# RAG Chatbot API Reference

**Base URL:** `http://localhost:8001/CustomerCare`

---

## 🔒 Authorization
All endpoints require a static API Key for security.
- **Header:** `X-API-Key: ft-customer-care-secret-2026`
- **Cookie:** `admin_token=ft-customer-care-secret-2026`
- **Logic:** The backend `verify_token` dependency checks both Header and Cookie. If either contains the correct token, access is granted.

---

## 1. Chat & Processing

### `POST /process` (or `/chat`)
Processes user queries using the 3-stage hybrid pipeline.
- **Headers:** 
  - `X-API-Key: ft-customer-care-secret-2026`
  - `Content-Type: application/json`
- **JSON Payload:** 
  ```json
  { 
    "message": "String", 
    "kb_name": "String (Optional)" 
  }
  ```
- **Response (200 OK):**
  ```json
  { 
    "status": "success", 
    "intent": "String", 
    "answer": "String", 
    "redirect_to": "/path or null", 
    "source": "Knowledge Base | Fallback (Local)",
    "metadata": {
        "timestamp": "2026-04-30 10:00:00",
        "timing_breakdown": { 
          "semantic_search": "45ms",
          "reranking": "30ms",
          "generation": "120ms",
          "total_latency": "195ms" 
        }
    }
  }
  ```

### `POST /clear-cache`
Manually unloads AI models from memory and clears GPU cache.
- **Headers:** None required.
- **Response (200 OK):** 
  ```json
  { 
    "status": "success", 
    "message": "Model memory cleared and GPU cache emptied. Note: Models will re-load on the next query." 
  }
  ```

### `GET /health`
Basic health check to verify service availability.
- **Headers:** None required.
- **Response (200 OK):** 
  ```json
  { 
    "status": "healthy", 
    "service": "Chatbot API", 
    "timestamp": "2026-04-30 10:00:00" 
  }
  ```

---

## 2. Knowledge Base Management

### `POST /upload`
Initializes a new Knowledge Base or adds files to an existing one.
- **Headers:** `X-API-Key: ft-customer-care-secret-2026`
- **Multipart Form:** 
  - `kb_name`: "String" (Default: "General")
  - `file`: (Files) Multiple files supported
  - `custom_names`: (JSON Array string) Optional display names
- **Response (200 OK):** 
  ```json
  { 
    "status": "success", 
    "message": "Processed 2 files, 0 failed",
    "total_chunks": 150,
    "processed_files": [
      { "file": "manual.pdf", "chunks": 120, "duration": "1.5s" }
    ],
    "failed_files": [],
    "processing_stats": {
      "total_time": "2.1s",
      "completion_timestamp": "2026-04-30 10:05:00"
    }
  }
  ```

### `POST /knowledge-bases/<kb_name>/append`
Adds documents specifically to an existing Knowledge Base.
- **Headers:** `X-API-Key: ft-customer-care-secret-2026`
- **Multipart Form:** 
  - `file`: (Files) Multiple files supported
  - `custom_names`: (JSON Array string) Optional
- **Response (200 OK):** Same structure as `/upload`.

### `GET /knowledge-bases`
Returns a registry of all active Knowledge Systems.
- **Headers:** `X-API-Key: ft-customer-care-secret-2026`
- **Response (200 OK):** 
  ```json
  { 
    "status": "success", 
    "knowledge_bases": { 
      "General": { "jsonfile": "general_meta.json", "binfile": "general_index.bin" },
      "Technical": { "jsonfile": "tech_meta.json", "binfile": "tech_index.bin" }
    } 
  }
  ```

### `POST /knowledge-bases`
Manually registers or updates a Knowledge Base configuration.
- **Headers:** 
  - `X-API-Key: ft-customer-care-secret-2026`
  - `Content-Type: application/json`
- **JSON Payload:**
  ```json
  {
    "name": "String",
    "jsonfile": "String (path)",
    "binfile": "String (path)"
  }
  ```
- **Response (200 OK):** `{ "status": "success", "message": "Knowledge base 'Name' updated" }`

### `DELETE /knowledge-bases/<name>`
Removes a Knowledge Base configuration and deletes its physical vector files.
- **Headers:** `X-API-Key: ft-customer-care-secret-2026`
- **Response (200 OK):** 
  ```json
  { "status": "success", "message": "Knowledge base 'Name' and its files have been deleted" }
  ```

### `GET /stats`
Returns the total number of chunks currently indexed in the active vector store.
- **Headers:** None required.
- **Response (200 OK):** 
  ```json
  { 
    "status": "success", 
    "total_chunks": 1540, 
    "message": "Vector store stats retrieved" 
  }
  ```

---

## 3. Learning Loop (Admin)

### `GET /chat-history`
Retrieves interaction logs from `chat_history.json` with support for filtering and pagination.
- **Headers:** `X-API-Key: ft-customer-care-secret-2026`
- **Query Params:** 
  - `kb_name`: "String" (Optional)
  - `page`: Integer (Default: 1)
  - `page_size`: Integer (Default: 10)
- **Response (200 OK):** 
  ```json
  { 
    "status": "success",
    "items": [
      { "chunk_id": "...", "question": "...", "answer": "...", "verified": false, "kb_name": "..." }
    ], 
    "total": 50, 
    "page": 1, 
    "total_pages": 5 
  }
  ```

### `POST /unverified/update`
Edits and promotes an unverified chat log entry to the verified knowledge base.
- **Headers:** 
  - `X-API-Key: ft-customer-care-secret-2026`
  - `Content-Type: application/json`
- **JSON Payload:** 
  ```json
  { 
    "chunk_id": "String", 
    "text": "String (new answer)", 
    "kb_name": "String" 
  }
  ```
- **Response (200 OK):** 
  ```json
  { "status": "success", "message": "Item verified and moved to permanent knowledge base" }
  ```

### `POST /unverified/delete`
Permanently discards an unverified chat interaction.
- **Headers:** 
  - `X-API-Key: ft-customer-care-secret-2026`
  - `Content-Type: application/json`
- **JSON Payload:** 
  ```json
  { 
    "chunk_id": "String", 
    "kb_name": "String (Optional)" 
  }
  ```
- **Response (200 OK):** 
  ```json
  { "status": "success", "message": "Item deleted successfully" }
  ```

### `POST /memory/add`
Manually inserts a pre-verified Question/Answer pair into a specific knowledge base history.
- **Headers:** 
  - `X-API-Key: ft-customer-care-secret-2026`
  - `Content-Type: application/json`
- **JSON Payload:** 
  ```json
  { 
    "question": "String", 
    "answer": "String", 
    "kb_name": "String" 
  }
  ```
- **Response (200 OK):** 
  ```json
  { "status": "success", "message": "Successfully added new question to 'Name' chat history" }
  ```

---

## 4. Frontend Implementation Hooks

```javascript
const API_KEY = 'ft-customer-care-secret-2026';
const BASE_URL = 'http://localhost:8001/CustomerCare';

// Example: Chat Processing
const sendChat = async (message, kbName) => {
  const res = await fetch(`${BASE_URL}/process`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'X-API-Key': API_KEY 
    },
    body: JSON.stringify({ message, kb_name: kbName })
  });
  return await res.json();
};
```

---

## 5. Navigation Map
The system uses `ai-services/navigation_utils.py` to handle redirects.

| Shortcut | Keywords | Path |
| :--- | :--- | :--- |
| `report` | report | `/report` |
| `history` | history | `/history` |
| `payment` | payment, pay | `/payment` |
