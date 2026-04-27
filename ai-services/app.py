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
KNOWLEDGE_BASE_FILE = "knowledge_base.jsonl" # Kept for historical/export purposes if needed
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

if not GROQ_API_KEY:
    logger.error("GROQ_API_KEY not found in environment variables!")
    raise ValueError("GROQ_API_KEY is required")

# Initialize Processors and Vector Store
doc_processor = DocumentProcessor(GROQ_API_KEY)
vector_store = VectorStore()
ai_pipeline = HybridPipeline(vector_store=vector_store, groq_api_key=GROQ_API_KEY)

@app.route('/upload', methods=['POST'])
def upload_document():
    """Upload and process multiple documents directly into RAG Vector Store"""
    start_time = time.time()
    
    if 'file' not in request.files:
        return jsonify({"message": "No files uploaded"}), 400
    
    files = request.files.getlist('file')
    if not files or all(f.filename == '' for f in files):
        return jsonify({"message": "No selected files"}), 400

    logger.info(f"🚀 Batch upload started: {len(files)} files received")
    
    results = []
    total_chunks = 0
    failed_files = []

    for file in files:
        if file.filename == '':
            continue
            
        file_start_time = time.time()
        logger.info(f"📄 Processing individual file: {file.filename}")
        
        try:
            # Step 1: Extraction
            logger.info(f"⏳ Step 1: Extracting text from {file.filename}...")
            if file.filename.endswith('.docx'):
                paragraphs = doc_processor.extract_text_from_docx(file)
            elif file.filename.endswith('.pdf'):
                paragraphs = doc_processor.extract_text_from_pdf(file)
            elif file.filename.endswith(('.pptx', '.ppt')):
                paragraphs = doc_processor.extract_text_from_ppt(file)
            elif file.filename.endswith('.txt'):
                # Simple text extraction for .txt files
                text = file.read().decode('utf-8')
                paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
                logger.info(f"✓ Extracted {len(paragraphs)} paragraphs from TXT")
            else:
                logger.warning(f"⚠️ Unsupported format: {file.filename}")
                failed_files.append({"file": file.filename, "error": "Unsupported format"})
                continue

            if not paragraphs:
                logger.error(f"❌ No content in {file.filename}")
                failed_files.append({"file": file.filename, "error": "No text content found"})
                continue

            # Step 2: Chunking
            chunks = doc_processor.extract_chunks(file.filename, paragraphs, target_tokens=300)
            
            # Step 3: Vector Storage
            vector_store.add_chunks(chunks)
            
            total_chunks += len(chunks)
            file_duration = time.time() - file_start_time
            results.append({
                "file": file.filename,
                "chunks": len(chunks),
                "duration": f"{file_duration:.2f}s"
            })
            logger.info(f"✅ Finished {file.filename} ({len(chunks)} chunks)")

        except Exception as e:
            logger.error(f"❌ Error processing {file.filename}: {e}")
            failed_files.append({"file": file.filename, "error": str(e)})

    end_time = time.time()
    total_duration = end_time - start_time
    completion_time = time.strftime("%Y-%m-%d %H:%M:%S")

    summary = {
        "status": "success" if results else "error",
        "message": f"Processed {len(results)} files, {len(failed_files)} failed",
        "total_chunks": total_chunks,
        "processed_files": results,
        "failed_files": failed_files,
        "processing_stats": {
            "total_time": f"{total_duration:.2f}s",
            "completion_timestamp": completion_time,
            "status": "Completed"
        }
    }
    # Map back to keys frontend might expect for backward compatibility if needed
    summary["chunks_generated"] = total_chunks
    summary["domain"] = "Batch Ingestion"
    logger.info(f"🏁 Batch complete: {total_chunks} total chunks in {total_duration:.2f}s")
    return jsonify(summary), 200 if results or not failed_files else 207
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

    try:
        # Process query through hybrid pipeline
        result = ai_pipeline.process_query(message)

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

@app.route('/reset', methods=['POST'])
def reset_model():
    """Reset the knowledge base vector store"""
    global vector_store, ai_pipeline
    try:
        if os.path.exists("faiss_index.bin"):
            os.remove("faiss_index.bin")
        if os.path.exists("faiss_meta.json"):
            os.remove("faiss_meta.json")
        
        vector_store = VectorStore()
        ai_pipeline = HybridPipeline(vector_store=vector_store, groq_api_key=GROQ_API_KEY)
        
        logger.info("✅ Vector store reset successfully")
        
        return jsonify({
            "status": "success",
            "message": "Knowledge base has been cleared successfully"
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Reset error: {e}")
        return jsonify({
            "status": "error",
            "message": f"Error resetting knowledge base: {str(e)}"
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

@app.route('/unverified', methods=['GET'])
def get_unverified():
    """Get all unverified memory items"""
    try:
        items = vector_store.get_unverified()
        return jsonify({
            "status": "success",
            "count": len(items),
            "items": items
        }), 200
    except Exception as e:
        logger.error(f"❌ Unverified fetch error: {e}")
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