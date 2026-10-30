/**
 * Dashboard page: stats, Open-Loop Radar, overdue items.
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

  function getRiskColor(score: number) {
    if (score >= 70) return 'text-red-600 bg-red-50'
    if (score >= 40) return 'text-amber-600 bg-amber-50'
    return 'text-green-600 bg-green-50'
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>

      {stats && stats.total_meetings === 0 && (
        <div className="card bg-blue-50 border-blue-200 text-center py-8 space-y-3">
          <div className="text-4xl">🚀</div>
          <h2 className="text-xl font-bold text-blue-900">Welcome to Context Handoff AI</h2>
          <p className="text-sm text-blue-700 max-w-lg mx-auto">
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

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Meetings', value: stats.total_meetings, color: 'blue' },
            { label: 'Open Items', value: stats.open_items, color: 'yellow' },
            { label: 'In Progress', value: stats.in_progress_items, color: 'blue' },
            { label: 'Overdue', value: stats.overdue_items, color: 'red' },
            { label: 'Closed', value: stats.closed_items, color: 'green' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card text-center">
              <div className={`text-3xl font-bold text-${color}-600`}>{value}</div>
              <div className="text-sm text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* My Items lookup */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3">My Open Items</h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Enter your name..."
            value={myOwner}
            onChange={e => setMyOwner(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchMyItems()}
          />
          <button onClick={fetchMyItems} className="btn-primary">Look up</button>
        </div>
        {myItems.length > 0 && (
          <div className="mt-4 space-y-2">
            {myItems.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <Link to={`/items`} className="text-sm font-medium text-blue-600 hover:underline">
                    {item.title}
                  </Link>
                  {item.due_date && (
                    <span className="text-xs text-gray-500 ml-2">
                      due {new Date(item.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        )}
        {myOwner && myItems.length === 0 && (
          <p className="text-sm text-gray-400 mt-3">No open items found for "{myOwner}"</p>
        )}
      </div>

      {/* Open-Loop Radar */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-800 text-lg">🎯 Open-Loop Radar</h2>
            <p className="text-sm text-gray-500">Items most likely to slip between meetings</p>
          </div>
          {!radarLoading && radar.length > 0 && (
            <AiBadge mode={radar[0]?.ai_explained ? 'ai' : 'fallback'} />
          )}
        </div>

        {radarLoading ? (
          <Spinner />
        ) : radar.length === 0 ? (
          <EmptyState icon="✅" title="No open items – all loops closed!" />
        ) : (
          <div className="space-y-3">
            {radar.slice(0, 8).map(item => (
              <div key={item.item_id} className={`rounded-lg p-4 ${getRiskColor(item.risk_score)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{item.risk_score}%</span>
                      <Link to={`/items`} className="font-medium hover:underline">
                        {item.rewritten_title || item.title}
                      </Link>
                      {item.rewritten_title && item.rewritten_title !== item.title && (
                        <span className="text-xs opacity-60">(rewritten by AI)</span>
                      )}
                    </div>
                    <p className="text-xs mt-1 opacity-80">{item.risk_reason}</p>
                    {item.suggested_owner && (
                      <p className="text-xs mt-0.5 opacity-70">
                        💡 Suggested owner: {item.suggested_owner}
                      </p>
                    )}
                    {item.owner && (
                      <p className="text-xs mt-0.5 opacity-60">
                        Owner: {item.owner} · Status: {item.status}
                        {item.due_date && ` · Due: ${new Date(item.due_date).toLocaleDateString()}`}
                      </p>
                    )}
                  </div>
                  {item.nudge_message && (
                    <button
                      onClick={() => setNudgeItem(item)}
                      className="shrink-0 text-xs px-2 py-1 rounded bg-white/60 hover:bg-white/80 border border-current opacity-70"
                    >
                      💬 Nudge
                    </button>
                  )}
                </div>
              </div>
            ))}
            {radar.length > 8 && (
              <p className="text-sm text-gray-400 text-center">
                + {radar.length - 8} more items
              </p>
            )}
          </div>
        )}
      </div>

      {/* Overdue Items */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">⏰ Overdue Items ({overdue.length})</h2>
        {overdue.length === 0 ? (
          <EmptyState icon="✅" title="No overdue items" description="Great job keeping up!" />
        ) : (
          <div className="space-y-2">
            {overdue.slice(0, 10).map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.title}</p>
                  <p className="text-xs text-gray-500">
                    Owner: {item.owner || 'Unassigned'} ·
                    Due: {item.due_date ? new Date(item.due_date).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nudge modal */}
      {nudgeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setNudgeItem(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Follow-up Nudge</h3>
            <p className="text-sm text-gray-500 mb-3">For: {nudgeItem.owner || 'team'} · Item: {nudgeItem.title}</p>
            <textarea
              readOnly
              value={nudgeItem.nudge_message || ''}
              className="input h-28 text-sm mb-4 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(nudgeItem.nudge_message || '')
                  setNudgeItem(null)
                }}
                className="btn-primary"
              >
                📋 Copy to clipboard
              </button>
              <button onClick={() => setNudgeItem(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

