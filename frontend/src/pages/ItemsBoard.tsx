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

  useEffect(() => { fetchItems() }, [ownerFilter, statusFilter, overdueOnly])

  async function handleStatusChange(item: ActionItem, newStatus: string) {
    if (newStatus === 'done' || newStatus === 'dropped') {
      setCloseModal({ item, status: newStatus })
      return
    }
    try {
      await api.changeItemStatus(item.id, newStatus, undefined, actor || undefined)
      toast({ type: 'success', message: `Status → ${newStatus}` })
      fetchItems()
    } catch (e) { toastError(e) }
  }

  async function handleClose() {
    if (!closeModal || !outcome.trim()) {
      toast({ type: 'error', message: 'Outcome is required to close an item' })
      return
    }
    try {
      await api.changeItemStatus(closeModal.item.id, closeModal.status, outcome, actor || undefined)
      toast({ type: 'success', message: `Item ${closeModal.status}` })
      setCloseModal(null)
      setOutcome('')
      fetchItems()
    } catch (e) { toastError(e) }
  }

  async function handleReassign() {
    if (!reassignModal || !newOwner.trim()) return
    try {
      await api.reassignItem(reassignModal.id, newOwner, actor || undefined)
      toast({ type: 'success', message: `Reassigned to ${newOwner}` })
      setReassignModal(null)
      setNewOwner('')
      fetchItems()
    } catch (e) { toastError(e) }
  }

  const validTransitions: Record<string, string[]> = {
    open: ['in_progress', 'done', 'dropped'],
    in_progress: ['open', 'done', 'dropped'],
    done: ['open'],
    dropped: ['open'],
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Action Items</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className="input w-44"
          placeholder="Filter by owner..."
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
        />
        <select className="input w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="dropped">Dropped</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={e => setOverdueOnly(e.target.checked)}
            className="rounded"
          />
          Overdue only
        </label>
        <input
          className="input w-44 ml-auto"
          placeholder="Acting as (your name)..."
          value={actor}
          onChange={e => setActor(e.target.value)}
          title="Set your name for audit events"
        />
      </div>

      {/* Items */}
      {loading ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon="✅" title="No items found" description="Adjust filters or add items via a meeting" />
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const now = new Date()
            const isOverdue = item.due_date && new Date(item.due_date) < now && item.status !== 'done' && item.status !== 'dropped'
            return (
              <div
                key={item.id}
                className={`card p-4 ${isOverdue ? 'border-red-200 bg-red-50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={item.status} />
                      {item.ai_generated && (
                        <span className="badge bg-violet-100 text-violet-600">✦ AI</span>
                      )}
                      {item.carried_from_id && (
                        <span className="badge bg-amber-100 text-amber-600">↩ carried</span>
                      )}
                      <p className="font-medium text-sm">{item.title}</p>
                    </div>
                    {item.description && (
                      <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Owner: {item.owner || <span className="text-red-400">unassigned</span>}
                      {item.due_date && (
                        <span className={isOverdue ? ' text-red-500 font-medium' : ''}>
                          {' · Due: '}{new Date(item.due_date).toLocaleDateString()}
                          {isOverdue && ' ⚠ OVERDUE'}
                        </span>
                      )}
                      {item.outcome && <span> · Outcome: {item.outcome}</span>}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 items-end">
                    {/* Status change */}
                    <select
                      className="text-xs border rounded px-2 py-1"
                      value={item.status}
                      onChange={e => handleStatusChange(item, e.target.value)}
                    >
                      <option value={item.status} disabled>{item.status}</option>
                      {(validTransitions[item.status] || []).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setReassignModal(item); setNewOwner(item.owner || '') }}
                        className="text-xs text-blue-600 hover:underline"
                      >Reassign</button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => setHistoryItem(item)}
                        className="text-xs text-gray-400 hover:text-blue-600"
                      >History</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* History drawer */}
      {historyItem && (
        <HistoryDrawer
          events={historyItem.events}
          onClose={() => setHistoryItem(null)}
        />
      )}

      {/* Close modal */}
      {closeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="font-semibold mb-2">
              {closeModal.status === 'done' ? '✅ Mark as Done' : '🗑 Drop Item'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Closing: <strong>{closeModal.item.title}</strong>
            </p>
            <label className="label">Outcome (required) *</label>
            <textarea
              className="input h-24 resize-none mb-4"
              placeholder="Describe what was achieved or why it's being dropped..."
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCloseModal(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleClose}
                className={closeModal.status === 'done' ? 'btn-primary' : 'btn-danger'}
              >
                Confirm {closeModal.status}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign modal */}
      {reassignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold mb-3">Reassign Item</h3>
            <p className="text-sm text-gray-600 mb-3">{reassignModal.title}</p>
            <label className="label">New Owner</label>
            <input
              className="input mb-4"
              value={newOwner}
              onChange={e => setNewOwner(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setReassignModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleReassign} className="btn-primary">Reassign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

