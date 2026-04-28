import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ChatBot from './ChatBot'
import KnowledgeBase from './pages/KnowledgeBase'
import SystemsRegistry from './pages/SystemsRegistry'
import Report from './pages/Report'
import History from './pages/History'
import Payment from './pages/Payment'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatBot />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route path="/systems" element={<SystemsRegistry />} />
        <Route path="/report" element={<Report />} />
        <Route path="/history" element={<History />} />
        <Route path="/payment" element={<Payment />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
