import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const GLASS_STYLE = "bg-dark-800/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl";
const GRADIENT_TEXT = "bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-indigo-400 font-extrabold";

const SystemsRegistry = () => {
  const navigate = useNavigate();
  const [knowledgeBases, setKnowledgeBases] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedKB, setSelectedKB] = useState(null);
  const [status, setStatus] = useState(null);
  const [historyData, setHistoryData] = useState({ items: [], total: 0, page: 1, total_pages: 1 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const fetchKBs = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8001/knowledge-bases');
      if (response.ok) {
        const data = await response.json();
        setKnowledgeBases(data.knowledge_bases);
      }
    } catch (err) {
      console.error("Failed to fetch KBs:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAppendFiles = async (files) => {
    if (!files || files.length === 0) return;
    
    setHistoryLoading(true);
    setStatus({ type: 'info', message: `Adding ${files.length} documents...` });
    
    const formData = new FormData();
    for (const file of files) {
      formData.append('file', file);
    }

    try {
      const response = await fetch(`http://localhost:8001/knowledge-bases/${encodeURIComponent(selectedKB)}/append`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      if (response.ok) {
        setStatus({ type: 'success', message: `Successfully added ${data.total_chunks} new chunks!` });
        fetchHistory(selectedKB, 1);
      } else {
        setStatus({ type: 'error', message: data.message || "Failed to append files" });
      }
    } catch (err) {
      console.error("Append error:", err);
      setStatus({ type: 'error', message: "Network error while uploading" });
    } finally {
      setHistoryLoading(false);
      setTimeout(() => setStatus(null), 5000);
    }
  };

  const fetchHistory = async (kbName, page = 1) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`http://localhost:8001/chat-history?kb_name=${encodeURIComponent(kbName)}&page=${page}&page_size=10`);
      if (response.ok) {
        const data = await response.json();
        setHistoryData(data);
      }
    } catch (err) {
      console.error('Failed to fetch chat history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchKBs();
  }, []);

  useEffect(() => {
    if (selectedKB) {
      fetchHistory(selectedKB, 1);
    }
  }, [selectedKB]);

  const handleVerify = async (chunk_id, text) => {
    try {
      const response = await fetch('http://localhost:8001/unverified/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk_id, text })
      });
      if (response.ok) {
        setEditingId(null);
        fetchHistory(selectedKB, historyData.page);
        setStatus({ message: "Interaction verified and added to knowledge base!", type: "success" });
      }
    } catch (err) {
      console.error('Failed to verify item:', err);
    }
  };

  const handleDeleteMemory = async (chunk_id) => {
    if (!window.confirm("Delete this interaction from history?")) return;
    try {
      const response = await fetch('http://localhost:8001/unverified/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk_id })
      });
      if (response.ok) {
        fetchHistory(selectedKB, historyData.page);
      }
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const handleDeleteKB = async (name) => {
    if (!window.confirm(`Are you sure you want to delete '${name}'? This will permanently remove all associated metadata and index files.`)) return;
    
    try {
      const response = await fetch(`http://localhost:8001/knowledge-bases/${name}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setStatus({ message: `System '${name}' deleted successfully.`, type: 'success' });
        setSelectedKB(null);
        fetchKBs();
      } else {
        const data = await response.json();
        throw new Error(data.message || "Failed to delete system");
      }
    } catch (err) {
      setStatus({ message: err.message, type: 'error' });
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center p-6 bg-dark-950 overflow-x-hidden text-white">
      {/* Background Blobs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-primary-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>

      <div className="container max-w-4xl relative z-10 flex flex-col items-center">
        <header className="text-center mb-12">
          <h1 className={`text-4xl md:text-5xl mb-4 tracking-tight ${GRADIENT_TEXT}`}>
            FT Customer Care Bot
          </h1>

          <div className="flex bg-dark-800/80 p-1.5 rounded-2xl border border-slate-700/50 shadow-lg backdrop-blur-md">
            <button onClick={() => navigate('/')} className="px-8 py-2.5 rounded-xl font-bold text-sm text-slate-400 hover:text-slate-200 transition-all duration-300">Chat Interface</button>
            <button onClick={() => navigate('/knowledge-base')} className="px-8 py-2.5 rounded-xl font-bold text-sm text-slate-400 hover:text-slate-200 transition-all duration-300">Knowledge Base</button>
            <button className="px-8 py-2.5 rounded-xl font-bold text-sm bg-primary-600 text-white shadow-lg">Manage Systems</button>
          </div>
        </header>

        <main className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {status && (
            <div className={`p-4 rounded-2xl border ${status.type === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-400' : 'border-green-500/50 bg-green-500/10 text-green-400'} text-center font-bold`}>
              {status.message}
            </div>
          )}

          {!selectedKB ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.keys(knowledgeBases).length > 0 ? (
                Object.keys(knowledgeBases).map(name => (
                  <div 
                    key={name} 
                    onClick={() => setSelectedKB(name)}
                    className={`${GLASS_STYLE} p-8 rounded-3xl cursor-pointer hover:border-primary-500/50 transition-all group`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                        🧠
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-dark-900/50 px-2 py-1 rounded">Active Model</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">{name}</h3>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500 font-mono">Meta: {knowledgeBases[name].jsonfile}</p>
                      <p className="text-xs text-slate-500 font-mono">Index: {knowledgeBases[name].binfile}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className={`${GLASS_STYLE} col-span-full p-12 rounded-3xl text-center`}>
                  <p className="text-slate-500">No active knowledge systems found.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <div className={`${GLASS_STYLE} w-full p-10 rounded-3xl animate-in zoom-in-95 duration-300`}>
                <button onClick={() => setSelectedKB(null)} className="mb-8 text-slate-400 hover:text-white flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
                  ← Back to Systems
                </button>
                
                <div className="flex flex-col md:flex-row justify-between gap-8">
                  <div className="flex-1 space-y-6">
                    <div>
                      <h2 className="text-4xl font-bold text-white mb-2">{selectedKB}</h2>
                      <p className="text-slate-400">Knowledge System Management</p>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      <div className="p-4 rounded-2xl bg-dark-900/50 border border-slate-700/30">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Metadata File</p>
                        <p className="text-sm font-mono text-primary-400">{knowledgeBases[selectedKB].jsonfile}</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-dark-900/50 border border-slate-700/30">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Vector Index File</p>
                        <p className="text-sm font-mono text-primary-400">{knowledgeBases[selectedKB].binfile}</p>
                      </div>
                    </div>
                  </div>

                  <div className="md:w-72 space-y-4">
                    <div className="p-6 rounded-3xl bg-red-500/5 border border-red-500/20 space-y-4">
                      <h4 className="text-red-400 font-bold uppercase tracking-widest text-xs">Danger Zone</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Deleting this model will permanently remove all ingested documents, metadata, and the FAISS index from the server.
                      </p>
                      <button 
                        onClick={() => handleDeleteKB(selectedKB)}
                        className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors shadow-lg shadow-red-900/20"
                      >
                        Delete System
                      </button>
                    </div>

                    <div className="p-6 rounded-3xl bg-indigo-500/5 border border-indigo-500/20 space-y-4">
                      <h4 className="text-indigo-400 font-bold uppercase tracking-widest text-xs">Expansion</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Add more documents to this Knowledge Base to improve the AI's coverage.
                      </p>
                      <input
                        type="file"
                        multiple
                        id="append-files"
                        className="hidden"
                        onChange={(e) => handleAppendFiles(e.target.files)}
                      />
                      <button 
                        onClick={() => document.getElementById('append-files').click()}
                        disabled={historyLoading}
                        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors shadow-lg shadow-indigo-900/20 disabled:opacity-50"
                      >
                        {historyLoading ? 'Uploading...' : 'Add Files'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {status && (
                <div className={`p-4 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-300 ${
                  status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                  status.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                  'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                }`}>
                  <p className="text-sm font-bold flex items-center gap-2">
                    {status.type === 'success' ? '✓' : status.type === 'error' ? '!' : 'ℹ'} {status.message}
                  </p>
                </div>
              )}

              {/* System-Specific Chat History */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-amber-500 rounded-full"></div>
                    <h3 className="text-2xl font-bold text-white uppercase tracking-wider">Learning Loop: Chat History</h3>
                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-500 text-sm font-bold border border-amber-500/20">
                      {historyData.total} items
                    </span>
                  </div>
                  
                  {historyData.total_pages > 1 && (
                    <div className="flex items-center gap-2 bg-dark-800 p-1 rounded-xl border border-slate-700/50">
                      <button 
                        disabled={historyData.page === 1}
                        onClick={() => fetchHistory(selectedKB, historyData.page - 1)}
                        className="px-3 py-1 rounded-lg hover:bg-dark-700 disabled:opacity-30 transition-colors"
                      >
                        ←
                      </button>
                      <span className="text-xs font-bold text-slate-400 px-2">
                        Page {historyData.page} of {historyData.total_pages}
                      </span>
                      <button 
                        disabled={historyData.page === historyData.total_pages}
                        onClick={() => fetchHistory(selectedKB, historyData.page + 1)}
                        className="px-3 py-1 rounded-lg hover:bg-dark-700 disabled:opacity-30 transition-colors"
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>

                {historyLoading ? (
                  <div className="p-12 text-center text-slate-500 italic">Loading history...</div>
                ) : historyData.items.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {historyData.items.map((item, index) => (
                      <div key={item.chunk_id || index} className={`${GLASS_STYLE} p-6 rounded-3xl flex flex-col h-full group transition-all hover:border-amber-500/30`}>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Unverified Interaction</span>
                            </div>
                            <span className="text-slate-600 text-[10px] font-medium">{new Date(item.created_at).toLocaleString()}</span>
                          </div>
                          
                          {editingId === item.chunk_id ? (
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full h-40 p-4 rounded-2xl bg-dark-900/80 border border-amber-500/30 text-white text-sm focus:ring-2 focus:ring-amber-500/50 outline-none resize-none mb-4"
                            />
                          ) : (
                            <div className="bg-dark-900/50 rounded-2xl p-4 border border-slate-700/30 mb-4 h-40 overflow-y-auto custom-scrollbar">
                              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{item.text}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {editingId === item.chunk_id ? (
                            <>
                              <button onClick={() => handleVerify(item.chunk_id, editText)} className="flex-1 py-3 bg-green-600 text-white rounded-xl text-[11px] font-bold uppercase tracking-wider shadow-lg transition-all">Verify & Save</button>
                              <button onClick={() => setEditingId(null)} className="px-4 py-3 bg-dark-700 text-slate-300 rounded-xl text-[11px] font-bold uppercase tracking-wider hover:bg-dark-600 transition-all">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setEditingId(item.chunk_id); setEditText(item.text); }} className="flex-1 py-3 bg-primary-600/20 border border-primary-600/50 text-primary-400 rounded-xl text-[11px] font-bold uppercase tracking-wider hover:bg-primary-600 hover:text-white transition-all">Edit & Verify</button>
                              <button onClick={() => handleDeleteMemory(item.chunk_id)} className="px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[11px] font-bold uppercase tracking-wider hover:bg-red-500 hover:text-white transition-all">Discard</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`${GLASS_STYLE} p-12 rounded-3xl text-center border-dashed border-slate-700`}>
                    <p className="text-slate-500 text-sm">No chat history found for this system yet.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default SystemsRegistry;
