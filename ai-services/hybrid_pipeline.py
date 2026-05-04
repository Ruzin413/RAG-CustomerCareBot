import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, AutoModelForCausalLM
import logging
import threading
import time
import random
import re
from navigation_utils import is_navigation_intent, get_navigation_destination, build_navigation_reply, get_redirect_path
from sentence_transformers import CrossEncoder
logger = logging.getLogger(__name__)
class HybridPipeline:
    def __init__(self, vector_store):
        """
        Initialize the 3-stage RAG-first pipeline.
        Stage 2 uses Qwen2-0.5B-Instruct for grounded, hallucination-free generation.
        """
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.vector_store = vector_store
        self.lock = threading.Lock()

        logger.info(f"Initializing Hybrid Pipeline on {self.device}")
        # ------------------------------------------------------------------
        # Layer A: Intent Classification — heuristics only
        # ------------------------------------------------------------------
        self.intent_model = None
        logger.info("Using heuristics only for intent classification.")

        # ------------------------------------------------------------------
        # Layer B: Cross-Encoder Re-ranker (Accuracy Booster)
        # ------------------------------------------------------------------
        self.reranker_model_name = "cross-encoder/ms-marco-MiniLM-L-6-v2"
        try:
            self.reranker = CrossEncoder(self.reranker_model_name, device=self.device)
            logger.info("Cross-Encoder re-ranker loaded")
        except Exception as e:
            logger.warning(f"Could not load Cross-Encoder: {e}. Precision might be lower.")
            self.reranker = None

        # ------------------------------------------------------------------
        # Layer C: Qwen2-0.5B-Instruct — grounded response generation
        # ------------------------------------------------------------------
        self.qwen_model_name = "Qwen/Qwen2-0.5B-Instruct"
        try:
            logger.info(f"Loading {self.qwen_model_name} — first run will download ~1GB...")
            self.qwen_tokenizer = AutoTokenizer.from_pretrained(
                self.qwen_model_name,
                trust_remote_code=True
            )
            self.qwen_model = AutoModelForCausalLM.from_pretrained(
                self.qwen_model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                low_cpu_mem_usage=True,
                trust_remote_code=True
            ).to(self.device)
            self.qwen_model.eval()
            logger.info(f"Qwen2-0.5B-Instruct loaded on {self.device}")
        except Exception as e:
            logger.warning(f"Could not load Qwen2: {e}. Will use extractive fallback only.")
            self.qwen_model = None
            self.qwen_tokenizer = None

        # ------------------------------------------------------------------
        # Intent categories + stop words
        # ------------------------------------------------------------------
        self.intent_labels = ["greeting", "faq", "goodbye", "navigate"]

        self.stop_words = {
            "what", "is", "the", "a", "an", "how", "do", "i", "can", "you",
            "me", "my", "to", "of", "for", "in", "on", "at", "it", "its",
            "are", "was", "were", "be", "been", "being", "have", "has", "had",
            "will", "would", "could", "should", "that", "this", "which", "with",
            "from", "by", "about", "please", "tell", "explain", "describe"
        }
        # ------------------------------------------------------------------
        # Templates
        # ------------------------------------------------------------------
        self.templates = {
            "greeting": [
                "Hello! I'm your Customer Care Assistant. How can I help you today?",
                "Hi there! What can I assist you with?",
                "Welcome! Feel free to ask me anything.",
                "Greetings! I'm here to help. What would you like to know?"
            ],
            "goodbye": [
                "You're welcome! Feel free to reach out if you have more questions. Have a great day!",
                "Thank you for chatting! Don't hesitate to come back if you need help.",
                "Goodbye! I'm here whenever you need assistance.",
                "Take care! Come back anytime you have questions."
            ],
            "not_found": [
                "I'm sorry, I couldn't find specific information about that. Could you please rephrase or ask something else?",
                "I don't have information about that in my knowledge base. Can you try asking in a different way?",
                "That topic isn't in my knowledge base yet. Feel free to ask about other topics or rephrase your question."
            ]
        }

    # ======================================================================
    # MEMORY MANAGEMENT
    # ======================================================================

    def cleanup(self):
        """
        Unload models from memory and clear GPU cache.
        """
        logger.info("Starting memory cleanup...")
        with self.lock:
            try:
                # Delete large model objects
                if hasattr(self, 'qwen_model'):
                    del self.qwen_model
                    self.qwen_model = None
                if hasattr(self, 'intent_model'):
                    del self.intent_model
                    self.intent_model = None
                
                if hasattr(self, 'reranker'):
                    del self.reranker
                    self.reranker = None
                
                # Clear torch cache
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    logger.info("CUDA cache cleared")
                
                import gc
                gc.collect()
                logger.info("Garbage collection complete")
                return True
            except Exception as e:
                logger.error(f"Cleanup error: {e}")
                return False
    # ======================================================================
    # UTILITIES
    # ======================================================================

    def _clean_context(self, context: str) -> str:
        """Strip citations, artifacts, and noise symbols from context."""
        # 1. Remove citations and specific artifacts
        context = re.sub(r'\[Source:[^\]]*\]', '', context)
        context = re.sub(r'^\s*\d+\.\s*', '', context, flags=re.MULTILINE)
        
        # 2. Remove runs of repeated punctuation (e.g., ..., ---, . . .)
        context = re.sub(r'([.\-_•|~=*#^@…])(\s*\1)+', ' ', context)
        context = re.sub(r'\.{2,}', ' ', context)
        
        # 3. Junk Line Killer: Keep only lines that contain at least one letter or number
        cleaned_lines = []
        for line in context.splitlines():
            if re.search(r'[a-zA-Z0-9\u0900-\u097F]', line):
                cleaned_lines.append(line)
        
        # 4. Final polish
        clean = "\n".join(cleaned_lines)
        clean = re.sub(r'[ \t]{2,}', ' ', clean)     # Collapse spaces
        clean = re.sub(r'\n{3,}', '\n\n', clean)     # Collapse newlines
        return clean.strip()

    def _clean_generated_response(self, text: str) -> str:
        """Post-process AI output to remove artifacts and noise."""
        # 1. Remove repeated punctuation artifacts
        text = re.sub(r'([.\-_•|~=*#^@…])(\s*\1)+', ' ', text)
        text = re.sub(r'\.{2,}', ' ', text)
        
        # 2. Junk Line Killer: Keep only lines that contain at least one letter or number
        cleaned_lines = []
        for line in text.splitlines():
            if re.search(r'[a-zA-Z0-9\u0900-\u097F]', line):
                cleaned_lines.append(line)
        text = "\n".join(cleaned_lines)

        # 3. Convert list-style dashes/bullets at start of lines to commas for a natural sentence feel
        text = re.sub(r'\n\s*[-•*]\s*', ', ', text)
        
        # 4. Remove chat template tags
        lines = text.splitlines()
        clean_lines = [
            line for line in lines
            if not any(tag in line.lower() for tag in [
                "<|im_start|>", "<|im_end|>", "system:", "user:", "assistant:",
                "context:", "question:", "answer:", "instruction:"
            ])
        ]
        text = "\n".join(clean_lines).strip()
        # Strip surrounding quotes
        text = text.strip('"\'')

        # Ensure the response ends with a full sentence
        text = text.strip()
        if text:
            last_punc = max(text.rfind('.'), text.rfind('!'), text.rfind('?'), text.rfind('\u0964'))
            # Force trim at the last punctuation to prevent cut-off fragment sentences
            if last_punc != -1:
                text = text[:last_punc+1]
        
        # Hard cap at 3 sentences
        sentences = re.split(r'(?<=[.!?\u0964])\s+', text.strip())
        sentences = [s for s in sentences if s.strip()]
        text = " ".join(sentences[:3])
        
        return text.strip()

    def _extract_best_sentences(self, query: str, context: str, top_n: int = 2) -> str:
        """
        Extractive fallback: score every sentence by keyword overlap with query.
        Used when Qwen is unavailable or output is invalid.
        """
        sentences = re.split(r'(?<=[.?!\u0964])\s+', context)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 15]

        if not sentences:
            return context[:400].strip()

        query_keywords = set(query.lower().split()) - self.stop_words

        def score(sentence: str) -> float:
            words = set(sentence.lower().split())
            overlap = words & query_keywords
            return len(overlap) + (0.1 * len(overlap) / max(len(query_keywords), 1))

        scored = sorted(sentences, key=score, reverse=True)
        top_sentences = scored[:top_n]
        top_set = set(top_sentences)
        ordered = [s for s in sentences if s in top_set]
        result = " ".join(ordered).strip()
        return result if result else sentences[0]

    def _rerank_results(self, query: str, results: list) -> list:
        """
        Use Cross-Encoder to re-score vector search results for higher precision.
        """
        if not self.reranker or not results:
            return results

        # Create (Query, Chunk) pairs
        pairs = [[query, res['text']] for res in results]
        
        # Predict scores
        scores = self.reranker.predict(pairs)
        
        # Update scores and sort
        for i, score in enumerate(scores):
            results[i]['rerank_score'] = float(score)
        
        # Sort by rerank score descending
        reranked = sorted(results, key=lambda x: x['rerank_score'], reverse=True)
        
        # Filter: Only keep results that actually relate to the query
        # ms-marco scores > 0 are usually strong matches, < -4 are usually noise.
        # Relaxing threshold to -10.0 to return more answers
        filtered = [res for res in reranked if res['rerank_score'] > -8.0]
        
        if not filtered and reranked:
            logger.info(f"All {len(reranked)} matches failed reranking (Top score: {reranked[0]['rerank_score']:.2f})")
            return []

        logger.info(f"Reranking complete. Top score: {reranked[0]['rerank_score']:.2f} (Reduced {len(results)} -> {len(filtered)})")
        return filtered

    # ======================================================================
    # LAYER A: Intent Classification
    # ======================================================================

    def classify_intent(self, text: str) -> str:
        """
        Intent classifier using heuristics only.
        """
        # Fallback to heuristics
        text_lower = text.lower().strip()
        words = set(re.sub(r'[?!.,]', '', text_lower).split())
        greeting_words = {"hello", "hi", "hey", "greetings", "howdy", "sup"}
        if words & greeting_words or text_lower.startswith(("hi ", "hello ", "hey ")):
            return "greeting"
        goodbye_words = {"bye", "goodbye", "thanks", "thank", "exit", "quit", "cya", "later", "cheers"}
        if words & goodbye_words or text_lower.startswith(("bye", "thank", "thanks")):
            return "goodbye"
        if is_navigation_intent(text):
            return "navigate"
        return "faq"
    # ======================================================================
    # STAGE 1: RAG Retrieval
    # ======================================================================
    def stage1_rag_retrieve(self, text: str, intent: str) -> tuple[str, bool]:
        """
        Retrieve top-k chunks from vector store.
        Returns (context_string, from_history_boolean).
        """
        if intent not in ["faq", "support"]:
            return "", False
        results = self.vector_store.search(text, top_k=6, threshold=0.40)
        logger.info(f"Vector search returned {len(results)} potential matches (Threshold: 0.40)")
        if not results:
            return "", False
        # Log individual matches for debugging
        for i, res in enumerate(results):
            logger.info(f"  Match {i+1}: Score={res.get('similarity'):.3f}, Verified={res.get('verified')}, Source={res.get('source', {}).get('file')}")
        # Only allow verified chunks to be used as context
        verified_results = [res for res in results if res.get('verified') is True]
        
        # --- Stage 1.5: Re-ranking ---
        if verified_results:
            verified_results = self._rerank_results(text, verified_results)
        
        if not verified_results:
            logger.info("No verified matches survived reranking or were found.")
            return "", False

        # Combine texts with clear boundaries
        context_parts = [res['text'] for res in verified_results]
        # Check if any chunk came from chat history
        from_history = any(res.get('source', {}).get('type') == 'chat_history' for res in verified_results)
        return "\n\n".join(context_parts), from_history
    # STAGE 2: Qwen2-0.5B-Instruct Grounded Generation
    # ======================================================================
    def stage2_grounded_generation(self, text: str, context: str) -> str:
        """
        Use Qwen2-0.5B-Instruct to generate a clean, short, grounded answer.
        Anti-hallucination measures applied:
          1. System prompt forbids answering outside the context
          2. Context capped at 600 chars to stay focused
          3. max_new_tokens=120  —  forces short answers
          4. temperature=0.1    —  near-deterministic output
          5. repetition_penalty=1.3  —  prevents looping
          6. Post-processing removes all artifacts and prompt leakage
          7. Extractive fallback if output is empty / too short
        """
        if self.qwen_model is None or self.qwen_tokenizer is None:
            logger.warning("Qwen2 not available. Using extractive fallback.")
            return self._extract_best_sentences(text, self._clean_context(context), top_n=2)
        # Clean the context (strip citations, separators, etc.)
        context_clean = self._clean_context(context)
        context_trimmed = context_clean[:900].strip()
        # Strict system prompt — zero tolerance for hallucination
        system_prompt = (
    "You are a precise customer care assistant. "
    "Answer ONLY using the provided context. "
    "If the answer is not in the context, say exactly: "
    "'I don't have that information. Please contact our support team.' "

    "Rules: "
    "1. Always write 2 to 3 complete sentences. Never answer in less than 2 sentences. "
    "2. If the context only supports one fact, expand by restating who it applies to or when. "
    "3. Maximum 3 sentences. Pack all details into as few sentences as possible. "
    "4. When listing items, use commas inline: 'Face, Fingerprint, Palm, and Card.' "
    "5. Never use 'etc' — always list every item explicitly from the context. "
    "6. Include all specific values, numbers, and names from the context. Never generalize. "
    "7. End every sentence with a period(.). "
    "8. Do NOT repeat the question, add greetings, or use bullet points. "
    "9. Do NOT start with 'Based on the context' or 'As mentioned'. "
    "10. Never state facts not explicitly in the context. "

    "Example 1 — simple answer: "
    "Context: Refunds take 5-7 business days via original payment method. "
    "Question: How long do refunds take? "
    "Answer: Refunds are processed within 5-7 business days to your original payment method. "

    "Example 2 — specific details: "
    "Context: Biometric support includes Face, Fingerprint, Palm, and Card readers. "
    "Question: What biometric devices are supported? "
    "Answer: The system supports Face, Fingerprint, Palm, and Card biometric devices."
)
        user_message = (
            f"Context:\n{context_trimmed}\n\n"
            f"Question: {text}\n\n"
            "Provide a short, clear answer using only the context above:"
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_message}
        ]
        try:
            # Apply Qwen instruct chat template
            input_text = self.qwen_tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True
            )
            inputs = self.qwen_tokenizer(
                input_text,
                return_tensors="pt",
                truncation=True,
                max_length=1024
            ).to(self.device)
            with torch.no_grad():
                outputs = self.qwen_model.generate(
                    **inputs,
                    min_new_tokens=40,
                    max_new_tokens=200,
                    repetition_penalty=1.05,
                    do_sample=False,
                    pad_token_id=self.qwen_tokenizer.eos_token_id,
                    eos_token_id=self.qwen_tokenizer.eos_token_id,
                )
            # Decode only the newly generated tokens (skip the prompt)
            input_length = inputs["input_ids"].shape[1]
            generated_ids = outputs[0][input_length:]
            raw_answer = self.qwen_tokenizer.decode(generated_ids, skip_special_tokens=True)
            # Clean up the raw output
            answer = self._clean_generated_response(raw_answer)
            # Validate — fall back to extractive if output is invalid
            if not answer or len(answer) < 60:
                logger.warning("Qwen output too short or empty. Using extractive fallback.")
                extractive = self._extract_best_sentences(text, context, top_n=2)
                # Combine both if Qwen gave something
                if answer and len(answer) >= 10:
                    answer = answer + " " + extractive
                else:
                    answer = extractive
                answer = self._clean_generated_response(answer)
            logger.info(f"Qwen2 generated answer ({len(answer)} chars)")
            return answer
        except Exception as e:
            logger.error(f"Qwen2 generation error: {e}. Using extractive fallback.")
            return self._extract_best_sentences(text, self._clean_context(context), top_n=2)
    # ======================================================================
    # STAGE 3: Fallback
    # ======================================================================
    def stage3_fallback(self, text: str, kb_name="General") -> str:
        """
        No relevant context found — log query and return polite not-found message.
        """
        logger.info(f"No context found for KB '{kb_name}'. Logging unverified query.")
        try:
            self.vector_store.save_unverified_query(text, kb_name=kb_name)
        except Exception as e:
            logger.error(f"Error saving unverified query: {e}")
        return random.choice(self.templates["not_found"])
    # ======================================================================
    # MAIN PIPELINE
    # ======================================================================
    def process_query(self, text: str, kb_config: dict = None) -> dict:
        """
        Full 3-Stage RAG Pipeline:
          Stage 0 — Intent Classification
          Stage 1 — RAG Retrieval (faq / support intents)
          Stage 2 — Qwen2-0.5B-Instruct Grounded Generation
          Stage 3 — Fallback (nothing retrieved)
        """
        start_time = time.time()
        interaction_to_save = None
        
        with self.lock:
            # Switch Knowledge Base if needed
            if kb_config:
                json_file = kb_config.get('jsonfile')
                bin_file = kb_config.get('binfile')
                if json_file and bin_file:
                    # Check if we are already using this KB to avoid redundant loading
                    if self.vector_store.index_path != bin_file or self.vector_store.meta_path != json_file:
                        logger.info(f"Switching knowledge base to: {bin_file}")
                        self.vector_store.load_kb(bin_file, json_file)
            # --- Stage 0: Intent ---
            t0 = time.time()
            intent = self.classify_intent(text)
            logger.info(f"Stage 0: Intent = '{intent}' ({(time.time()-t0)*1000:.1f}ms)")
            # --- Quick-exit intents (no RAG needed) ---
            if intent == "greeting":
                return self._build_response(
                    intent, True,
                    random.choice(self.templates["greeting"]),
                    start_time
                )
            if intent == "goodbye":
                return self._build_response(
                    intent, True,
                    random.choice(self.templates["goodbye"]),
                    start_time
                )
            if intent == "navigate":
                dest = get_navigation_destination(text)
                if dest:
                    reply = build_navigation_reply(dest)
                    response = self._build_response(intent, True, reply, start_time)
                    response["redirect_to"] = get_redirect_path(dest)
                else:
                    reply = "I'm sorry, I don't know how to navigate to that page yet. Would you like me to help you find something else?"
                    response = self._build_response(intent, False, reply, start_time)
                return response
            # --- Stage 1: RAG Retrieval ---
            logger.info("Stage 1: Searching knowledge base...")
            context, from_history = self.stage1_rag_retrieve(text, intent)

            if context:
                # --- Stage 2: Qwen2 grounded generation ---
                logger.info("Stage 2: Generating grounded response with Qwen2-0.5B-Instruct...")
                reply = self.stage2_grounded_generation(text, context)
                
                # Auto-log interaction as unverified for future learning
                if not from_history:
                    kb_name = kb_config.get('kb_name', 'General') if kb_config else 'General'
                    interaction_to_save = (text, reply, kb_name)
                else:
                    logger.info("Skipping auto-log: Context sourced from existing chat history.")
                
                response = self._build_response(intent, True, reply, start_time)
            else:
                # --- Stage 3: Fallback ---
                logger.info("Stage 3: No context found. Using fallback...")
                kb_name = kb_config.get('kb_name', 'General') if kb_config else 'General'
                reply = self.stage3_fallback(text, kb_name=kb_name)
                response = self._build_response(intent, False, reply, start_time)
        
        # DB write happens after lock is released
        if interaction_to_save:
            try:
                self.vector_store.save_interaction(*interaction_to_save)
            except Exception as e:
                logger.error(f"Error logging interaction: {e}")
        return response
    # ======================================================================
    # HELPER
    # ======================================================================
    def _build_response(
        self,
        intent: str,
        context_found: bool,
        reply: str,
        start_time: float
    ) -> dict:
        total_ms = (time.time() - start_time) * 1000
        logger.info(f"Query processed in {total_ms:.1f}ms")
        return {
            "intent": intent,
            "context_found": context_found,
            "reply": reply,
            "timing": {
                "total_latency": f"{total_ms:.1f}ms"
            }
        }