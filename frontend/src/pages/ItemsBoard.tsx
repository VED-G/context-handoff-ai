/**
 * Action Items board/table with filtering, inline status change, reassign, close-with-outcome, history.
 */
import { useEffect, useState } from 'react'
import { api, ActionItem } from '../api'
import { StatusBadge, Spinner, EmptyState, HistoryDrawer, toastError, toast } from '../components/shared'

export default function ItemsBoard() {
  const [items, setItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [ownerFilter, setOwnerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [historyItem, setHistoryItem] = useState<ActionItem | null>(null)
  const [closeModal, setCloseModal] = useState<{ item: ActionItem; status: 'done' | 'dropped' } | null>(null)
  const [outcome, setOutcome] = useState('')
  const [actor, setActor] = useState('')
  const [reassignModal, setReassignModal] = useState<ActionItem | null>(null)
  const [newOwner, setNewOwner] = useState('')

  function fetchItems() {
    setLoading(true)
    api.listItems({
      owner: ownerFilter || undefined,
      status: statusFilter || undefined,
      overdue: overdueOnly || undefined,
    })
      .then(setItems)
      .catch(toastError)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchItems()
  }, [ownerFilter, statusFilter, overdueOnly])

  async function handleStatusChange(item: ActionItem, newStatus: string) {
    if (newStatus === 'done' || newStatus === 'dropped') {
      setCloseModal({ item, status: newStatus })
      return
    }
    try {
      await api.changeItemStatus(item.id, newStatus, undefined, actor || undefined)
      toast({ type: 'success', message: `Status updated to ${newStatus}` })
      fetchItems()
    } catch (e) {
      toastError(e)
    }
  }

  async function handleClose() {
    if (!closeModal || !outcome.trim()) {
      toast({ type: 'error', message: 'Outcome description is required when closing an item' })
      return
    }
    try {
      await api.changeItemStatus(closeModal.item.id, closeModal.status, outcome, actor || undefined)
      toast({ type: 'success', message: `Item marked as ${closeModal.status}` })
      setCloseModal(null)
      setOutcome('')
      fetchItems()
    } catch (e) {
      toastError(e)
    }
  }

  async function handleReassign() {
    if (!reassignModal || !newOwner.trim()) return
    try {
      await api.reassignItem(reassignModal.id, newOwner, actor || undefined)
      toast({ type: 'success', message: `Reassigned to ${newOwner}` })
      setReassignModal(null)
      setNewOwner('')
      fetchItems()
    } catch (e) {
      toastError(e)
    }
  }

  const validTransitions: Record<string, string[]> = {
    open: ['in_progress', 'done', 'dropped'],
    in_progress: ['open', 'done', 'dropped'],
    done: ['open'],
    dropped: ['open'],
  }

  const filtered = items.filter(i =>
    i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (i.owner && i.owner.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const openCount = items.filter(i => i.status === 'open').length
  const inProgressCount = items.filter(i => i.status === 'in_progress').length
  const doneCount = items.filter(i => i.status === 'done').length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Action Items
            </h1>
            <span className="badge bg-slate-100 text-slate-700 font-bold">
              {items.length} Total
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track accountability across handovers, update stages, and audit lifecycles
          </p>
        </div>

        {/* User Identity Chip ("Acting as") */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto">
          <span className="text-xs text-slate-400">Acting as:</span>
          <input
            className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none w-28 placeholder:text-slate-400"
            placeholder="Your name..."
            value={actor}
            onChange={e => setActor(e.target.value)}
            title="Your name for audit trail events"
          />
        </div>
      </div>

      {/* Quick Summary Pill Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-center">
          <span className="text-xs font-semibold text-amber-700 uppercase">Open</span>
          <p className="text-xl font-extrabold text-amber-900">{openCount}</p>
        </div>
        <div className="p-3 bg-brand-50/70 border border-brand-200/80 rounded-xl text-center">
          <span className="text-xs font-semibold text-brand-700 uppercase">In Progress</span>
          <p className="text-xl font-extrabold text-brand-900">{inProgressCount}</p>
        </div>
        <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-center">
          <span className="text-xs font-semibold text-emerald-700 uppercase">Closed / Done</span>
          <p className="text-xl font-extrabold text-emerald-900">{doneCount}</p>
        </div>
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Items</span>
          <p className="text-xl font-extrabold text-slate-800">{items.length}</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card p-4 flex flex-col md:flex-row items-center gap-3 shadow-xs">
        <div className="relative flex-1 w-full">
          <input
            className="input pl-9 text-xs"
            placeholder="Search items by title or owner..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <input
            className="input text-xs w-full sm:w-36"
            placeholder="Filter by owner..."
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
          />

          <select className="input text-xs w-full sm:w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="dropped">Dropped</option>
          </select>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-50 border border-slate-200">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={e => setOverdueOnly(e.target.checked)}
              className="rounded text-brand-600 focus:ring-brand-500"
            />
            <span>Overdue only</span>
          </label>
        </div>
      </div>

      {/* Items List */}
      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState icon="✅" title="No action items match your query" description="Clear your filters or add items via a meeting." />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(item => {
            const now = new Date()
            const isOverdue = item.due_date && new Date(item.due_date) < now && item.status !== 'done' && item.status !== 'dropped'

            return (
              <div
                key={item.id}
                className={`card card-hover p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isOverdue ? 'border-rose-200 bg-rose-50/30' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <StatusBadge status={item.status} />
                    {item.ai_generated && (
                      <span className="badge bg-violet-50 text-violet-700 border-violet-200 text-[10px]">✦ AI</span>
                    )}
                    {item.carried_from_id && (
                      <span className="badge bg-amber-50 text-amber-700 border-amber-200 text-[10px]">↩ Carried</span>
                    )}
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">{item.title}</h3>
                  </div>

                  {item.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">{item.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="text-slate-400">Owner:</span>
                      <strong className={`font-semibold ${item.owner ? 'text-slate-800' : 'text-rose-600 font-bold'}`}>
                        {item.owner || 'Unassigned'}
                      </strong>
                    </span>

                    {item.due_date && (
                      <span className={`font-mono text-[11px] ${isOverdue ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                        Due: {new Date(item.due_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        {isOverdue && ' (OVERDUE)'}
                      </span>
                    )}

                    {item.outcome && (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-medium border border-emerald-100">
                        Outcome: {item.outcome}
                      </span>
                    )}
                  </div>
                </div>

                {/* Inline Action Controls */}
                <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-between sm:justify-end">
                  <select
                    className="text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 shadow-2xs hover:border-slate-300"
                    value={item.status}
                    onChange={e => handleStatusChange(item, e.target.value)}
                  >
                    <option value={item.status} disabled>
                      Status: {item.status}
                    </option>
                    {(validTransitions[item.status] || []).map(s => (
                      <option key={s} value={s}>
                        → Mark as {s}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setReassignModal(item)
                        setNewOwner(item.owner || '')
                      }}
                      className="btn-secondary text-xs py-1 px-2.5"
                      title="Reassign to new owner"
                    >
                      Reassign
                    </button>
                    <button
                      onClick={() => setHistoryItem(item)}
                      className="btn-ghost text-xs py-1 px-2.5 text-slate-500 hover:text-brand-600"
                      title="View audit trail"
                    >
                      Audit
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* History Drawer */}
      {historyItem && (
        <HistoryDrawer
          events={historyItem.events}
          onClose={() => setHistoryItem(null)}
        />
      )}

      {/* Close Item with Mandatory Outcome Modal */}
      {closeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => setCloseModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-fade-in-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                {closeModal.status === 'done' ? '✅ Complete Action Item' : '🗑 Drop Action Item'}
              </h3>
              <button onClick={() => setCloseModal(null)} className="text-slate-400 hover:text-slate-600 text-sm">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Item: <strong className="text-slate-800">{closeModal.item.title}</strong>
            </p>

            <label className="label">
              Closing Outcome Description (Required) *
            </label>
            <textarea
              className="input h-24 text-xs resize-none mb-4"
              placeholder="Record the deliverable, link to PR, or explanation why dropped..."
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              autoFocus
            />

            <div className="flex gap-2.5 justify-end">
              <button onClick={() => setCloseModal(null)} className="btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={handleClose}
                className={closeModal.status === 'done' ? 'btn-primary text-xs' : 'btn-danger text-xs'}
              >
                Confirm {closeModal.status === 'done' ? 'Completion' : 'Drop'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {reassignModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => setReassignModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 animate-fade-in-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Reassign Action Item</h3>
              <button onClick={() => setReassignModal(null)} className="text-slate-400 hover:text-slate-600 text-sm">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3 truncate">
              {reassignModal.title}
            </p>

            <label className="label">New Assignee Name *</label>
            <input
              className="input text-xs mb-4"
              placeholder="e.g. Arjun Mehta"
              value={newOwner}
              onChange={e => setNewOwner(e.target.value)}
              autoFocus
            />

            <div className="flex gap-2.5 justify-end">
              <button onClick={() => setReassignModal(null)} className="btn-secondary text-xs">
                Cancel
              </button>
              <button onClick={handleReassign} className="btn-primary text-xs">
                Reassign Owner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
