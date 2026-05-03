import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { API_BASE_URL } from './apiConfig'

function ChatBot({ role, token, onLogout }) {
  const API_KEY = token || "admin123";
  const navigate = useNavigate()
  const location = useLocation()
  const [messages, setMessages] = useState([
    { id: 1, text: "Hello! I'm your support assistant. How can I help you today?", sender: 'bot' }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [knowledgeBases, setKnowledgeBases] = useState({})
  const [selectedKB, setSelectedKB] = useState("")
  const messagesEndRef = useRef(null)

  useEffect(() => {
    const fetchKBs = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/knowledge-bases`, {
          headers: { 'X-API-Key': API_KEY }
        })
        if (response.ok) {
          const data = await response.json()
          setKnowledgeBases(data.knowledge_bases)
          const kbs = Object.keys(data.knowledge_bases).filter(kb => kb !== "General")
          if (kbs.length > 0 && (!selectedKB || selectedKB === "General")) {
            setSelectedKB(kbs[0])
          }
        }
      } catch (err) {
        console.error("Failed to fetch KBs:", err)
      }
    }
    fetchKBs()
  }, [])
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    const userMessage = { id: Date.now(), text: input, sender: 'user' }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          message: input,
          kb_name: selectedKB
        })
      })
      if (!response.ok) throw new Error('Failed to connect to backend')
      const data = await response.json()
      const botMessage = {
        id: Date.now() + 1,
        text: data.answer || "I'm sorry, I couldn't process that request.",
        sender: 'bot',
        source: data.source
      }
      setMessages(prev => [...prev, botMessage])
      if (data.redirect_to) {
        setTimeout(() => {
          navigate(data.redirect_to)
        }, 1500)
      }
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage = {
        id: Date.now() + 1,
        text: "System error: Could not reach the AI service. Please ensure the backend is running.",
        sender: 'bot',
        isError: true
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-100">
      {/* Navbar/Header */}
      <nav className="w-full bg-white border-b border-surface-300 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold">
                  S
                </div>
                <span className="text-xl font-bold text-surface-900 tracking-tight">Support Center</span>
                {role === 'admin' && (
                  <span className="px-2 py-0.5 rounded bg-primary-50 text-primary-600 text-[10px] font-bold uppercase tracking-widest border border-primary-100">
                    Admin
                  </span>
                )}
              </div>

              {role === 'admin' && (
                <div className="hidden md:flex items-center gap-2">
                  <button
                    onClick={() => navigate('/')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname === '/'
                        ? 'bg-primary-600 text-white shadow-sm shadow-primary-200'
                        : 'text-surface-500 hover:text-surface-900 hover:bg-surface-50'
                      }`}
                  >
                    Chat Bot
                  </button>
                  <button
                    onClick={() => navigate('/admin/knowledge-base')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname === '/admin/knowledge-base'
                        ? 'bg-primary-600 text-white shadow-sm shadow-primary-200'
                        : 'text-surface-500 hover:text-surface-900 hover:bg-surface-50'
                      }`}
                  >
                    Knowledge Base
                  </button>
                  <button
                    onClick={() => navigate('/admin/systems')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname === '/admin/systems'
                        ? 'bg-primary-600 text-white shadow-sm shadow-primary-200'
                        : 'text-surface-500 hover:text-surface-900 hover:bg-surface-50'
                      }`}
                  >
                    Systems
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              {role === 'admin' ? (
                <button
                  onClick={onLogout}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-red-600 hover:bg-red-50 transition-all border border-transparent hover:border-red-100"
                >
                  Logout
                </button>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-surface-400 hover:text-primary-600 transition-all uppercase tracking-widest"
                >
                  Admin Login
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 container max-w-5xl mx-auto flex flex-col md:flex-row gap-6 p-6">
        {/* Left Sidebar - Options */}
        <div className="hidden md:flex flex-col w-64 gap-6">
          <div className="card-white p-6 space-y-4">
            <h2 className="text-xs font-bold text-surface-400 uppercase tracking-widest">Help Settings</h2>
            <div className="space-y-2">
              <label htmlFor="kb-select" className="text-sm font-medium text-surface-700 block">Department</label>
              <select
                id="kb-select"
                value={selectedKB}
                onChange={(e) => setSelectedKB(e.target.value)}
                className="w-full bg-surface-50 border border-surface-300 rounded-xl px-3 py-2.5 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 cursor-pointer transition-all"
              >
                {Object.keys(knowledgeBases).filter(kb => kb !== "General").map(kb => (
                  <option key={kb} value={kb}>{kb}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="card-white p-6">
            <h3 className="text-sm font-bold text-surface-900 mb-2">Need more help?</h3>
            <p className="text-xs text-surface-500 leading-relaxed">Our AI assistant is here 24/7 to help with common questions. For complex issues, please open a ticket.</p>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col card-white overflow-hidden max-h-[calc(100vh-8rem)]">
          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-surface-300 bg-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold">
                  AI
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
              </div>
              <div>
                <h3 className="font-semibold text-surface-900 text-sm">Assistant</h3>
                <p className="text-[11px] text-surface-400">Usually responds instantly</p>
              </div>
            </div>
            <div className="md:hidden">
              <select
                value={selectedKB}
                onChange={(e) => setSelectedKB(e.target.value)}
                className="bg-surface-50 border border-surface-300 rounded-lg px-2 py-1 text-[10px] text-surface-700 focus:outline-none"
              >
                {Object.keys(knowledgeBases).filter(kb => kb !== "General").map(kb => (
                  <option key={kb} value={kb}>{kb}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide bg-surface-50/50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom-1 duration-300`}
              >
                {msg.sender === 'bot' && (
                  <div className="w-8 h-8 rounded-full bg-surface-200 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-surface-600">
                    AI
                  </div>
                )}
                <div className="flex flex-col max-w-[80%]">
                  <div className={
                    msg.sender === 'user'
                      ? 'chat-bubble-user'
                      : msg.source?.includes('Fallback')
                        ? 'chat-bubble-fallback'
                        : 'chat-bubble-bot'
                  }>
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    {msg.sender === 'bot' && msg.source && (
                      <div className={`text-[10px] mt-2 font-medium flex items-center gap-1.5 ${msg.source.includes('Fallback') ? 'text-amber-600' : 'text-primary-600'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${msg.source.includes('Fallback') ? 'bg-amber-500' : 'bg-primary-500'}`}></div>
                        {msg.source.includes('Fallback') ? 'AI Insight' : 'Verified Knowledge'}
                      </div>
                    )}
                  </div>
                  <span className={`text-[10px] text-surface-400 mt-1.5 px-1 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                    {msg.sender === 'user' ? 'Just now' : 'Assistant'}
                  </span>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-full bg-surface-200 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-surface-600">
                  AI
                </div>
                <div className="chat-bubble-bot py-4 px-6 flex gap-1.5 items-center">
                  <div className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce [animation-duration:0.8s]"></div>
                  <div className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.2s]"></div>
                  <div className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.4s]"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-surface-300">
            <form onSubmit={handleSend} className="relative group">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                className="w-full bg-surface-50 border border-surface-300 rounded-2xl py-4 pl-5 pr-14 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all placeholder:text-surface-400"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute right-2 top-2 bottom-2 px-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white transition-all disabled:opacity-40 disabled:grayscale shadow-sm flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </form>
            <p className="text-[10px] text-center text-surface-400 mt-3 font-medium uppercase tracking-wider">
              Powered by RAG Customer Care
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

export default ChatBot
