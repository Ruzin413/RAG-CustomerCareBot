import os
import json
import logging
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Import our modular layers
from document_processor import DocumentProcessor
from vector_store import VectorStore
from hybrid_pipeline import HybridPipeline

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    force=True
)
logger = logging.getLogger(__name__)

# Constants
KB_CONFIG_FILE = "knowledge_bases.json"

def load_kb_config():
    if os.path.exists(KB_CONFIG_FILE):
        try:
            if os.path.getsize(KB_CONFIG_FILE) > 0:
                with open(KB_CONFIG_FILE, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"⚠️ Error loading KB config: {e}. Resetting to empty.")
    return {}

def save_kb_config(config):
    with open(KB_CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

# Initialize Processors and Vector Store
doc_processor = DocumentProcessor()
vector_store = VectorStore()
ai_pipeline = HybridPipeline(vector_store=vector_store)

def process_and_add_files(kb_name, uploaded_files, custom_names, target_kb, is_new_kb=False):
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

    for file, custom_name in zip(uploaded_files, custom_names):
        display_name = custom_name or file.filename
        if not file.filename or not display_name:
            continue
            
        if display_name in existing_files:
            logger.warning(f"⚠️ Skipping '{display_name}': Already exists in '{kb_name}'.")
            failed_files.append({"file": display_name, "error": "Already exists"})
            continue
            
        file_start_time = time.time()
        try:
            # Extraction
            if file.filename.endswith('.docx'):
                units = doc_processor.extract_text_from_docx(file)
            elif file.filename.endswith('.pdf'):
                units = doc_processor.extract_text_from_pdf(file)
            elif file.filename.endswith(('.pptx', '.ppt')):
                units = doc_processor.extract_text_from_ppt(file)
            elif file.filename.endswith('.txt'):
                text = file.read().decode('utf-8')
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
            logger.info(f"✅ Finished {display_name}")
        except Exception as e:
            logger.error(f"❌ Error processing {display_name}: {e}")
            failed_files.append({"file": display_name, "error": str(e)})

    # Persist changes
    if total_chunks > 0:
        vector_store._save()
        
        if is_new_kb:
            kb_config = load_kb_config()
            kb_config[kb_name] = target_kb
            save_kb_config(kb_config)
            logger.info(f"🆕 Registered new KB: {kb_name}")
    
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

@app.route('/upload', methods=['POST'])
def upload_document():
    """Upload and process multiple documents into a new or existing KB"""
    kb_name = request.form.get('kb_name', 'General')
    uploaded_files = request.files.getlist('file')
    custom_names = request.form.getlist('custom_names')
    
    # Fix for custom_names length mismatch
    if not custom_names or len(custom_names) < len(uploaded_files):
        custom_names = [f.filename for f in uploaded_files]

    kb_config = load_kb_config()
    is_new_kb = kb_name not in kb_config
    
    if is_new_kb:
        safe_name = "".join(x for x in kb_name if x.isalnum() or x in "._-").strip()
        target_kb = {
            "jsonfile": f"{safe_name.lower()}_meta.json",
            "binfile": f"{safe_name.lower()}_index.bin"
        }
    else:
        target_kb = kb_config[kb_name]
        
    result = process_and_add_files(kb_name, uploaded_files, custom_names, target_kb, is_new_kb=is_new_kb)
    return jsonify(result), (200 if result["status"] == "success" else 500)

@app.route('/knowledge-bases/<kb_name>/append', methods=['POST'])
def append_to_kb(kb_name):
    """Add more files to an existing Knowledge Base"""
    try:
        uploaded_files = request.files.getlist('file')
        custom_names = request.form.getlist('custom_names')
        
        if not custom_names or len(custom_names) < len(uploaded_files):
            custom_names = [f.filename for f in uploaded_files]

        kb_config = load_kb_config()
        if kb_name not in kb_config:
            return jsonify({"status": "error", "message": f"KB '{kb_name}' not found"}), 404
            
        target_kb = kb_config[kb_name]
        result = process_and_add_files(kb_name, uploaded_files, custom_names, target_kb, is_new_kb=False)
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"❌ Append error for {kb_name}: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
@app.route('/process', methods=['POST'])
@app.route('/chat', methods=['POST'])
def chat():
    """Chat endpoint - processes user queries using 3-stage hybrid pipeline"""
    data = request.json
    message = data.get('message', '').strip()
    
    if not message:
        return jsonify({
            "status": "error",
            "answer": "Message cannot be empty"
        }), 400

    logger.info(f"💬 User query: {message}")

    kb_name = data.get('kb_name')
    kb_config = load_kb_config()
    
    # Safely get target KB or fallback to the first available one
    target_kb = kb_config.get(kb_name)
    if not target_kb and kb_config:
        # Fallback to the first available KB if the requested one is missing
        first_kb_name = next(iter(kb_config))
        target_kb = kb_config[first_kb_name]
        logger.info(f"⚠️ KB '{kb_name}' not found, falling back to '{first_kb_name}'")

    try:
        # Determine which KB name we are actually using (for tagging)
        actual_kb_name = kb_name if (kb_name and kb_name in kb_config) else next(iter(kb_config))
        if target_kb:
            target_kb['kb_name'] = actual_kb_name

        # Process query through hybrid pipeline with specific KB
        result = ai_pipeline.process_query(message, kb_config=target_kb)

        logger.info(f"✓ Intent: {result['intent']}, Context found: {result['context_found']}")
        logger.info(f"✓ Response: {result['reply'][:100]}...")

        return jsonify({
            "status": "success",
            "intent": result["intent"],
            "answer": result["reply"],
            "redirect_to": result.get("redirect_to"),
            "source": "Knowledge Base" if result["context_found"] else "Fallback (Groq)",
            "metadata": {
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "timing_breakdown": result["timing"]
            }
        }), 200
    except Exception as e:
        logger.error(f"❌ Chat error: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "answer": f"I encountered an error processing your request: {str(e)}"
        }), 500


@app.route('/stats', methods=['GET'])
def get_stats():
    """Get statistics about the knowledge base vector store"""
    try:
        count = vector_store.index.ntotal if vector_store.index else 0
        return jsonify({
            "status": "success",
            "total_chunks": count,
            "message": "Vector store stats retrieved"
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Stats error: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/chat-history', methods=['GET'])
def get_chat_history():
    """Get unverified items (chat history) with filtering and pagination"""
    try:
        kb_name = request.args.get('kb_name')
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('page_size', 10))
        
        result = vector_store.get_chat_history(kb_name=kb_name, page=page, page_size=page_size)
        return jsonify({
            "status": "success",
            **result
        }), 200
    except Exception as e:
        logger.error(f"❌ Chat history fetch error: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/unverified/update', methods=['POST'])
def update_unverified():
    """Update and verify a memory item"""
    try:
        data = request.json
        chunk_id = data.get('chunk_id')
        new_text = data.get('text')
        
        if not chunk_id or not new_text:
            return jsonify({"status": "error", "message": "Missing chunk_id or text"}), 400
            
        success = vector_store.update_chunk(chunk_id, new_text)
        if success:
            return jsonify({
                "status": "success", 
                "message": "Item verified and moved to permanent knowledge base"
            }), 200
        else:
            return jsonify({"status": "error", "message": "Item not found"}), 404
    except Exception as e:
        logger.error(f"❌ Update error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/unverified/delete', methods=['POST'])
def delete_unverified():
    """Delete an unverified memory item"""
    try:
        data = request.json
        chunk_id = data.get('chunk_id')
        
        if not chunk_id:
            return jsonify({"status": "error", "message": "Missing chunk_id"}), 400
            
        success = vector_store.delete_chunk(chunk_id)
        if success:
            return jsonify({"status": "success", "message": "Item deleted successfully"}), 200
        else:
            return jsonify({"status": "error", "message": "Item not found"}), 404
    except Exception as e:
        logger.error(f"❌ Delete error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/knowledge-bases', methods=['GET'])
def get_knowledge_bases():
    """List all available knowledge bases"""
    return jsonify({
        "status": "success",
        "knowledge_bases": load_kb_config()
    }), 200

@app.route('/knowledge-bases/<name>', methods=['DELETE'])
def delete_knowledge_base(name):
    """Delete a knowledge base configuration and its files"""
    try:
        kb_config = load_kb_config()
        if name not in kb_config:
            return jsonify({"status": "error", "message": "Knowledge base not found"}), 404
            
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
        
        logger.info(f"🗑️ Deleted KB: {name}")
        return jsonify({"status": "success", "message": f"Knowledge base '{name}' and its files have been deleted"}), 200
        
    except Exception as e:
        logger.error(f"❌ Delete KB error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
    
@app.route('/knowledge-bases', methods=['POST'])
def add_knowledge_base():
    """Add or update a knowledge base configuration"""
    data = request.json
    name = data.get('name')
    jsonfile = data.get('jsonfile')
    binfile = data.get('binfile')
    
    if not all([name, jsonfile, binfile]):
        return jsonify({"status": "error", "message": "Missing name, jsonfile, or binfile"}), 400
        
    config = load_kb_config()
    config[name] = {"jsonfile": jsonfile, "binfile": binfile}
    save_kb_config(config)
    
    return jsonify({"status": "success", "message": f"Knowledge base '{name}' updated"}), 200

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "Chatbot API",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }), 200

if __name__ == '__main__':
    logger.info("🚀 Starting 3-Stage RAG Chatbot API Server...")
    logger.info("="*60)
    
    app.run(host='0.0.0.0', port=8001, debug=False, threaded=True)