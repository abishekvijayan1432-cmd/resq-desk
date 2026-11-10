import { useEffect, useMemo, useState } from 'react'
import {
  comparePriority,
  formatDuration,
  getCategory,
  getEscalation,
  getPriority,
  timeAgo,
} from '../lib/engine'
import { teamSummary } from '../lib/teams'
import {
  CATEGORY_TINTS,
  CategoryIcon,
  ConfirmDialog,
  EmptyState,
  EscalationChip,
  Icon,
  SEVERITY_STYLES,
  SeverityBadge,
  StatCard,
  StatusBadge,
  useNow,
} from '../components/ui'
import CategoryChart from '../components/CategoryChart'
import TeamChart from '../components/TeamChart'
import IncidentModal from '../components/IncidentModal'

const FILTERS = ['All', 'Reported', 'Assigned', 'In Progress', 'Resolved']

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value) && value >= 0)
  if (!usable.length) return null
  return Math.round(usable.reduce((total, value) => total + value, 0) / usable.length)
}

export default function ControlRoomPage({
  incidents,
  teams,
  onUpdateStatus,
  onDelete,
  onMerge,
  onAnalyze,
  onAssign,
  onUnassign,
  onLoadDemo,
  onClearAll,
  onOpenTeams,
  onOpenMap,
  initialSelectedId,
  onClearFocus,
}) {
  const now = useNow(30000)
  const [filter, setFilter] = useState('All')
  const [selectedId, setSelectedId] = useState(initialSelectedId || null)
  const [clearOpen, setClearOpen] = useState(false)

  useEffect(() => {
    if (initialSelectedId) setSelectedId(initialSelectedId)
  }, [initialSelectedId])

  const teamStats = useMemo(() => teamSummary(teams), [teams])

  const stats = useMemo(() => {
    return incidents.reduce(
      (totals, incident) => {
        totals.total += 1
        if (getEscalation(incident, now).level === 'Critical') totals.critical += 1
        if (incident.status === 'Assigned' || incident.status === 'In Progress') totals.assigned += 1
        if (incident.status === 'Resolved') totals.resolved += 1
        return totals
      },
      { total: 0, critical: 0, assigned: 0, resolved: 0 },
    )
  }, [incidents, now])

  const insights = useMemo(() => {
    const dispatchTimes = incidents
      .filter((incident) => incident.assignedAt)
      .map((incident) => (Date.parse(incident.assignedAt) - Date.parse(incident.createdAt)) / 60000)
    const resolutionTimes = incidents
      .filter((incident) => incident.status === 'Resolved')
      .map((incident) => {
        const resolved = [...(incident.history || [])]
          .reverse()
          .find((entry) => entry.status === 'Resolved')
        return resolved ? (Date.parse(resolved.at) - Date.parse(incident.createdAt)) / 60000 : null
      })
    const unassignedCritical = incidents.filter(
      (incident) =>
        incident.status !== 'Resolved' &&
        !incident.assignedTeamId &&
        getEscalation(incident, now).level === 'Critical',
    ).length
    const awaitingDispatch = incidents.filter((incident) => incident.status === 'Reported').length

    return {
      avgDispatch: average(dispatchTimes),
      avgResolution: average(resolutionTimes),
      unassignedCritical,
      awaitingDispatch,
    }
  }, [incidents, now])

  const counts = useMemo(() => {
    const result = { All: incidents.length }
    for (const status of FILTERS.slice(1)) {
      result[status] = incidents.filter((incident) => incident.status === status).length
    }
    return result
  }, [incidents])

  const queue = useMemo(() => {
    const filtered =
      filter === 'All' ? incidents : incidents.filter((incident) => incident.status === filter)
    return [...filtered].sort((a, b) => comparePriority(a, b, now))
  }, [incidents, filter, now])

  const selectedIncident = incidents.find((incident) => incident.id === selectedId) || null
  const duplicateTarget = selectedIncident?.duplicateOf
    ? incidents.find((incident) => incident.trackingId === selectedIncident.duplicateOf)
    : null
  const hasDemo = incidents.some((incident) => incident.source === 'demo')

  useEffect(() => {
    if (selectedId && !incidents.some((incident) => incident.id === selectedId)) setSelectedId(null)
  }, [incidents, selectedId])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-red-400 uppercase">
            Operations · live
          </p>
          <h1 className="mt-1.5 font-display text-2xl font-bold text-white sm:text-3xl">
            Control room
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Prioritised incidents, live team capacity and nearest-unit dispatch — one operational
            picture.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button type="button" className="btn-secondary w-full !px-3 !py-2 text-xs sm:w-auto" onClick={onOpenMap}>
            <Icon name="map" className="size-3.5" />
            Map
          </button>
          <button type="button" className="btn-secondary w-full !px-3 !py-2 text-xs sm:w-auto" onClick={onOpenTeams}>
            <Icon name="users" className="size-3.5" />
            Teams
          </button>
          <button
            type="button"
            className="btn-secondary w-full !px-3 !py-2 text-xs sm:w-auto"
            onClick={onLoadDemo}
            disabled={hasDemo}
            title={hasDemo ? 'Demo data is already loaded' : 'Add 7 incidents and 8 response teams'}
          >
            <Icon name="sparkles" className="size-3.5" />
            {hasDemo ? 'Demo data loaded' : 'Load demo data'}
          </button>
          <button
            type="button"
            className="btn-danger w-full !px-3 !py-2 text-xs sm:w-auto"
            onClick={() => setClearOpen(true)}
            disabled={!incidents.length && !teams.length}
          >
            <Icon name="trash" className="size-3.5" />
            Clear all data
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total incidents" value={stats.total} hint="All reports" icon="activity" accent="sky" />
        <StatCard label="Critical" value={stats.critical} hint="Escalated included" icon="alertTriangle" accent="red" />
        <StatCard label="Available teams" value={teamStats.available} hint={`of ${teamStats.total} on roster`} icon="checkCircle" accent="emerald" />
        <StatCard label="Busy teams" value={teamStats.busy} hint="On assignment" icon="radio" accent="yellow" />
        <StatCard label="Assigned" value={stats.assigned} hint="Active dispatch" icon="route" accent="violet" />
        <StatCard label="Resolved" value={stats.resolved} hint="Response complete" icon="shield" accent="slate" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <CategoryChart incidents={incidents} />
        <TeamChart teams={teams} />
      </div>

      <section className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Operational insights">
        <div className="panel flex items-center gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-red-400/25 bg-red-500/10 text-red-300">
            <Icon name="alertTriangle" className="size-5" />
          </span>
          <div>
            <p className="text-[10px] tracking-wide text-slate-400 uppercase">Critical, unassigned</p>
            <p className="font-display text-xl font-bold text-white tabular-nums">
              {insights.unassignedCritical}
            </p>
            <p className="text-[11px] text-slate-500">{insights.awaitingDispatch} waiting for dispatch</p>
          </div>
        </div>
        <div className="panel flex items-center gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-400/25 bg-sky-400/10 text-sky-300">
            <Icon name="clock" className="size-5" />
          </span>
          <div>
            <p className="text-[10px] tracking-wide text-slate-400 uppercase">Avg time to dispatch</p>
            <p className="font-display text-xl font-bold text-white tabular-nums">
              {insights.avgDispatch == null ? '—' : `${insights.avgDispatch} min`}
            </p>
            <p className="text-[11px] text-slate-500">Report → team assigned</p>
          </div>
        </div>
        <div className="panel flex items-center gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
            <Icon name="checkCircle" className="size-5" />
          </span>
          <div>
            <p className="text-[10px] tracking-wide text-slate-400 uppercase">Avg resolution</p>
            <p className="font-display text-xl font-bold text-white tabular-nums">
              {insights.avgResolution == null
                ? '—'
                : insights.avgResolution >= 60
                  ? `${Math.floor(insights.avgResolution / 60)}h ${insights.avgResolution % 60}m`
                  : `${insights.avgResolution} min`}
            </p>
            <p className="text-[11px] text-slate-500">Closed incidents</p>
          </div>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="priority-queue-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="priority-queue-title" className="font-display text-lg font-semibold text-white">
              Priority queue
            </h2>
            <p className="text-xs text-slate-400">
              Severity level first, then score plus time since reporting, then oldest.
            </p>
          </div>
          <span className="text-xs text-slate-400">{queue.length} shown</span>
        </div>

        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter incidents by status">
          {FILTERS.map((status) => {
            const active = filter === status
            return (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                aria-pressed={active}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'border-white/25 bg-white/15 text-white'
                    : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                {status}
                <span className="ml-1.5 font-mono text-[10px] opacity-70">{counts[status] ?? 0}</span>
              </button>
            )
          })}
        </div>

        {incidents.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon="shield"
              title="No incidents reported yet"
              message="Reports submitted from the Report Emergency page appear here. Load the demo scene to explore dispatch, teams and analytics."
              action={
                <button type="button" className="btn-primary" onClick={onLoadDemo}>
                  <Icon name="sparkles" className="size-4" />
                  Load demo data
                </button>
              }
            />
          </div>
        ) : queue.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon="filter"
              title={`No ${filter.toLowerCase()} incidents`}
              message="Try another status filter to see the rest of the queue."
              action={
                <button type="button" className="btn-secondary" onClick={() => setFilter('All')}>
                  Show all incidents
                </button>
              }
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {queue.map((incident) => {
              const escalation = getEscalation(incident, now)
              const priority = getPriority(incident, now)
              const category = getCategory(incident.category)
              const style = SEVERITY_STYLES[escalation.level]
              const isCritical = escalation.level === 'Critical'
              const team = incident.assignedTeamId
                ? teams.find((item) => item.id === incident.assignedTeamId)
                : null
              return (
                <li key={incident.id}>
                  <article
                    className={`panel border-l-4 p-4 transition hover:border-white/20 sm:p-5 ${style.border} ${
                      isCritical ? 'critical-card' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                        <span className="font-mono tracking-wide">{incident.trackingId}</span>
                        <span aria-hidden="true">·</span>
                        <span>{timeAgo(incident.createdAt, now)}</span>
                        {incident.status !== 'Resolved' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              {formatDuration(escalation.minutes)} in {incident.status}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge level={escalation.level} baseLevel={escalation.baseLevel} />
                        <StatusBadge status={incident.status} />
                      </div>
                    </div>

                    <div className="mt-3 flex items-start gap-3">
                      <span className={`grid size-10 shrink-0 place-items-center rounded-xl border ${CATEGORY_TINTS[category.id]}`}>
                        <CategoryIcon category={category.id} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-base leading-snug font-semibold text-white">
                          {incident.title}
                        </h3>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Icon name="mapPin" className="size-3.5" />
                            {incident.location}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Icon name="users" className="size-3.5" />
                            {incident.peopleAffected} affected
                          </span>
                          <span
                            className="inline-flex items-center gap-1"
                            title="Severity score plus time unattended (max +20)"
                          >
                            <Icon name="activity" className="size-3.5" />
                            Priority {priority.index}
                          </span>
                          {team && (
                            <span className="inline-flex items-center gap-1 text-violet-200">
                              <Icon name="route" className="size-3.5" />
                              {team.code}
                            </span>
                          )}
                        </p>
                        {(escalation.unattended ||
                          incident.duplicateOf ||
                          incident.mergedInto ||
                          incident.aiAnalysis ||
                          !incident.assignedTeamId) && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <EscalationChip escalation={escalation} />
                            {!incident.assignedTeamId && incident.status !== 'Resolved' && (
                              <span className="chip border-sky-400/30 bg-sky-400/10 text-sky-200">
                                <Icon name="navigation" className="size-3" />
                                Unassigned
                              </span>
                            )}
                            {team && (
                              <span className="chip border-violet-400/30 bg-violet-500/10 text-violet-200">
                                <Icon name="users" className="size-3" />
                                {team.name}
                              </span>
                            )}
                            {incident.duplicateOf && !incident.mergedInto && (
                              <span className="chip border-violet-400/30 bg-violet-500/10 text-violet-200">
                                <Icon name="merge" className="size-3" />
                                Possible duplicate of {incident.duplicateOf}
                              </span>
                            )}
                            {incident.mergedInto && (
                              <span className="chip border-violet-400/30 bg-violet-500/10 text-violet-200">
                                Merged into {incident.mergedInto}
                              </span>
                            )}
                            {incident.aiAnalysis && (
                              <span className="chip border-sky-400/30 bg-sky-400/10 text-sky-200">
                                <Icon name="sparkles" className="size-3" />
                                AI: {incident.aiAnalysis.priority}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedId(incident.id)}
                        className="btn-secondary shrink-0 !px-3 !py-1.5 text-xs"
                        aria-label={`Open incident ${incident.trackingId}: ${incident.title}`}
                      >
                        Details
                        <Icon name="chevronRight" className="size-3.5" />
                      </button>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {selectedIncident && (
        <IncidentModal
          incident={selectedIncident}
          escalation={getEscalation(selectedIncident, now)}
          teams={teams}
          duplicateTarget={duplicateTarget}
          onClose={() => {
            setSelectedId(null)
            onClearFocus?.()
          }}
          onUpdateStatus={(status) => onUpdateStatus(selectedIncident.id, status)}
          onAssign={(teamId) => onAssign(selectedIncident.id, teamId)}
          onUnassign={() => onUnassign(selectedIncident.id)}
          onDelete={() => {
            onDelete(selectedIncident.id)
            setSelectedId(null)
          }}
          onMerge={() => {
            if (duplicateTarget) onMerge(selectedIncident.id, duplicateTarget.id)
          }}
          onAnalyze={() => onAnalyze(selectedIncident.id)}
        />
      )}

      {clearOpen && (
        <ConfirmDialog
          title="Clear all data?"
          message="This permanently deletes every incident, status history, tracking ID and response team stored in this browser. It cannot be undone."
          confirmLabel="Delete everything"
          onCancel={() => setClearOpen(false)}
          onConfirm={() => {
            onClearAll()
            setClearOpen(false)
          }}
        />
      )}
    </div>
  )
}
