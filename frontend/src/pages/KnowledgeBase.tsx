/**
 * Knowledge Base page: list/add documents, suggest KB links for items.
 */
import { useEffect, useState } from 'react'
import { api, KBDocument, ActionItem, KBSuggestion } from '../api'
import { Spinner, EmptyState, LoadingButton, toastError, toast } from '../components/shared'

export default function KnowledgeBase() {
  const [docs, setDocs] = useState<KBDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newDoc, setNewDoc] = useState({ title: '', content: '', doc_type: 'doc' })
  const [creating, setCreating] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // KB link suggestion
  const [items, setItems] = useState<ActionItem[]>([])
  const [selectedItem, setSelectedItem] = useState('')
  const [suggestions, setSuggestions] = useState<KBSuggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<KBDocument | null>(null)

  useEffect(() => {
    api.listDocuments(typeFilter || undefined).then(setDocs).catch(toastError).finally(() => setLoading(false))
    api.listItems({ status: 'open' }).then(setItems).catch(() => {})
  }, [typeFilter])

  async function handleCreate() {
    if (!newDoc.title.trim() || !newDoc.content.trim()) {
      toast({ type: 'error', message: 'Title and content are required' })
      return
    }
    setCreating(true)
    try {
      await api.createDocument(newDoc)
      toast({ type: 'success', message: 'Document added to Knowledge Base' })
      setShowAdd(false)
      setNewDoc({ title: '', content: '', doc_type: 'doc' })
      const updated = await api.listDocuments(typeFilter || undefined)
      setDocs(updated)
    } catch (e) {
      toastError(e)
    } finally {
      setCreating(false)
    }
  }

  async function handleSuggest() {
    if (!selectedItem) return
    setSuggestLoading(true)
    try {
      const results = await api.suggestKBLinks(Number(selectedItem))
      setSuggestions(results)
      if (results.length === 0) {
        toast({ type: 'info', message: 'No relevant KB documents found for this item' })
      }
    } catch (e) {
      toastError(e)
    } finally {
      setSuggestLoading(false)
    }
  }

  async function confirmLink(sug: KBSuggestion) {
    try {
      await api.confirmKBLink({
        source_type: 'item',
        source_id: Number(selectedItem),
        document_id: sug.document_id,
        score: sug.score,
        reason: sug.reason,
      })
      toast({ type: 'success', message: 'Link confirmed and recorded!' })
      setSuggestions(prev => prev.filter(s => s.document_id !== sug.document_id))
    } catch (e) {
      toastError(e)
    }
  }

  const DOC_TYPE_CONFIG: Record<string, { label: string; badgeBg: string; text: string; icon: string }> = {
    doc: { label: 'System Doc', badgeBg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: '📄' },
    past_meeting: { label: 'Past Meeting', badgeBg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', icon: '📅' },
    note: { label: 'Team Note', badgeBg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: '📝' },
  }

  const filteredDocs = docs.filter(d =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Knowledge Base
            </h1>
            <span className="badge bg-slate-100 text-slate-700 font-bold">
              {docs.length} Documents
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Team runbooks, architecture notes, and past meeting summaries linked via AI
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs self-start sm:self-auto px-4 py-2">
          <span>+ Add Document</span>
        </button>
      </div>

      {/* AI KB Linking Feature Card */}
      <div className="card bg-gradient-to-br from-indigo-50/50 via-white to-violet-50/30 border-indigo-200/80 p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-violet-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shadow-brand-500/20">
            🔗
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 text-base">AI Knowledge Retrieval & Linking</h2>
              <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200 uppercase">
                TF-IDF + LLM Rerank
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Select an open action item to surface related architecture notes, on-call runbooks, or past meeting precedents
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <select
            className="input text-xs flex-1"
            value={selectedItem}
            onChange={e => {
              setSelectedItem(e.target.value)
              setSuggestions([])
            }}
          >
            <option value="">Select an action item to analyze...</option>
            {items.map(i => (
              <option key={i.id} value={i.id}>
                {i.title} (#{i.id})
              </option>
            ))}
          </select>
          <LoadingButton
            loading={suggestLoading}
            onClick={handleSuggest}
            disabled={!selectedItem}
            className="btn-ai text-xs px-5"
          >
            ✦ Find Relevant Docs
          </LoadingButton>
        </div>

        {/* Suggestions List */}
        {suggestions.length > 0 && (
          <div className="mt-4 space-y-3 pt-3 border-t border-indigo-100 animate-fade-in-up">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Matched Knowledge Documents ({suggestions.length})
            </h3>
            <div className="grid grid-cols-1 gap-2.5">
              {suggestions.map(sug => (
                <div
                  key={sug.document_id}
                  className="p-4 bg-white rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-900 truncate">{sug.title}</span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-bold border border-brand-100">
                        {(sug.score * 100).toFixed(0)}% Match
                      </span>
                      {sug.ai_reranked && (
                        <span className="text-[10px] bg-violet-50 text-violet-700 px-2 py-0.5 rounded border border-violet-100 font-semibold">
                          ✦ AI Verified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100 mt-1">
                      <span className="font-semibold text-slate-700">Relevance:</span> {sug.reason}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                      onClick={() => confirmLink(sug)}
                      className="btn-primary text-xs py-1 px-3"
                    >
                      ✓ Confirm Link
                    </button>
                    <button
                      onClick={() => setSuggestions(prev => prev.filter(s => s.document_id !== sug.document_id))}
                      className="btn-secondary text-xs py-1 px-2.5 text-slate-500"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search */}
      <div className="card p-4 flex flex-col sm:flex-row items-center gap-3 shadow-xs">
        <div className="relative flex-1 w-full">
          <input
            className="input pl-9 text-xs"
            placeholder="Search documents by title or content..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
        </div>
        <select
          className="input text-xs w-full sm:w-44"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="">All Document Types</option>
          <option value="doc">System Documents</option>
          <option value="past_meeting">Past Meeting Recaps</option>
          <option value="note">Engineering Notes</option>
        </select>
      </div>

      {/* Documents Grid */}
      {loading ? (
        <Spinner />
      ) : filteredDocs.length === 0 ? (
        <EmptyState
          icon="📚"
          title="No documents found"
          description="Add runbooks, architecture checklists, or close meetings to archive them here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDocs.map(doc => {
            const conf = DOC_TYPE_CONFIG[doc.doc_type] || {
              label: doc.doc_type,
              badgeBg: 'bg-slate-50 border-slate-200',
              text: 'text-slate-700',
              icon: '📄',
            }

            return (
              <div
                key={doc.id}
                className="card card-hover p-5 cursor-pointer flex flex-col justify-between group"
                onClick={() => setSelectedDoc(doc)}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md border ${conf.badgeBg} ${conf.text}`}>
                      <span>{conf.icon}</span>
                      <span>{conf.label}</span>
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        api.deleteDocument(doc.id)
                          .then(() => {
                            toast({ type: 'success', message: 'Document deleted' })
                            setDocs(prev => prev.filter(d => d.id !== doc.id))
                          })
                          .catch(toastError)
                      }}
                      className="text-slate-300 hover:text-rose-500 transition-colors p-1"
                      title="Delete document"
                    >
                      ✕
                    </button>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base group-hover:text-brand-600 transition-colors line-clamp-1">
                    {doc.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed">
                    {doc.content}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
                  <span className="font-mono">
                    {new Date(doc.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="text-brand-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                    Read Document →
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Document Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full border border-slate-200 animate-fade-in-up">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-lg">Add Knowledge Base Document</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600 text-sm">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Document Category</label>
                <select
                  className="input text-xs"
                  value={newDoc.doc_type}
                  onChange={e => setNewDoc(d => ({ ...d, doc_type: e.target.value }))}
                >
                  <option value="doc">System / Architecture Document</option>
                  <option value="note">Team Note / Guideline</option>
                  <option value="past_meeting">Past Meeting Summary</option>
                </select>
              </div>

              <div>
                <label className="label">Document Title *</label>
                <input
                  className="input text-xs"
                  placeholder="e.g. On-Call Incident Runbook v2.1"
                  value={newDoc.title}
                  onChange={e => setNewDoc(d => ({ ...d, title: e.target.value }))}
                />
              </div>

              <div>
                <label className="label">Document Content *</label>
                <textarea
                  className="input h-48 text-xs font-mono resize-y"
                  value={newDoc.content}
                  onChange={e => setNewDoc(d => ({ ...d, content: e.target.value }))}
                  placeholder="Paste Markdown or text content..."
                />
              </div>
            </div>

            <div className="flex gap-2.5 mt-6 justify-end pt-3 border-t border-slate-100">
              <button onClick={() => setShowAdd(false)} className="btn-secondary text-xs">
                Cancel
              </button>
              <LoadingButton loading={creating} onClick={handleCreate} className="text-xs">
                Add to Knowledge Base
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* Read Document Modal */}
      {selectedDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => setSelectedDoc(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full border border-slate-200 max-h-[85vh] flex flex-col animate-fade-in-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <span className="badge bg-slate-100 text-slate-700 text-[10px] font-bold uppercase mb-1">
                  {selectedDoc.doc_type}
                </span>
                <h2 className="font-bold text-slate-900 text-lg leading-snug">{selectedDoc.title}</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Archived on {new Date(selectedDoc.created_at).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <button onClick={() => setSelectedDoc(null)} className="text-slate-400 hover:text-slate-600 text-lg">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              <pre className="whitespace-pre-wrap text-xs sm:text-sm text-slate-700 font-sans leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                {selectedDoc.content}
              </pre>
            </div>

            <div className="pt-4 mt-2 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedDoc(null)} className="btn-secondary text-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
