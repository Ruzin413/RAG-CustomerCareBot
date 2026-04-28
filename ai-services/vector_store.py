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

        logger.info(f"Loading embedding model: {model_name}...")
        try:
            self.model = SentenceTransformer(model_name)
            self.dimension = self.model.get_sentence_embedding_dimension()
            logger.info(f"✓ Model loaded (dimension: {self.dimension})")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise

        # Load or initialize FAISS index
        if os.path.exists(self.index_path) and os.path.exists(self.meta_path):
            try:
                self.index = faiss.read_index(self.index_path)
                with open(self.meta_path, 'r', encoding='utf-8') as f:
                    self.metadata = json.load(f)
                logger.info(f"✓ Loaded existing vector store with {self.index.ntotal} items")
            except Exception as e:
                logger.error(f"Failed to load vector store: {e}. Creating new one.")
                self.index = faiss.IndexFlatL2(self.dimension)
                self.metadata = []
        else:
            logger.info("Initializing new vector store")
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
        logger.info(f"✓ Added {len(chunks)} chunks (Total: {self.index.ntotal})")

    def search(self, query, top_k=3, threshold=0.5):
        """
        Search for the top_k most similar chunks above similarity threshold.

        Embeddings are L2-normalized, so L2 distance relates to cosine similarity:
          cosine_sim ≈ 1 - (L2_dist² / 2)
        We use: sim_score = 1.0 - (dist / 4.0)  (dist in [0,4] for normalized vecs)

        Threshold=0.5 means we require at least ~50% cosine similarity.
        Unverified items are returned with their flag intact so callers can filter.
        """
        if self.index.ntotal == 0:
            return []

        query_embedding = self.model.encode([query], convert_to_numpy=True).astype('float32')
        faiss.normalize_L2(query_embedding)

        distances, indices = self.index.search(query_embedding, min(top_k, self.index.ntotal))

        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx == -1:
                continue
            sim_score = 1.0 - (dist / 4.0)
            if sim_score >= threshold:
                chunk = self.metadata[idx].copy()
                chunk["similarity"] = float(sim_score)
                results.append(chunk)

        # Sort by similarity descending
        results.sort(key=lambda r: r["similarity"], reverse=True)
        return results

    def save_unverified_query(self, question):
        """
        Log an unanswered user query for admin review.

        Key difference from old save_memory():
        - Stores ONLY the question (no fake answer string).
        - Marks unverified=True so stage1 can filter it out of live results.
        - Does NOT embed a misleading "Pending Admin Review" answer that could
          surface as a real result in future searches.
        """
        chunk = {
            "doc_id": "unverified_query",
            "chunk_id": f"unverified_{int(time.time())}",
            "source": {"type": "unverified_query"},
            "text": f"Unanswered question: {question}",
            "tags": ["unverified"],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "unverified": True,
            "original_question": question,
        }
        self.add_chunks([chunk])
        logger.info("✓ Saved unverified query for admin review")

    def save_memory(self, question, answer, tags=None):
        """
        Save a verified Q/A pair as a memory item.
        Use this only when both question AND answer are known/verified.
        For unanswered queries use save_unverified_query() instead.
        """
        if tags is None:
            tags = ["memory"]

        # Remove 'unverified' tag if caller accidentally included it
        tags = [t for t in tags if t != "unverified"]

        chunk = {
            "doc_id": "memory_item",
            "chunk_id": f"memory_{int(time.time())}",
            "source": {"type": "conversation"},
            "text": f"Question: {question}\nAnswer: {answer}",
            "tags": tags,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "unverified": False,
        }
        self.add_chunks([chunk])
        logger.info("✓ Saved verified memory item")

    def get_unverified(self):
        """Return all items tagged as unverified (pending admin review)."""
        return [item for item in self.metadata if item.get("unverified") is True]

    def update_chunk(self, chunk_id, new_text, tags=None):
        """
        Update a chunk's text and mark it as verified, then rebuild the index.
        Returns True on success, False if chunk_id not found.
        """
        target_idx = next(
            (i for i, item in enumerate(self.metadata) if item.get("chunk_id") == chunk_id),
            -1
        )

        if target_idx == -1:
            logger.error(f"Chunk ID '{chunk_id}' not found for update")
            return False

        logger.info(f"Updating chunk '{chunk_id}'...")
        self.metadata[target_idx]["text"] = new_text
        self.metadata[target_idx]["unverified"] = False

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
        logger.info(f"✓ Chunk '{chunk_id}' updated and verified")
        return True

    def delete_chunk(self, chunk_id):
        """
        Delete a chunk by ID. Returns True on success, False if not found.
        """
        original_len = len(self.metadata)
        self.metadata = [item for item in self.metadata if item.get("chunk_id") != chunk_id]

        if len(self.metadata) == original_len:
            logger.warning(f"Chunk ID '{chunk_id}' not found for deletion")
            return False

        self._rebuild_index()
        self._save()
        logger.info(f"✓ Chunk '{chunk_id}' deleted")
        return True

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
        logger.info(f"✓ Index rebuilt ({self.index.ntotal} items)")