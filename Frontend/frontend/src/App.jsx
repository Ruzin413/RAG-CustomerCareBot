import { useState, useRef, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import ChatBot from './ChatBot'
import Report from './pages/Report'
import History from './pages/History'
import Payment from './pages/Payment'

const GLASS_STYLE = "bg-dark-800/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl";
const GRADIENT_TEXT = "bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-fuchsia-400 font-extrabold";
const UPLOAD_CARD = `${GLASS_STYLE} rounded-3xl p-10 transition-all duration-500 hover:border-primary-500/50 hover:shadow-primary-500/10 cursor-pointer group`;

function MainApp() {
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

      if (response.ok) {
        setStatus({
          success: true,
          message: result.message || "Knowledge base updated and model re-trained successfully!",
          data: result,
          type: "success"
        })
        setFiles([])
        fetchUnverified()
      } else {
        throw new Error(result.message || "Failed to process documents")
      }
    } catch (err) {
      setStatus({ success: false, message: err.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const resetModel = async () => {
    if (!window.confirm("Are you sure you want to delete all trained data and reset the model?")) return
    setLoading(true)
    try {
      const response = await fetch('http://localhost:8001/reset', { method: 'POST' })
      if (response.ok) {
        setStatus({ success: true, message: "Knowledge base cleared!", type: "success" })
        setUnverifiedItems([])
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
                  <button onClick={uploadFile} className="w-full py-5 rounded-2xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white font-bold text-xl shadow-lg shadow-primary-900/50">
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
                <h3 className="text-2xl font-bold text-white mb-6">Unverified Knowledge</h3>
                {unverifiedItems.length > 0 ? (
                  <div className="space-y-4">
                    {unverifiedItems.map((item, index) => (
                      <div key={item.chunk_id || index} className="p-6 rounded-3xl border border-slate-700/50 bg-dark-800/30 backdrop-blur-md">
                        <p className="text-white text-sm mb-4">{item.text}</p>
                        <div className="flex gap-2">
                          <button onClick={() => handleDeleteMemory(item.chunk_id)} className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold">Discard</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-8">No unverified items yet.</p>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/report" element={<Report />} />
        <Route path="/history" element={<History />} />
        <Route path="/payment" element={<Payment />} />
      </Routes>
    </BrowserRouter>
  )
}
export default App
