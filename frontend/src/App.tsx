import { Routes, Route, NavLink } from 'react-router-dom'
import { ToastContainer } from './components/shared'
import Dashboard from './pages/Dashboard'
import MeetingsList from './pages/MeetingsList'
import MeetingDetail from './pages/MeetingDetail'
import ItemsBoard from './pages/ItemsBoard'
import KnowledgeBase from './pages/KnowledgeBase'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-6">
          <span className="font-bold text-blue-600 text-lg mr-4">⟳ Context Handoff</span>
          {[
            { to: '/', label: 'Dashboard' },
            { to: '/meetings', label: 'Meetings' },
            { to: '/items', label: 'Action Items' },
            { to: '/kb', label: 'Knowledge Base' },
          ].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive ? 'text-blue-600 border-b-2 border-blue-600 pb-0.5' : 'text-gray-600 hover:text-blue-600'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/meetings" element={<MeetingsList />} />
          <Route path="/meetings/:id" element={<MeetingDetail />} />
          <Route path="/items" element={<ItemsBoard />} />
          <Route path="/kb" element={<KnowledgeBase />} />
        </Routes>
      </main>

      {/* Global toast container */}
      <ToastContainer />
    </div>
  )
}

