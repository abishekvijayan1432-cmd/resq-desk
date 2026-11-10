import { useEffect, useState } from 'react'
import {
  getCategory,
  getEscalation,
  normalizeTrackingId,
  timeAgo,
} from '../lib/engine'
import {
  CategoryIcon,
  EmptyState,
  EscalationChip,
  Icon,
  SEVERITY_STYLES,
  SeverityBadge,
  StatusBadge,
  StatusTimeline,
  useNow,
} from '../components/ui'
import { formatDistance, formatEta, teamDistanceToIncident } from '../lib/teams'

export default function TrackPage({ incidents, teams = [], initialTrackingId }) {
  const [query, setQuery] = useState(initialTrackingId || '')
  const [searched, setSearched] = useState(Boolean(initialTrackingId))
  const now = useNow(20000)

  useEffect(() => {
    if (initialTrackingId) {
      setQuery(initialTrackingId)
      setSearched(true)
    }
  }, [initialTrackingId])

  const normalized = normalizeTrackingId(query)
  const incident = searched ? incidents.find((item) => item.trackingId === normalized) : null
  const escalation = incident ? getEscalation(incident, now) : null
  const assignedTeam = incident?.assignedTeamId
    ? teams.find((team) => team.id === incident.assignedTeamId)
    : null
  const assignedDistance = assignedTeam ? teamDistanceToIncident(assignedTeam, incident) : null
  const recentIds = [...incidents].slice(0, 3).map((item) => item.trackingId)

  function handleSubmit(event) {
    event.preventDefault()
    setSearched(true)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-sky-400 uppercase">Public tracking</p>
        <h1 className="mt-1.5 font-display text-2xl font-bold text-white sm:text-3xl">Track a report</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-slate-400">
          Enter the tracking ID you received to see live status and the full response timeline.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="panel mt-6 p-4 sm:p-5" role="search">
        <label htmlFor="tracking-id" className="field-label">
          Tracking ID
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
            />
            <input
              id="tracking-id"
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setSearched(false)
              }}
              placeholder="INC-2026-0001"
              autoComplete="off"
              spellCheck="false"
              className="field-input pl-9 font-mono tracking-wide uppercase"
              aria-describedby="tracking-help"
            />
          </div>
          <button type="submit" className="btn-primary sm:w-auto">
            <Icon name="search" className="size-4" />
            Track report
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p id="tracking-help" className="text-[11px] text-slate-500">
            Format: INC-YYYY-0000. Case-insensitive.
          </p>
          {recentIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500">Recent:</span>
              {recentIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setQuery(id)
                    setSearched(true)
                  }}
                  className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-white/10"
                >
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>
      </form>

      {!searched && (
        <div className="mt-5">
          <EmptyState
            icon="search"
            title="Your report status will appear here"
            message="Use the tracking ID shown after submitting a report. This page refreshes automatically every 20 seconds."
          />
        </div>
      )}

      {searched && !incident && (
        <div className="mt-5">
          <div role="alert" className="panel border-red-400/30 p-5 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-xl border border-red-400/30 bg-red-500/10 text-red-300">
              <Icon name="alertCircle" className="size-5" />
            </span>
            <h2 className="mt-3 font-display text-base font-semibold text-white">No report found</h2>
            <p className="mt-1 text-sm text-slate-400">
              We could not find a report with that ID. Check the format and try again — IDs look like
              INC-2026-0001.
            </p>
          </div>
        </div>
      )}

      {incident && escalation && (
        <article className="panel mt-5 overflow-hidden" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 bg-white/[0.03] p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs tracking-wider text-slate-400">{incident.trackingId}</span>
                {incident.mergedInto && (
                  <span className="chip border-violet-400/30 bg-violet-500/10 text-violet-200">
                    Merged into {incident.mergedInto}
                  </span>
                )}
              </div>
              <h2 className="mt-1 font-display text-xl font-bold text-white">{incident.title}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="mapPin" className="size-3.5" />
                  {incident.location}
                </span>
                <span>Reported {timeAgo(incident.createdAt, now)}</span>
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <StatusBadge status={incident.status} />
              <SeverityBadge level={escalation.level} baseLevel={escalation.baseLevel} />
            </div>
          </div>

          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className={`grid size-9 place-items-center rounded-lg border ${SEVERITY_STYLES[escalation.level].chip}`}>
                  <CategoryIcon category={incident.category} className="size-4" />
                </span>
                <div>
                  <p className="text-[10px] tracking-wide text-slate-500 uppercase">Category</p>
                  <p className="text-sm font-medium text-slate-200">{getCategory(incident.category).label}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] tracking-wide text-slate-500 uppercase">Description</p>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-300">{incident.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-navy-950/40 p-3">
                <div>
                  <p className="text-[10px] tracking-wide text-slate-500 uppercase">People affected</p>
                  <p className="text-sm font-medium text-slate-200">{incident.peopleAffected}</p>
                </div>
                <div>
                  <p className="text-[10px] tracking-wide text-slate-500 uppercase">Responder</p>
                  <p className="text-sm font-medium text-slate-200">
                    {assignedTeam?.name ||
                      incident.aiAnalysis?.responder ||
                      getCategory(incident.category).responder}
                  </p>
                </div>
              </div>

              {assignedTeam && (
                <div className="rounded-lg border border-violet-400/25 bg-violet-500/[0.07] p-3">
                  <p className="flex items-center gap-1.5 text-[10px] tracking-wide text-violet-300 uppercase">
                    <Icon name="route" className="size-3.5" />
                    Team dispatched
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">{assignedTeam.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {assignedTeam.code} · {formatDistance(assignedDistance)} away ·{' '}
                    {formatEta(assignedDistance)}
                  </p>
                  <a
                    href={`tel:${assignedTeam.phone || '112'}`}
                    className="btn-secondary mt-2 !px-2.5 !py-1.5 text-xs"
                  >
                    <Icon name="phone" className="size-3.5" />
                    Call response team
                  </a>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <EscalationChip escalation={escalation} />
              </div>
              {incident.duplicateOf && !incident.mergedInto && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
                  <Icon name="merge" className="mt-0.5 size-3.5 shrink-0" />
                  Possible duplicate of {incident.duplicateOf}. Control room will merge if needed.
                </p>
              )}
            </div>

            <div>
              <h3 className="section-title mb-3 text-sm">Status timeline</h3>
              <StatusTimeline history={incident.history} newestFirst />
              <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="live-dot size-1.5 rounded-full bg-emerald-400" />
                Updates automatically — no need to refresh.
              </p>
            </div>
          </div>
        </article>
      )}
    </div>
  )
}
