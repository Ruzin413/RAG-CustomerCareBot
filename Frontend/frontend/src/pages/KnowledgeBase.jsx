import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const GLASS_STYLE = "bg-dark-800/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl";
const GRADIENT_TEXT = "bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-fuchsia-400 font-extrabold";
const UPLOAD_CARD = `${GLASS_STYLE} rounded-3xl p-10 transition-all duration-500 hover:border-primary-500/50 hover:shadow-primary-500/10 cursor-pointer group`;
const API_KEY = "ft-customer-care-secret-2026";

const KnowledgeBase = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState({});
  const [kbName, setKbName] = useState("");
  const [kbJsonFile, setKbJsonFile] = useState("");
  const [kbBinFile, setKbBinFile] = useState("");
  const [fileNames, setFileNames] = useState({}); // Mapping of index to custom name
  const fileInputRef = useRef(null);
  const fetchKBs = async () => {
    try {
      const response = await fetch('http://localhost:8001/CustomerCare/knowledge-bases', {
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
      const startIdx = files.length;
      const newNames = { ...fileNames };
      selectedFiles.forEach((f, i) => {
        newNames[startIdx + i] = f.name;
      });
      setFiles(prev => [...prev, ...selectedFiles]);
      setFileNames(newNames);
      setStatus(null);
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    const newNames = {};
    files.filter((_, i) => i !== index).forEach((f, i) => {
      newNames[i] = fileNames[i < index ? i : i + 1];
    });
    setFileNames(newNames);
  };

  const uploadFile = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setStatus({ message: `Analyzing ${files.length} document(s) and generating knowledge...`, type: "info" });

    const formData = new FormData();
    files.forEach((f, i) => {
      formData.append('file', f);
      formData.append('custom_names', fileNames[i] || f.name);
    });
    formData.append('kb_name', kbName || "General");
    formData.append('jsonfile', kbJsonFile);
    formData.append('binfile', kbBinFile);

    try {
      const response = await fetch('http://localhost:8001/CustomerCare/upload', {
        method: 'POST',
        headers: { 'X-API-Key': API_KEY },
        body: formData,
      });
      const result = await response.json();

      if (response.ok) {
        setStatus({
          success: true,
          message: result.message || "Knowledge base updated successfully!",
          data: result,
          type: "success"
        });
        setFiles([]);
        setFileNames({});
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
    <div className="relative min-h-screen flex flex-col items-center p-6 bg-dark-950 overflow-x-hidden">
      {/* Background Blobs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-primary-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>

      <div className="container max-w-4xl relative z-10 flex flex-col items-center">
        <header className="text-center mb-12">
          <h1 className={`text-4xl md:text-5xl mb-4 tracking-tight ${GRADIENT_TEXT}`}>
            FT Customer Care Bot
          </h1>

          <div className="flex bg-dark-800/80 p-1.5 rounded-2xl border border-slate-700/50 shadow-lg backdrop-blur-md">
            <button
              onClick={() => navigate('/')}
              className="px-8 py-2.5 rounded-xl font-bold text-sm text-slate-400 hover:text-slate-200 transition-all duration-300"
            >
              Chat Interface
            </button>
            <button
              className="px-8 py-2.5 rounded-xl font-bold text-sm bg-primary-600 text-white shadow-lg"
            >
              Knowledge Base
            </button>
            <button
              onClick={() => navigate('/systems')}
              className="px-8 py-2.5 rounded-xl font-bold text-sm text-slate-400 hover:text-slate-200 transition-all duration-300"
            >
              Manage Systems
            </button>
          </div>
        </header>

        <main className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* KB Configuration */}
          <div className={`${GLASS_STYLE} rounded-3xl p-8 mb-8`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1.5 h-6 bg-primary-500 rounded-full"></div>
              <h3 className="text-xl font-bold text-white uppercase tracking-wider">Target System Configuration</h3>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">System Name</label>
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
                  placeholder="e.g., E-attendance, Banking..."
                  className="w-full bg-dark-900/80 border border-slate-700/50 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all text-lg font-medium"
                />
                <p className="text-[9px] text-slate-500 px-1 italic">
                  Files: <span className="text-primary-400/80">{kbJsonFile || '...'}</span> and <span className="text-primary-400/80">{kbBinFile || '...'}</span>
                </p>
              </div>

              {/* Quick Select */}
              {Object.keys(knowledgeBases).filter(kb => kb !== "General").length > 0 && (
                <div className="pt-4 border-t border-slate-700/30">
                  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-3">Existing Templates:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(knowledgeBases).filter(kb => kb !== "General").map(kb => (
                      <button
                        key={kb}
                        onClick={() => {
                          setKbName(kb);
                          setKbJsonFile(knowledgeBases[kb].jsonfile);
                          setKbBinFile(knowledgeBases[kb].binfile);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-dark-800 border border-slate-700/50 text-[10px] text-slate-400 hover:text-white hover:border-primary-500/50 transition-all font-bold uppercase tracking-tight"
                      >
                        {kb}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Upload Zone */}
          <div
            className={`${UPLOAD_CARD} ${dragging ? 'ring-4 ring-primary-500/50 scale-[1.02]' : ''}`}
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
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={`w-20 h-20 rounded-2xl bg-primary-500/10 flex items-center justify-center text-[10px] font-bold text-primary-400 mb-2 transition-transform duration-500 ${loading ? 'animate-spin' : 'group-hover:scale-110'}`}>
                {loading ? '...' : 'UPLOAD'}
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-semibold text-white">{files.length > 0 ? `${files.length} document(s) selected` : "Select documents"}</h3>
                <p className="text-slate-400">{files.length > 0 ? `${(files.reduce((acc, f) => acc + f.size, 0) / 1024).toFixed(1)} KB total` : "Drag and drop your PDF, DOCX, PPTX or TXT here"}</p>
              </div>
            </div>
          </div>

          {files.length > 0 && !loading && (
            <div className="grid grid-cols-1 gap-3">
              {files.map((f, index) => (
                <div key={index} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl bg-dark-800/40 border border-slate-700/50 gap-4 group transition-all hover:border-slate-600/50">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center text-[10px] font-bold text-primary-400 shrink-0">DOC</div>
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Original: {f.name}</p>
                      <input
                        type="text"
                        value={fileNames[index] || ""}
                        onChange={(e) => setFileNames({ ...fileNames, [index]: e.target.value })}
                        placeholder="Rename this file..."
                        className="w-full bg-dark-900/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500/50"
                      />
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(index); }} className="p-2 rounded-xl hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors">
                    <span className="text-xs font-bold uppercase tracking-widest px-2">Remove</span>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-4">
            {files.length > 0 && !loading && (
              <button onClick={uploadFile} className="w-full py-5 rounded-2xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white font-bold text-xl shadow-lg shadow-primary-900/50 hover:scale-[1.01] transition-transform">
                Start Batch Ingestion
              </button>
            )}
          </div>

          {status && (
            <div className={`rounded-3xl p-8 border-l-4 ${status.type === 'error' ? 'border-red-500' : 'border-primary-500'} ${GLASS_STYLE}`}>
              <h3 className="text-xl font-bold uppercase tracking-wider mb-2">{status.type === 'info' ? 'Processing...' : 'System Report'}</h3>
              <p className="text-slate-300 text-lg">{status.message}</p>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

export default KnowledgeBase;
