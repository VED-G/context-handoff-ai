/**
 * Meetings list page with filtering and new meeting creation.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, MeetingListItem } from '../api'
import { StatusBadge, Spinner, EmptyState, LoadingButton, toastError, toast } from '../components/shared'

export default function MeetingsList() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState({ type: 'meeting', title: '', agenda: '', scheduled_at: '' })
  const navigate = useNavigate()

  function fetchMeetings() {
    setLoading(true)
    api.listMeetings({ type: typeFilter || undefined, status: statusFilter || undefined })
      .then(setMeetings)
      .catch(toastError)
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchMeetings() }, [typeFilter, statusFilter])

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
      toast({ type: 'success', message: 'Meeting created!' })
      navigate(`/meetings/${m.id}`)
    } catch (e) {
      toastError(e)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Meetings & Handovers</h1>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          + New Meeting / Handover
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select className="input w-auto" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="meeting">Meeting</option>
          <option value="handover">Handover</option>
        </select>
        <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="held">Held</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* List */}
      {loading ? <Spinner /> : meetings.length === 0 ? (
        <EmptyState icon="📅" title="No meetings found" description="Create your first meeting using the button above" />
      ) : (
        <div className="space-y-3">
          {meetings.map(m => (
            <Link
              key={m.id}
              to={`/meetings/${m.id}`}
              className="card flex items-center justify-between hover:border-blue-200 hover:shadow-md transition-all"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 uppercase font-medium">{m.type}</span>
                  <h3 className="font-semibold text-gray-800">{m.title}</h3>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {m.scheduled_at
                    ? `Scheduled: ${new Date(m.scheduled_at).toLocaleString()}`
                    : `Created: ${new Date(m.created_at).toLocaleDateString()}`}
                </p>
              </div>
              <StatusBadge status={m.status} />
            </Link>
          ))}
        </div>
      )}

      {/* New meeting modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="font-semibold text-gray-800 mb-4">New Meeting / Handover</h2>

            <div className="space-y-4">
              <div>
                <label className="label">Type</label>
                <select
                  className="input"
                  value={newForm.type}
                  onChange={e => setNewForm(f => ({ ...f, type: e.target.value }))}
                >
                  <option value="meeting">Meeting</option>
                  <option value="handover">Work Handover</option>
                </select>
              </div>
              <div>
                <label className="label">Title *</label>
                <input
                  className="input"
                  placeholder="e.g. Sprint 12 Planning"
                  value={newForm.title}
                  onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Agenda</label>
                <textarea
                  className="input h-24 resize-none"
                  placeholder="What will be covered..."
                  value={newForm.agenda}
                  onChange={e => setNewForm(f => ({ ...f, agenda: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Scheduled at</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={newForm.scheduled_at}
                  onChange={e => setNewForm(f => ({ ...f, scheduled_at: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
              <LoadingButton loading={creating} onClick={handleCreate}>Create</LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

