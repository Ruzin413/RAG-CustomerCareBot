import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../apiConfig';

const KnowledgeBase = ({ token }) => {
  const API_KEY = token || "ft-customer-care-secret-2026";
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState({});
  const [kbName, setKbName] = useState("");
  const [kbJsonFile, setKbJsonFile] = useState("");
  const [kbBinFile, setKbBinFile] = useState("");
  const fileInputRef = useRef(null);

  const fetchKBs = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/knowledge-bases`, {
        headers: { 'X-API-Key': API_KEY }
      });
      if (response.ok) {
        const data = await response.json();
        setKnowledgeBases(data.knowledge_bases);
      }
    } catch (err) {
      console.error("Failed to fetch KBs:", err);
    }
  };

  useEffect(() => {
    fetchKBs();
  }, []);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      setFiles(prev => [...prev, ...selectedFiles]);
      setStatus(null);
    }
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const uploadFile = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setStatus({ message: `Analyzing ${files.length} document(s) and generating knowledge...`, type: "info" });

    const formData = new FormData();
    files.forEach((f) => {
      formData.append('file', f);
    });
    formData.append('kb_name', kbName || "General");
    formData.append('jsonfile', kbJsonFile);
    formData.append('binfile', kbBinFile);

    try {
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        headers: { 'X-API-Key': API_KEY },
        body: formData,
      });
      const result = await response.json();

      if (response.ok) {
        setStatus({
          success: true,
          message: result.message || "Knowledge base updated successfully!",
          type: "success"
        });
        setFiles([]);
        fetchKBs();
      } else {
        throw new Error(result.message || "Failed to process documents");
      }
    } catch (err) {
      setStatus({ success: false, message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-surface-900 tracking-tight">Knowledge Ingestion</h2>
          <p className="text-surface-500 text-sm">Upload documents to build your AI knowledge base.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: Config */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card-white p-6 space-y-6">
            <h3 className="text-sm font-bold text-surface-900 uppercase tracking-widest border-b border-surface-100 pb-4">Configuration</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-surface-400 uppercase tracking-widest ml-1">System Name</label>
                <input
                  type="text"
                  value={kbName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setKbName(val);
                    const safeName = val.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (safeName) {
                      setKbJsonFile(`${safeName}_meta.json`);
                      setKbBinFile(`${safeName}_index.bin`);
                    }
                  }}
                  placeholder="e.g., Support, Sales..."
                  className="w-full input-field"
                />
              </div>

              <div className="p-3 bg-surface-50 rounded-xl border border-surface-300">
                <p className="text-[10px] font-bold text-surface-400 uppercase mb-1">Generated Index Files</p>
                <p className="text-[11px] font-mono text-surface-600 truncate">{kbJsonFile || '..._meta.json'}</p>
                <p className="text-[11px] font-mono text-surface-600 truncate">{kbBinFile || '..._index.bin'}</p>
              </div>

              {Object.keys(knowledgeBases).filter(kb => kb !== "General").length > 0 && (
                <div className="pt-4">
                  <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-3">Existing Systems:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(knowledgeBases).filter(kb => kb !== "General").map(kb => (
                      <button
                        key={kb}
                        onClick={() => {
                          setKbName(kb);
                          setKbJsonFile(knowledgeBases[kb].jsonfile);
                          setKbBinFile(knowledgeBases[kb].binfile);
                        }}
                        className="px-2.5 py-1 rounded-md bg-white border border-surface-300 text-[10px] font-bold text-surface-600 hover:border-primary-500 hover:text-primary-600 transition-all"
                      >
                        {kb}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {status && (
            <div className={`p-5 rounded-2xl border ${status.type === 'error' ? 'bg-red-50 border-red-100 text-red-600' : 'bg-primary-50 border-primary-100 text-primary-700'}`}>
              <h4 className="text-xs font-bold uppercase mb-1">{status.type === 'info' ? 'Processing' : 'Status'}</h4>
              <p className="text-sm font-medium leading-relaxed">{status.message}</p>
            </div>
          )}
        </div>

        {/* Right Col: Upload */}
        <div className="lg:col-span-2 space-y-6">
          <div
            className={`card-white p-12 border-2 border-dashed transition-all duration-300 flex flex-col items-center text-center cursor-pointer group ${dragging ? 'border-primary-500 bg-primary-50/30' : 'border-surface-300 hover:border-primary-400'}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const droppedFiles = Array.from(e.dataTransfer.files);
              if (droppedFiles.length > 0) {
                const startIdx = files.length;
                const newNames = { ...fileNames };
                droppedFiles.forEach((f, i) => { newNames[startIdx + i] = f.name; });
                setFiles(prev => [...prev, ...droppedFiles]);
                setFileNames(newNames);
              }
            }}
            onClick={() => fileInputRef.current.click()}
          >
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.txt,.docx,.pptx,.ppt" multiple />
            <div className="w-16 h-16 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-surface-900">{files.length > 0 ? `${files.length} documents selected` : "Upload Documents"}</h3>
            <p className="text-sm text-surface-500 mt-1 max-w-sm">Drag and drop PDFs, TXT, or DOCX files here. Our AI will automatically chunk and index them.</p>
          </div>

          {files.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-surface-400 uppercase tracking-widest ml-1">Selected Files</h4>
              {files.map((f, index) => (
                <div key={index} className="card-white p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-surface-100 rounded-xl flex items-center justify-center text-[10px] font-bold text-surface-500">FILE</div>
                    <p className="text-sm font-medium text-surface-700 truncate">{f.name}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(index); }} className="text-red-500 hover:text-red-700 transition-colors p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
              <div className="pt-4">
                <button 
                  onClick={uploadFile} 
                  disabled={loading || files.length === 0}
                  className="w-full btn-primary py-4 text-base shadow-lg shadow-primary-500/10"
                >
                  {loading ? 'Processing Knowledge...' : 'Start Knowledge Ingestion'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBase;

