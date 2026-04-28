import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, AutoModelForCausalLM
import logging
import threading
import time
import random
import re

logger = logging.getLogger(__name__)


class HybridPipeline:
    def __init__(self, vector_store, groq_api_key=None):
        """
        Initialize the 3-stage RAG-first pipeline.
        Stage 2 uses Qwen2-0.5B-Instruct for grounded, hallucination-free generation.
        """
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.vector_store = vector_store
        self.lock = threading.Lock()

        logger.info(f"🚀 Initializing Hybrid Pipeline on {self.device}")

        # ------------------------------------------------------------------
        # Layer A: Intent Classification (MobileBERT) — heuristic fallback
        # ------------------------------------------------------------------
        self.intent_model_name = "google/mobilebert-uncased"
        try:
            self.intent_tokenizer = AutoTokenizer.from_pretrained(self.intent_model_name)
            self.intent_model = AutoModelForSequenceClassification.from_pretrained(
                self.intent_model_name,
                num_labels=5,
                low_cpu_mem_usage=True
            ).to(self.device)
            logger.info("✓ MobileBERT intent classifier loaded")
        except Exception as e:
            logger.warning(f"⚠️ Could not load MobileBERT: {e}. Using heuristics only.")
            self.intent_model = None
            self.intent_tokenizer = None

        # ------------------------------------------------------------------
        # Layer C: Qwen2-0.5B-Instruct — grounded response generation
        # ------------------------------------------------------------------
        self.qwen_model_name = "Qwen/Qwen2-0.5B-Instruct"
        try:
            logger.info(f"⏳ Loading {self.qwen_model_name} — first run will download ~1GB...")
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
            logger.info(f"✓ Qwen2-0.5B-Instruct loaded on {self.device}")
        except Exception as e:
            logger.warning(f"⚠️ Could not load Qwen2: {e}. Will use extractive fallback only.")
            self.qwen_model = None
            self.qwen_tokenizer = None

        # ------------------------------------------------------------------
        # Intent categories + stop words
        # ------------------------------------------------------------------
        self.intents = ["greeting", "faq", "complaint", "support", "goodbye", "navigate"]

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
    # UTILITIES
    # ======================================================================

    def _clean_context(self, context: str) -> str:
        """
        Strip all noise symbols from PDF/doc extraction:
        repeated dots, dashes, underscores, pipes, bullets, equals, etc.
        """
        # Remove 2+ repeated punctuation/symbol runs
        clean = re.sub(r'[.\-_•|~=*#^@]{2,}', ' ', context)
        # Remove isolated stray special characters
        clean = re.sub(r'(?<!\w)[^\w\s,.()?!:\'"%-](?!\w)', ' ', clean)
        # Strip non-printable / non-ASCII characters
        clean = re.sub(r'[^\x20-\x7E\n]', '', clean)
        # Collapse multiple spaces/tabs
        clean = re.sub(r'[ \t]{2,}', ' ', clean)
        # Collapse multiple blank lines
        clean = re.sub(r'\n{3,}', '\n\n', clean)
        return clean.strip()

    def _clean_generated_response(self, text: str) -> str:
        """
        Post-process Qwen output — remove leftover prompt fragments,
        repeated symbols, chat template tags, and model artifacts.
        """
        # Remove repeated punctuation artifacts
        text = re.sub(r'[.\-_•|~=*#^@]{2,}', ' ', text)
        # Remove non-ASCII
        text = re.sub(r'[^\x20-\x7E\n]', '', text)
        # Collapse whitespace
        text = re.sub(r'[ \t]{2,}', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)

        # Remove lines that are prompt artifacts or chat template tags
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

        # If the model echoed the question back, remove it
        # (Qwen sometimes starts with "Question: ..." or "Q: ...")
        text = re.sub(r'^(Q|Question)\s*:.*?\n', '', text, flags=re.IGNORECASE).strip()

        return text.strip()

    def _extract_best_sentences(self, query: str, context: str, top_n: int = 2) -> str:
        """
        Extractive fallback: score every sentence by keyword overlap with query.
        Used when Qwen is unavailable or output is invalid.
        """
        sentences = re.split(r'(?<=[.?!])\s+', context)
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

    # ======================================================================
    # LAYER A: Intent Classification
    # ======================================================================

    def classify_intent(self, text: str) -> str:
        """
        Heuristic intent classifier. Fast and reliable.
        """
        text_lower = text.lower().strip()
        words = set(re.sub(r'[?!.,]', '', text_lower).split())

        greeting_words = {"hello", "hi", "hey", "greetings", "howdy", "sup"}
        if words & greeting_words or text_lower.startswith(("hi ", "hello ", "hey ")):
            return "greeting"

        goodbye_words = {"bye", "goodbye", "thanks", "thank", "exit", "quit", "cya", "later", "cheers"}
        if words & goodbye_words or text_lower.startswith(("bye", "thank", "thanks")):
            return "goodbye"

        support_words = {
            "help", "support", "problem", "issue", "error", "stuck",
            "trouble", "fix", "broken", "fail", "wrong", "cant", "cannot"
        }
        if words & support_words:
            return "support"

        navigate_words = {"go", "navigate", "take", "open", "show", "redirect"}
        if words & navigate_words or any(w in text_lower for w in ["report", "history", "payment"]):
            return "navigate"

        return "faq"

    # ======================================================================
    # STAGE 1: RAG Retrieval
    # ======================================================================

    def stage1_rag_retrieve(self, text: str, intent: str) -> str:
        """
        Retrieve top-k chunks from vector store, clean and return context.
        """
        if intent not in ["faq", "support"]:
            return ""

        results = self.vector_store.search(text, top_k=5, threshold=0.5)
        logger.info(f"🔍 Vector search returned {len(results)} potential matches (Threshold: 0.75)")
        
        if not results:
            return ""

        # Log individual matches for debugging
        for i, res in enumerate(results):
            logger.info(f"  Match {i+1}: Score={res.get('similarity'):.3f}, Verified={res.get('verified')}, Source={res.get('source', {}).get('file')}")

        # Only allow verified chunks to be used as context
        verified_results = [res for res in results if res.get('verified') is True]
        
        if not verified_results:
            logger.info("⚠️ No verified matches found above threshold.")
            return ""

        logger.info(f"✅ Found {len(verified_results)} verified chunks for context.")
        
        # Combine texts with clear boundaries (no citations for cleaner fallback)
        context_parts = [res['text'] for res in verified_results]
        return "\n\n".join(context_parts)

    # ======================================================================
    def _clean_context(self, context: str) -> str:
        """Strip citations and artifacts from context for cleaner generation."""
        # Remove [Source: ...] citations
        clean = re.sub(r'\[Source:[^\]]*\]', '', context)
        # Remove --- separators
        clean = re.sub(r'-{2,}', ' ', clean)
        # Remove numbered list artifacts like "1." "2." at start of line
        clean = re.sub(r'^\s*\d+\.\s*', '', clean, flags=re.MULTILINE)
        # Collapse multiple spaces
        clean = re.sub(r'\s+', ' ', clean)
        return clean.strip()

    # ======================================================================
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
            logger.warning("⚠️ Qwen2 not available. Using extractive fallback.")
            return self._extract_best_sentences(text, self._clean_context(context), top_n=2)

        # Clean the context (strip citations, separators, etc.)
        context_clean = self._clean_context(context)
        context_trimmed = context_clean[:2000].strip()

        # Strict system prompt — zero tolerance for hallucination
        system_prompt = (
    "You are a precise customer care assistant. "
    "Answer ONLY using the provided context. "
    "If the answer is not in the context, say exactly: "
    "'I don't have that information. Please contact our support team.' "

    "Response rules by question type: "
    "WHAT: Give a clear factual definition or description. "
    "HOW: Explain the process or steps. "
    "WHERE: Identify the specific location or department. "
    "IS/ARE: Start with Yes or No, then explain using the context. "
    "DO NOT include source citations like [Source: filename.docx] in your answer. "
    "DO NOT include separator lines like --- or ===. "
    "DO NOT include numbered list prefixes like '1.' '2.' '3.' unless explaining steps. "
    "Answer in plain natural sentences only."

    "Hard rules: "
    "1. Maximum 3 sentences. Stop after 3 sentences. "
    "2. Never use any name, company, or fact not explicitly in the context. "
    "3. DO NOT repeat the question. "
    "4. DO NOT start with 'Based on the context' or 'As mentioned'. "
    "5. DO NOT add greetings like Hello or Sure. "
    "6. DO NOT generate generic customer service templates. "

    "Example: "
    "Context: Refunds take 5-7 business days via original payment method. "
    "Question: How long do refunds take? "
    "Answer: Refunds are processed within 5-7 business days to your original payment method."
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
                    max_new_tokens=120,
                    temperature=0.1,
                    top_p=0.9,
                    repetition_penalty=1.3,
                    do_sample=True,
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
            if not answer or len(answer) < 10:
                logger.warning("⚠️ Qwen output too short or empty. Using extractive fallback.")
                return self._extract_best_sentences(text, context, top_n=2)

            logger.info(f"✓ Qwen2 generated answer ({len(answer)} chars)")
            return answer

        except Exception as e:
            logger.error(f"❌ Qwen2 generation error: {e}. Using extractive fallback.")
            return self._extract_best_sentences(text, self._clean_context(context), top_n=2)

    # ======================================================================
    # STAGE 3: Fallback
    # ======================================================================

    def stage3_fallback(self, text: str, kb_name="General") -> str:
        """
        No relevant context found — log query and return polite not-found message.
        """
        logger.info(f"⚠️ No context found for KB '{kb_name}'. Logging unverified query.")
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

        with self.lock:
            # Switch Knowledge Base if needed
            if kb_config:
                json_file = kb_config.get('jsonfile')
                bin_file = kb_config.get('binfile')
                if json_file and bin_file:
                    # Check if we are already using this KB to avoid redundant loading
                    if self.vector_store.index_path != bin_file or self.vector_store.meta_path != json_file:
                        logger.info(f"🔄 Switching knowledge base to: {bin_file}")
                        self.vector_store.load_kb(bin_file, json_file)

            # --- Stage 0: Intent ---
            t0 = time.time()
            intent = self.classify_intent(text)
            logger.info(f"🔍 Stage 0: Intent = '{intent}' ({(time.time()-t0)*1000:.1f}ms)")

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
                text_lower = text.lower()
                dest = "chat"
                if "report"  in text_lower: dest = "report"
                elif "history" in text_lower: dest = "history"
                elif "pay"     in text_lower: dest = "payment"

                reply = f"Sure! Redirecting you to the {dest} page now."
                response = self._build_response(intent, True, reply, start_time)
                response["redirect_to"] = f"/{dest}" if dest != "chat" else "/"
                return response
            # --- Stage 1: RAG Retrieval ---
            logger.info("🔎 Stage 1: Searching knowledge base...")
            context = self.stage1_rag_retrieve(text, intent)

            if context:
                # --- Stage 2: Qwen2 grounded generation ---
                logger.info("🧠 Stage 2: Generating grounded response with Qwen2-0.5B-Instruct...")
                reply = self.stage2_grounded_generation(text, context)
                
                # Auto-log interaction as unverified for future learning
                try:
                    kb_name = kb_config.get('kb_name', 'General') if kb_config else 'General'
                    self.vector_store.save_interaction(text, reply, kb_name=kb_name)
                except Exception as e:
                    logger.error(f"Error logging interaction: {e}")
                
                return self._build_response(intent, True, reply, start_time)
            else:
                # --- Stage 3: Fallback ---
                logger.info("🛟 Stage 3: No context found. Using fallback...")
                kb_name = kb_config.get('kb_name', 'General') if kb_config else 'General'
                reply = self.stage3_fallback(text, kb_name=kb_name)
                return self._build_response(intent, False, reply, start_time)

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
        logger.info(f"✨ Query processed in {total_ms:.1f}ms")
        return {
            "intent": intent,
            "context_found": context_found,
            "reply": reply,
            "timing": {
                "total_latency": f"{total_ms:.1f}ms"
            }
        }