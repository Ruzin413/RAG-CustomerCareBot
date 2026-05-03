import { Outlet, Navigate } from 'react-router-dom'
import Navbar from './Navbar'

const AdminLayout = ({ role, onLogout }) => {
  if (role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-surface-100">
      <Navbar onLogout={onLogout} />
      <main className="p-6 max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
