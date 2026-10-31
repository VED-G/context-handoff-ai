import { Routes, Route, NavLink, Link } from 'react-router-dom'
import { ToastContainer } from './components/shared'
import Dashboard from './pages/Dashboard'
import MeetingsList from './pages/MeetingsList'
import MeetingDetail from './pages/MeetingDetail'
import ItemsBoard from './pages/ItemsBoard'
import KnowledgeBase from './pages/KnowledgeBase'

export default function App() {
  const navItems = [
    { to: '/', label: 'Dashboard', icon: '📊' },
    { to: '/meetings', label: 'Meetings & Handovers', icon: '🗓️' },
    { to: '/items', label: 'Action Items', icon: '✓' },
    { to: '/kb', label: 'Knowledge Base', icon: '📚' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-50/40 via-slate-50 to-slate-100/50 text-slate-800 antialiased">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-40 glass border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo / Brand */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform duration-200">
                <span className="text-lg font-bold">⟳</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 tracking-tight text-base group-hover:text-brand-600 transition-colors">
                    Context Handoff
                  </span>
                  <span className="bg-gradient-to-r from-violet-600 to-brand-600 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded-md uppercase tracking-wider shadow-xs">
                    AI
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Knowledge & Tasks Lifecycle</span>
              </div>
            </Link>

            {/* Nav Links */}
            <div className="flex items-center gap-1 sm:gap-2">
              {navItems.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 font-semibold shadow-xs border border-brand-200/60'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                    }`
                  }
                >
                  <span className="text-xs opacity-80">{icon}</span>
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>

            {/* Right Status Indicator */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/80 border border-slate-200/70 text-xs text-slate-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-medium text-[11px] text-slate-600">Dual-AI Active</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/meetings" element={<MeetingsList />} />
          <Route path="/meetings/:id" element={<MeetingDetail />} />
          <Route path="/items" element={<ItemsBoard />} />
          <Route path="/kb" element={<KnowledgeBase />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/70 py-6 text-center text-xs text-slate-400">
        <p>Context Handoff AI · Groq & Gemini Powered · Team Knowledge & Task Accountability</p>
      </footer>

      {/* Global Toast Notifications */}
      <ToastContainer />
    </div>
  )
}
