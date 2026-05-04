import os
import json
import logging
import time
import asyncio
from typing import List, Optional, Dict
from fastapi import FastAPI, Request, File, UploadFile, Form, HTTPException, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
# Import our modular layers
from document_processor import DocumentProcessor
from vector_store import VectorStore
from hybrid_pipeline import HybridPipeline
from translation_service import TranslationService
# Load environment variables
load_dotenv()
tags_metadata = [
    {
        "name": "Authentication",
        "description": "Operations with authentication.",
    },
    {
        "name": "Chat",
        "description": "Endpoints for user chat interactions with the RAG pipeline.",
    },
    {
        "name": "Knowledge Base",
        "description": "Manage document uploads and Knowledge Bases.",
    },
    {
        "name": "Memory & History",
        "description": "Manage verified and unverified chat memory items.",
    },
    {
        "name": "System",
        "description": "System health and administrative endpoints.",
    }
]
app = FastAPI(
    title="RAG CustomerCare API", 
    version="2.0.0",
    description="API for the RAG CustomerCareBot system, supporting hybrid retrieval, document ingestion, and chat history management.",
    openapi_tags=tags_metadata
)
# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create API Router (Equivalent to FastAPI APIRouter)
router = APIRouter(prefix='/CustomerCare')

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    force=True
)
logger = logging.getLogger(__name__)

# Constants
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)
KB_CONFIG_FILE = os.path.join(DATA_DIR, "knowledge_bases.json")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin123")
CHAT_TOKEN = os.getenv("CHAT_TOKEN", "customer-bot-token")

from fastapi import Header, Cookie

async def verify_token(
    x_api_key: Optional[str] = Header(None), 
    admin_token: Optional[str] = Cookie(None)
):
    """Dependency to verify static token from header or cookie."""
    if x_api_key == ADMIN_TOKEN or admin_token == ADMIN_TOKEN:
        return True
    raise HTTPException(status_code=401, detail="Unauthorized: Invalid or missing API Token")

class MemoryAddRequest(BaseModel):
    question: str
    answer: str
    kb_name: str

class LoginRequest(BaseModel):
    token: str

def load_kb_config():
    if os.path.exists(KB_CONFIG_FILE):
        try:
            if os.path.getsize(KB_CONFIG_FILE) > 0:
                with open(KB_CONFIG_FILE, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading KB config: {e}. Resetting to empty.")
    return {}

def save_kb_config(config):
    with open(KB_CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

# Initialize Processors and Vector Store
doc_processor = DocumentProcessor()
vector_store = VectorStore()
ai_pipeline = HybridPipeline(vector_store=vector_store)
translation_service = TranslationService()

# Pydantic Models for Request Bodies
class ChatRequest(BaseModel):
    message: str
    kb_name: Optional[str] = None
    token: Optional[str] = None

class UpdateUnverifiedRequest(BaseModel):
    chunk_id: str
    text: str
    kb_name: Optional[str] = None

class DeleteUnverifiedRequest(BaseModel):
    chunk_id: str
    kb_name: Optional[str] = None

class AddKBRequest(BaseModel):
    name: str
    jsonfile: str
    binfile: str

# Helper Functions
async def process_and_add_files(kb_name, uploaded_files: List[UploadFile], target_kb, is_new_kb=False):
    """Helper to process files and add them to a specific KB."""
    # Ensure KB files exist
    meta_path = target_kb['jsonfile']
    index_path = target_kb['binfile']
    
    # Load the target KB into the vector store first
    vector_store.load_kb(index_path, meta_path)
    
    # Track existing files to avoid duplicates
    existing_files = set(item.get("source", {}).get("file") for item in vector_store.metadata)
    
    results = []
    total_chunks = 0
    failed_files = []
    start_time = time.time()

    for file in uploaded_files:
        display_name = file.filename
        if not display_name:
            continue
            
        if display_name in existing_files:
            logger.warning(f"Skipping '{display_name}': Already exists in '{kb_name}'.")
            failed_files.append({"file": display_name, "error": "Already exists"})
            continue
            
        file_start_time = time.time()
        try:
            # Extraction
            # In FastAPI, we need to read the file stream
            # We wrap it in a bytes object that mimics a file-like object
            import io
            content = await file.read()
            file_stream = io.BytesIO(content)
            
            if file.filename.endswith('.docx'):
                units = doc_processor.extract_text_from_docx(file_stream)
            elif file.filename.endswith('.pdf'):
                units = doc_processor.extract_text_from_pdf(file_stream)
            elif file.filename.endswith(('.pptx', '.ppt')):
                units = doc_processor.extract_text_from_ppt(file_stream)
            elif file.filename.endswith('.txt'):
                text = content.decode('utf-8')
                units = [p.strip() for p in text.split('\n\n') if p.strip()]
            else:
                failed_files.append({"file": file.filename, "error": "Unsupported format"})
                continue

            if not units:
                failed_files.append({"file": display_name, "error": "No content extracted"})
                continue

            # Chunking
            chunks = doc_processor.extract_chunks(display_name, units, kb_name=kb_name)
            if not chunks:
                failed_files.append({"file": display_name, "error": "No chunks generated"})
                continue

            # Storage
            vector_store.add_chunks(chunks)
            total_chunks += len(chunks)
            
            results.append({
                "file": display_name,
                "chunks": len(chunks),
                "duration": f"{time.time() - file_start_time:.2f}s"
            })
            logger.info(f"[DONE] Finished {display_name}")
        except Exception as e:
            logger.error(f"[ERROR] Error processing {display_name}: {e}")
            failed_files.append({"file": display_name, "error": str(e)})

    # Persist changes
    if total_chunks > 0:
        vector_store._save()
        
        if is_new_kb:
            kb_config = load_kb_config()
            kb_config[kb_name] = target_kb
            save_kb_config(kb_config)
            logger.info(f"Registered new KB: {kb_name}")
    
    total_duration = time.time() - start_time
    completion_time = time.strftime("%Y-%m-%d %H:%M:%S")

    return {
        "status": "success" if results else "error",
        "message": f"Processed {len(results)} files, {len(failed_files)} failed",
        "total_chunks": total_chunks,
        "processed_files": results,
        "failed_files": failed_files,
        "processing_stats": {
            "total_time": f"{total_duration:.2f}s",
            "completion_timestamp": completion_time
        }
    }

# API Endpoints

@router.post('/login', tags=["Authentication"])
async def login(request: LoginRequest):
    """Verify admin token and return user role"""
    if request.token == ADMIN_TOKEN:
        return {"status": "success", "role": "admin", "token": ADMIN_TOKEN}
    raise HTTPException(status_code=401, detail="Invalid admin token")

@router.post('/upload', dependencies=[Depends(verify_token)], tags=["Knowledge Base"])
async def upload_document(
    kb_name: str = Form(...),
    file: List[UploadFile] = File(...)
):
    """Upload and process multiple documents into a new or existing KB"""
    # Validate kb_name
    if not kb_name or not kb_name.strip():
        raise HTTPException(status_code=400, detail="kb_name is required and cannot be empty")
    
    kb_name = kb_name.strip()
    uploaded_files = file

    kb_config = load_kb_config()
    is_new_kb = kb_name not in kb_config
    
    if is_new_kb:
        safe_name = "".join(x for x in kb_name if x.isalnum() or x in "._-").strip()
        target_kb = {
            "jsonfile": os.path.join(DATA_DIR, f"{safe_name.lower()}_meta.json"),
            "binfile": os.path.join(DATA_DIR, f"{safe_name.lower()}_index.bin")
        }
    else:
        target_kb = kb_config[kb_name]
    result = await process_and_add_files(kb_name, uploaded_files, target_kb, is_new_kb=is_new_kb)
    if result["status"] == "error" and not result["processed_files"]:
        raise HTTPException(status_code=500, detail=result)
    return result

@router.post('/knowledge-bases/{kb_name}/append', dependencies=[Depends(verify_token)], tags=["Knowledge Base"])
async def append_to_kb(
    kb_name: str,
    file: List[UploadFile] = File(...)
):
    """Add more files to an existing Knowledge Base"""
    try:
        uploaded_files = file

        kb_config = load_kb_config()
        if kb_name not in kb_config:
            raise HTTPException(status_code=404, detail=f"KB '{kb_name}' not found")
            
        target_kb = kb_config[kb_name]
        result = await process_and_add_files(kb_name, uploaded_files, target_kb, is_new_kb=False)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Append error for {kb_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post('/process', tags=["Chat"])
@router.post('/chat', tags=["Chat"])
async def chat(request_data: ChatRequest, x_api_key: Optional[str] = Header(None), admin_token: Optional[str] = Cookie(None)):
    """Chat endpoint - processes user queries using 3-stage hybrid pipeline"""
    # Manual token verification to support Body, Header, or Cookie
    provided_token = request_data.token or x_api_key or admin_token
    # Allow both CHAT_TOKEN and ADMIN_TOKEN for chat
    if provided_token not in [CHAT_TOKEN, ADMIN_TOKEN]:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or missing API Token")

    message = request_data.message.strip()
    
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    logger.info(f"User query: {message}")

    kb_name = request_data.kb_name
    kb_config = load_kb_config()
    
    # Safely get target KB or fallback to the first available one
    target_kb = kb_config.get(kb_name)
    if not target_kb and kb_config:
        # Fallback to the first available KB if the requested one is missing
        first_kb_name = next(iter(kb_config))
        target_kb = kb_config[first_kb_name]
        logger.info(f"KB '{kb_name}' not found, falling back to '{first_kb_name}'")

    try:
        # Determine which KB name we are actually using (for tagging)
        actual_kb_name = kb_name if (kb_name and kb_name in kb_config) else (next(iter(kb_config)) if kb_config else "General")
        if target_kb:
            target_kb_copy = target_kb.copy()
            target_kb_copy['kb_name'] = actual_kb_name
        else:
            target_kb_copy = None

        # Process query through hybrid pipeline with specific KB
        # We use asyncio.wait_for with a strict 60s timeout.
        # Since ai_pipeline.process_query is synchronous (with a Lock), 
        # we run it in a threadpool using asyncio.to_thread to keep the event loop alive.
        try:
            trans_data = translation_service.translate_to_english(message)
            english_query = trans_data["english_query"]
            user_lang = trans_data["original_language"]

            # Query Augmentation: If it was translated, append the original text.
            # This ensures English loanwords (e.g., 'payroll', 'login') that might have been 
            # destroyed by phonetic transliteration are still captured by the semantic search!
            if user_lang != "en":
                search_query = f"{english_query} (Original: {message})"
            else:
                search_query = english_query

            result = await asyncio.wait_for(
                asyncio.to_thread(ai_pipeline.process_query, search_query, kb_config=target_kb_copy, language=user_lang),
                timeout=120.0
            )

            # Re-translate back to user's original language if applicable
            final_reply = translation_service.translate_from_english(result["reply"], user_lang)
            result["reply"] = final_reply
            
        except asyncio.TimeoutError:
            logger.error(f"Chat request timed out after 120s for query: {message[:50]}...")
            raise HTTPException(
                status_code=503, 
                detail="The system is taking too long to respond. This can happen with large contexts or slow hardware. Please try a shorter query."
            )

        logger.info(f"Intent: {result['intent']}, Context found: {result['context_found']}")
        logger.info(f"Response: {result['reply'][:100]}...")

        # Centralized Chat History Logging in Native Language
        try:
            kb_to_log = result.get("kb_name", "General")
            if not result["context_found"]:
                # Log unverified queries (fallback)
                ai_pipeline.vector_store.save_unverified_query(message, kb_name=kb_to_log, language=user_lang)
            elif result.get("should_log"):
                # Log successful generated interaction
                ai_pipeline.vector_store.save_interaction(message, final_reply, kb_name=kb_to_log, language=user_lang)
        except Exception as e:
            logger.error(f"Error saving chat history: {e}")

        return {
            "status": "success",
            "intent": result["intent"],
            "answer": result["reply"],
            "redirect_to": result.get("redirect_to"),
            "source": "Knowledge Base" if result["context_found"] else "Fallback (Local)",
            "metadata": {
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "timing_breakdown": result["timing"]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"I encountered an error processing your request: {str(e)}")

@router.get('/stats', tags=["System"])
async def get_stats():
    """Get statistics about the knowledge base vector store"""
    try:
        count = vector_store.index.ntotal if vector_store.index else 0
        return {
            "status": "success",
            "total_chunks": count,
            "message": "Vector store stats retrieved"
        }
    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get('/chat-history', dependencies=[Depends(verify_token)], tags=["Memory & History"])
async def get_chat_history(kb_name: Optional[str] = None, page: int = 1, page_size: int = 10):
    """Get unverified items (chat history) with filtering and pagination"""
    try:
        result = vector_store.get_chat_history(kb_name=kb_name, page=page, page_size=page_size)
        return {
            "status": "success",
            **result
        }
    except Exception as e:
        logger.error(f"Chat history fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post('/unverified/update', dependencies=[Depends(verify_token)], tags=["Memory & History"])
async def update_unverified(data: UpdateUnverifiedRequest):
    """Update and verify a memory item"""
    try:
        chunk_id = data.chunk_id
        new_text = data.text
        kb_name = data.kb_name
        
        # Ensure correct KB is loaded
        if kb_name:
            kb_config = load_kb_config()
            if kb_name in kb_config:
                target = kb_config[kb_name]
                if vector_store.index_path != target['binfile']:
                    logger.info(f"Switching KB to '{kb_name}' for update")
                    vector_store.load_kb(target['binfile'], target['jsonfile'])
        
        success = vector_store.update_chunk(chunk_id, new_text)
        if success:
            return {
                "status": "success", 
                "message": "Item verified and moved to permanent knowledge base"
            }
        else:
            raise HTTPException(status_code=404, detail="Item not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post('/unverified/delete', dependencies=[Depends(verify_token)], tags=["Memory & History"])
async def delete_unverified(data: DeleteUnverifiedRequest):
    """Delete an unverified memory item"""
    try:
        chunk_id = data.chunk_id
        kb_name = data.kb_name
        
        # Ensure correct KB is loaded
        if kb_name:
            kb_config = load_kb_config()
            if kb_name in kb_config:
                target = kb_config[kb_name]
                if vector_store.index_path != target['binfile']:
                    logger.info(f"Switching KB to '{kb_name}' for deletion")
                    vector_store.load_kb(target['binfile'], target['jsonfile'])
        
        success = vector_store.delete_chunk(chunk_id)
        if success:
            return {"status": "success", "message": "Item deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Item not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
@router.post('/memory/add', dependencies=[Depends(verify_token)], tags=["Memory & History"])
async def add_memory(request: MemoryAddRequest):
    """Manually add a verified Q/A pair to a specific knowledge base (saved to central history)"""
    try:
        kb_config = load_kb_config()
        kb_name = request.kb_name
        
        if kb_name not in kb_config:
            raise HTTPException(status_code=404, detail=f"KB '{kb_name}' not found")
        
        # Save as a permanent verified memory item in centralized history
        success = vector_store.save_memory(request.question, request.answer, kb_name=kb_name)
        
        if success:
            return {"status": "success", "message": f"Successfully added new question to '{kb_name}' chat history"}
        else:
            return {"status": "warning", "message": f"This question already exists in '{kb_name}' history"}
    except Exception as e:
        logger.error(f"Add memory error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get('/knowledge-bases', tags=["Knowledge Base"])
async def get_knowledge_bases(x_api_key: Optional[str] = Header(None), admin_token: Optional[str] = Cookie(None)):
    """List all available knowledge bases (accessible with chat or admin token)"""
    provided_token = x_api_key or admin_token
    if provided_token not in [CHAT_TOKEN, ADMIN_TOKEN]:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or missing API Token")
    return {
        "status": "success",
        "knowledge_bases": load_kb_config()
    }

@router.delete('/knowledge-bases/{name}', dependencies=[Depends(verify_token)], tags=["Knowledge Base"])
async def delete_knowledge_base(name: str):
    """Delete a knowledge base configuration and its files"""
    try:
        kb_config = load_kb_config()
        if name not in kb_config:
            raise HTTPException(status_code=404, detail="Knowledge base not found")
            
        kb = kb_config[name]
        json_file = kb.get('jsonfile')
        bin_file = kb.get('binfile')
        
        # Delete files if they exist
        if json_file and os.path.exists(json_file):
            os.remove(json_file)
        if bin_file and os.path.exists(bin_file):
            os.remove(bin_file)
            
        # Remove from config
        del kb_config[name]
        save_kb_config(kb_config)
        
        logger.info(f"Deleted KB: {name}")
        return {"status": "success", "message": f"Knowledge base '{name}' and its files have been deleted"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete KB error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post('/knowledge-bases', dependencies=[Depends(verify_token)], tags=["Knowledge Base"])
async def add_knowledge_base(data: AddKBRequest):
    """Add or update a knowledge base configuration"""
    name = data.name
    jsonfile = data.jsonfile
    binfile = data.binfile
    
    config = load_kb_config()
    config[name] = {"jsonfile": jsonfile, "binfile": binfile}
    save_kb_config(config)
    
    return {"status": "success", "message": f"Knowledge base '{name}' updated"}

@router.post('/clear-cache', tags=["System"])
async def clear_model_cache():
    """Manually clear models from memory and empty GPU cache"""
    success = ai_pipeline.cleanup()
    if success:
        return {
            "status": "success", 
            "message": "Model memory cleared and GPU cache emptied. Note: Models will re-load on the next query."
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to clear memory cache")

@router.get('/health', tags=["System"])
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Chatbot API",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

# Register Router
app.include_router(router)

if __name__ == '__main__':
    import uvicorn
    logger.info("Starting 3-Stage RAG CustomerCare API Server (FastAPI)...")
    logger.info("="*60)
    uvicorn.run("app:app", host='0.0.0.0', port=8001, workers=1)