/**
 * Meeting detail page: all tabs - agenda, participants, notes/recap, decisions, items, brief, carry-forward.
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, Meeting, RecapProposal } from '../api'
import {
  StatusBadge, AiBadge, Spinner, LoadingButton,
  toastError, toast, HistoryDrawer, EmptyState
} from '../components/shared'

type Tab = 'agenda' | 'participants' | 'notes' | 'decisions' | 'items' | 'brief' | 'carry'

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>()
  const meetingId = Number(id)
  const navigate = useNavigate()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('agenda')

  // Recap state
  const [recapProposal, setRecapProposal] = useState<RecapProposal | null>(null)
  const [recapLoading, setRecapLoading] = useState(false)
  const [applyLoading, setApplyLoading] = useState(false)

  // Brief state
  const [briefPerson, setBriefPerson] = useState('')
  const [briefText, setBriefText] = useState('')
  const [briefMode, setBriefMode] = useState('')
  const [briefLoading, setBriefLoading] = useState(false)

  // Carry-forward state
  const [carryLoading, setCarryLoading] = useState(false)
  const [carryResult, setCarryResult] = useState<{ next_meeting_id: number; carried_count: number } | null>(null)

  // Auto-agenda state
  const [agendaItems, setAgendaItems] = useState<any[]>([])
  const [agendaLoading, setAgendaLoading] = useState(false)
  const [agendaMode, setAgendaMode] = useState('')

  // Item history drawer
  const [historyItemId, setHistoryItemId] = useState<number | null>(null)

  // Add participant form
  const [newParticipant, setNewParticipant] = useState({ name: '', email: '', attendance: 'invited' })
  const [newDecision, setNewDecision] = useState('')
  const [newItem, setNewItem] = useState({ title: '', description: '', owner: '', due_date: '' })

  function reload() {
    api.getMeeting(meetingId)
      .then(setMeeting)
      .catch(toastError)
  }

  useEffect(() => {
    api.getMeeting(meetingId)
      .then(setMeeting)
      .catch(toastError)
      .finally(() => setLoading(false))
  }, [meetingId])

  async function handleStatusChange(status: string) {
    try {
      await api.changeMeetingStatus(meetingId, status)
      toast({ type: 'success', message: `Status changed to ${status}` })
      reload()
    } catch (e) { toastError(e) }
  }

  async function handleGenerateRecap() {
    if (!meeting?.raw_notes?.trim()) {
      toast({ type: 'error', message: 'Paste some raw notes first' })
      return
    }
    setRecapLoading(true)
    try {
      const proposal = await api.generateRecap(meetingId)
      setRecapProposal(proposal)
      toast({ type: 'success', message: 'Recap generated! Review and save.' })
    } catch (e) { toastError(e) }
    finally { setRecapLoading(false) }
  }

  async function handleApplyRecap() {
    if (!recapProposal) return
    setApplyLoading(true)
    try {
      await api.applyRecap(meetingId, recapProposal)
      toast({ type: 'success', message: 'Recap saved!' })
      setRecapProposal(null)
      reload()
    } catch (e) { toastError(e) }
    finally { setApplyLoading(false) }
  }

  async function handleGetBrief() {
    if (!briefPerson.trim()) { toast({ type: 'error', message: 'Enter a person name' }); return }
    setBriefLoading(true)
    try {
      const r = await api.getBrief(meetingId, briefPerson)
      setBriefText(r.brief)
      setBriefMode(r.generated_by)
    } catch (e) { toastError(e) }
    finally { setBriefLoading(false) }
  }

  async function handleCarryForward() {
    setCarryLoading(true)
    try {
      const r = await api.carryForward(meetingId, {})
      setCarryResult(r)
      toast({ type: 'success', message: `Carried ${r.carried_count} items to new meeting #${r.next_meeting_id}` })
    } catch (e) { toastError(e) }
    finally { setCarryLoading(false) }
  }

  async function handleAutoAgenda() {
    setAgendaLoading(true)
    try {
      const r = await api.getAutoAgenda(meetingId)
      setAgendaItems(r.agenda_items as any[])
      setAgendaMode(r.generated_by)
    } catch (e) { toastError(e) }
    finally { setAgendaLoading(false) }
  }

  async function addParticipant() {
    if (!newParticipant.name.trim()) return
    try {
      await api.addParticipant(meetingId, newParticipant)
      setNewParticipant({ name: '', email: '', attendance: 'invited' })
      toast({ type: 'success', message: 'Participant added' })
      reload()
    } catch (e) { toastError(e) }
  }

  async function addDecision() {
    if (!newDecision.trim()) return
    try {
      await api.addDecision(meetingId, newDecision)
      setNewDecision('')
      reload()
    } catch (e) { toastError(e) }
  }

  async function addItem() {
    if (!newItem.title.trim()) return
    try {
      await api.createItem({
        title: newItem.title,
        description: newItem.description || undefined,
        owner: newItem.owner || undefined,
        due_date: newItem.due_date || undefined,
        current_meeting_id: meetingId,
      } as any)
      setNewItem({ title: '', description: '', owner: '', due_date: '' })
      toast({ type: 'success', message: 'Item added' })
      reload()
    } catch (e) { toastError(e) }
  }

  if (loading) return <Spinner />
  if (!meeting) return <EmptyState icon="❌" title="Meeting not found" />

  const TABS: { key: Tab; label: string }[] = [
    { key: 'agenda', label: 'Agenda' },
    { key: 'participants', label: `Participants (${meeting.participants.length})` },
    { key: 'notes', label: 'Notes & AI Recap' },
    { key: 'decisions', label: `Decisions (${meeting.decisions.length})` },
    { key: 'items', label: `Items (${meeting.action_items.length})` },
    { key: 'brief', label: 'Catchup Brief' },
    { key: 'carry', label: 'Carry Forward' },
  ]

  const historyItem = historyItemId !== null
    ? meeting.action_items.find(i => i.id === historyItemId)
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <span className="uppercase font-medium">{meeting.type}</span>
            <StatusBadge status={meeting.status} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{meeting.title}</h1>
          {meeting.scheduled_at && (
            <p className="text-sm text-gray-400 mt-0.5">
              {new Date(meeting.scheduled_at).toLocaleString()}
            </p>
          )}
        </div>
        {/* Status transitions */}
        <div className="flex gap-2 flex-wrap">
          {['draft', 'scheduled', 'held', 'closed'].map(s => (
            s !== meeting.status && (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className="btn-secondary text-xs py-1 px-3"
              >
                → {s}
              </button>
            )
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {/* Agenda */}
        {tab === 'agenda' && (
          <div className="space-y-4">
            <div>
              <label className="label">Agenda</label>
              <textarea
                className="input h-40 resize-none"
                value={meeting.agenda || ''}
                onChange={e => api.updateMeeting(meetingId, { agenda: e.target.value }).then(setMeeting)}
                placeholder="Enter agenda items..."
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label">AI Auto-Agenda</label>
                <AiBadge mode={agendaMode || 'ai'} />
              </div>
              <LoadingButton loading={agendaLoading} onClick={handleAutoAgenda}>
                ✦ Generate Auto-Agenda
              </LoadingButton>
              {agendaItems.length > 0 && (
                <div className="mt-4 space-y-2">
                  {agendaItems.map((item: any) => (
                    <div key={item.order} className="flex gap-3 p-3 bg-blue-50 rounded-lg">
                      <span className="text-blue-600 font-bold text-sm">{item.order}.</span>
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-gray-500">{item.description}</p>
                        <p className="text-xs text-blue-500 mt-0.5">⏱ {item.time_minutes} min</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Participants */}
        {tab === 'participants' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <input className="input" placeholder="Name *" value={newParticipant.name}
                onChange={e => setNewParticipant(p => ({ ...p, name: e.target.value }))} />
              <input className="input" placeholder="Email" value={newParticipant.email}
                onChange={e => setNewParticipant(p => ({ ...p, email: e.target.value }))} />
              <select className="input" value={newParticipant.attendance}
                onChange={e => setNewParticipant(p => ({ ...p, attendance: e.target.value }))}>
                <option value="invited">Invited</option>
                <option value="attended">Attended</option>
                <option value="missed">Missed</option>
                <option value="no_response">No Response</option>
              </select>
            </div>
            <button onClick={addParticipant} className="btn-primary">+ Add Participant</button>

            <div className="space-y-2">
              {meeting.participants.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="text-xs border rounded px-2 py-1"
                      value={p.attendance}
                      onChange={e => api.updateParticipant(meetingId, p.id, { attendance: e.target.value as any })
                        .then(reload).catch(toastError)}
                    >
                      <option value="invited">Invited</option>
                      <option value="attended">Attended</option>
                      <option value="missed">Missed</option>
                      <option value="no_response">No Response</option>
                    </select>
                    <StatusBadge status={p.attendance} />
                    <button
                      onClick={() => api.removeParticipant(meetingId, p.id).then(reload).catch(toastError)}
                      className="text-red-400 hover:text-red-600 text-sm"
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes & AI Recap */}
        {tab === 'notes' && (
          <div className="space-y-4">
            <div>
              <label className="label">Raw Notes (paste meeting notes, chat, emails...)</label>
              <textarea
                className="input h-48 resize-y font-mono text-sm"
                placeholder="Paste raw notes here – the messier the better. AI will structure it."
                value={meeting.raw_notes || ''}
                onChange={e => api.updateMeeting(meetingId, { raw_notes: e.target.value }).then(setMeeting)}
              />
            </div>

            <LoadingButton loading={recapLoading} onClick={handleGenerateRecap}>
              ✦ Generate AI Recap
            </LoadingButton>

            {/* Recap Review Panel */}
            {recapProposal && (
              <div className="card border-2 border-blue-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">Recap Proposal – Review & Edit</h3>
                  <AiBadge mode={recapProposal.ai_mode} />
                </div>

                <div>
                  <label className="label">Summary</label>
                  <textarea
                    className="input h-24 resize-none"
                    value={recapProposal.summary}
                    onChange={e => setRecapProposal(p => p ? { ...p, summary: e.target.value } : p)}
                  />
                </div>

                <div>
                  <label className="label">Decisions</label>
                  {recapProposal.decisions.map((d, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input
                        className="input flex-1"
                        value={d}
                        onChange={e => {
                          const ds = [...recapProposal.decisions]
                          ds[i] = e.target.value
                          setRecapProposal(p => p ? { ...p, decisions: ds } : p)
                        }}
                      />
                      <button
                        onClick={() => setRecapProposal(p => p ? {
                          ...p, decisions: p.decisions.filter((_, j) => j !== i)
                        } : p)}
                        className="text-red-400 hover:text-red-600"
                      >×</button>
                    </div>
                  ))}
                  <button
                    onClick={() => setRecapProposal(p => p ? { ...p, decisions: [...p.decisions, ''] } : p)}
                    className="text-sm text-blue-600 hover:underline"
                  >+ Add decision</button>
                </div>

                <div>
                  <label className="label">Action Items</label>
                  {recapProposal.action_items.map((item, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg mb-2 space-y-2">
                      <div className="flex gap-2">
                        <input
                          className="input flex-1"
                          placeholder="Title"
                          value={item.title}
                          onChange={e => {
                            const items = [...recapProposal.action_items]
                            items[i] = { ...items[i], title: e.target.value }
                            setRecapProposal(p => p ? { ...p, action_items: items } : p)
                          }}
                        />
                        <button
                          onClick={() => setRecapProposal(p => p ? {
                            ...p, action_items: p.action_items.filter((_, j) => j !== i)
                          } : p)}
                          className="text-red-400 hover:text-red-600"
                        >×</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="input text-sm"
                          placeholder="Owner"
                          value={item.owner || ''}
                          onChange={e => {
                            const items = [...recapProposal.action_items]
                            items[i] = { ...items[i], owner: e.target.value }
                            setRecapProposal(p => p ? { ...p, action_items: items } : p)
                          }}
                        />
                        <input
                          className="input text-sm"
                          placeholder="Due date (YYYY-MM-DD)"
                          value={item.due_date || ''}
                          onChange={e => {
                            const items = [...recapProposal.action_items]
                            items[i] = { ...items[i], due_date: e.target.value }
                            setRecapProposal(p => p ? { ...p, action_items: items } : p)
                          }}
                        />
                      </div>
                      {item.needs_owner && (
                        <p className="text-xs text-amber-600">⚠ Owner needs to be assigned</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <LoadingButton loading={applyLoading} onClick={handleApplyRecap}>
                    ✓ Save Recap
                  </LoadingButton>
                  <button onClick={() => setRecapProposal(null)} className="btn-secondary">Discard</button>
                </div>
              </div>
            )}

            {meeting.summary && (
              <div className="card bg-gray-50">
                <h3 className="font-medium text-gray-700 mb-2">Saved Summary</h3>
                <p className="text-sm text-gray-600">{meeting.summary}</p>
              </div>
            )}
          </div>
        )}

        {/* Decisions */}
        {tab === 'decisions' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Add a decision..."
                value={newDecision}
                onChange={e => setNewDecision(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDecision()}
              />
              <button onClick={addDecision} className="btn-primary">Add</button>
            </div>
            {meeting.decisions.length === 0 ? (
              <EmptyState icon="📋" title="No decisions recorded" />
            ) : (
              <ol className="space-y-2">
                {meeting.decisions.map((d, i) => (
                  <li key={d.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-400 font-mono text-sm">{i + 1}.</span>
                    <p className="flex-1 text-sm">{d.text}</p>
                    <button
                      onClick={() => api.deleteDecision(meetingId, d.id).then(reload).catch(toastError)}
                      className="text-red-400 hover:text-red-600 text-sm"
                    >×</button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* Action Items */}
        {tab === 'items' && (
          <div className="space-y-4">
            {/* Quick add form */}
            <div className="card bg-blue-50 border-blue-200 space-y-2">
              <h3 className="text-sm font-medium text-blue-800">Add Action Item</h3>
              <input className="input" placeholder="Title *" value={newItem.title}
                onChange={e => setNewItem(i => ({ ...i, title: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Owner"
                  value={newItem.owner}
                  onChange={e => setNewItem(i => ({ ...i, owner: e.target.value }))} />
                <input className="input" type="date" value={newItem.due_date}
                  onChange={e => setNewItem(i => ({ ...i, due_date: e.target.value }))} />
              </div>
              <button onClick={addItem} className="btn-primary w-full">+ Add Item</button>
            </div>

            {/* Items list */}
            {meeting.action_items.length === 0 ? (
              <EmptyState icon="✅" title="No action items" description="Add items above or generate via AI Recap" />
            ) : (
              <div className="space-y-2">
                {meeting.action_items.map(item => (
                  <div key={item.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={item.status} />
                          {item.ai_generated && <span className="badge bg-violet-100 text-violet-600">AI</span>}
                          {item.carried_from_id && <span className="badge bg-amber-100 text-amber-600">↩ carried</span>}
                          <p className="text-sm font-medium">{item.title}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.owner ? `Owner: ${item.owner}` : 'No owner'}
                          {item.due_date && ` · Due: ${new Date(item.due_date).toLocaleDateString()}`}
                        </p>
                      </div>
                      <button
                        onClick={() => setHistoryItemId(item.id)}
                        className="text-xs text-gray-400 hover:text-blue-600"
                      >History</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Catchup Brief */}
        {tab === 'brief' && (
          <div className="space-y-4">
            <div>
              <label className="label">Generate brief for person (name of someone who missed the meeting)</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Enter participant name..."
                  value={briefPerson}
                  onChange={e => setBriefPerson(e.target.value)}
                  list="participant-names"
                />
                <datalist id="participant-names">
                  {meeting.participants.map(p => <option key={p.id} value={p.name} />)}
                </datalist>
                <LoadingButton loading={briefLoading} onClick={handleGetBrief}>
                  ✦ Generate Brief
                </LoadingButton>
              </div>
            </div>
            {briefText && (
              <div className="card bg-gray-50 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Catchup Brief for {briefPerson}</h3>
                  <AiBadge mode={briefMode} />
                </div>
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{briefText}</pre>
                <button
                  onClick={() => navigator.clipboard.writeText(briefText)}
                  className="text-sm text-blue-600 hover:underline"
                >📋 Copy to clipboard</button>
              </div>
            )}
          </div>
        )}

        {/* Carry Forward */}
        {tab === 'carry' && (
          <div className="space-y-4">
            <div className="card bg-amber-50 border-amber-200">
              <h3 className="font-semibold text-amber-800 mb-2">Carry Open Items Forward</h3>
              <p className="text-sm text-amber-700 mb-4">
                All open and in-progress items from this meeting will be moved to a new meeting,
                preserving their history and origin.
              </p>
              <LoadingButton loading={carryLoading} onClick={handleCarryForward}>
                ↩ Carry Forward to New Meeting
              </LoadingButton>
              {carryResult && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-700">
                    ✓ Carried {carryResult.carried_count} items to{' '}
                    <a
                      href={`/meetings/${carryResult.next_meeting_id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      meeting #{carryResult.next_meeting_id}
                    </a>
                  </p>
                </div>
              )}
            </div>

            {/* Auto-agenda for next meeting */}
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Auto-Agenda for Next Meeting</h3>
                <AiBadge mode={agendaMode || 'ai'} />
              </div>
              <p className="text-sm text-gray-500 mb-3">
                AI drafts an agenda from carried items, overdue items, and unresolved decisions.
              </p>
              <LoadingButton loading={agendaLoading} onClick={handleAutoAgenda}>
                ✦ Draft Auto-Agenda
              </LoadingButton>
              {agendaItems.length > 0 && (
                <div className="mt-4 space-y-2">
                  {agendaItems.map((item: any) => (
                    <div key={item.order} className="flex gap-3 p-3 bg-blue-50 rounded-lg">
                      <span className="text-blue-600 font-bold">{item.order}.</span>
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-gray-500">{item.description}</p>
                        <p className="text-xs text-blue-500">⏱ {item.time_minutes} min</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* History Drawer */}
      {historyItem && (
        <HistoryDrawer
          events={historyItem.events}
          onClose={() => setHistoryItemId(null)}
        />
      )}
    </div>
  )
}

