import os
import json
import logging
import time
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

class VectorStore:
    def __init__(self, index_path="faiss_index.bin", meta_path="faiss_meta.json", model_name='all-MiniLM-L6-v2'):
        self.index_path = index_path
        self.meta_path = meta_path
        self.model_name = model_name

        logger.info(f"Loading embedding model: {model_name}...")
        try:
            self.model = SentenceTransformer(model_name)
            self.dimension = self.model.get_sentence_embedding_dimension()
            logger.info(f"Model loaded (dimension: {self.dimension})")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise

        self.index = None
        self.metadata = []
        
        # Centralized Chat History
        self.chat_history_path = "chat_history.json"
        self.history_index_path = "chat_history_index.bin"
        self.chat_history = []
        self.history_index = None
        self.chat_history_verified_meta = [] # Subset of chat_history that is verified
        
        self._load_chat_history()
        self.load_kb(self.index_path, self.meta_path)

    def _load_chat_history(self):
        """Load centralized chat history and its vector index from disk."""
        if os.path.exists(self.chat_history_path):
            try:
                with open(self.chat_history_path, 'r', encoding='utf-8') as f:
                    self.chat_history = json.load(f)
                logger.info(f"Loaded {len(self.chat_history)} chat history items")
            except Exception as e:
                logger.error(f"Failed to load chat history: {e}")
                self.chat_history = []
        
        # Build/Load History Index (only for verified items)
        if os.path.exists(self.history_index_path):
            try:
                self.history_index = faiss.read_index(self.history_index_path)
                self.chat_history_verified_meta = [item for item in self.chat_history if item.get("verified") is True]
                
                if self.history_index.ntotal != len(self.chat_history_verified_meta):
                    logger.warning("History index out of sync. Rebuilding...")
                    self._rebuild_history_index()
                else:
                    logger.info(f"Loaded history vector index with {self.history_index.ntotal} verified items")
            except Exception as e:
                logger.error(f"Failed to load history index: {e}")
                self._rebuild_history_index()
        else:
            self._rebuild_history_index()

    def _rebuild_history_index(self):
        """Build a FAISS index for all verified items in chat history."""
        self.chat_history_verified_meta = [item for item in self.chat_history if item.get("verified") is True]
        self.history_index = faiss.IndexFlatL2(self.dimension)
        
        if not self.chat_history_verified_meta:
            return

        texts = [m.get("text") or f"Question: {m.get('question','')}\nAnswer: {m.get('answer','')}" 
                 for m in self.chat_history_verified_meta]
        logger.info(f"Indexing {len(texts)} verified history items...")
        
        embeddings = self.model.encode(texts, convert_to_numpy=True).astype('float32')
        faiss.normalize_L2(embeddings)
        self.history_index.add(embeddings)
        faiss.write_index(self.history_index, self.history_index_path)

    def _save_chat_history(self):
        """Persist centralized chat history and its index to disk."""
        try:
            with open(self.chat_history_path, 'w', encoding='utf-8') as f:
                json.dump(self.chat_history, f, ensure_ascii=False, indent=2)
            
            # Update and save the index if it exists
            if self.history_index:
                faiss.write_index(self.history_index, self.history_index_path)
        except Exception as e:
            logger.error(f"Failed to save chat history: {e}")

    def load_kb(self, index_path, meta_path):
        """Switch to a different knowledge base files."""
        self.index_path = index_path
        self.meta_path = meta_path
        
        if os.path.exists(self.index_path) and os.path.exists(self.meta_path):
            try:
                self.index = faiss.read_index(self.index_path)
                with open(self.meta_path, 'r', encoding='utf-8') as f:
                    self.metadata = json.load(f)
                
                # Critical Sync Check: Ensure vectors match metadata
                if self.index.ntotal != len(self.metadata):
                    logger.warning(f"Index ({self.index.ntotal}) and metadata ({len(self.metadata)}) out of sync. Rebuilding...")
                    self._rebuild_index()
                    self._save()
                else:
                    logger.info(f"Loaded existing vector store from {self.index_path} with {self.index.ntotal} items")
            except Exception as e:
                logger.error(f"Failed to load vector store from {self.index_path}: {e}. Initializing empty.")
                self.index = faiss.IndexFlatL2(self.dimension)
                self.metadata = []
        else:
            logger.info(f"Initializing new vector store (files not found: {self.index_path})")
            self.index = faiss.IndexFlatL2(self.dimension)
            self.metadata = []

    def _save(self):
        """Persist index and metadata to disk."""
        faiss.write_index(self.index, self.index_path)
        with open(self.meta_path, 'w', encoding='utf-8') as f:
            json.dump(self.metadata, f, ensure_ascii=False, indent=2)

    def add_chunks(self, chunks):
        """
        Add a list of chunk dicts to the vector store.
        Expected format:
        {
            "doc_id": str,
            "chunk_id": str,
            "source": dict,
            "text": str,
            "tags": list,
            "created_at": str,
            "unverified": bool  (optional, defaults to False)
        }
        """
        if not chunks:
            return

        texts = [chunk.get("text", "") for chunk in chunks]
        logger.info(f"Encoding {len(texts)} chunks...")

        # Encode in batches to avoid OOM on large ingestions
        batch_size = 64
        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            emb = self.model.encode(batch, convert_to_numpy=True)
            all_embeddings.append(emb)

        embeddings = np.vstack(all_embeddings).astype('float32')
        faiss.normalize_L2(embeddings)

        self.index.add(embeddings)
        self.metadata.extend(chunks)

        self._save()
        logger.info(f"Added {len(chunks)} chunks (Total: {self.index.ntotal})")

    def search(self, query, top_k=3, threshold=0.5):
        """
        Search for similarity in both the current KB and verified chat history.
        """
        query_embedding = self.model.encode([query], convert_to_numpy=True).astype('float32')
        faiss.normalize_L2(query_embedding)

        results = []

        # 1. Search in current Knowledge Base
        if self.index and self.index.ntotal > 0:
            results.extend(self._search_index(self.index, self.metadata, query_embedding, top_k, threshold))

        # 2. Search in Verified Chat History (Global)
        if self.history_index and self.history_index.ntotal > 0:
            kb_name = self.active_kb_name()
            history_hits = self._search_index(self.history_index, self.chat_history_verified_meta, query_embedding, top_k, threshold)
            
            # Filter and Boost history hits
            if kb_name:
                history_hits = [h for h in history_hits if h.get("kb_name") == kb_name]
            
            for h in history_hits:
                h["similarity"] += 0.10  # Priority Boost for human-verified answers
            
            results.extend(history_hits)

        # Sort by similarity descending and take top_k
        # After boosting, history items will naturally rank higher
        results.sort(key=lambda r: r["similarity"], reverse=True)
        return results[:top_k]

    def _search_index(self, index, metadata, query_embedding, top_k, threshold):
        """Internal helper to search a specific FAISS index."""
        distances, indices = index.search(query_embedding, min(top_k, index.ntotal))
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx == -1: continue
            sim_score = 1.0 - (dist / 4.0)
            if sim_score >= threshold:
                if idx < len(metadata):
                    chunk = metadata[idx].copy()
                    
                    # Synthesize 'text' field if missing (for chat history items)
                    if "text" not in chunk:
                        q = chunk.get("question", "")
                        a = chunk.get("answer", "")
                        chunk["text"] = f"Question: {q}\nAnswer: {a}"
                    
                    chunk["similarity"] = float(sim_score)
                    results.append(chunk)
        return results

    def active_kb_name(self):
        """Helper to find the kb_name of the currently loaded KB from metadata."""
        if self.metadata:
            return self.metadata[0].get("kb_name")
        return None

    def _is_duplicate(self, question, kb_name):
        """Check if a question already exists in the history or KB for a specific kb_name."""
        # Always reload from disk first to ensure we have manual edits made while server is running
        if os.path.exists(self.chat_history_path):
            try:
                with open(self.chat_history_path, 'r', encoding='utf-8') as f:
                    self.chat_history = json.load(f)
            except Exception as e:
                logger.error(f"Failed to reload chat history for sync: {e}")

        normalized_q = question.strip().lower()
        target_kb = kb_name.strip().lower()
        
        # 1. Check Chat History (scoping by kb_name, case-insensitive)
        for item in self.chat_history:
            item_kb = str(item.get("kb_name", "")).strip().lower()
            if item_kb == target_kb:
                q = (item.get("question") or item.get("original_question") or "").strip().lower()
                if q == normalized_q:
                    return True
        
        # 2. Check current Knowledge Base Metadata (scoping by current loaded KB)
        active_kb = str(self.active_kb_name() or "").strip().lower()
        if active_kb == target_kb:
            for item in self.metadata:
                q_text = item.get("text", "").lower()
                # Use a more precise check for verified metadata to avoid false positives
                # If the exact question is a line in the text or matches closely
                if normalized_q in q_text:
                    return True
                    
        return False

    def save_unverified_query(self, question, kb_name="General"):
        """Log an unanswered user query for admin review in centralized chat history."""
        if self._is_duplicate(question, kb_name):
            logger.info(f"Skipping duplicate query in '{kb_name}': {question[:30]}...")
            return False

        chunk = {
            "doc_id": "unverified_query",
            "chunk_id": f"unverified_{int(time.time())}",
            "kb_name": kb_name,
            "source": {"type": "unverified_query"},
            "question": question,
            "answer": "",
            "tags": ["unverified"],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "verified": False,
            "original_question": question,
        }
        
        self.chat_history.append(chunk)
        self._save_chat_history()
        logger.info(f"Saved unverified query to centralized history for KB '{kb_name}'")
        return True

    def save_interaction(self, question, answer, kb_name="General"):
        """Automatically log an AI interaction in centralized chat history."""
        if self._is_duplicate(question, kb_name):
            logger.info(f"Skipping duplicate chat interaction in '{kb_name}': {question[:30]}...")
            return False

        chunk = {
            "doc_id": "chat_interaction",
            "chunk_id": f"chat_{int(time.time())}",
            "kb_name": kb_name,
            "source": {"type": "chat_history"},
            "question": question,
            "answer": answer,
            "tags": ["chat_history"],
            "verified": False,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        
        self.chat_history.append(chunk)
        self._save_chat_history()
        logger.info(f"Automatically logged AI interaction to centralized history for KB '{kb_name}'")
        return True

    def save_memory(self, question, answer, kb_name="General", tags=None):
        """
        Save a verified Q/A pair as a memory item in centralized chat history.
        """
        if self._is_duplicate(question, kb_name):
            logger.info(f"Skipping duplicate manual memory item in '{kb_name}': {question[:30]}...")
            return False

        if tags is None:
            tags = ["memory", "verified"]

        # Remove 'unverified' tag if caller accidentally included it
        tags = [t for t in tags if t != "unverified"]
        chunk = {
            "doc_id": "memory_item",
            "chunk_id": f"memory_{int(time.time())}",
            "kb_name": kb_name,
            "source": {"type": "manual_entry"},
            "question": question,
            "answer": answer,
            "tags": tags,
            "verified": True,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        self.chat_history.append(chunk)
        self._save_chat_history()
        self._rebuild_history_index()
        logger.info(f"Saved verified manual memory item to centralized history for KB '{kb_name}'")
        return True

    def get_chat_history(self, kb_name=None, page=1, page_size=10):
        """
        Get chat history items from centralized store with filtering and pagination.
        """
        items = self.chat_history
        
        # Filter by KB if requested
        if kb_name:
            items = [item for item in items if item.get("kb_name") == kb_name]
            
        # Sort by latest first
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        
        # Pagination
        total = len(items)
        start = (page - 1) * page_size
        end = start + page_size
        
        return {
            "items": items[start:end],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        }

    def update_chunk(self, chunk_id, new_text, tags=None):
        """
        Update a chunk's text and mark it as verified.
        Keeps verified history items in chat_history.json but updates their status.
        """
        # 1. Search in chat history
        history_idx = next(
            (i for i, item in enumerate(self.chat_history) if item.get("chunk_id") == chunk_id),
            -1
        )

        if history_idx != -1:
            logger.info(f"Verifying item '{chunk_id}' in chat history...")
            item = self.chat_history[history_idx]
            
            # Update data keys
            item["answer"] = new_text
            item["verified"] = True
            
            # Remove 'text' key if it exists (cleaning up old entries)
            if "text" in item:
                del item["text"]
            
            if tags is not None:
                self.chat_history[history_idx]["tags"] = tags
            else:
                current_tags = self.chat_history[history_idx].get("tags", [])
                current_tags = [t for t in current_tags if t not in ["unverified", "chat_history"]]
                if "verified" not in current_tags:
                    current_tags.append("verified")
                self.chat_history[history_idx]["tags"] = current_tags

            # Rebuild history index to include this newly verified item
            self._rebuild_history_index()
            self._save_chat_history()
            return True

        # 2. Search in current KB metadata (for items already in KB)
        target_idx = next(
            (i for i, item in enumerate(self.metadata) if item.get("chunk_id") == chunk_id),
            -1
        )
        # ... (rest of the KB update logic remains the same)

        if target_idx != -1:
            logger.info(f"Updating verified chunk '{chunk_id}'...")
            self.metadata[target_idx]["text"] = new_text
            self.metadata[target_idx]["verified"] = True

            if tags is not None:
                self.metadata[target_idx]["tags"] = tags
            else:
                current_tags = self.metadata[target_idx].get("tags", [])
                current_tags = [t for t in current_tags if t != "unverified"]
                if "verified" not in current_tags:
                    current_tags.append("verified")
                self.metadata[target_idx]["tags"] = current_tags

            self._rebuild_index()
            self._save()
            logger.info(f"Chunk '{chunk_id}' updated and verified")
            return True

        logger.error(f"Chunk ID '{chunk_id}' not found in history or current KB")
        return False

    def delete_chunk(self, chunk_id):
        """
        Delete a chunk by ID from history or metadata.
        Returns True on success, False if not found.
        """
        # 1. Try deleting from chat history
        original_history_len = len(self.chat_history)
        self.chat_history = [item for item in self.chat_history if item.get("chunk_id") != chunk_id]
        
        if len(self.chat_history) < original_history_len:
            self._rebuild_history_index()
            self._save_chat_history()
            logger.info(f"Chunk '{chunk_id}' deleted from history")
            return True

        # 2. Try deleting from KB metadata
        original_meta_len = len(self.metadata)
        self.metadata = [item for item in self.metadata if item.get("chunk_id") != chunk_id]

        if len(self.metadata) < original_meta_len:
            self._rebuild_index()
            self._save()
            logger.info(f"Chunk '{chunk_id}' deleted from KB metadata")
            return True

        logger.warning(f"Chunk ID '{chunk_id}' not found for deletion")
        return False

    def _rebuild_index(self):
        """
        Re-encode all stored texts and rebuild the FAISS index from scratch.
        Batched to handle large stores without OOM.
        """
        self.index = faiss.IndexFlatL2(self.dimension)
        if not self.metadata:
            return

        texts = [m.get("text", "") for m in self.metadata]
        logger.info(f"Re-indexing {len(texts)} items...")

        batch_size = 64
        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            emb = self.model.encode(batch, convert_to_numpy=True)
            all_embeddings.append(emb)

        embeddings = np.vstack(all_embeddings).astype('float32')
        faiss.normalize_L2(embeddings)
        self.index.add(embeddings)
        logger.info(f"Index rebuilt ({self.index.ntotal} items)")

    def get_existing_files(self):
        """Returns a set of unique file names already present in the metadata."""
        return set(m.get("source", {}).get("file", "") for m in self.metadata if "source" in m)