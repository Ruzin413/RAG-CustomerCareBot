import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../apiConfig';

const SystemsRegistry = ({ token }) => {
  const API_KEY = token || "ft-customer-care-secret-2026";
  const navigate = useNavigate();
  const [knowledgeBases, setKnowledgeBases] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedKB, setSelectedKB] = useState(null);
  const [status, setStatus] = useState(null);
  const [historyData, setHistoryData] = useState({ items: [], total: 0, page: 1, total_pages: 1 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  const fetchKBs = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (kbName, page = 1) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/chat-history?kb_name=${encodeURIComponent(kbName)}&page=${page}&page_size=10`, {
        headers: { 'X-API-Key': API_KEY }
      });
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

  const handleAppendFiles = async (files) => {
    if (!files || files.length === 0) return;
    setHistoryLoading(true);
    setStatus({ type: 'info', message: `Adding ${files.length} documents...` });
    const formData = new FormData();
    for (const file of files) { formData.append('file', file); }
    try {
      const response = await fetch(`${API_BASE_URL}/knowledge-bases/${encodeURIComponent(selectedKB)}/append`, {
        method: 'POST',
        headers: { 'X-API-Key': API_KEY },
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
      setStatus({ type: 'error', message: "Network error while uploading" });
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { fetchKBs(); }, []);
  useEffect(() => { if (selectedKB) fetchHistory(selectedKB, 1); }, [selectedKB]);

  const handleAddQuestion = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/memory/add`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({ question: newQuestion, answer: newAnswer, kb_name: selectedKB })
      });
      if (response.ok) {
        setNewQuestion(''); setNewAnswer(''); setShowAddModal(false);
        setStatus({ type: 'success', message: "Question added successfully!" });
      } else {
        const data = await response.json();
        setStatus({ type: 'error', message: data.detail || "Failed to add question" });
      }
    } catch (err) {
      setStatus({ type: 'error', message: "Network error while adding question" });
    } finally {
      setHistoryLoading(false);
      setTimeout(() => setStatus(null), 5000);
    }
  };

  const handleVerify = async (chunk_id, text) => {
    try {
      const response = await fetch(`${API_BASE_URL}/unverified/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ chunk_id, text, kb_name: selectedKB })
      });
      if (response.ok) {
        setEditingId(null);
        fetchHistory(selectedKB, historyData.page);
        setStatus({ message: "Interaction verified and added to knowledge base!", type: "success" });
        setTimeout(() => setStatus(null), 3000);
      }
    } catch (err) { console.error('Failed to verify item:', err); }
  };

  const handleDeleteMemory = async (chunk_id) => {
    if (!window.confirm("Delete this interaction from history?")) return;
    try {
      const response = await fetch(`${API_BASE_URL}/unverified/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ chunk_id, kb_name: selectedKB })
      });
      if (response.ok) fetchHistory(selectedKB, historyData.page);
    } catch (err) { console.error('Failed to delete item:', err); }
  };

  const handleDeleteKB = async (name) => {
    if (!window.confirm(`Are you sure you want to delete '${name}'? This will permanently remove all associated metadata and index files.`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/knowledge-bases/${name}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': API_KEY }
      });
      if (response.ok) {
        setStatus({ message: `System '${name}' deleted successfully.`, type: 'success' });
        setSelectedKB(null);
        fetchKBs();
      } else {
        const data = await response.json();
        throw new Error(data.message || "Failed to delete system");
      }
    } catch (err) { setStatus({ message: err.message, type: 'error' }); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h2 className="text-2xl font-bold text-surface-900 tracking-tight">Systems Registry</h2>
          <p className="text-surface-500 text-sm">Manage and monitor your active AI knowledge systems.</p>
        </div>
      </div>

      {status && (
        <div className={`p-4 rounded-xl border ${status.type === 'error' ? 'bg-red-50 border-red-100 text-red-600' : 'bg-primary-50 border-primary-100 text-primary-700'} text-sm font-semibold text-center`}>
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
                className="card-white p-6 cursor-pointer hover:border-primary-400 hover:shadow-md transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 font-bold group-hover:scale-110 transition-transform">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest bg-green-50 px-2.5 py-1 rounded-full border border-green-100">Live</span>
                </div>
                <h3 className="text-lg font-bold text-surface-900 mb-1">{name}</h3>
                <div className="space-y-1">
                  <p className="text-[11px] text-surface-400 font-mono truncate">ID: {knowledgeBases[name].jsonfile}</p>
                </div>
                <div className="mt-4 pt-4 border-t border-surface-100 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">View Details</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-surface-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))
          ) : (
            <div className="card-white col-span-full p-12 text-center border-dashed">
              <p className="text-surface-400 text-sm italic">No active knowledge systems found.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
          <div className="flex items-center gap-4">
             <button onClick={() => setSelectedKB(null)} className="p-2 rounded-lg bg-white border border-surface-300 text-surface-600 hover:text-primary-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
             </button>
             <div>
                <h3 className="text-xl font-bold text-surface-900">{selectedKB}</h3>
                <p className="text-xs text-surface-500">Resource Overview & Learning Loop</p>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
             <div className="lg:col-span-2 space-y-6">
                <div className="card-white p-6 space-y-6">
                   <h4 className="text-sm font-bold text-surface-900 uppercase tracking-widest border-b border-surface-100 pb-4">Resource Info</h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-surface-50 rounded-xl border border-surface-300">
                        <p className="text-[10px] font-bold text-surface-400 uppercase mb-1">Metadata File</p>
                        <p className="text-xs font-mono text-surface-700 truncate">{knowledgeBases[selectedKB].jsonfile}</p>
                      </div>
                      <div className="p-4 bg-surface-50 rounded-xl border border-surface-300">
                        <p className="text-[10px] font-bold text-surface-400 uppercase mb-1">Vector Index</p>
                        <p className="text-xs font-mono text-surface-700 truncate">{knowledgeBases[selectedKB].binfile}</p>
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center justify-between px-2">
                      <h4 className="text-sm font-bold text-surface-900 uppercase tracking-widest">Unverified Interactions</h4>
                      {historyData.total_pages > 1 && (
                        <div className="flex items-center gap-2">
                          <button disabled={historyData.page === 1} onClick={() => fetchHistory(selectedKB, historyData.page - 1)} className="p-1 rounded bg-white border border-surface-300 disabled:opacity-30">←</button>
                          <span className="text-[10px] font-bold text-surface-500">{historyData.page} / {historyData.total_pages}</span>
                          <button disabled={historyData.page === historyData.total_pages} onClick={() => fetchHistory(selectedKB, historyData.page + 1)} className="p-1 rounded bg-white border border-surface-300 disabled:opacity-30">→</button>
                        </div>
                      )}
                   </div>

                   {historyLoading ? (
                     <div className="p-12 text-center text-surface-400 italic">Synchronizing history...</div>
                   ) : historyData.items.length > 0 ? (
                     <div className="space-y-4">
                        {historyData.items.map((item, index) => (
                          <div key={item.chunk_id || index} className="card-white p-5 space-y-4">
                             <div className="flex justify-between items-start">
                                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold uppercase tracking-wider border border-amber-100">Action Required</span>
                                <span className="text-surface-400 text-[10px]">{new Date(item.created_at).toLocaleString()}</span>
                             </div>

                             {editingId === item.chunk_id ? (
                               <div className="space-y-4">
                                  <div className="p-3 bg-surface-50 rounded-lg text-xs italic text-surface-500 border border-surface-100">{item.question || item.original_question}</div>
                                  <textarea
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    className="w-full h-32 p-3 text-sm border border-primary-200 rounded-xl focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                                    placeholder="Refine the AI answer..."
                                  />
                                  <div className="flex gap-2">
                                     <button onClick={() => handleVerify(item.chunk_id, editText)} className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest shadow-sm">Verify & Index</button>
                                     <button onClick={() => setEditingId(null)} className="px-4 py-2.5 bg-surface-100 text-surface-600 rounded-lg text-xs font-bold uppercase tracking-widest">Cancel</button>
                                  </div>
                               </div>
                             ) : (
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                     <p className="text-[9px] font-bold text-surface-400 uppercase">Question</p>
                                     <p className="text-xs text-surface-700 line-clamp-3 leading-relaxed">{item.question || item.original_question}</p>
                                  </div>
                                  <div className="space-y-1">
                                     <p className="text-[9px] font-bold text-primary-500 uppercase">AI Answer</p>
                                     <p className="text-xs text-surface-700 line-clamp-3 leading-relaxed">{item.answer}</p>
                                  </div>
                                  <div className="col-span-full pt-2 flex gap-2">
                                     <button onClick={() => { setEditingId(item.chunk_id); setEditText(item.answer || ''); }} className="flex-1 py-2 bg-primary-50 text-primary-600 border border-primary-100 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-primary-600 hover:text-white transition-all">Refine & Verify</button>
                                     <button onClick={() => handleDeleteMemory(item.chunk_id)} className="px-4 py-2 text-red-500 hover:bg-red-50 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">Discard</button>
                                  </div>
                               </div>
                             )}
                          </div>
                        ))}
                     </div>
                   ) : (
                     <div className="card-white p-12 text-center text-surface-400 text-sm italic">
                        All interactions are verified.
                     </div>
                   )}
                </div>
             </div>

             <div className="lg:col-span-1 space-y-6">
                <div className="card-white p-6 space-y-4">
                   <h4 className="text-xs font-bold text-surface-900 uppercase tracking-widest">Knowledge Actions</h4>
                   <button onClick={() => setShowAddModal(true)} className="w-full btn-primary py-3 text-xs flex items-center justify-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                      Add Manual Entry
                   </button>
                   <input type="file" multiple id="append-files" className="hidden" onChange={(e) => handleAppendFiles(e.target.files)} />
                   <button onClick={() => document.getElementById('append-files').click()} className="w-full py-3 bg-white border border-surface-300 rounded-xl text-xs font-bold text-surface-700 hover:bg-surface-50 transition-all flex items-center justify-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      Batch Append Docs
                   </button>
                </div>

                <div className="card-white p-6 border-red-100 bg-red-50/20 space-y-4">
                   <h4 className="text-xs font-bold text-red-600 uppercase tracking-widest">Danger Zone</h4>
                   <p className="text-[10px] text-surface-500 leading-relaxed">Permanently remove this knowledge system. This cannot be undone.</p>
                   <button onClick={() => handleDeleteKB(selectedKB)} className="w-full py-3 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all shadow-sm">Delete System</button>
                </div>
             </div>
          </div>

          {showAddModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-surface-900/40 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="card-white w-full max-w-xl p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                <h3 className="text-xl font-bold text-surface-900 mb-6 uppercase tracking-wider">Manual Knowledge Entry</h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-surface-400 uppercase tracking-widest ml-1">Question</label>
                    <textarea value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} className="w-full h-24 p-4 input-field resize-none" placeholder="Type common user question..." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-surface-400 uppercase tracking-widest ml-1">Verified Answer</label>
                    <textarea value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)} className="w-full h-40 p-4 input-field resize-none" placeholder="Type the expert answer..." />
                  </div>
                  <div className="flex gap-4 pt-2">
                    <button onClick={handleAddQuestion} disabled={historyLoading || !newQuestion.trim() || !newAnswer.trim()} className="flex-1 btn-primary py-4 text-sm uppercase tracking-widest">{historyLoading ? 'Saving...' : 'Add to Knowledge Base'}</button>
                    <button onClick={() => { setShowAddModal(false); setNewQuestion(''); setNewAnswer(''); }} className="px-8 py-4 bg-surface-100 text-surface-600 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-surface-200 transition-all">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SystemsRegistry;
