import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const GLASS_STYLE = "bg-dark-800/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl";
const GRADIENT_TEXT = "bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-fuchsia-400 font-extrabold";
const UPLOAD_CARD = `${GLASS_STYLE} rounded-3xl p-10 transition-all duration-500 hover:border-primary-500/50 hover:shadow-primary-500/10 cursor-pointer group`;

const KnowledgeBase = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [unverifiedItems, setUnverifiedItems] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const fileInputRef = useRef(null);

  const fetchUnverified = async () => {
    try {
      const response = await fetch('http://localhost:8001/unverified');
      const data = await response.json();
      if (response.ok) {
        setUnverifiedItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch unverified items:', err);
    }
  };

  useEffect(() => {
    fetchUnverified();
  }, []);

  const handleVerify = async (chunk_id, text) => {
    try {
      const response = await fetch('http://localhost:8001/unverified/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk_id, text })
      });
      if (response.ok) {
        setEditingId(null);
        fetchUnverified();
        setStatus({ success: true, message: "Knowledge item verified and saved!", type: "success" });
      }
    } catch (err) {
      console.error('Failed to verify item:', err);
    }
  };

  const handleDeleteMemory = async (chunk_id) => {
    if (!window.confirm("Delete this memory item?")) return;
    try {
      const response = await fetch('http://localhost:8001/unverified/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk_id })
      });
      if (response.ok) {
        fetchUnverified();
      }
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      setFiles(prev => [...prev, ...selectedFiles]);
      setStatus(null);
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setStatus({ message: `Analyzing ${files.length} document(s) and generating knowledge...`, type: "info" });

    const formData = new FormData();
    files.forEach(f => {
      formData.append('file', f);
    });

    try {
      const response = await fetch('http://localhost:8001/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (response.ok) {
        setStatus({
          success: true,
          message: result.message || "Knowledge base updated and model re-trained successfully!",
          data: result,
          type: "success"
        });
        setFiles([]);
        fetchUnverified();
      } else {
        throw new Error(result.message || "Failed to process documents");
      }
    } catch (err) {
      setStatus({ success: false, message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const resetModel = async () => {
    if (!window.confirm("Are you sure you want to delete all trained data and reset the model?")) return;
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8001/reset', { method: 'POST' });
      if (response.ok) {
        setStatus({ success: true, message: "Knowledge base cleared!", type: "success" });
        setUnverifiedItems([]);
      }
    } catch (err) {
      setStatus({ success: false, message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 p-6 flex flex-col items-center overflow-hidden relative">
      {/* Background Blobs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-primary-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-fuchsia-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>

      <div className="w-full max-w-5xl relative z-10">
        <header className="w-full flex flex-col items-center mb-16">
          {/* System Status Pill */}
          <div className="mb-6 flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 backdrop-blur-md">
            <div className="w-2 h-2 rounded-full bg-primary-500 shadow-[0_0_8px_rgba(var(--primary-rgb),0.8)]"></div>
            <span className="text-[10px] font-bold text-primary-400 uppercase tracking-[0.2em]">Knowledge Sync Active</span>
          </div>

          <div className="w-full flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="text-center md:text-left">
              <h1 className={`text-5xl md:text-6xl mb-3 tracking-tight ${GRADIENT_TEXT}`}>
                Brain Base
              </h1>
              <p className="text-slate-400 font-medium">Neural network ingestion and verification portal</p>
            </div>
            
            <button 
              onClick={() => navigate('/')}
              className="group relative px-8 py-3.5 rounded-2xl bg-dark-900 text-slate-300 border border-slate-700/50 transition-all hover:border-primary-500/50 hover:text-white shadow-xl flex items-center gap-3 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary-600/10 to-indigo-600/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <span className="text-lg transition-transform group-hover:-translate-x-1">←</span>
              <span className="font-bold text-xs uppercase tracking-widest">Return to Portal</span>
            </button>
          </div>
        </header>

        <main className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Upload Zone */}
          <div
            className={`${UPLOAD_CARD} ${dragging ? 'ring-4 ring-primary-500/50 scale-[1.02]' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const droppedFiles = Array.from(e.dataTransfer.files);
              if (droppedFiles.length > 0) setFiles(prev => [...prev, ...droppedFiles]);
            }}
            onClick={() => fileInputRef.current.click()}
          >
            <input
              type="file" ref={fileInputRef} onChange={handleFileChange}
              className="hidden" accept=".pdf,.txt,.docx,.pptx,.ppt" multiple
            />
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={`w-20 h-20 rounded-2xl bg-primary-500/10 flex items-center justify-center text-4xl mb-2 transition-transform duration-500 ${loading ? 'animate-spin' : 'group-hover:scale-110'}`}>
                {loading ? '⚙️' : '📁'}
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-semibold text-white">
                  {files.length > 0 ? `${files.length} document(s) selected` : "Select documents"}
                </h3>
                <p className="text-slate-400">
                  {files.length > 0
                    ? `${(files.reduce((acc, f) => acc + f.size, 0) / 1024).toFixed(1)} KB total`
                    : "Drag and drop your PDF, DOCX, PPTX or TXT here"}
                </p>
              </div>
            </div>
          </div>

          {files.length > 0 && !loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {files.map((f, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-dark-800/40 border border-slate-700/50 group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="text-xl">📄</span>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-white truncate">{f.name}</p>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(index); }} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400">
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
            {!loading && (
              <button onClick={resetModel} className="w-full py-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400 font-semibold hover:bg-red-500 hover:text-white transition-all">
                ⚠️ Delete Model & Data
              </button>
            )}
          </div>

          {status && (
            <div className={`rounded-3xl p-8 border-l-4 ${status.type === 'error' ? 'border-red-500' : 'border-primary-500'} ${GLASS_STYLE}`}>
              <h3 className="text-xl font-bold uppercase tracking-wider mb-2">{status.type === 'info' ? 'Processing...' : 'System Report'}</h3>
              <p className="text-slate-300 text-lg">{status.message}</p>
            </div>
          )}

          <div className="pt-8 border-t border-slate-700/30">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              Unverified Knowledge
              <span className="px-2 py-0.5 rounded-lg bg-primary-500/10 text-primary-400 text-sm font-bold">{unverifiedItems.length}</span>
            </h3>
            {unverifiedItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {unverifiedItems.map((item, index) => (
                  <div key={item.chunk_id || index} className={`${GLASS_STYLE} p-6 rounded-3xl group transition-all hover:border-slate-600/50`}>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                           <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-wider">Conversation Memory</span>
                           <span className="text-slate-600 text-xs">{item.created_at}</span>
                        </div>
                        
                        {editingId === item.chunk_id ? (
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full h-32 p-4 rounded-xl bg-dark-900 border border-primary-500/30 text-white text-sm focus:ring-2 focus:ring-primary-500/50 outline-none"
                          />
                        ) : (
                          <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{item.text}</p>
                        )}
                      </div>
                      
                      <div className="flex md:flex-col gap-2 shrink-0">
                        {editingId === item.chunk_id ? (
                          <>
                            <button 
                              onClick={() => handleVerify(item.chunk_id, editText)}
                              className="flex-1 md:w-28 px-4 py-2.5 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-500 transition-colors"
                            >
                              Save & Verify
                            </button>
                            <button 
                              onClick={() => setEditingId(null)}
                              className="flex-1 md:w-28 px-4 py-2.5 bg-dark-700 text-slate-300 rounded-xl text-xs font-bold hover:bg-dark-600 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => {
                                setEditingId(item.chunk_id);
                                setEditText(item.text);
                              }}
                              className="flex-1 md:w-28 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-xs font-bold hover:bg-primary-500 transition-colors"
                            >
                              Edit & Verify
                            </button>
                            <button 
                              onClick={() => handleDeleteMemory(item.chunk_id)} 
                              className="flex-1 md:w-28 px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold hover:bg-red-500 hover:text-white transition-all"
                            >
                              Discard
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`${GLASS_STYLE} rounded-3xl p-12 text-center`}>
                <p className="text-slate-500 font-medium">All knowledge is currently verified and integrated.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default KnowledgeBase;
