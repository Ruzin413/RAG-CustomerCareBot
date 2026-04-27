import { useState, useRef, useEffect } from 'react'
import ChatBot from './ChatBot'

const GLASS_STYLE = "bg-dark-800/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl";
const GRADIENT_TEXT = "bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-fuchsia-400 font-extrabold";
const UPLOAD_CARD = `${GLASS_STYLE} rounded-3xl p-10 transition-all duration-500 hover:border-primary-500/50 hover:shadow-primary-500/10 cursor-pointer group`;

function App() {
  const [view, setView] = useState('chat') // Default to chat
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [unverifiedItems, setUnverifiedItems] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const fileInputRef = useRef(null)

  const fetchUnverified = async () => {
    try {
      const response = await fetch('http://localhost:8001/unverified')
      const data = await response.json()
      if (response.ok) {
        setUnverifiedItems(data.items || [])
      }
    } catch (err) {
      console.error('Failed to fetch unverified items:', err)
    }
  }

  // Fetch unverified items when switching to ingestion view
  useEffect(() => {
    if (view === 'ingestion') {
      fetchUnverified()
    }
  }, [view])

  const handleVerify = async (chunk_id, text) => {
    try {
      const response = await fetch('http://localhost:8001/unverified/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk_id, text })
      })
      if (response.ok) {
        setEditingId(null)
        fetchUnverified()
        setStatus({ success: true, message: "Knowledge item verified and saved!", type: "success" })
      }
    } catch (err) {
      console.error('Failed to verify item:', err)
    }
  }

  const handleDeleteMemory = async (chunk_id) => {
    if (!window.confirm("Delete this memory item?")) return
    try {
      const response = await fetch('http://localhost:8001/unverified/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk_id })
      })
      if (response.ok) {
        fetchUnverified()
      }
    } catch (err) {
      console.error('Failed to delete item:', err)
    }
  }

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files)
    if (selectedFiles.length > 0) {
      setFiles(prev => [...prev, ...selectedFiles])
      setStatus(null)
    }
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const uploadFile = async () => {
    if (files.length === 0) return
    setLoading(true)
    setStatus({ message: `Analyzing ${files.length} document(s) and generating knowledge...`, type: "info" })

    console.log(`📤 Starting upload for ${files.length} files`)

    const formData = new FormData()
    files.forEach(f => {
      formData.append('file', f)
    })

    try {
      const response = await fetch('http://localhost:8001/upload', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()

      console.log('📥 Backend Response:', result)

      if (response.ok) {
        console.log('✅ Documents processed successfully')
        setStatus({
          success: true,
          message: result.message || "Knowledge base updated and model re-trained successfully!",
          data: result,
          type: "success"
        })
        setFiles([])
        fetchUnverified() // Refresh unverified list
      } else {
        console.warn('⚠️ Backend returned an error:', result.message)
        throw new Error(result.message || "Failed to process documents")
      }
    } catch (err) {
      console.error('❌ Upload process failed:', err)
      setStatus({ success: false, message: err.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const resetModel = async () => {
    if (!window.confirm("Are you sure you want to delete all trained data and reset the model? This action cannot be undone.")) return

    setLoading(true)
    setStatus({ message: "Resetting model and clearing knowledge base...", type: "info" })

    try {
      const response = await fetch('http://localhost:8001/reset', {
        method: 'POST',
      })
      const result = await response.json()

      if (response.ok) {
        setStatus({
          success: true,
          message: result.message,
          type: "success"
        })
        setUnverifiedItems([]) // Clear unverified list
      } else {
        throw new Error(result.message || "Failed to reset model")
      }
    } catch (err) {
      setStatus({ success: false, message: err.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden bg-dark-950">
      {/* Background Blobs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-primary-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-fuchsia-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      <div className="container max-w-4xl relative z-10 flex flex-col items-center">
        <header className="text-center mb-8">
          <h1 className={`text-4xl md:text-5xl mb-4 tracking-tight ${GRADIENT_TEXT}`}>
            FT Customer Care Bot
          </h1>

          {/* Navigation Toggle */}
          <div className="flex bg-dark-800/80 p-1.5 rounded-2xl border border-slate-700/50 shadow-lg backdrop-blur-md">
            <button
              onClick={() => setView('chat')}
              className={`px-8 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${view === 'chat' ? 'bg-primary-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Chat Interface
            </button>
            <button
              onClick={() => setView('ingestion')}
              className={`px-8 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${view === 'ingestion' ? 'bg-primary-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Knowledge Base
            </button>
          </div>
        </header>

        <main className="w-full animate-in fade-in zoom-in-95 duration-500">
          {view === 'chat' ? (
            <ChatBot />
          ) : (
            <div className="space-y-8">
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

                  {files.length === 0 && !loading && (
                    <div className="pt-4 text-primary-400 font-medium text-sm uppercase tracking-widest">
                      Supported: PDF, DOCX, PPTX, TXT
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Files List */}
              {files.length > 0 && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
                  {files.map((f, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-dark-800/40 border border-slate-700/50 group">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className="text-xl">📄</span>
                        <div className="overflow-hidden">
                          <p className="text-sm font-medium text-white truncate">{f.name}</p>
                          <p className="text-[10px] text-slate-500">{(f.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-4">
                {files.length > 0 && !loading && (
                  <button
                    onClick={uploadFile}
                    className="w-full py-5 rounded-2xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white font-bold text-xl shadow-lg shadow-primary-900/50 hover:scale-[1.01] active:scale-[0.99] transition-all"
                  >
                    Start Batch Ingestion
                  </button>
                )}

                {!loading && (
                  <button
                    onClick={resetModel}
                    className="w-full py-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400 font-semibold hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 group"
                  >
                    <span className="opacity-70 group-hover:opacity-100 transition-opacity">⚠️</span>
                    Delete Model & Data
                  </button>
                )}
              </div>

              {/* Status Display */}
              {status && (
                <div className={`glass rounded-3xl p-8 border-l-4 ${status.type === 'error' ? 'border-red-500' : 'border-primary-500'} animate-in fade-in slide-in-from-bottom-4 duration-500 ${GLASS_STYLE}`}>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold uppercase tracking-wider">{status.type === 'info' ? 'Processing...' : 'System Report'}</h3>
                    <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase ${status.type === 'success' ? 'bg-green-500/10 text-green-400' :
                      status.type === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-primary-500/10 text-primary-400'
                      }`}>
                      {status.type}
                    </span>
                  </div>

                  <p className="text-slate-300 text-lg mb-6">{status.message}</p>

                  {status.success && status.data && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-dark-900/50 p-4 rounded-2xl border border-slate-700/30">
                        <div className="text-primary-400 text-sm font-bold uppercase mb-1">Domain</div>
                        <div className="text-white font-medium truncate">{status.data.domain}</div>
                      </div>
                      <div className="bg-dark-900/50 p-4 rounded-2xl border border-slate-700/30">
                        <div className="text-primary-400 text-sm font-bold uppercase mb-1">Total Chunks</div>
                        <div className="text-white text-2xl font-bold">{status.data.chunks_generated}</div>
                      </div>
                      <div className="bg-dark-900/50 p-4 rounded-2xl border border-slate-700/30">
                        <div className="text-primary-400 text-sm font-bold uppercase mb-1">Status</div>
                        <div className="text-green-400 font-bold uppercase flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                          Retrained
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Unverified Knowledge Section */}
              <div className="pt-8 border-t border-slate-700/30">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-1">Unverified Knowledge</h3>
                    <p className="text-slate-400 text-sm">Answers generated by AI during fallbacks that need review</p>
                  </div>
                  <span className="bg-amber-500/10 text-amber-500 px-4 py-1 rounded-full text-xs font-bold uppercase border border-amber-500/20">
                    {unverifiedItems.length} Items
                  </span>
                </div>

                {unverifiedItems.length > 0 ? (
                  <div className="space-y-4">
                    {unverifiedItems.map((item, index) => (
                      <div key={item.chunk_id || index} className="p-6 rounded-3xl border border-slate-700/50 bg-dark-800/30 backdrop-blur-md group hover:border-amber-500/30 transition-all">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-xl shrink-0">
                            💡
                          </div>
                          <div className="flex-1 space-y-3">
                            {editingId === item.chunk_id ? (
                              <div className="space-y-4">
                                <div className="bg-dark-900/60 p-3 rounded-xl border border-slate-700/30">
                                  <span className="text-[10px] font-bold text-primary-400 uppercase tracking-widest block mb-1">Question</span>
                                  <p className="text-white text-sm font-medium">{item.text.split('\nAnswer:')[0].replace('Question: ', '')}</p>
                                </div>
                                <div className="space-y-2">
                                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest block px-1">Correct Answer</span>
                                  <textarea
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    className="w-full bg-dark-950/50 border border-amber-500/30 rounded-xl p-4 text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 h-40 text-sm leading-relaxed"
                                    placeholder="Write the correct answer here..."
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      const question = item.text.split('\nAnswer:')[0];
                                      const combined = `${question}\nAnswer: ${editText}`;
                                      handleVerify(item.chunk_id, combined);
                                    }}
                                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-900/20"
                                  >
                                    Save & Verify
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="px-6 py-2.5 bg-dark-700 hover:bg-dark-600 text-slate-300 rounded-xl text-xs font-bold transition-all"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="bg-dark-900/40 p-3 rounded-xl border border-slate-700/30">
                                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest block mb-1">Question</span>
                                  <p className="text-white text-sm font-medium">{item.text.split('\nAnswer:')[0].replace('Question: ', '')}</p>
                                </div>
                                <div className="p-3">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">AI Response</span>
                                  <p className="text-slate-300 text-sm leading-relaxed">{item.text.split('\nAnswer:')[1]}</p>
                                </div>
                                <div className="flex items-center justify-between mt-4">
                                  <div className="flex gap-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest items-center">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50"></span>
                                      Pending Review
                                    </span>
                                    <span>•</span>
                                    <span>{new Date(item.created_at).toLocaleString()}</span>
                                  </div>
                                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => { 
                                        setEditingId(item.chunk_id); 
                                        setEditText(item.text.split('\nAnswer: ')[1] || item.text.split('\nAnswer:')[1] || ''); 
                                      }}
                                      className="px-3 py-1.5 bg-primary-600/10 hover:bg-primary-600 text-primary-400 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all"
                                    >
                                      Edit Answer
                                    </button>
                                    <button
                                      onClick={() => handleDeleteMemory(item.chunk_id)}
                                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all"
                                    >
                                      Discard
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-dark-800/20 rounded-3xl border border-dashed border-slate-700/50">
                    <p className="text-slate-500 font-medium">No unverified items yet. When the AI uses fallbacks, they will appear here.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
