import os
import json
import logging
from docx import Document
from pptx import Presentation
import fitz  # PyMuPDF
from groq import Groq
from transformers import AutoTokenizer
import difflib

logger = logging.getLogger(__name__)

class DocumentProcessor:
    def __init__(self, groq_api_key):
        """Initialize document processor with Groq API"""
        self.client = Groq(api_key=groq_api_key)
        
        # Load tokenizer for token estimation
        try:
            self.tokenizer = AutoTokenizer.from_pretrained("gpt2")
            logger.info("✓ GPT-2 tokenizer loaded for token estimation")
        except Exception as e:
            self.tokenizer = None
            logger.warning(f"⚠️ Could not load tokenizer: {e}. Using character-based estimation")

    def extract_text_from_docx(self, file_stream):
        """Extract all text from DOCX file"""
        try:
            logger.info(f"📂 Reading DOCX file...")
            doc = Document(file_stream)
            full_text = []
            
            for i, para in enumerate(doc.paragraphs):
                if para.text.strip():
                    full_text.append(para.text.strip())
                if (i + 1) % 50 == 0:
                    logger.info(f"  - Read {i+1} paragraphs...")
            
            logger.info(f"✓ Extracted {len(full_text)} non-empty paragraphs from DOCX")
            return full_text
            
        except Exception as e:
            logger.error(f"❌ Error extracting DOCX: {e}")
            raise

    def extract_text_from_pdf(self, file_stream):
        """Extract all text from PDF using PyMuPDF, preserving page structure"""
        try:
            logger.info(f"📂 Reading PDF file content...")
            pdf_bytes = file_stream.read()
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            pages_text = []
            
            total_pages = len(doc)
            logger.info(f"📄 PDF has {total_pages} pages. Starting extraction...")
            
            for page in doc:
                text = page.get_text().strip()
                if text:
                    # Add page marker for context
                    page_content = f"[PAGE {page.number + 1}]\n{text}"
                    pages_text.append(page_content)
                
                if (page.number + 1) % 5 == 0 or (page.number + 1) == total_pages:
                    logger.info(f"  - Extracted page {page.number + 1}/{total_pages}...")
            
            doc.close()
            logger.info(f"✓ Extracted {len(pages_text)} non-empty pages from PDF")
            return pages_text
            
        except Exception as e:
            logger.error(f"❌ Error extracting PDF: {e}")
            raise

    def extract_text_from_ppt(self, file_stream):
        """Extract all text from PowerPoint (.pptx) file"""
        try:
            logger.info(f"📂 Reading PPTX file...")
            prs = Presentation(file_stream)
            slides_text = []
            
            for i, slide in enumerate(prs.slides):
                slide_content = []
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text.strip():
                        slide_content.append(shape.text.strip())
                
                if slide_content:
                    text = f"[SLIDE {i+1}]\n" + "\n".join(slide_content)
                    slides_text.append(text)
                
                if (i + 1) % 10 == 0:
                    logger.info(f"  - Read {i+1} slides...")
            
            logger.info(f"✓ Extracted {len(slides_text)} non-empty slides from PPTX")
            return slides_text
            
        except Exception as e:
            logger.error(f"❌ Error extracting PPTX: {e}")
            raise

    def extract_chunks(self, file_name, text_units, target_tokens=300, overlap_tokens=50):
        """
        Groups text units (pages or paragraphs) into RAG-friendly chunks.
        
        Returns a list of dictionaries with metadata:
        {
            "doc_id": "...",
            "chunk_id": "...",
            "source": {"file": "..."},
            "text": "...",
            "tags": [],
            "created_at": "..."
        }
        """
        import time
        import uuid
        
        doc_id = file_name.replace(" ", "_").lower()
        chunks = []
        current_window = []
        current_tokens = 0
        chunk_index = 0
        total_units = len(text_units)

        logger.info(f"✂️  Starting chunking process for {total_units} text units (Target: {target_tokens} tokens)...")

        for i, unit in enumerate(text_units):
            # Estimate tokens
            if self.tokenizer:
                unit_tokens = len(self.tokenizer.encode(unit))
            else:
                unit_tokens = len(unit) // 4  # Rough fallback

            if current_tokens + unit_tokens > target_tokens and current_window:
                # Close current window
                text_content = "\n\n".join(current_window)
                
                chunks.append({
                    "doc_id": doc_id,
                    "chunk_id": f"{doc_id}#{chunk_index:03d}",
                    "source": {"file": file_name},
                    "text": text_content,
                    "tags": [],
                    "created_at": time.strftime("%Y-%m-%dT%H:%M:%S")
                })
                
                if (chunk_index + 1) % 10 == 0:
                    logger.info(f"  - Generated {chunk_index + 1} chunks so far...")
                
                chunk_index += 1
                
                # Start new window with overlap
                overlap_text = ""
                # Simple approximation: keep last overlap_tokens tokens worth of units
                temp_tokens = 0
                temp_window = []
                for u in reversed(current_window):
                    u_tok = len(self.tokenizer.encode(u)) if self.tokenizer else len(u)//4
                    temp_window.insert(0, u)
                    temp_tokens += u_tok
                    if temp_tokens >= overlap_tokens:
                        break
                        
                current_window = temp_window
                current_tokens = temp_tokens

            current_window.append(unit)
            current_tokens += unit_tokens

        # Add final window
        if current_window:
            text_content = "\n\n".join(current_window)
            chunks.append({
                "doc_id": doc_id,
                "chunk_id": f"{doc_id}#{chunk_index:03d}",
                "source": {"file": file_name},
                "text": text_content,
                "tags": [],
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S")
            })

        logger.info(f"✅ Chunking complete. Generated {len(chunks)} chunks for {file_name}")
        return chunks