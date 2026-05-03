import { Link, useLocation } from 'react-router-dom'

const Navbar = ({ onLogout }) => {
  const location = useLocation()

  const navItems = [
    { name: 'Chat Bot', path: '/' },
    { name: 'Knowledge Base', path: '/admin/knowledge-base' },
    { name: 'Systems', path: '/admin/systems' },
  ]

  return (
    <nav className="bg-white border-b border-surface-300 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold">
                S
              </div>
              <span className="text-xl font-bold text-surface-900 tracking-tight">
                Support Center
              </span>
              <span className="px-2 py-0.5 rounded bg-primary-50 text-primary-600 text-[10px] font-bold uppercase tracking-widest border border-primary-100">
                Admin
              </span>
            </div>
            <div className="hidden md:flex items-center gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname === item.path
                      ? 'bg-primary-600 text-white shadow-sm shadow-primary-200'
                      : 'text-surface-500 hover:text-surface-900 hover:bg-surface-50'
                    }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onLogout}
              className="px-4 py-2 rounded-lg text-sm font-bold text-red-600 hover:bg-red-50 transition-all border border-transparent hover:border-red-100"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
export default Navbar
