import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, AutoModelForCausalLM
import logging
import os
import threading
import json
import time
import random
import difflib
from groq import Groq

logger = logging.getLogger(__name__)

class HybridPipeline:
    def __init__(self, vector_store, groq_api_key=None):
        """
        Initialize the 3-stage RAG-first pipeline.
        """
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.vector_store = vector_store
        self.groq_client = Groq(api_key=groq_api_key) if groq_api_key else None
        self.lock = threading.Lock()

        logger.info(f"🚀 Initializing Hybrid Pipeline on {self.device}")
        # Layer A: Intent Classification (MobileBERT)
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
        
        # Layer C: Response Generation (124M model / GPT-2)
        self.nlg_model_name = "gpt2"
        try:
            self.nlg_tokenizer = AutoTokenizer.from_pretrained(self.nlg_model_name)
            self.nlg_tokenizer.pad_token = self.nlg_tokenizer.eos_token
            
            self.nlg_model = AutoModelForCausalLM.from_pretrained(
                self.nlg_model_name,
                low_cpu_mem_usage=True
            ).to(self.device)
            self.nlg_model.config.pad_token_id = self.nlg_tokenizer.eos_token_id
            logger.info("✓ GPT-2 (124M) loaded for grounded response generation")
        except Exception as e:
            logger.warning(f"⚠️ Could not load GPT-2: {e}. Using templates only.")
            self.nlg_model = None
            self.nlg_tokenizer = None
        
        # Intent categories
        self.intents = ["greeting", "faq", "complaint", "support", "goodbye", "navigate"]
        
        # Template-based responses for reliability
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
                "I'm sorry, I couldn't find specific information about that in my knowledge base. Could you please rephrase or ask something else?",
                "I don't have information about that in my current knowledge base. Can you try asking in a different way?",
                "That's not in my knowledge base yet. Feel free to ask about other topics or rephrase your question."
            ]
        }

    def classify_intent(self, text):
        """
        Layer A: Intent Classification
        """
        text_lower = text.lower().strip()
        words = set(text_lower.strip("?!.,").split())
        
        greeting_words = {"hello", "hi", "hey", "greetings", "good morning", "good afternoon", "good evening"}
        if words.intersection(greeting_words) or text_lower.startswith(("hi ", "hello ", "hey ")):
            return "greeting"
        
        goodbye_words = {"bye", "goodbye", "thanks", "thank", "exit", "quit"}
        if words.intersection(goodbye_words) or text_lower.startswith(("bye", "thank", "thanks")):
            return "goodbye"
        
        support_words = {"help", "support", "problem", "issue", "error", "stuck", "trouble", "fix", "broken"}
        if words.intersection(support_words):
            return "support"
        
        navigate_words = {"go", "show", "open", "navigate", "report", "history", "payment", "pay"}
        if words.intersection(navigate_words) or any(w in text_lower for w in ["report", "history", "payment"]):
            return "navigate"
        
        return "faq"

    def stage1_rag_retrieve(self, text, intent):
        """
        Stage 1: RAG-first (always)
        Retrieve top chunks from vector store.
        """
        if intent not in ["faq", "support"]:
            return ""

        # Search the vector store
        results = self.vector_store.search(text, top_k=3, threshold=0.5)
        if not results:
            return ""

        # Sort by similarity, get top matches
        context_parts = []
        for res in results:
            context_parts.append(res['text'])
            
        context = "\n\n".join(context_parts)
        logger.info(f"✓ Retrieved context from vector store (Similarity: {results[0]['similarity']:.2f})")
        return context

    def stage2_grounded_generation(self, text, context):
        """
        Stage 2: Small model rewrites the retrieved content (if high confidence).
        Using GPT-2 (124M) or Groq 8B if available. We'll use Groq 8B for safety if API is present,
        or GPT-2 locally.
        """
        if self.groq_client:
            prompt = f"SYSTEM: You are a helpful support agent. Answer ONLY from the provided context. Be concise and polite. IMPORTANT: Do not mention page numbers or slide numbers in your response.\n\nCONTEXT:\n{context}\n\nUSER: {text}\nASSISTANT:"
            try:
                response = self.groq_client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=150,
                    temperature=0.1
                )
                return response.choices[0].message.content.strip()
            except Exception as e:
                logger.error(f"Stage 2 Groq 8B error: {e}")
        
        # Fallback to local GPT-2 or just return context directly
        if self.nlg_model and self.nlg_tokenizer:
            # We skip local GPT-2 actual generation because it hallucinates heavily on small param size.
            # Returning the context directly with a nice prefix.
            prefixes = ["Based on the documentation: ", "Here's what I found: ", "According to our policies: "]
            return random.choice(prefixes) + "\n" + context[:500] + "..." if len(context) > 500 else context
            
        return context

    def stage3_groq_fallback(self, text):
        """
        Stage 3: Fallback to Groq, learn safely.
        """
        if not self.groq_client:
            return random.choice(self.templates["not_found"])

        logger.info("⚠️ Low confidence retrieval. Triggering Stage 3 Groq Fallback.")
        
        try:
            # First try 8B
            response = self.groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": "You are a helpful customer care assistant. Provide a helpful, general answer. Do not hallucinate company-specific policies."},
                    {"role": "user", "content": text}
                ],
                temperature=0.3,
                max_tokens=500
            )
            answer = response.choices[0].message.content.strip()
            
            # Save the new Q/A as an unverified memory item immediately
            self.vector_store.save_memory(text, answer, tags=["fallback", "unverified"])
            
            return answer
        except Exception as e:
            logger.error(f"Stage 3 Groq error: {e}")
            return random.choice(self.templates["not_found"])

    def process_query(self, text):
        """
        Full 3-Stage Pipeline
        """
        start_time = time.time()
        
        with self.lock:
            # 1. Intent Classification
            t0 = time.time()
            intent = self.classify_intent(text)
            t1 = time.time()
            logger.info(f"🔍 Stage 0: Intent detected as '{intent}' in {(t1-t0)*1000:.2f}ms")
            
            if intent == "greeting":
                reply = random.choice(self.templates["greeting"])
                context_found = True
            elif intent == "goodbye":
                reply = random.choice(self.templates["goodbye"])
                context_found = True
            elif intent == "navigate":
                # Determine destination
                dest = "chat"
                if "report" in text.lower(): dest = "report"
                elif "history" in text.lower(): dest = "history"
                elif "pay" in text.lower(): dest = "payment"
                
                reply = f"Sure! Redirecting you to the {dest} page now."
                context_found = True
                return {
                    "intent": intent,
                    "context_found": context_found,
                    "reply": reply,
                    "redirect_to": f"/{dest}" if dest != "chat" else "/",
                    "timing": {"total_latency": f"{(time.time() - start_time) * 1000:.2f}ms"}
                }
            else:
                # Stage 1: RAG-first (always)
                logger.info(f"🔎 Stage 1: Searching knowledge base for context...")
                context = self.stage1_rag_retrieve(text, intent)
                
                if context:
                    # Stage 2: Small model grounded answer
                    logger.info(f"🧠 Stage 2: Context found. Generating grounded response...")
                    reply = self.stage2_grounded_generation(text, context)
                    context_found = True
                else:
                    # Stage 3: Fallback to Groq and "learn" safely
                    logger.info(f"🛟 Stage 3: No context found. Falling back to Groq...")
                    reply = self.stage3_groq_fallback(text)
                    context_found = False
            
            t2 = time.time()
            
            total_latency = t2 - start_time
            logger.info(f"✨ Query processed in {total_latency * 1000:.2f}ms")
            
            return {
                "intent": intent,
                "context_found": context_found,
                "reply": reply,
                "timing": {
                    "total_latency": f"{total_latency * 1000:.2f}ms"
                }
            }

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    from vector_store import VectorStore
    vs = VectorStore()
    pipeline = HybridPipeline(vector_store=vs)
    print(pipeline.process_query("Hello!"))