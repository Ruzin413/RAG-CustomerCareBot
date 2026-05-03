import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'

function Login({ onLogin }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })

      if (response.ok) {
        const data = await response.json()
        onLogin(data.role, data.token)
        navigate('/admin')
      } else {
        setError('Invalid admin token. Please try again.')
      }
    } catch (err) {
      setError('Connection failed. Is the backend running?')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface-100">
      <div className="w-full max-w-md p-10 card-white">
        <div className="text-center mb-10">
          <div className="w-12 h-12 bg-primary-600 rounded-2xl mx-auto mb-6 flex items-center justify-center text-white shadow-lg shadow-primary-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            Admin Authentication
          </h1>
          <p className="text-surface-500 text-sm mt-2 font-medium">Enter your secure token to manage the bot</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-surface-400 uppercase tracking-widest ml-1">Secure Access Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="••••••••••••••••"
              className="w-full input-field text-center tracking-widest font-mono"
              required
            />
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold text-center animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !token.trim()}
            className="w-full btn-primary py-4 text-base"
          >
            {isLoading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-surface-300 text-center">
          <button 
            onClick={() => navigate('/')}
            className="text-xs font-bold text-surface-400 hover:text-primary-600 transition-colors uppercase tracking-widest flex items-center justify-center gap-2 mx-auto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Chat
          </button>
        </div>
      </div>
      
      <p className="mt-8 text-[11px] text-surface-400 font-medium">
        SYSTEM STATUS: <span className="text-green-500">OPERATIONAL</span>
      </p>
    </div>
  )
}

export default Login

