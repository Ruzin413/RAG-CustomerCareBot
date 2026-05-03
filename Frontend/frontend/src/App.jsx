import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ChatBot from './ChatBot'
import KnowledgeBase from './pages/KnowledgeBase'
import SystemsRegistry from './pages/SystemsRegistry'
import Login from './pages/Login'
import AdminLayout from './components/AdminLayout'

function App() {
  const [role, setRole] = useState('user')
  const [token, setToken] = useState('')

  const handleLogin = (userRole, userToken) => {
    setRole(userRole)
    setToken(userToken)
  }

  const handleLogout = () => {
    setRole('user')
    setToken('')
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public/User Route */}
        <Route path="/" element={<ChatBot role={role} token={token} onLogout={handleLogout} />} />
        
        {/* Login Route */}
        <Route path="/login" element={<Login onLogin={handleLogin} />} />

        {/* Admin Routes */}
        <Route path="/admin" element={<AdminLayout role={role} token={token} onLogout={handleLogout} />}>
          <Route index element={<Navigate to="knowledge-base" replace />} />
          <Route path="knowledge-base" element={<KnowledgeBase token={token} />} />
          <Route path="systems" element={<SystemsRegistry token={token} />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
