# RAG Chatbot API Reference

**Base URL:** `http://localhost:8001/CustomerCare`

---

## 🔒 Authorization
The system uses two static tokens for different security levels.
- **Admin Token:** `admin123` (Full access to all endpoints)
- **Chat Token:** `customer-bot-token` (Access only to `/process` and `/chat`)

**Header:** `X-Api-Key: <token>`
**Cookie:** `admin_token=<token>`
**Body (Chat only):** `{ "token": "<token>", ... }`

**Logic:** The backend checks Header, Cookie, or Body (for chat) for a valid token.

---

## 1. Authentication & Session

### `POST /login`
Verifies the administrative token and returns the user's role.
- **Headers:** `Content-Type: application/json`
- **JSON Payload:** 
  ```json
  { "token": "admin123" }
  ```
- **Response (200 OK):**
  ```json
  { 
    "status": "success", 
    "role": "admin", 
    "token": "admin123" 
  }
  ```
- **Error (401 Unauthorized):**
  ```json
  { "detail": "Invalid admin token" }
  ```

---

## 2. Chat & Processing

### `POST /process` (or `/chat`)
Processes user queries using the 3-stage hybrid RAG pipeline.
- **Headers:** 
  - `X-Api-Key: customer-bot-token` (or admin123/cookie)
  - `Content-Type: application/json`
- **JSON Payload:** 
  ```json
  { 
    "message": "String", 
    "kb_name": "String (Optional)",
    "token": "customer-bot-token (Optional/Alternative to Header)"
  }
  ```
- **Response (200 OK):**
  ```json
  { 
    "status": "success", 
    "intent": "faq | greeting | goodbye | navigate", 
    "answer": "String", 
    "redirect_to": "/path or null", 
    "source": "Knowledge Base | Fallback (Local)",
    "metadata": {
        "timestamp": "2026-05-03 10:00:00",
        "timing_breakdown": { 
          "total_latency": "195.5ms" 
        }
    }
  }
  ```

> [!NOTE]
> **Navigation Logic:** When the system detects a `navigate` intent (e.g., "go to reports"), it matches keywords against the `NAV_MAP`. If a match is found, the response includes a non-null `redirect_to` path, which the frontend can use to perform an automatic client-side redirect.

### `POST /clear-cache`
Manually unloads AI models from memory and clears GPU cache (CUDA).
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
    "timestamp": "2026-05-03 10:00:00" 
  }
  ```

---

## 3. Knowledge Base Management

### `POST /upload`
Initializes a new Knowledge Base or adds files to an existing one.
- **Headers:** `X-Api-Key: admin123`
- **Multipart Form:** 
  - `kb_name`: "String" **(Required)** — Name of the knowledge base
  - `file`: (Files) Multiple files supported. The original filename is used as the display name.
- **Error (400 Bad Request):** `{ "detail": "kb_name is required and cannot be empty" }`
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
      "completion_timestamp": "2026-05-03 10:05:00"
    }
  }
  ```

### `POST /knowledge-bases/<kb_name>/append`
Adds documents specifically to an existing Knowledge Base.
- **Headers:** `X-Api-Key: admin123`
- **Multipart Form:** 
  - `file`: (Files) Multiple files supported. The original filename is used as the display name.
- **Response (200 OK):** Same structure as `/upload`.

### `GET /knowledge-bases`
Returns a registry of all active Knowledge Systems.
- **Headers:** `X-Api-Key: admin123`
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
  - `X-Api-Key: admin123`
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
- **Headers:** `X-Api-Key: admin123`
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

## 4. Learning Loop (Admin)

### `GET /chat-history`
Retrieves interaction logs with support for filtering and pagination.
- **Headers:** `X-Api-Key: admin123`
- **Query Params:** 
  - `kb_name`: "String" (Optional)
  - `page`: Integer (Default: 1)
  - `page_size`: Integer (Default: 10)
- **Response (200 OK):** 
  ```json
  { 
    "status": "success",
    "items": [
      { "chunk_id": "...", "question": "...", "answer": "...", "verified": false, "kb_name": "...", "created_at": "..." }
    ], 
    "total": 50, 
    "page": 1, 
    "total_pages": 5 
  }
  ```

### `POST /unverified/update`
Edits and promotes an unverified chat log entry to the verified knowledge base.
- **Headers:** 
  - `X-Api-Key: admin123`
  - `Content-Type: application/json`
- **JSON Payload:** 
  ```json
  { 
    "chunk_id": "String", 
    "text": "String (new answer)", 
    "kb_name": "String (Optional)" 
  }
  ```
- **Response (200 OK):** 
  ```json
  { "status": "success", "message": "Item verified and moved to permanent knowledge base" }
  ```

### `POST /unverified/delete`
Permanently discards an unverified chat interaction.
- **Headers:** 
  - `X-Api-Key: admin123`
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
Manually inserts a pre-verified Question/Answer pair.
- **Headers:** 
  - `X-Api-Key: admin123`
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

## 5. Navigation Map
The system detects navigation intent and provides a `redirect_to` path.

| Shortcut | Keywords | Path |
| :--- | :--- | :--- |
| `report` | report | `/report` |

---

## 6. Frontend Implementation Hooks

```javascript
const CHAT_TOKEN = 'customer-bot-token';
const ADMIN_TOKEN = 'admin123';
const BASE_URL = 'http://localhost:8001/CustomerCare';

// Example: Chat Processing
const sendChat = async (message, kbName) => {
  const res = await fetch(`${BASE_URL}/process`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'X-Api-Key': CHAT_TOKEN 
    },
    body: JSON.stringify({ message, kb_name: kbName })
  });
  return await res.json();
};
```
