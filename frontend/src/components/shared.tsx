/**
 * Shared reusable components for context-handoff-ai frontend.
 */

import React, { useEffect, useState } from 'react'
import { ApiException } from '../api'

// ─── StatusBadge ──────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  // Meeting statuses
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  held: 'bg-purple-100 text-purple-700',
  closed: 'bg-green-100 text-green-700',
  // Item statuses
  open: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  dropped: 'bg-red-100 text-red-700',
  // Attendance
  invited: 'bg-gray-100 text-gray-600',
  attended: 'bg-green-100 text-green-700',
  missed: 'bg-red-100 text-red-700',
  no_response: 'bg-orange-100 text-orange-700',
}

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`badge ${color}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

// ─── AiBadge ──────────────────────────────────────────────────────────────────
export function AiBadge({ mode }: { mode: 'ai' | 'fallback' | string }) {
  if (mode === 'ai') {
    return (
      <span className="badge bg-violet-100 text-violet-700 gap-1">
        ✦ AI
      </span>
    )
  }
  return (
    <span className="badge bg-amber-100 text-amber-700" title="AI unavailable – using rule-based logic">
      ⚡ Basic mode
    </span>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
export interface ToastMessage {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
  request_id?: string
}

let _toastId = 0
type ToastHandler = (msg: Omit<ToastMessage, 'id'>) => void
let _globalToast: ToastHandler | null = null

export function setGlobalToast(fn: ToastHandler) {
  _globalToast = fn
}

export function toast(msg: Omit<ToastMessage, 'id'>) {
  _globalToast?.(msg)
}

export function toastError(e: unknown) {
  if (e instanceof ApiException) {
    toast({
      type: 'error',
      message: e.error.message,
      request_id: e.error.request_id,
    })
  } else if (e instanceof Error) {
    toast({ type: 'error', message: e.message })
  } else {
    toast({ type: 'error', message: 'An unexpected error occurred' })
  }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    setGlobalToast((msg) => {
      const id = ++_toastId
      setToasts(prev => [...prev, { ...msg, id }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
    })
  }, [])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`rounded-lg shadow-lg p-4 text-white ${
            t.type === 'error' ? 'bg-red-600' :
            t.type === 'success' ? 'bg-green-600' : 'bg-blue-600'
          }`}
        >
          <p className="text-sm font-medium">{t.message}</p>
          {t.request_id && (
            <p className="text-xs mt-1 opacity-75">Request ID: {t.request_id}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── LoadingButton ────────────────────────────────────────────────────────────
export function LoadingButton({
  loading,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      disabled={loading || props.disabled}
      className={`btn-primary relative ${className}`}
      {...props}
    >
      {loading && (
        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 align-middle" />
      )}
      {children}
    </button>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ icon = '📭', title, description }: {
  icon?: string
  title: string
  description?: string
}) {
  return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="font-medium text-gray-500">{title}</p>
      {description && <p className="text-sm mt-1">{description}</p>}
    </div>
  )
}

// ─── Loading spinner ──────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )
}

// ─── HistoryDrawer ────────────────────────────────────────────────────────────
export function HistoryDrawer({
  events,
  onClose,
}: {
  events: Array<{
    id: number
    event_type: string
    old_value: string | null
    new_value: string | null
    actor: string | null
    created_at: string
  }>
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-80 h-full shadow-xl overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Item History</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        {events.length === 0 ? (
          <EmptyState icon="📜" title="No history yet" />
        ) : (
          <ol className="relative border-l border-gray-200 space-y-4 ml-2">
            {events.map(ev => (
              <li key={ev.id} className="ml-4">
                <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-blue-400 border-2 border-white" />
                <p className="text-xs text-gray-500">
                  {new Date(ev.created_at).toLocaleString()}
                  {ev.actor && ` · ${ev.actor}`}
                </p>
                <p className="text-sm font-medium capitalize">{ev.event_type.replace('_', ' ')}</p>
                {ev.old_value && (
                  <p className="text-xs text-gray-400">
                    {ev.old_value} → {ev.new_value}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

// ─── Confirm modal ────────────────────────────────────────────────────────────
export function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
        <p className="text-gray-600 text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} className="btn-danger">Confirm</button>
        </div>
      </div>
    </div>
  )
}

