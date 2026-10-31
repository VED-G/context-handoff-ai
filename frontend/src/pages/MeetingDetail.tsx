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
  const [copiedBrief, setCopiedBrief] = useState(false)

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
      toast({ type: 'success', message: `Status updated to ${status}` })
      reload()
    } catch (e) {
      toastError(e)
    }
  }

  async function handleGenerateRecap() {
    if (!meeting?.raw_notes?.trim()) {
      toast({ type: 'error', message: 'Paste some raw notes first under the Notes tab' })
      return
    }
    setRecapLoading(true)
    try {
      const proposal = await api.generateRecap(meetingId)
      setRecapProposal(proposal)
      toast({ type: 'success', message: 'Recap generated! Review proposal below.' })
    } catch (e) {
      toastError(e)
    } finally {
      setRecapLoading(false)
    }
  }

  async function handleApplyRecap() {
    if (!recapProposal) return
    setApplyLoading(true)
    try {
      await api.applyRecap(meetingId, recapProposal)
      toast({ type: 'success', message: 'Recap applied to meeting!' })
      setRecapProposal(null)
      reload()
    } catch (e) {
      toastError(e)
    } finally {
      setApplyLoading(false)
    }
  }

  async function handleGetBrief() {
    if (!briefPerson.trim()) {
      toast({ type: 'error', message: 'Enter or select a person name' })
      return
    }
    setBriefLoading(true)
    try {
      const r = await api.getBrief(meetingId, briefPerson)
      setBriefText(r.brief)
      setBriefMode(r.generated_by)
    } catch (e) {
      toastError(e)
    } finally {
      setBriefLoading(false)
    }
  }

  async function handleCarryForward() {
    setCarryLoading(true)
    try {
      const r = await api.carryForward(meetingId, {})
      setCarryResult(r)
      toast({ type: 'success', message: `Carried ${r.carried_count} open items to new meeting #${r.next_meeting_id}` })
    } catch (e) {
      toastError(e)
    } finally {
      setCarryLoading(false)
    }
  }

  async function handleAutoAgenda() {
    setAgendaLoading(true)
    try {
      const r = await api.getAutoAgenda(meetingId)
      setAgendaItems(r.agenda_items as any[])
      setAgendaMode(r.generated_by)
    } catch (e) {
      toastError(e)
    } finally {
      setAgendaLoading(false)
    }
  }

  async function addParticipant() {
    if (!newParticipant.name.trim()) return
    try {
      await api.addParticipant(meetingId, newParticipant)
      setNewParticipant({ name: '', email: '', attendance: 'invited' })
      toast({ type: 'success', message: 'Participant added' })
      reload()
    } catch (e) {
      toastError(e)
    }
  }

  async function addDecision() {
    if (!newDecision.trim()) return
    try {
      await api.addDecision(meetingId, newDecision)
      setNewDecision('')
      toast({ type: 'success', message: 'Decision recorded' })
      reload()
    } catch (e) {
      toastError(e)
    }
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
      toast({ type: 'success', message: 'Action item created' })
      reload()
    } catch (e) {
      toastError(e)
    }
  }

  if (loading) return <Spinner />
  if (!meeting) return <EmptyState icon="❌" title="Meeting not found" />

  const TABS: { key: Tab; label: string; icon: string; count?: number }[] = [
    { key: 'agenda', label: 'Agenda & Auto-Draft', icon: '📝' },
    { key: 'notes', label: 'Notes & AI Recap', icon: '✨' },
    { key: 'decisions', label: 'Decisions', icon: '⚖️', count: meeting.decisions.length },
    { key: 'items', label: 'Action Items', icon: '✓', count: meeting.action_items.length },
    { key: 'participants', label: 'Participants', icon: '👥', count: meeting.participants.length },
    { key: 'brief', label: 'Catchup Brief', icon: '📬' },
    { key: 'carry', label: 'Carry Forward', icon: '↩' },
  ]

  const historyItem = historyItemId !== null
    ? meeting.action_items.find(i => i.id === historyItemId)
    : null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Breadcrumb & Status Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/70">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => navigate('/meetings')}
              className="text-xs font-semibold text-slate-400 hover:text-brand-600 transition-colors flex items-center gap-1"
            >
              <span>← All Meetings</span>
            </button>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {meeting.type}
            </span>
            <StatusBadge status={meeting.status} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {meeting.title}
          </h1>
          {meeting.scheduled_at && (
            <p className="text-xs text-slate-400 font-mono mt-1">
              🗓️ {new Date(meeting.scheduled_at).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
            </p>
          )}
        </div>

        {/* Status transition chips */}
        <div className="flex items-center gap-1.5 self-start md:self-auto bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/80">
          <span className="text-[11px] font-medium text-slate-400 px-2">Stage:</span>
          {['draft', 'scheduled', 'held', 'closed'].map(s => {
            const isCurrent = s === meeting.status
            return (
              <button
                key={s}
                disabled={isCurrent}
                onClick={() => handleStatusChange(s)}
                className={`text-xs px-2.5 py-1 rounded-lg font-semibold capitalize transition-all ${
                  isCurrent
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 cursor-default'
                    : 'text-slate-500 hover:text-brand-600 hover:bg-white/60'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      {/* Modern Tabs Bar */}
      <div className="flex gap-1.5 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80 overflow-x-auto shadow-2xs">
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-150 ${
                active
                  ? 'bg-white text-brand-700 shadow-xs border border-slate-200/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                    active ? 'bg-brand-50 text-brand-700' : 'bg-slate-200/70 text-slate-600'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Contents */}
      <div className="mt-4">
        {/* ─── TAB 1: Agenda ─── */}
        {tab === 'agenda' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card space-y-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base mb-1">Meeting Agenda</h3>
                <p className="text-xs text-slate-400">Outline objectives and discussion points</p>
              </div>
              <textarea
                className="input h-48 font-mono text-xs leading-relaxed resize-none"
                value={meeting.agenda || ''}
                onChange={e => api.updateMeeting(meetingId, { agenda: e.target.value }).then(setMeeting)}
                placeholder="1. Review past action items&#10;2. Product updates&#10;3. Key decisions..."
              />
              <p className="text-[11px] text-slate-400 italic">Changes save automatically on edit</p>
            </div>

            <div className="card space-y-4 bg-gradient-to-br from-indigo-50/40 via-white to-violet-50/30 border-indigo-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">✦ AI Auto-Agenda</h3>
                  <p className="text-xs text-slate-500">Auto-drafts a prioritized agenda from carried/overdue tasks</p>
                </div>
                <AiBadge mode={agendaMode || 'ai'} />
              </div>

              <LoadingButton loading={agendaLoading} onClick={handleAutoAgenda} className="btn-ai text-xs w-full py-2.5">
                ✦ Synthesize Auto-Agenda
              </LoadingButton>

              {agendaItems.length > 0 && (
                <div className="mt-4 space-y-2.5 animate-fade-in-up">
                  {agendaItems.map((item: any) => (
                    <div key={item.order} className="flex gap-3 p-3.5 bg-white rounded-xl border border-indigo-100 shadow-2xs">
                      <span className="w-6 h-6 rounded-lg bg-indigo-50 text-brand-600 font-extrabold text-xs flex items-center justify-center shrink-0">
                        {item.order}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-xs text-slate-800 truncate">{item.title}</p>
                          <span className="text-[10px] font-mono text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full shrink-0">
                            ⏱ {item.time_minutes} min
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 2: Notes & AI Recap ─── */}
        {tab === 'notes' && (
          <div className="space-y-6">
            <div className="card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Unstructured Raw Notes</h3>
                  <p className="text-xs text-slate-400">Paste messy meeting transcript, slack discussions, or quick bullets</p>
                </div>
                <LoadingButton loading={recapLoading} onClick={handleGenerateRecap} className="btn-ai text-xs py-2 px-4">
                  ✦ Generate AI Recap
                </LoadingButton>
              </div>

              <textarea
                className="input h-52 font-mono text-xs leading-relaxed"
                value={meeting.raw_notes || ''}
                onChange={e => api.updateMeeting(meetingId, { raw_notes: e.target.value }).then(setMeeting)}
                placeholder="Paste your meeting notes here..."
              />
            </div>

            {/* Recap Proposal Canvas (Review before apply) */}
            {recapProposal && (
              <div className="card border-2 border-violet-200 bg-gradient-to-b from-violet-50/30 to-white space-y-5 shadow-lg animate-fade-in-up">
                <div className="flex items-center justify-between pb-3 border-b border-violet-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">✨</span>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">AI Recap Proposal (Review & Apply)</h3>
                      <p className="text-xs text-slate-500">Edit any details before committing to meeting record</p>
                    </div>
                  </div>
                  <AiBadge mode={recapProposal.ai_mode} />
                </div>

                <div>
                  <label className="label">Executive Summary</label>
                  <textarea
                    className="input h-24 text-xs font-sans leading-relaxed"
                    value={recapProposal.summary}
                    onChange={e => setRecapProposal(p => p ? { ...p, summary: e.target.value } : p)}
                  />
                </div>

                <div>
                  <label className="label">Extracted Decisions</label>
                  <div className="space-y-2">
                    {recapProposal.decisions.map((d, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          className="input flex-1 text-xs"
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
                          className="text-slate-400 hover:text-rose-600 px-2"
                        >✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => setRecapProposal(p => p ? { ...p, decisions: [...p.decisions, ''] } : p)}
                      className="text-xs text-brand-600 hover:underline font-semibold"
                    >+ Add another decision</button>
                  </div>
                </div>

                <div>
                  <label className="label">Proposed Action Items</label>
                  <div className="space-y-2.5">
                    {recapProposal.action_items.map((item, i) => (
                      <div key={i} className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2 shadow-2xs">
                        <div className="flex gap-2">
                          <input
                            className="input flex-1 text-xs font-semibold"
                            placeholder="Action Title"
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
                            className="text-slate-400 hover:text-rose-600 px-2"
                          >✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="input text-xs"
                            placeholder="Owner name"
                            value={item.owner || ''}
                            onChange={e => {
                              const items = [...recapProposal.action_items]
                              items[i] = { ...items[i], owner: e.target.value }
                              setRecapProposal(p => p ? { ...p, action_items: items } : p)
                            }}
                          />
                          <input
                            className="input text-xs"
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
                          <p className="text-[11px] text-amber-600 font-medium">⚠️ Needs valid owner assignment</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-3 border-t border-violet-100">
                  <LoadingButton loading={applyLoading} onClick={handleApplyRecap} className="text-xs">
                    ✓ Apply & Save to Meeting
                  </LoadingButton>
                  <button onClick={() => setRecapProposal(null)} className="btn-secondary text-xs">
                    Discard Proposal
                  </button>
                </div>
              </div>
            )}

            {/* Saved Summary Display */}
            {meeting.summary && (
              <div className="card bg-slate-50 border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-slate-800 text-sm">Committed Meeting Summary</h3>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">
                    Active
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed font-sans">{meeting.summary}</p>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 3: Decisions ─── */}
        {tab === 'decisions' && (
          <div className="space-y-4">
            <div className="card p-4">
              <h3 className="font-bold text-slate-800 text-sm mb-2">Record New Decision</h3>
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-xs"
                  placeholder="e.g. Approved database migration schedule for Q4..."
                  value={newDecision}
                  onChange={e => setNewDecision(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDecision()}
                />
                <button onClick={addDecision} className="btn-primary text-xs px-4">
                  + Record
                </button>
              </div>
            </div>

            {meeting.decisions.length === 0 ? (
              <EmptyState icon="⚖️" title="No decisions recorded yet" description="Add key agreements above or generate them via AI Recap." />
            ) : (
              <div className="space-y-2.5">
                {meeting.decisions.map((d, i) => (
                  <div key={d.id} className="card p-4 flex items-start gap-3 hover:border-slate-300">
                    <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <p className="flex-1 text-xs sm:text-sm font-medium text-slate-800 leading-relaxed">{d.text}</p>
                    <button
                      onClick={() => api.deleteDecision(meetingId, d.id).then(reload).catch(toastError)}
                      className="text-slate-400 hover:text-rose-600 text-xs px-2"
                      title="Delete decision"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 4: Action Items ─── */}
        {tab === 'items' && (
          <div className="space-y-4">
            {/* Quick Add Form */}
            <div className="card p-5 bg-gradient-to-r from-brand-50/50 to-indigo-50/30 border-brand-200">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Add Action Item</h3>
              <div className="space-y-3">
                <input
                  className="input text-xs"
                  placeholder="Action Item Title *"
                  value={newItem.title}
                  onChange={e => setNewItem(i => ({ ...i, title: e.target.value }))}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    className="input text-xs"
                    placeholder="Owner (e.g. Priya Sharma)"
                    value={newItem.owner}
                    onChange={e => setNewItem(i => ({ ...i, owner: e.target.value }))}
                  />
                  <input
                    className="input text-xs"
                    type="date"
                    value={newItem.due_date}
                    onChange={e => setNewItem(i => ({ ...i, due_date: e.target.value }))}
                  />
                </div>
                <button onClick={addItem} className="btn-primary text-xs w-full py-2">
                  + Add Item to Agenda
                </button>
              </div>
            </div>

            {/* Items List */}
            {meeting.action_items.length === 0 ? (
              <EmptyState icon="✅" title="No action items yet" description="Add tasks manually or extract them via AI Recap." />
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {meeting.action_items.map(item => (
                  <div key={item.id} className="card card-hover p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={item.status} />
                        {item.ai_generated && <span className="badge bg-violet-50 text-violet-700 border-violet-200">✦ AI</span>}
                        {item.carried_from_id && <span className="badge bg-amber-50 text-amber-700 border-amber-200">↩ Carried</span>}
                        <h4 className="font-bold text-xs sm:text-sm text-slate-900 truncate">{item.title}</h4>
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-3">
                        <span>Owner: <strong className="text-slate-700 font-medium">{item.owner || 'Unassigned'}</strong></span>
                        {item.due_date && <span>Due: {new Date(item.due_date).toLocaleDateString()}</span>}
                      </p>
                    </div>

                    <button
                      onClick={() => setHistoryItemId(item.id)}
                      className="btn-secondary text-xs py-1 px-3 self-end sm:self-auto"
                    >
                      Audit Trail
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 5: Participants ─── */}
        {tab === 'participants' && (
          <div className="space-y-4">
            <div className="card p-4 space-y-3">
              <h3 className="font-bold text-slate-800 text-sm">Add Participant</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  className="input text-xs"
                  placeholder="Full Name *"
                  value={newParticipant.name}
                  onChange={e => setNewParticipant(p => ({ ...p, name: e.target.value }))}
                />
                <input
                  className="input text-xs"
                  placeholder="Email Address"
                  value={newParticipant.email}
                  onChange={e => setNewParticipant(p => ({ ...p, email: e.target.value }))}
                />
                <select
                  className="input text-xs"
                  value={newParticipant.attendance}
                  onChange={e => setNewParticipant(p => ({ ...p, attendance: e.target.value }))}
                >
                  <option value="invited">Invited</option>
                  <option value="attended">Attended</option>
                  <option value="missed">Missed</option>
                  <option value="no_response">No Response</option>
                </select>
              </div>
              <button onClick={addParticipant} className="btn-primary text-xs">
                + Add Participant
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {meeting.participants.map(p => (
                <div key={p.id} className="card p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">
                      {p.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{p.name}</p>
                      {p.email && <p className="text-[11px] text-slate-400 truncate">{p.email}</p>}
                    </div>
                  </div>
                  <select
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1 bg-white font-medium text-slate-700"
                    value={p.attendance}
                    onChange={e => api.updateParticipant(meetingId, p.id, { attendance: e.target.value as any })
                      .then(reload).catch(toastError)}
                  >
                    <option value="invited">Invited</option>
                    <option value="attended">Attended</option>
                    <option value="missed">Missed</option>
                    <option value="no_response">No Response</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TAB 6: Catchup Brief ─── */}
        {tab === 'brief' && (
          <div className="space-y-4">
            <div className="card p-5 space-y-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Personalized Catchup Brief</h3>
                <p className="text-xs text-slate-500">
                  Generate a high-density, 150-word summary tailored for someone who missed the meeting or is taking over a project.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <input
                  className="input text-xs flex-1"
                  placeholder="Select or enter recipient name..."
                  value={briefPerson}
                  onChange={e => setBriefPerson(e.target.value)}
                  list="participant-names"
                />
                <datalist id="participant-names">
                  {meeting.participants.map(p => <option key={p.id} value={p.name} />)}
                </datalist>
                <LoadingButton loading={briefLoading} onClick={handleGetBrief} className="btn-ai text-xs px-4">
                  ✦ Generate Catchup Brief
                </LoadingButton>
              </div>
            </div>

            {briefText && (
              <div className="card bg-gradient-to-br from-indigo-50/40 via-white to-slate-50 border-indigo-100 p-6 space-y-4 shadow-sm animate-fade-in-up">
                <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📬</span>
                    <h4 className="font-bold text-slate-900 text-sm">Brief for {briefPerson}</h4>
                  </div>
                  <AiBadge mode={briefMode} />
                </div>
                <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                  <pre className="whitespace-pre-wrap text-xs sm:text-sm text-slate-700 font-sans leading-relaxed">
                    {briefText}
                  </pre>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(briefText)
                      setCopiedBrief(true)
                      setTimeout(() => setCopiedBrief(false), 2000)
                    }}
                    className="btn-secondary text-xs"
                  >
                    {copiedBrief ? '✓ Copied to Clipboard' : '📋 Copy Brief Text'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 7: Carry Forward ─── */}
        {tab === 'carry' && (
          <div className="space-y-6">
            <div className="card p-6 bg-gradient-to-r from-amber-50/60 to-orange-50/30 border-amber-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-sm shadow-amber-500/20">
                  ↩
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Carry Open Items Forward</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Automatically migrates all open and in-progress action items into the next meeting agenda with audit preservation.
                  </p>
                </div>
              </div>

              <LoadingButton loading={carryLoading} onClick={handleCarryForward} className="text-xs">
                ↩ Execute Carry Forward
              </LoadingButton>

              {carryResult && (
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 space-y-1 animate-fade-in">
                  <p className="font-bold">✓ Successfully carried forward {carryResult.carried_count} items!</p>
                  <p>
                    Target meeting created:{' '}
                    <a
                      href={`/meetings/${carryResult.next_meeting_id}`}
                      className="text-brand-600 font-bold hover:underline"
                    >
                      View Meeting #{carryResult.next_meeting_id} →
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Item Audit Trail Drawer */}
      {historyItem && (
        <HistoryDrawer
          events={historyItem.events}
          onClose={() => setHistoryItemId(null)}
        />
      )}
    </div>
  )
}
