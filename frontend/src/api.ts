/**
 * Typed API fetch wrapper.
 * All requests go through here so error handling is centralised.
 * Reads X-Request-ID from responses for error toast correlation.
 */

const BASE = '/api'

export interface ApiError {
  code: string
  message: string
  request_id: string
  details?: unknown
}

export class ApiException extends Error {
  constructor(
    public status: number,
    public error: ApiError
  ) {
    super(error.message)
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!res.ok) {
    let errorBody: { error: ApiError }
    try {
      errorBody = await res.json()
    } catch {
      errorBody = {
        error: {
          code: `HTTP_${res.status}`,
          message: res.statusText,
          request_id: res.headers.get('X-Request-ID') || '',
        },
      }
    }
    throw new ApiException(res.status, errorBody.error)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

// ─── Type definitions (matching backend schemas) ──────────────────────────────

export interface Participant {
  id: number
  meeting_id: number
  name: string
  email: string | null
  attendance: 'invited' | 'attended' | 'missed' | 'no_response'
}

export interface Decision {
  id: number
  meeting_id: number
  text: string
}

export interface ItemEvent {
  id: number
  item_id: number
  event_type: string
  old_value: string | null
  new_value: string | null
  actor: string | null
  created_at: string
}

export interface ActionItem {
  id: number
  title: string
  description: string | null
  owner: string | null
  due_date: string | null
  status: 'open' | 'in_progress' | 'done' | 'dropped'
  outcome: string | null
  origin_meeting_id: number | null
  current_meeting_id: number | null
  carried_from_id: number | null
  ai_generated: boolean
  created_at: string
  updated_at: string
  events: ItemEvent[]
}

export interface Meeting {
  id: number
  type: 'meeting' | 'handover'
  title: string
  status: 'draft' | 'scheduled' | 'held' | 'closed'
  agenda: string | null
  raw_notes: string | null
  summary: string | null
  scheduled_at: string | null
  previous_meeting_id: number | null
  created_at: string
  updated_at: string
  participants: Participant[]
  decisions: Decision[]
  action_items: ActionItem[]
}

export interface MeetingListItem {
  id: number
  type: string
  title: string
  status: string
  scheduled_at: string | null
  created_at: string
  updated_at: string
}

export interface RecapItem {
  title: string
  description: string | null
  owner: string | null
  due_date: string | null
  confidence: number
  needs_owner: boolean
}

export interface RecapProposal {
  summary: string
  decisions: string[]
  action_items: RecapItem[]
  ai_mode: 'ai' | 'fallback'
}

export interface KBDocument {
  id: number
  title: string
  content: string
  doc_type: 'doc' | 'past_meeting' | 'note'
  created_at: string
}

export interface KBSuggestion {
  document_id: number
  title: string
  score: number
  reason: string
  ai_reranked: boolean
}

export interface RadarItem {
  item_id: number
  title: string
  owner: string | null
  due_date: string | null
  status: string
  risk_score: number
  risk_reason: string
  rewritten_title: string | null
  suggested_owner: string | null
  nudge_message: string | null
  ai_explained: boolean
}

export interface DashboardStats {
  total_meetings: number
  open_items: number
  overdue_items: number
  in_progress_items: number
  closed_items: number
}

// ─── API functions ────────────────────────────────────────────────────────────

// Meetings
export const api = {
  // Health
  health: () => fetch('/health').then(r => r.json()),

  // Meetings
  listMeetings: (params?: { type?: string; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.type) qs.set('type', params.type)
    if (params?.status) qs.set('status', params.status)
    const q = qs.toString() ? `?${qs}` : ''
    return request<MeetingListItem[]>(`/meetings${q}`)
  },

  getMeeting: (id: number) => request<Meeting>(`/meetings/${id}`),

  createMeeting: (data: {
    type?: string
    title: string
    agenda?: string
    scheduled_at?: string
    previous_meeting_id?: number
  }) => request<Meeting>('/meetings', { method: 'POST', body: JSON.stringify(data) }),

  updateMeeting: (id: number, data: Partial<Meeting>) =>
    request<Meeting>(`/meetings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  changeMeetingStatus: (id: number, status: string) =>
    request<Meeting>(`/meetings/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  deleteMeeting: (id: number) =>
    request<void>(`/meetings/${id}`, { method: 'DELETE' }),

  // Participants
  addParticipant: (meetingId: number, data: { name: string; email?: string; attendance?: string }) =>
    request<Participant>(`/meetings/${meetingId}/participants`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateParticipant: (meetingId: number, participantId: number, data: Partial<Participant>) =>
    request<Participant>(`/meetings/${meetingId}/participants/${participantId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  removeParticipant: (meetingId: number, participantId: number) =>
    request<void>(`/meetings/${meetingId}/participants/${participantId}`, { method: 'DELETE' }),

  // Decisions
  addDecision: (meetingId: number, text: string) =>
    request<Decision>(`/meetings/${meetingId}/decisions`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  editDecision: (meetingId: number, decisionId: number, text: string) =>
    request<Decision>(`/meetings/${meetingId}/decisions/${decisionId}`, {
      method: 'PUT',
      body: JSON.stringify({ text }),
    }),

  deleteDecision: (meetingId: number, decisionId: number) =>
    request<void>(`/meetings/${meetingId}/decisions/${decisionId}`, { method: 'DELETE' }),

  // Action Items
  listItems: (params?: { owner?: string; status?: string; overdue?: boolean; meeting_id?: number }) => {
    const qs = new URLSearchParams()
    if (params?.owner) qs.set('owner', params.owner)
    if (params?.status) qs.set('status', params.status)
    if (params?.overdue !== undefined) qs.set('overdue', String(params.overdue))
    if (params?.meeting_id) qs.set('meeting_id', String(params.meeting_id))
    const q = qs.toString() ? `?${qs}` : ''
    return request<ActionItem[]>(`/items${q}`)
  },

  getItem: (id: number) => request<ActionItem>(`/items/${id}`),

  createItem: (data: Partial<ActionItem> & { title: string }) =>
    request<ActionItem>('/items', { method: 'POST', body: JSON.stringify(data) }),

  updateItem: (id: number, data: Partial<ActionItem>) =>
    request<ActionItem>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  changeItemStatus: (id: number, status: string, outcome?: string, actor?: string) =>
    request<ActionItem>(`/items/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, outcome, actor }),
    }),

  reassignItem: (id: number, owner: string, actor?: string) =>
    request<ActionItem>(`/items/${id}/reassign`, {
      method: 'PATCH',
      body: JSON.stringify({ owner, actor }),
    }),

  deleteItem: (id: number) => request<void>(`/items/${id}`, { method: 'DELETE' }),

  // Carry forward
  carryForward: (meetingId: number, data: { next_meeting_id?: number; next_meeting_title?: string }) =>
    request<{ next_meeting_id: number; carried_count: number; item_ids: number[] }>(
      `/meetings/${meetingId}/carry-forward`,
      { method: 'POST', body: JSON.stringify(data) }
    ),

  // AI
  generateRecap: (meetingId: number) =>
    request<RecapProposal>(`/meetings/${meetingId}/ai/recap`, { method: 'POST', body: '{}' }),

  applyRecap: (meetingId: number, proposal: RecapProposal) =>
    request<{ status: string }>(`/meetings/${meetingId}/ai/recap/apply`, {
      method: 'POST',
      body: JSON.stringify(proposal),
    }),

  getBrief: (meetingId: number, forPerson: string) =>
    request<{ brief: string; generated_by: string; brief_id: number }>(
      `/meetings/${meetingId}/brief?for=${encodeURIComponent(forPerson)}`
    ),

  // KB
  listDocuments: (docType?: string) => {
    const qs = docType ? `?doc_type=${docType}` : ''
    return request<KBDocument[]>(`/kb/documents${qs}`)
  },

  createDocument: (data: { title: string; content: string; doc_type?: string }) =>
    request<KBDocument>('/kb/documents', { method: 'POST', body: JSON.stringify(data) }),

  updateDocument: (id: number, data: Partial<KBDocument>) =>
    request<KBDocument>(`/kb/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteDocument: (id: number) =>
    request<void>(`/kb/documents/${id}`, { method: 'DELETE' }),

  suggestKBLinks: (itemId: number) =>
    request<KBSuggestion[]>(`/kb/items/${itemId}/suggest`, { method: 'POST', body: '{}' }),

  confirmKBLink: (data: {
    source_type: string
    source_id: number
    document_id: number
    score?: number
    reason?: string
  }) => request('/kb/links', { method: 'POST', body: JSON.stringify(data) }),

  deleteKBLink: (linkId: number) =>
    request<void>(`/kb/links/${linkId}`, { method: 'DELETE' }),

  // Dashboard & Radar
  getDashboard: () => request<DashboardStats>('/dashboard'),
  getOverdue: () => request<ActionItem[]>('/dashboard/overdue'),
  getMyItems: (owner: string) =>
    request<ActionItem[]>(`/dashboard/my-items?owner=${encodeURIComponent(owner)}`),
  getRadar: (useAi = true) => request<RadarItem[]>(`/radar?use_ai=${useAi}`),
  getAutoAgenda: (meetingId: number) =>
    request<{ agenda_items: unknown[]; generated_by: string }>(`/meetings/${meetingId}/auto-agenda`),

  // Seed
  seedDatabase: () => request<{ status: string; message: string }>('/seed', { method: 'POST' }),
}

