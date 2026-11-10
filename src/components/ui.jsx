import { useEffect, useRef, useState } from 'react'
import {
  CATEGORY_MAP,
  SEVERITY_LEVELS,
  formatDateTime,
  getCategory,
  timeAgo,
} from '../lib/engine'

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

const ICON_PATHS = {
  flame: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  car: (
    <>
      <path d="M5 17H3v-4l2-1 1.5-3.2A2 2 0 0 1 8.3 7.5h7.4a2 2 0 0 1 1.8 1.3L19 12l2 1v4h-2" />
      <path d="M9 17h6" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  medical: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
  flood: (
    <>
      <path d="M2 7c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2" />
      <path d="M2 12c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2" />
      <path d="M2 17c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M16 9h2a2 2 0 0 1 2 2v10" />
      <path d="M2 21h20M8 7h2M8 11h2M8 15h2" />
    </>
  ),
  alertTriangle: (
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  monitor: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  navigation: <path d="m3 11 19-9-9 19-2-8-8-2z" />,
  route: (
    <>
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="5" r="3" />
      <path d="M9 19h5a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h5" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
    </>
  ),
  userPlus: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
    </>
  ),
  volume: (
    <>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  mapPin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  merge: (
    <>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
      <path d="M19 3v4M17 5h4" />
    </>
  ),
  activity: (
    <path d="M22 12h-4l-3 8L9 4l-3 8H2" />
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  alertCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
  chevronRight: <path d="m9 18 6-6-6-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
}

export function Icon({ name, className = 'size-5', strokeWidth = 1.8 }) {
  const paths = ICON_PATHS[name] || ICON_PATHS.info
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  )
}

export function CategoryIcon({ category, className = 'size-5' }) {
  const cat = getCategory(category)
  return <Icon name={cat.icon} className={className} />
}

export function Logo({ className = 'size-9' }) {
  return (
    <span className={`grid place-items-center rounded-xl bg-red-600 text-white shadow-lg shadow-red-950/50 ring-1 ring-white/20 ${className}`}>
      <Icon name="medical" className="size-5" strokeWidth={2.2} />
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Colour maps                                                                */
/* -------------------------------------------------------------------------- */

export const SEVERITY_STYLES = {
  Low: {
    chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    border: 'border-l-emerald-400',
    hex: '#34d399',
  },
  Medium: {
    chip: 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300',
    dot: 'bg-yellow-400',
    text: 'text-yellow-300',
    border: 'border-l-yellow-400',
    hex: '#facc15',
  },
  High: {
    chip: 'border-orange-400/40 bg-orange-400/10 text-orange-300',
    dot: 'bg-orange-400',
    text: 'text-orange-300',
    border: 'border-l-orange-400',
    hex: '#fb923c',
  },
  Critical: {
    chip: 'border-red-400/50 bg-red-500/15 text-red-300',
    dot: 'bg-red-500',
    text: 'text-red-400',
    border: 'border-l-red-500',
    hex: '#ef4444',
  },
}

export const STATUS_STYLES = {
  Reported: { chip: 'border-slate-400/40 bg-slate-400/10 text-slate-300', dot: 'bg-slate-400', hex: '#94a3b8' },
  Assigned: { chip: 'border-violet-400/40 bg-violet-500/10 text-violet-200', dot: 'bg-violet-400', hex: '#a78bfa' },
  Pending: { chip: 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300', dot: 'bg-yellow-400', hex: '#facc15' },
  'In Progress': { chip: 'border-sky-400/40 bg-sky-400/10 text-sky-300', dot: 'bg-sky-400', hex: '#38bdf8' },
  Resolved: { chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', dot: 'bg-emerald-400', hex: '#34d399' },
}

export const CATEGORY_TINTS = {
  fire: 'border-orange-400/30 bg-orange-400/10 text-orange-300',
  road: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  medical: 'border-pink-400/30 bg-pink-400/10 text-pink-300',
  flood: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  collapse: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  other: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
}

export const CATEGORY_HEX = {
  fire: '#f97316',
  road: '#38bdf8',
  medical: '#f472b6',
  flood: '#22d3ee',
  collapse: '#a78bfa',
  other: '#94a3b8',
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                     */
/* -------------------------------------------------------------------------- */

export function SeverityBadge({ level, baseLevel }) {
  const style = SEVERITY_STYLES[level] || SEVERITY_STYLES.Low
  return (
    <span className={`chip ${style.chip}`}>
      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {level}
      {baseLevel && baseLevel !== level && (
        <span className="font-medium opacity-70">↑ from {baseLevel}</span>
      )}
    </span>
  )
}

export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.Reported
  return (
    <span className={`chip ${style.chip}`}>
      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {status}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

export function Modal({ onClose, ariaLabel, children }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-navy-950/85 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative flex min-h-full items-end justify-center sm:items-center sm:p-6">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          className="modal-in relative w-full rounded-t-3xl border border-white/10 bg-navy-850 shadow-2xl shadow-black/60 outline-none sm:max-w-3xl sm:rounded-2xl"
        >
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost absolute top-3 right-3 z-10 !rounded-full !p-2 text-slate-400 hover:text-white"
            aria-label="Close dialog"
          >
            <Icon name="x" className="size-5" />
          </button>
          <div className="max-h-[92vh] overflow-y-auto p-5 sm:p-6">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} ariaLabel={title}>
      <div className="sm:max-w-md">
        <div className="flex items-start gap-3 pr-8">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-red-400/30 bg-red-500/10 text-red-300">
            <Icon name="alertTriangle" className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

export function ToastStack({ toasts, onDismiss }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-stretch gap-2 sm:right-5 sm:bottom-5 sm:left-auto sm:w-96"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-in pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${
            toast.tone === 'error'
              ? 'border-red-400/40 bg-red-950/90 text-red-100'
              : 'border-emerald-400/30 bg-[#07182a]/95 text-slate-100'
          }`}
        >
          <Icon
            name={toast.tone === 'error' ? 'alertCircle' : 'checkCircle'}
            className={`mt-0.5 size-4 shrink-0 ${toast.tone === 'error' ? 'text-red-300' : 'text-emerald-300'}`}
          />
          <p className="flex-1 leading-snug">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="rounded p-0.5 text-slate-400 hover:text-white"
            aria-label="Dismiss notification"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* -------------------------------------------------------------------------- */

export function StatusTimeline({ history, newestFirst = true }) {
  const now = Date.now()
  const entries = [...(history || [])].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  )
  const ordered = newestFirst ? entries : entries.reverse()

  if (!ordered.length) {
    return <p className="text-sm text-slate-400">No status history yet.</p>
  }

  return (
    <ol className="relative space-y-4 border-l border-white/10 pl-5">
      {ordered.map((entry, index) => {
        const style = STATUS_STYLES[entry.status] || STATUS_STYLES.Reported
        return (
          <li key={`${entry.at}-${index}`} className="relative">
            <span
              className={`absolute top-1 -left-[27px] size-3 rounded-full ring-4 ring-navy-850 ${style.dot}`}
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <StatusBadge status={entry.status} />
              <time className="text-xs text-slate-400" dateTime={entry.at}>
                {formatDateTime(entry.at)}
              </time>
              <span className="text-xs text-slate-500">· {timeAgo(entry.at, now)}</span>
            </div>
            {entry.note && <p className="mt-1 text-sm leading-relaxed text-slate-300">{entry.note}</p>}
          </li>
        )
      })}
    </ol>
  )
}

/* -------------------------------------------------------------------------- */
/* Severity breakdown                                                         */
/* -------------------------------------------------------------------------- */

export function SeverityBreakdown({ incident, escalation, priority }) {
  const level = escalation?.level || incident.level
  const style = SEVERITY_STYLES[level] || SEVERITY_STYLES.Low
  const reasons = Array.isArray(incident.reasons) ? incident.reasons : []

  return (
    <section className="rounded-xl border border-white/10 bg-navy-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="section-title text-sm">Why is this {level}?</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Transparent rule-based score — every point is listed.
          </p>
        </div>
        <div className="text-right">
          <p className={`font-display text-2xl font-bold ${style.text}`}>{incident.score}</p>
          <p className="text-[11px] tracking-wide text-slate-500 uppercase">Score / 100</p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-white/10 rounded-lg border border-white/10 bg-navy-950/40">
        {reasons.map((reason, index) => (
          <li
            key={`${reason.label}-${index}`}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span className="text-slate-300">{reason.label}</span>
            <span className={`font-mono text-xs font-semibold ${style.text}`}>+{reason.points}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm font-semibold">
          <span className="text-slate-200">Total score</span>
          <span className="font-mono text-xs text-white">{incident.score}</span>
        </li>
      </ul>

      {incident.capped && (
        <p className="mt-2 text-xs text-slate-400">Keyword points are capped at 40.</p>
      )}

      {priority && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-3 text-slate-400">
            <span>Severity score</span>
            <span className="font-mono text-slate-200">{incident.score}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-slate-400">
            <span>Time since reporting</span>
            <span className="font-mono text-slate-200">+{priority.agePoints}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-white/10 pt-1 font-semibold text-slate-200">
            <span>Dispatch priority</span>
            <span className={`font-mono ${style.text}`}>{priority.index}</span>
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-4 gap-1" aria-hidden="true">
        {SEVERITY_LEVELS.map((tier) => (
          <div
            key={tier}
            className={`h-1.5 rounded-full ${tier === level ? SEVERITY_STYLES[tier].dot : 'bg-white/10'}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
        <span>Low 0–29</span>
        <span>Medium 30–49</span>
        <span>High 50–74</span>
        <span>Critical 75+</span>
      </div>

      {escalation?.escalated && (
        <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-200">
          <strong className="font-semibold">Auto-escalated:</strong> base severity was{' '}
          {escalation.baseLevel} ({incident.score} pts) and the incident stayed unattended for{' '}
          {escalation.minutes} min. Shown as <strong>{escalation.level}</strong> (+
          {escalation.steps} level{escalation.steps === 1 ? '' : 's'}, capped at Critical).
        </div>
      )}

      {escalation?.unattended && !escalation.escalated && (
        <p className="mt-3 text-xs text-slate-400">
          Unattended for {escalation.minutes} min — already at the maximum displayed severity.
        </p>
      )}
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Small building blocks                                                      */
/* -------------------------------------------------------------------------- */

export function StatCard({ label, value, hint, icon, accent = 'sky' }) {
  const accents = {
    sky: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
    red: 'border-red-400/30 bg-red-500/10 text-red-300',
    yellow: 'border-yellow-400/25 bg-yellow-400/10 text-yellow-300',
    emerald: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
    violet: 'border-violet-400/25 bg-violet-500/10 text-violet-300',
    slate: 'border-slate-400/25 bg-slate-400/10 text-slate-300',
  }
  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</p>
        <span className={`grid size-9 place-items-center rounded-lg border ${accents[accent]}`}>
          <Icon name={icon} className="size-4" />
        </span>
      </div>
      <p className="mt-2 font-display text-3xl font-bold text-white tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export function EmptyState({ icon = 'shield', title, message, action }) {
  return (
    <div className="panel flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/5 text-slate-300">
        <Icon name={icon} className="size-6" />
      </span>
      <h3 className="mt-4 font-display text-base font-semibold text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-400">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function EscalationChip({ escalation }) {
  if (!escalation?.active) return null
  if (!escalation.unattended) return null
  return (
    <span
      className={`chip ${
        escalation.escalated
          ? 'border-red-400/40 bg-red-500/10 text-red-200'
          : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
      }`}
      title="Unattended reported incidents rise one level per 10 minutes after the first 10 minutes."
    >
      <Icon name="clock" className="size-3.5" />
      {escalation.escalated
        ? `Escalated: unattended for ${escalation.minutes} min`
        : `Unattended for ${escalation.minutes} min`}
    </span>
  )
}

export function useNow(interval = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}

export function categoryLabel(id) {
  return (CATEGORY_MAP[id] || getCategory(id)).label
}
