/**
 * Meetings list page with filtering, search and new meeting creation.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, MeetingListItem } from '../api'
import { StatusBadge, Spinner, LoadingButton, toastError, toast } from '../components/shared'

export default function MeetingsList() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [newForm, setNewForm] = useState({ type: 'meeting', title: '', agenda: '', scheduled_at: '' })
  const navigate = useNavigate()

  function fetchMeetings() {
    setLoading(true)
    api.listMeetings({ type: typeFilter || undefined, status: statusFilter || undefined })
      .then(setMeetings)
      .catch(toastError)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchMeetings()
  }, [typeFilter, statusFilter])

  async function handleCreate() {
    if (!newForm.title.trim()) {
      toast({ type: 'error', message: 'Title is required' })
      return
    }
    setCreating(true)
    try {
      const m = await api.createMeeting({
        type: newForm.type,
        title: newForm.title,
        agenda: newForm.agenda || undefined,
        scheduled_at: newForm.scheduled_at || undefined,
      })
      toast({ type: 'success', message: 'Meeting created successfully!' })
      navigate(`/meetings/${m.id}`)
    } catch (e) {
      toastError(e)
    } finally {
      setCreating(false)
    }
  }

  const filtered = meetings.filter(m =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Meetings & Work Handovers
            </h1>
            <span className="badge bg-slate-100 text-slate-700 font-bold">
              {meetings.length} Total
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Capture discussions, track decisions, and carry forward context across teams
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary self-start sm:self-auto text-xs px-4 py-2">
          <span>+ New Meeting / Handover</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="card p-4 flex flex-col sm:flex-row items-center gap-3 shadow-xs">
        <div className="relative flex-1 w-full">
          <input
            className="input pl-9 text-xs"
            placeholder="Search meetings by title..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <select className="input text-xs w-full sm:w-36" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            <option value="meeting">Meeting</option>
            <option value="handover">Handover</option>
          </select>
          <select className="input text-xs w-full sm:w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="held">Held</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12 px-6 space-y-4 border-dashed border-slate-300">
          <div className="text-4xl">📅</div>
          <h3 className="text-lg font-bold text-slate-800">No meetings match your filter</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            You can create a new meeting or load pre-populated sample team data (5 meetings, 13 action items, and knowledge base).
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button onClick={() => setShowNew(true)} className="btn-secondary text-xs">
              + Create Meeting
            </button>
            <LoadingButton
              loading={seeding}
              onClick={async () => {
                setSeeding(true)
                try {
                  await api.seedDatabase()
                  toast({ type: 'success', message: 'Sample team data loaded!' })
                  fetchMeetings()
                } catch (e) {
                  toastError(e)
                } finally {
                  setSeeding(false)
                }
              }}
              className="text-xs"
            >
              ✦ Load Sample Team Data
            </LoadingButton>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filtered.map(m => (
            <Link
              key={m.id}
              to={`/meetings/${m.id}`}
              className="card card-hover p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                    m.type === 'handover'
                      ? 'bg-violet-50 text-violet-600 border border-violet-200/60'
                      : 'bg-brand-50 text-brand-600 border border-brand-200/60'
                  }`}
                >
                  {m.type === 'handover' ? '🤝' : '🗓️'}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        m.type === 'handover'
                          ? 'bg-violet-100 text-violet-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {m.type}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base group-hover:text-brand-600 transition-colors">
                      {m.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <span>⏱</span>
                      {m.scheduled_at
                        ? new Date(m.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : `Created: ${new Date(m.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}`}
                    </span>
                    {m.previous_meeting_id && (
                      <span className="text-[11px] text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                        Carried from #{m.previous_meeting_id}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <StatusBadge status={m.status} />
                <span className="text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all text-sm font-bold">
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New Meeting Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full border border-slate-200 animate-fade-in-up">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-lg">New Meeting or Handover</h2>
              <button onClick={() => setShowNew(false)} className="text-slate-400 hover:text-slate-600 text-sm">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Meeting Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: 'meeting', label: 'Team Meeting / Sync', icon: '🗓️' },
                    { val: 'handover', label: 'Work Transfer / Handover', icon: '🤝' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setNewForm(f => ({ ...f, type: opt.val }))}
                      className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
                        newForm.type === opt.val
                          ? 'bg-brand-50 border-brand-500 text-brand-700 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-base">{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Meeting Title *</label>
                <input
                  className="input text-xs"
                  placeholder="e.g. Sprint 12 Planning & Architecture Review"
                  value={newForm.title}
                  onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>

              <div>
                <label className="label">Agenda Topics</label>
                <textarea
                  className="input h-24 text-xs resize-none"
                  placeholder="Key topics to discuss..."
                  value={newForm.agenda}
                  onChange={e => setNewForm(f => ({ ...f, agenda: e.target.value }))}
                />
              </div>

              <div>
                <label className="label">Scheduled Time</label>
                <input
                  type="datetime-local"
                  className="input text-xs"
                  value={newForm.scheduled_at}
                  onChange={e => setNewForm(f => ({ ...f, scheduled_at: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-2.5 mt-6 justify-end pt-3 border-t border-slate-100">
              <button onClick={() => setShowNew(false)} className="btn-secondary text-xs">
                Cancel
              </button>
              <LoadingButton loading={creating} onClick={handleCreate} className="text-xs">
                Create Meeting
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
