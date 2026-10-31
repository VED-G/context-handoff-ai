/**
 * Shared reusable UI components for context-handoff-ai frontend.
 */

import React, { useEffect, useState } from 'react'
import { ApiException } from '../api'

// ─── StatusBadge ──────────────────────────────────────────────────────────────
interface StatusStyle {
  bg: string
  text: string
  border: string
  dot: string
}

const STATUS_CONFIG: Record<string, StatusStyle> = {
  // Meeting statuses
  draft: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' },
  scheduled: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-500' },
  held: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-500' },
  closed: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  // Item statuses
  open: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  in_progress: { bg: 'bg-brand-50', text: 'text-brand-700', border: 'border-brand-200', dot: 'bg-brand-500' },
  done: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  dropped: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-400' },
  // Attendance
  invited: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-400' },
  attended: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  missed: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  no_response: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
}

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border} shadow-2xs`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{status.replace('_', ' ')}</span>
    </span>
  )
}

// ─── AiBadge ──────────────────────────────────────────────────────────────────
export function AiBadge({ mode = 'ai' }: { mode?: 'ai' | 'fallback' | string }) {
  if (mode === 'ai') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200/80 text-violet-700 shadow-2xs">
        <span className="text-[10px] text-violet-500">✦</span>
        <span>AI Generated</span>
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"
      title="Generated via deterministic rule-based fallback"
    >
      <span>⚡ Heuristic mode</span>
    </span>
  )
}

// ─── Toast System ─────────────────────────────────────────────────────────────
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
    setGlobalToast(msg => {
      const id = ++_toastId
      setToasts(prev => [...prev, { ...msg, id }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
    })
  }, [])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl p-4 shadow-xl border backdrop-blur-md animate-fade-in-up flex items-start gap-3 ${
            t.type === 'error'
              ? 'bg-rose-900/90 border-rose-700 text-rose-50 shadow-rose-900/20'
              : t.type === 'success'
              ? 'bg-slate-900/90 border-emerald-600/60 text-white shadow-emerald-950/20'
              : 'bg-slate-900/90 border-slate-700 text-white'
          }`}
        >
          <span className="text-base mt-0.5">
            {t.type === 'error' ? '⚠️' : t.type === 'success' ? '✓' : 'ℹ️'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug">{t.message}</p>
            {t.request_id && (
              <p className="text-[11px] mt-1 font-mono text-slate-400 truncate">
                Req ID: {t.request_id}
              </p>
            )}
          </div>
          <button
            onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
            className="text-slate-400 hover:text-white transition-colors text-xs"
          >
            ✕
          </button>
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
        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="card text-center py-12 px-4 border-dashed border-slate-300/80 bg-slate-50/50">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-semibold text-slate-700 text-base">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="relative w-9 h-9">
        <div className="absolute inset-0 rounded-full border-3 border-brand-200 opacity-60"></div>
        <div className="absolute inset-0 rounded-full border-3 border-brand-600 border-t-transparent animate-spin"></div>
      </div>
      <span className="text-xs font-medium text-slate-400">Loading details...</span>
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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-xs animate-fade-in" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto p-6 border-l border-slate-200 animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Item Audit Trail</h3>
            <p className="text-xs text-slate-400">Immutable lifecycle events</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="mt-6">
          {events.length === 0 ? (
            <EmptyState icon="📜" title="No history recorded yet" />
          ) : (
            <ol className="relative border-l-2 border-slate-200 space-y-6 ml-3">
              {events.map(ev => (
                <li key={ev.id} className="ml-5 relative">
                  <span className="absolute -left-[27px] mt-1.5 w-3.5 h-3.5 rounded-full bg-brand-500 border-3 border-white shadow-xs" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200/50">
                      {ev.event_type.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Actor: <span className="font-medium text-slate-700">{ev.actor || 'System'}</span>
                  </p>
                  {(ev.old_value || ev.new_value) && (
                    <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600">
                      {ev.old_value && <span className="line-through text-slate-400 mr-2">{ev.old_value}</span>}
                      <span className="font-semibold text-slate-800">→ {ev.new_value}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    {new Date(ev.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 animate-fade-in-up">
        <h3 className="font-bold text-slate-800 text-base mb-2">{title}</h3>
        <p className="text-slate-600 text-sm mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-2.5 justify-end">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-danger">
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
