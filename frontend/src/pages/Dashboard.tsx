/**
 * Dashboard page: stats, Open-Loop Radar, overdue items, personal lookup.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, DashboardStats, RadarItem, ActionItem } from '../api'
import { Spinner, EmptyState, StatusBadge, AiBadge, LoadingButton, toastError, toast } from '../components/shared'

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [radar, setRadar] = useState<RadarItem[]>([])
  const [overdue, setOverdue] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [radarLoading, setRadarLoading] = useState(true)
  const [myOwner, setMyOwner] = useState('')
  const [myItems, setMyItems] = useState<ActionItem[]>([])
  const [nudgeItem, setNudgeItem] = useState<RadarItem | null>(null)
  const [copiedNudge, setCopiedNudge] = useState(false)
  const [seeding, setSeeding] = useState(false)

  function refreshAll() {
    setLoading(true)
    setRadarLoading(true)
    Promise.all([api.getDashboard(), api.getOverdue()])
      .then(([s, o]) => {
        setStats(s)
        setOverdue(o as ActionItem[])
      })
      .catch(toastError)
      .finally(() => setLoading(false))

    api.getRadar(true)
      .then(setRadar)
      .catch(() => api.getRadar(false).then(setRadar).catch(toastError))
      .finally(() => setRadarLoading(false))
  }

  useEffect(() => {
    refreshAll()
  }, [])

  function fetchMyItems() {
    if (!myOwner.trim()) return
    api.getMyItems(myOwner).then(items => setMyItems(items as ActionItem[])).catch(toastError)
  }

  function getRiskBadge(score: number) {
    if (score >= 70) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 border border-rose-200 text-rose-700 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          Critical ({score}%)
        </span>
      )
    }
    if (score >= 40) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 border border-amber-200 text-amber-700 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          At Risk ({score}%)
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-2xs">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        Low Risk ({score}%)
      </span>
    )
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time handoff visibility, task accountability & AI slip detection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            className="btn-secondary text-xs px-3 py-1.5"
            title="Reload metrics"
          >
            <span>↻ Refresh</span>
          </button>
          <Link to="/meetings" className="btn-primary text-xs px-3.5 py-1.5">
            <span>+ New Meeting</span>
          </Link>
        </div>
      </div>

      {/* Empty State Banner (if database is brand new) */}
      {stats && stats.total_meetings === 0 && (
        <div className="card bg-gradient-to-br from-brand-50/80 via-white to-indigo-50/50 border-brand-200 text-center py-10 px-6 space-y-4 shadow-md animate-fade-in-up">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-600 text-white flex items-center justify-center text-2xl shadow-lg shadow-brand-500/25">
            🚀
          </div>
          <h2 className="text-xl font-bold text-slate-900">Welcome to Context Handoff AI</h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            Your database is currently empty. Click below to load pre-configured Atlas team sample data (5 meetings, 13 action items across all statuses, 7 knowledge base docs, and risk scores).
          </p>
          <div className="pt-2">
            <LoadingButton
              loading={seeding}
              onClick={async () => {
                setSeeding(true)
                try {
                  await api.seedDatabase()
                  toast({ type: 'success', message: 'Sample team data loaded successfully!' })
                  refreshAll()
                } catch (e) {
                  toastError(e)
                } finally {
                  setSeeding(false)
                }
              }}
            >
              ✦ Load Sample Team Data
            </LoadingButton>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total Meetings', value: stats.total_meetings, icon: '🗓️', color: 'from-blue-500 to-indigo-600', border: 'hover:border-blue-300' },
            { label: 'Open Items', value: stats.open_items, icon: '⏳', color: 'from-amber-500 to-orange-600', border: 'hover:border-amber-300' },
            { label: 'In Progress', value: stats.in_progress_items, icon: '⚡', color: 'from-brand-500 to-violet-600', border: 'hover:border-brand-300' },
            { label: 'Overdue Items', value: stats.overdue_items, icon: '⚠️', color: 'from-rose-500 to-red-600', border: 'hover:border-rose-300' },
            { label: 'Closed / Resolved', value: stats.closed_items, icon: '✓', color: 'from-emerald-500 to-teal-600', border: 'hover:border-emerald-300' },
          ].map(({ label, value, icon, color, border }) => (
            <div
              key={label}
              className={`card card-hover relative overflow-hidden group ${border}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
                <span className="text-base p-1.5 rounded-lg bg-slate-100 group-hover:scale-110 transition-transform">
                  {icon}
                </span>
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                {value}
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${color} opacity-80`} />
            </div>
          ))}
        </div>
      )}

      {/* Standout Feature: Open-Loop Radar */}
      <div className="card shadow-md border-slate-200/90 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-sm shadow-rose-500/20">
              <span className="text-lg">🎯</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900 text-lg tracking-tight">Open-Loop Radar</h2>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <span className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/60">
                  Slip Detector
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Deterministic 7-signal scoring + AI-rewritten titles & auto-nudges for slipping tasks
              </p>
            </div>
          </div>
          {!radarLoading && radar.length > 0 && (
            <div className="self-start sm:self-auto">
              <AiBadge mode={radar[0]?.ai_explained ? 'ai' : 'fallback'} />
            </div>
          )}
        </div>

        {radarLoading ? (
          <Spinner />
        ) : radar.length === 0 ? (
          <EmptyState icon="🎉" title="All loops closed!" description="No high-risk action items detected right now." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {radar.slice(0, 6).map(item => (
              <div
                key={item.item_id}
                className="group relative rounded-xl border border-slate-200/90 bg-white p-5 hover:border-brand-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar: Risk Badge + Nudge Action */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    {getRiskBadge(item.risk_score)}
                    {item.nudge_message && (
                      <button
                        onClick={() => {
                          setNudgeItem(item)
                          setCopiedNudge(false)
                        }}
                        className="btn-secondary text-xs py-1 px-2.5 h-7 gap-1 font-medium text-slate-700 hover:text-brand-600 hover:border-brand-200"
                      >
                        <span>💬</span>
                        <span>Follow-up Nudge</span>
                      </button>
                    )}
                  </div>

                  {/* Title & AI Rewrite */}
                  <Link
                    to={`/items`}
                    className="font-bold text-slate-900 text-sm hover:text-brand-600 transition-colors line-clamp-2 block leading-snug"
                  >
                    {item.rewritten_title || item.title}
                  </Link>

                  {item.rewritten_title && item.rewritten_title !== item.title && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-violet-700 bg-violet-50/80 px-2 py-0.5 rounded border border-violet-100">
                      <span>✦ Original:</span>
                      <span className="italic truncate text-slate-500 font-mono text-[10px]">"{item.title}"</span>
                    </div>
                  )}

                  {/* Risk Explanation */}
                  <p className="text-xs text-slate-600 mt-2.5 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="font-semibold text-slate-700">Diagnosis:</span> {item.risk_reason}
                  </p>
                </div>

                {/* Footer Meta */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Owner:</span>
                    <span className={`font-medium ${item.owner ? 'text-slate-700' : 'text-rose-600 font-semibold'}`}>
                      {item.owner || 'Unassigned'}
                    </span>
                  </div>
                  {item.due_date && (
                    <span className="text-[11px] text-slate-500 font-mono">
                      Due: {new Date(item.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Two Column Grid: My Items & Overdue Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: My Open Items */}
        <div className="card shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">👤</span>
            <div>
              <h2 className="font-bold text-slate-800 text-base">My Action Items</h2>
              <p className="text-xs text-slate-400">Quickly check items assigned to you or a colleague</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Search by name (e.g. Ravi, Priya, Arjun)..."
              value={myOwner}
              onChange={e => setMyOwner(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchMyItems()}
            />
            <button onClick={fetchMyItems} className="btn-primary text-xs px-4">
              Search
            </button>
          </div>

          <div className="mt-4 min-h-[140px]">
            {myItems.length > 0 ? (
              <div className="space-y-2.5 animate-fade-in">
                {myItems.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200/80 transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <Link to={`/items`} className="text-sm font-semibold text-slate-900 hover:text-brand-600 truncate block">
                        {item.title}
                      </Link>
                      {item.due_date && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Due: {new Date(item.due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            ) : myOwner ? (
              <p className="text-sm text-slate-400 py-8 text-center">No open items found for "{myOwner}"</p>
            ) : (
              <p className="text-xs text-slate-400 py-8 text-center italic">
                Enter your name above to see your assigned tickets
              </p>
            )}
          </div>
        </div>

        {/* Right: Overdue Items */}
        <div className="card shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">⏰</span>
              <div>
                <h2 className="font-bold text-slate-800 text-base">Overdue Action Items</h2>
                <p className="text-xs text-slate-400">Past target delivery dates</p>
              </div>
            </div>
            <span className="badge bg-rose-50 text-rose-700 border-rose-200 font-bold">
              {overdue.length} Overdue
            </span>
          </div>

          <div className="space-y-2.5 min-h-[140px]">
            {overdue.length === 0 ? (
              <EmptyState icon="🎉" title="No overdue items" description="All deadlines are on schedule." />
            ) : (
              overdue.slice(0, 5).map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 bg-rose-50/50 rounded-xl border border-rose-100 hover:border-rose-200 transition-colors"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                    <p className="text-[11px] text-rose-600 mt-0.5 font-medium">
                      Owner: {item.owner || 'Unassigned'} · Due: {item.due_date ? new Date(item.due_date).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Follow-up Nudge Modal */}
      {nudgeItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => setNudgeItem(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full border border-slate-200 animate-fade-in-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-lg">💬</span>
                <h3 className="font-bold text-slate-900 text-base">AI Follow-up Nudge</h3>
              </div>
              <button onClick={() => setNudgeItem(null)} className="text-slate-400 hover:text-slate-600 text-sm">
                ✕
              </button>
            </div>

            <div className="mb-4 text-xs text-slate-500 space-y-1">
              <p><strong className="text-slate-700">Recipient:</strong> {nudgeItem.owner || 'Team Lead'}</p>
              <p><strong className="text-slate-700">Task:</strong> {nudgeItem.title}</p>
              <p><strong className="text-slate-700">Reason:</strong> {nudgeItem.risk_reason}</p>
            </div>

            <label className="label">Drafted Message (Ready to Send)</label>
            <textarea
              readOnly
              value={nudgeItem.nudge_message || ''}
              className="input h-32 text-xs font-mono mb-4 resize-none bg-slate-50 text-slate-700 leading-relaxed border-slate-200 focus:ring-brand-500"
            />

            <div className="flex gap-2.5 justify-end">
              <button onClick={() => setNudgeItem(null)} className="btn-secondary text-xs">
                Close
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(nudgeItem.nudge_message || '')
                  setCopiedNudge(true)
                  setTimeout(() => setCopiedNudge(false), 2500)
                }}
                className="btn-primary text-xs"
              >
                {copiedNudge ? '✓ Copied to Clipboard!' : '📋 Copy Nudge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
