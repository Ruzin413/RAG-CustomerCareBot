import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const GLASS_STYLE = "bg-dark-900/60 backdrop-blur-2xl border border-slate-700/50 shadow-2xl";
const GRADIENT_TEXT = "bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-indigo-400 font-extrabold";
const API_KEY = "ft-customer-care-secret-2026";

function ChatBot() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([
    { id: 1, text: "Hello! I'm your AI Customer Assistant. How can I help you today?", sender: 'bot' }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [knowledgeBases, setKnowledgeBases] = useState({})
  const [selectedKB, setSelectedKB] = useState("")
  const messagesEndRef = useRef(null)

  useEffect(() => {
    const fetchKBs = async () => {
      try {
        const response = await fetch('http://localhost:8001/CustomerCare/knowledge-bases', {
          headers: { 'X-API-Key': API_KEY }
        })
        if (response.ok) {
          const data = await response.json()
          setKnowledgeBases(data.knowledge_bases)
          // Default to first available KB if current selection is invalid
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
      const response = await fetch('http://localhost:8001/CustomerCare/process', {
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
      console.log('Chat response:', data)
      const botMessage = {
        id: Date.now() + 1,
        text: data.answer || "I'm sorry, I couldn't process that request.",
        sender: 'bot',
        source: data.source
      }
      setMessages(prev => [...prev, botMessage])

      // Handle Redirection
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
    <div className="relative min-h-screen flex flex-col items-center justify-center p-6 bg-dark-950 overflow-hidden">
      {/* Background Blobs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-primary-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>

      <div className="container max-w-4xl relative z-10 flex flex-col items-center">
        <header className="text-center mb-8">
          <h1 className={`text-4xl md:text-5xl mb-4 tracking-tight ${GRADIENT_TEXT}`}>
            FT Customer Care Bot
          </h1>

          <div className="flex bg-dark-800/80 p-1.5 rounded-2xl border border-slate-700/50 shadow-lg backdrop-blur-md">
            <button
              className="px-8 py-2.5 rounded-xl font-bold text-sm bg-primary-600 text-white shadow-lg"
            >
              Chat Interface
            </button>
            <button
              onClick={() => navigate('/knowledge-base')}
              className="px-8 py-2.5 rounded-xl font-bold text-sm text-slate-400 hover:text-slate-200 transition-all duration-300"
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

        <div className={`flex flex-col h-[600px] w-full max-w-2xl mx-auto rounded-3xl overflow-hidden ${GLASS_STYLE}`}>
      {/* Chat Header */}
      <div className="p-6 border-b border-slate-700/50 flex items-center justify-between bg-dark-800/30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white">
            AI
          </div>
          <div>
            <h3 className="font-bold text-white tracking-tight">AI Assistant</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="kb-select" className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hidden sm:block">Knowledge Base:</label>
          <select
            id="kb-select"
            value={selectedKB}
            onChange={(e) => setSelectedKB(e.target.value)}
            className="bg-dark-900/80 border border-slate-700/50 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary-500/50 cursor-pointer hover:border-slate-600 transition-all shadow-inner"
          >
            {Object.keys(knowledgeBases).filter(kb => kb !== "General").map(kb => (
              <option key={kb} value={kb}>{kb}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide bg-dark-900/20">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            <div className={
              msg.sender === 'user'
                ? 'chat-bubble-user'
                : msg.source?.includes('Fallback')
                  ? 'chat-bubble-fallback'
                  : 'chat-bubble-bot'
            }>
              {msg.text}
              {msg.sender === 'bot' && msg.source && (
                <div className={`text-[9px] mt-2 font-bold uppercase tracking-widest flex items-center gap-1 ${msg.source.includes('Fallback') ? 'text-amber-500/70' : 'text-primary-400/70'}`}>
                  <span className={`w-1 h-1 rounded-full ${msg.source.includes('Fallback') ? 'bg-amber-500' : 'bg-primary-400'}`}></span>
                  {msg.source.includes('Fallback') ? 'AI Generated' : 'Verified Source'}
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 px-1 uppercase tracking-tighter">
              {msg.sender === 'user' ? 'You' : 'Assistant'}
            </span>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start animate-pulse">
            <div className="chat-bubble-bot flex gap-1 items-center">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSend} className="p-4 bg-dark-800/40 border-t border-slate-700/50">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="w-full bg-dark-900/50 border border-slate-700/50 rounded-2xl py-4 pl-6 pr-14 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 p-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-900/40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
      </form>
        </div>
      </div>
    </div>
  )
}
export default ChatBot
