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
Processes user queries and returns a grounded AI response or navigation command.
- **Headers:** `{ "X-API-Key": "ft-customer-care-secret-2026" }`
- **JSON Payload:** 
  ```json
  { 
    "message": "String", 
    "kb_name": "String (Optional)" 
  }
  ```
- **Response:**
  ```json
  { 
    "status": "success", 
    "answer": "String", 
    "intent": "String", 
    "redirect_to": "/path", 
    "source": "Knowledge Base",
    "metadata": {
        "timestamp": "2026-04-29 13:00:00",
        "timing_breakdown": { "total_latency": "150.5ms" }
    }
  }
  ```

### `POST /clear-cache`
Manually unloads AI models from memory (RAM/VRAM).
- **Response:** `{ "status": "success", "message": "Memory cleared" }`

### `GET /health`
Basic health check.
- **Response:** `{ "status": "healthy", "service": "Chatbot API", "timestamp": "..." }`

---

## 2. Knowledge Base Management

### `POST /upload`
Initializes a new Knowledge Base system or adds files to an existing one.
- **Multipart Form:** `kb_name` (String), `file` (Files), `custom_names` (JSON Array string)
- **Response:** 
  ```json
  { 
    "status": "success", 
    "total_chunks": 150,
    "processed_files": [{ "file": "doc.pdf", "chunks": 50, "duration": "1.2s" }],
    "failed_files": [] 
  }
  ```

### `POST /knowledge-bases/<kb_name>/append`
Adds more documents specifically to an existing Knowledge Base.
- **Multipart Form:** `file` (Files), `custom_names` (JSON Array string)

### `GET /knowledge-bases`
Returns a registry of all active Knowledge Systems.
- **Response:** 
  ```json
  { 
    "status": "success", 
    "knowledge_bases": { 
      "General": { "jsonfile": "general_meta.json", "binfile": "general_index.bin" } 
    } 
  }
  ```

### `DELETE /knowledge-bases/<name>`
Completely removes a Knowledge Base system and its files.

### `GET /stats`
Returns total chunks loaded in the active vector store.

---

## 3. Learning Loop (Admin)

### `GET /chat-history`
Retrieves logs from the centralized `chat_history.json`.
- **Query Params:** `kb_name` (Optional), `page` (Int), `page_size` (Int)
- **Response:** `{ "items": [...], "total": 50, "page": 1, "total_pages": 5 }`

### `POST /unverified/update`
Edits and verifies a chat log entry.
- **JSON Payload:** `{ "chunk_id": "String", "text": "String", "kb_name": "String" }`

### `POST /unverified/delete`
Permanently discards a chat interaction.

### `POST /memory/add`
Manually insert a pre-verified Q/A pair.

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
