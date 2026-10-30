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
      toast({ type: 'success', message: 'Document added to KB' })
      setShowAdd(false)
      setNewDoc({ title: '', content: '', doc_type: 'doc' })
      const updated = await api.listDocuments(typeFilter || undefined)
      setDocs(updated)
    } catch (e) { toastError(e) }
    finally { setCreating(false) }
  }

  async function handleSuggest() {
    if (!selectedItem) return
    setSuggestLoading(true)
    try {
      const results = await api.suggestKBLinks(Number(selectedItem))
      setSuggestions(results)
      if (results.length === 0) toast({ type: 'info', message: 'No relevant KB documents found for this item' })
    } catch (e) { toastError(e) }
    finally { setSuggestLoading(false) }
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
      toast({ type: 'success', message: 'Link confirmed!' })
      setSuggestions(prev => prev.filter(s => s.document_id !== sug.document_id))
    } catch (e) { toastError(e) }
  }

  const DOC_TYPE_LABELS: Record<string, string> = {
    doc: '📄 Doc',
    past_meeting: '📅 Past Meeting',
    note: '📝 Note',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Knowledge Base</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Document</button>
      </div>

      {/* AI KB Linking panel */}
      <div className="card bg-violet-50 border-violet-200">
        <h2 className="font-semibold text-violet-800 mb-3">🔗 AI KB Linking</h2>
        <p className="text-sm text-violet-700 mb-3">
          Select an open action item to find relevant KB documents (TF-IDF + AI reranking).
        </p>
        <div className="flex gap-2">
          <select
            className="input flex-1"
            value={selectedItem}
            onChange={e => { setSelectedItem(e.target.value); setSuggestions([]) }}
          >
            <option value="">Select an action item...</option>
            {items.map(i => (
              <option key={i.id} value={i.id}>{i.title} (#{i.id})</option>
            ))}
          </select>
          <LoadingButton loading={suggestLoading} onClick={handleSuggest} disabled={!selectedItem}>
            ✦ Suggest
          </LoadingButton>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-4 space-y-2">
            {suggestions.map(sug => (
              <div key={sug.document_id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                <div>
                  <p className="text-sm font-medium">{sug.title}</p>
                  <p className="text-xs text-gray-500">{sug.reason}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">Score: {(sug.score * 100).toFixed(0)}%</span>
                    {sug.ai_reranked && (
                      <span className="badge bg-violet-100 text-violet-600 text-xs">AI ranked</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => confirmLink(sug)} className="btn-primary text-xs py-1">✓ Link</button>
                  <button
                    onClick={() => setSuggestions(prev => prev.filter(s => s.document_id !== sug.document_id))}
                    className="btn-secondary text-xs py-1"
                  >✗ Skip</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <select className="input w-auto" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="doc">Documents</option>
          <option value="past_meeting">Past Meetings</option>
          <option value="note">Notes</option>
        </select>
      </div>

      {/* Document list */}
      {loading ? <Spinner /> : docs.length === 0 ? (
        <EmptyState icon="📚" title="No documents yet" description="Add docs, runbooks, or notes to your knowledge base" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map(doc => (
            <div
              key={doc.id}
              className="card cursor-pointer hover:border-blue-200 hover:shadow-md transition-all"
              onClick={() => setSelectedDoc(doc)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-medium text-gray-400">
                    {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                  </span>
                  <h3 className="font-medium text-gray-800 mt-0.5">{doc.title}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{doc.content}</p>
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    api.deleteDocument(doc.id)
                      .then(() => setDocs(prev => prev.filter(d => d.id !== doc.id)))
                      .catch(toastError)
                  }}
                  className="text-gray-300 hover:text-red-400 ml-2"
                >×</button>
              </div>
              <p className="text-xs text-gray-300 mt-2">{new Date(doc.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add Document modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4">
            <h2 className="font-semibold mb-4">Add KB Document</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Type</label>
                <select className="input" value={newDoc.doc_type}
                  onChange={e => setNewDoc(d => ({ ...d, doc_type: e.target.value }))}>
                  <option value="doc">Document</option>
                  <option value="note">Note</option>
                  <option value="past_meeting">Past Meeting</option>
                </select>
              </div>
              <div>
                <label className="label">Title *</label>
                <input className="input" value={newDoc.title}
                  onChange={e => setNewDoc(d => ({ ...d, title: e.target.value }))} />
              </div>
              <div>
                <label className="label">Content *</label>
                <textarea className="input h-48 resize-y" value={newDoc.content}
                  onChange={e => setNewDoc(d => ({ ...d, content: e.target.value }))}
                  placeholder="Paste the document content here..." />
              </div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
              <LoadingButton loading={creating} onClick={handleCreate}>Add to KB</LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* Document detail modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedDoc(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs text-gray-400">{DOC_TYPE_LABELS[selectedDoc.doc_type]}</span>
                <h2 className="font-semibold text-lg">{selectedDoc.title}</h2>
              </div>
              <button onClick={() => setSelectedDoc(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{selectedDoc.content}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

