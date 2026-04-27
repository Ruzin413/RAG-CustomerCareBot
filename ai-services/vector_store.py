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
            raise e

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
        """Save index and metadata to disk."""
        faiss.write_index(self.index, self.index_path)
        with open(self.meta_path, 'w', encoding='utf-8') as f:
            json.dump(self.metadata, f, ensure_ascii=False, indent=2)

    def add_chunks(self, chunks):
        """
        Add a list of chunk dictionaries to the vector store.
        Expected chunk format:
        {
            "doc_id": "...",
            "chunk_id": "...",
            "source": {...},
            "text": "...",
            "tags": [...],
            "created_at": "..."
        }
        """
        if not chunks:
            return

        texts = [chunk.get("text", "") for chunk in chunks]
        
        logger.info(f"Encoding {len(texts)} chunks...")
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        
        # FAISS expects float32
        embeddings = np.array(embeddings).astype('float32')
        
        # Ensure L2 normalization for cosine similarity-like behavior with L2 index
        faiss.normalize_L2(embeddings)

        self.index.add(embeddings)
        self.metadata.extend(chunks)
        
        self._save()
        logger.info(f"✓ Added {len(chunks)} chunks to vector store (Total: {self.index.ntotal})")

    def search(self, query, top_k=3, threshold=0.8):
        """
        Search for the top_k most similar chunks.
        Note: Since embeddings are L2 normalized, L2 distance relates to cosine similarity.
        Smaller L2 distance = more similar. L2 dist of 0 means identical, 2 means exactly opposite.
        A reasonable threshold for 'close match' is distance < 1.0 (approx cosine sim > 0.5).
        """
        if self.index.ntotal == 0:
            return []

        query_embedding = self.model.encode([query], convert_to_numpy=True)
        query_embedding = np.array(query_embedding).astype('float32')
        faiss.normalize_L2(query_embedding)

        # distances are L2 squared distances
        distances, indices = self.index.search(query_embedding, top_k)
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx == -1:
                continue
            
            # Convert L2 squared distance to something like a similarity score (1.0 = perfect match)
            # dist is between 0 and 4. 
            sim_score = 1.0 - (dist / 4.0)
            
            if sim_score >= threshold:
                chunk = self.metadata[idx].copy()
                chunk["similarity"] = sim_score
                results.append(chunk)

        return results

    def save_memory(self, question, answer, tags=None):
        """
        Save a new Q/A pair as an unverified memory item immediately.
        """
        if tags is None:
            tags = ["memory", "unverified"]
            
        chunk = {
            "doc_id": "memory_item",
            "chunk_id": f"memory_{int(time.time())}",
            "source": {"type": "conversation"},
            "text": f"Question: {question}\nAnswer: {answer}",
            "tags": tags,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "unverified": True
        }
        
        self.add_chunks([chunk])
        logger.info("✓ Saved new memory item to vector store")

    def get_unverified(self):
        """
        Return all items tagged as unverified.
        """
        return [item for item in self.metadata if item.get("unverified") is True]

    def update_chunk(self, chunk_id, new_text, tags=None):
        """
        Update a chunk's text and re-index the entire store to keep it simple.
        """
        target_idx = -1
        for i, item in enumerate(self.metadata):
            if item.get("chunk_id") == chunk_id:
                target_idx = i
                break
        
        if target_idx == -1:
            logger.error(f"Chunk ID {chunk_id} not found for update")
            return False

        logger.info(f"Updating chunk {chunk_id}...")
        
        # Update metadata
        self.metadata[target_idx]["text"] = new_text
        self.metadata[target_idx]["unverified"] = False
        
        if tags:
            self.metadata[target_idx]["tags"] = tags
        else:
            # Clean up tags
            current_tags = self.metadata[target_idx].get("tags", [])
            if "unverified" in current_tags:
                current_tags.remove("unverified")
            if "verified" not in current_tags:
                current_tags.append("verified")
            self.metadata[target_idx]["tags"] = current_tags

        # Rebuild the FAISS index
        self._rebuild_index()
        self._save()
        return True

    def delete_chunk(self, chunk_id):
        """
        Delete a chunk by ID.
        """
        new_metadata = [item for item in self.metadata if item.get("chunk_id") != chunk_id]
        if len(new_metadata) == len(self.metadata):
            return False
            
        self.metadata = new_metadata
        self._rebuild_index()
        self._save()
        return True

    def _rebuild_index(self):
        """Re-encode all texts and re-initialize the FAISS index."""
        self.index = faiss.IndexFlatL2(self.dimension)
        if not self.metadata:
            return
            
        texts = [m.get("text", "") for m in self.metadata]
        logger.info(f"Re-indexing {len(texts)} items...")
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        embeddings = np.array(embeddings).astype('float32')
        faiss.normalize_L2(embeddings)
        self.index.add(embeddings)
        logger.info("✓ Index rebuilt")
