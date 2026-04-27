# 🤖 RAG-First Customer Care Bot

[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![FAISS](https://img.shields.io/badge/VectorDB-FAISS-00599C?logo=facebook&logoColor=white)](https://github.com/facebookresearch/faiss)
[![LLM](https://img.shields.io/badge/LLM-Groq--Llama3.1-orange)](https://groq.com/)

A premium, modular Customer Care Assistant built with a **3-Stage Hybrid RAG Pipeline**. This system prioritizes accuracy and groundedness by retrieving from a verified knowledge base before falling back to general-purpose LLMs.

---

## 🚀 Key Features

- **📄 Multi-Format Ingestion**: Batch process PDFs, DOCX, PPTX, and TXT files directly into a high-performance vector store.
- **🧠 3-Stage Hybrid Architecture**:
    - **Stage 0 (Intent)**: Real-time classification (Greeting, FAQ, Support, Goodbye) using TinyBERT.
    - **Stage 1 (Retrieve)**: Semantic search via FAISS & Sentence-Transformers with high-confidence thresholds.
    - **Stage 2 (Grounded Gen)**: LLM responses strictly anchored to your uploaded documents to prevent hallucinations.
    - **Stage 3 (Fallback)**: Graceful fallback to Groq Llama-3.1 for general queries with "unverified memory" logging.
- **🛠️ Self-Learning Mechanism**: Fallback responses are saved as "unverified" items, allowing admins to review, edit, and promote them to the permanent knowledge base.
- **⚡ Performance First**: Optimized with asynchronous processing, local embedding caching, and sub-second latency tracking.
- **🎨 Premium UI**: A modern, responsive dashboard built with React, Vite, and Tailwind CSS.

---

## 🏗️ System Architecture

```mermaid
graph TD
    User((User)) -->|Query| API[Flask Backend]
    API --> Intent{Intent Classifier}
    Intent -->|Greeting/Goodbye| Template[Template Engine]
    Intent -->|FAQ/Support| RAG[RAG Pipeline]
    
    RAG --> Search{FAISS Search}
    Search -->|Context Found| Gen[Grounded Generation]
    Search -->|No Match| Fallback[Groq Fallback]
    
    Fallback --> Memory[(Unverified Memory)]
    Memory -->|Admin Verification| KB[(Verified Knowledge Base)]
    
    Gen --> Reply
    Template --> Reply
    Fallback --> Reply
    Reply -->|Response| User
