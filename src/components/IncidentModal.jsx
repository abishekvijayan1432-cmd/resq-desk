import { useState } from 'react'
import {
  STATUSES,
  formatDateTime,
  formatDuration,
  getCategory,
  getPriority,
  timeAgo,
} from '../lib/engine'
import {
  TEAM_STATUS_STYLES,
  formatDistance,
  formatEta,
  rankTeamsForIncident,
  teamDistanceToIncident,
} from '../lib/teams'
import {
  CATEGORY_TINTS,
  CategoryIcon,
  Icon,
  Modal,
  SEVERITY_STYLES,
  SeverityBadge,
  SeverityBreakdown,
  StatusBadge,
  StatusTimeline,
} from './ui'

export default function IncidentModal({
  incident,
  escalation,
  teams = [],
  duplicateTarget,
  onClose,
  onUpdateStatus,
  onAssign,
  onUnassign,
  onDelete,
  onMerge,
  onAnalyze,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const category = getCategory(incident.category)
  const priority = getPriority(incident)
  const assignedTeam = incident.assignedTeamId
    ? teams.find((team) => team.id === incident.assignedTeamId)
    : null
  const assignedDistance = assignedTeam ? teamDistanceToIncident(assignedTeam, incident) : null
  const availableTeams = incident.assignedTeamId ? [] : rankTeamsForIncident(teams, incident).slice(0, 4)
  const assignedStatus = assignedTeam
    ? TEAM_STATUS_STYLES[assignedTeam.available ? 'available' : 'busy']
    : null
  const canMerge =
    Boolean(duplicateTarget) &&
    duplicateTarget.status !== 'Resolved' &&
    !incident.mergedInto &&
    incident.status !== 'Resolved'

  return (
    <Modal onClose={onClose} ariaLabel={`Incident ${incident.trackingId}`}>
      <header className="pr-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs tracking-wider text-slate-400">{incident.trackingId}</span>
          <SeverityBadge level={escalation.level} baseLevel={escalation.baseLevel} />
          <StatusBadge status={incident.status} />
          <span
            className="chip border-white/10 bg-white/5 text-slate-300"
            title="Severity score plus time unattended (max +20)"
          >
            <Icon name="activity" className="size-3" />
            Priority {priority.index}
          </span>
          {incident.mergedInto && (
            <span className="chip border-violet-400/30 bg-violet-500/10 text-violet-200">
              <Icon name="merge" className="size-3" />
              Merged into {incident.mergedInto}
            </span>
          )}
        </div>
        <h2 className="mt-2 font-display text-xl leading-snug font-bold text-white sm:text-2xl">
          {incident.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className={`grid size-5 place-items-center rounded border ${CATEGORY_TINTS[category.id]}`}>
              <CategoryIcon category={category.id} className="size-3" />
            </span>
            {category.label}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="mapPin" className="size-3.5" />
            {incident.location}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" className="size-3.5" />
            Reported {timeAgo(incident.createdAt)}
          </span>
        </div>
      </header>

      {escalation.escalated && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-400/35 bg-red-500/10 px-3.5 py-3 text-xs leading-relaxed text-red-200">
          <Icon name="alertTriangle" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">Escalated: unattended for {escalation.minutes} min.</strong>{' '}
            Base severity {escalation.baseLevel} raised {escalation.steps} level
            {escalation.steps === 1 ? '' : 's'} to {escalation.level}. This incident needs attention
            now.
          </span>
        </div>
      )}

      {escalation.unattended && !escalation.escalated && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-400/35 bg-amber-400/10 px-3.5 py-3 text-xs leading-relaxed text-amber-200">
          <Icon name="clock" className="mt-0.5 size-4 shrink-0" />
          <span>
            Unattended for {escalation.minutes} min. Displayed severity is already Critical, so it
            cannot escalate further.
          </span>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-navy-900/50 p-3.5">
          <p className="text-[10px] font-medium tracking-wide text-slate-500 uppercase">Description</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-200">{incident.description}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-navy-900/50 p-3.5 text-sm">
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">People affected</dt>
            <dd className="mt-0.5 font-medium text-slate-100">{incident.peopleAffected}</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">Contact</dt>
            <dd className="mt-0.5 break-words text-slate-100">{incident.contact || 'Not provided'}</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">Reported</dt>
            <dd className="mt-0.5 text-xs text-slate-200">{formatDateTime(incident.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">In current status</dt>
            <dd className="mt-0.5 text-xs text-slate-200">
              {incident.status === 'Resolved' ? 'Closed' : formatDuration(escalation.minutes)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[10px] tracking-wide text-slate-500 uppercase">Suggested responder</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-slate-100">
              <Icon name="shield" className="size-3.5 text-sky-300" />
              {incident.aiAnalysis?.responder || category.responder}
            </dd>
          </div>
        </dl>
      </div>

      <section
        className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-navy-900/40"
        aria-labelledby="assignment-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg border border-sky-400/25 bg-sky-400/10 text-sky-300">
              <Icon name="route" className="size-3.5" />
            </span>
            <h3 id="assignment-title" className="font-display text-sm font-semibold text-white">
              Response assignment
            </h3>
          </div>
          {assignedTeam ? (
            <span className={`chip ${assignedStatus.chip}`}>
              <span className={`size-1.5 rounded-full ${assignedStatus.dot}`} />
              {assignedTeam.code} · {assignedStatus.label}
            </span>
          ) : (
            <span className="chip border-sky-400/30 bg-sky-400/10 text-sky-200">
              <Icon name="navigation" className="size-3" />
              Needs a team
            </span>
          )}
        </div>

        {assignedTeam ? (
          <div className="p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg border ${CATEGORY_TINTS[assignedTeam.category]}`}>
                  <CategoryIcon category={assignedTeam.category} className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{assignedTeam.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {getCategory(assignedTeam.category).label} ·{' '}
                    {assignedTeam.base || 'Base not set'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-emerald-300">
                  {formatDistance(assignedDistance)}
                </p>
                <p className="text-[11px] text-slate-400">{formatEta(assignedDistance)}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a
                href={`tel:${assignedTeam.phone || '112'}`}
                className="btn-secondary !px-2.5 !py-1.5 text-xs"
              >
                <Icon name="phone" className="size-3.5" />
                Call {assignedTeam.phone || 'unit'}
              </a>
              <button
                type="button"
                className="btn-ghost !px-2.5 !py-1.5 text-xs"
                onClick={onUnassign}
              >
                <Icon name="refresh" className="size-3.5" />
                Release &amp; requeue
              </button>
              {incident.assignedAt && (
                <span className="ml-auto text-[10px] text-slate-500">
                  Dispatched {timeAgo(incident.assignedAt)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3.5">
            <p className="text-[11px] leading-relaxed text-slate-400">
              {Number.isFinite(incident.lat)
                ? 'Available units are ranked by category match and straight-line distance from station to scene.'
                : 'This report has no GPS pin, so units are ranked by category only. Distances appear once a location is pinned.'}
            </p>
            {availableTeams.length > 0 ? (
              <ul className="mt-2 divide-y divide-white/10 rounded-lg border border-white/10">
                {availableTeams.map((team, index) => (
                  <li key={team.id} className="flex flex-wrap items-center gap-2 px-2.5 py-2">
                    <span className={`grid size-7 shrink-0 place-items-center rounded-md border ${CATEGORY_TINTS[team.category]}`}>
                      <CategoryIcon category={team.category} className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-slate-100">
                        {team.name}
                        {index === 0 && (
                          <span className="rounded bg-sky-400/15 px-1 py-0.5 text-[8px] font-bold tracking-wide text-sky-300 uppercase">
                            Best fit
                          </span>
                        )}
                        {!team.matched && (
                          <span className="rounded bg-white/10 px-1 py-0.5 text-[8px] tracking-wide text-slate-400 uppercase">
                            Cross-trained
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {team.code} · {formatDistance(team.distance)} · {formatEta(team.distance)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-primary !px-2.5 !py-1 text-[11px]"
                      onClick={() => onAssign(team.id)}
                    >
                      Assign
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
                No available team for this category. Mark a unit available on the Response Teams page,
                or dispatch the nearest general unit.
              </p>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
              <Icon name="shield" className="size-3" />
              Distance is calculated on this device. Assigning a team updates the lifecycle to
              Assigned.
            </p>
          </div>
        )}
      </section>

      {incident.duplicateOf && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3.5 py-3">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-violet-100">
            <Icon name="merge" className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-semibold">Possible duplicate of {incident.duplicateOf}.</strong>{' '}
              Same category and a similar location within the last 60 minutes.
            </span>
          </p>
          {canMerge ? (
            <button type="button" className="btn-secondary !border-violet-300/30 !bg-violet-500/15 !px-3 !py-1.5 text-xs" onClick={onMerge}>
              <Icon name="merge" className="size-3.5" />
              Merge
            </button>
          ) : (
            <span className="text-[11px] text-violet-300/80">
              {incident.mergedInto ? 'Already merged' : 'Original is resolved'}
            </span>
          )}
        </div>
      )}

      <section className="mt-5 rounded-xl border border-violet-400/25 bg-violet-500/[0.06] p-4" aria-labelledby="incident-ai-title">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg border border-violet-400/30 bg-violet-500/15 text-violet-200">
              <Icon name="sparkles" className="size-4" />
            </span>
            <div>
              <h3 id="incident-ai-title" className="font-display text-sm font-semibold text-white">
                AI scene analysis
              </h3>
              <p className="text-[10px] text-slate-400">On-device triage · advisory only</p>
            </div>
          </div>
          {incident.aiAnalysis ? (
            <button type="button" className="btn-ghost !px-2 !py-1 text-[11px]" onClick={onAnalyze}>
              <Icon name="refresh" className="size-3.5" />
              Re-analyze
            </button>
          ) : (
            <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={onAnalyze}>
              <Icon name="sparkles" className="size-3.5" />
              Analyze scene
            </button>
          )}
        </div>

        {incident.aiAnalysis ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge level={incident.aiAnalysis.priority} />
              <span className="text-xs text-slate-400">
                Suggested responder:{' '}
                <strong className="font-medium text-slate-200">{incident.aiAnalysis.responder}</strong>
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">{incident.aiAnalysis.summary}</p>
            <div>
              <h4 className="text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
                Immediate actions
              </h4>
              <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {incident.aiAnalysis.actions.map((action) => (
                  <li key={action} className="flex items-start gap-2 text-xs leading-snug text-slate-300">
                    <Icon name="check" className="mt-0.5 size-3.5 shrink-0 text-violet-300" />
                    {action}
                  </li>
                ))}
              </ul>
            </div>
            <p className="border-t border-violet-400/20 pt-2 text-[10px] text-slate-500">
              Generated on this device with ResQ offline triage. Human judgement decides dispatch.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Generate a scene analysis for suggested priority, responder and immediate actions. Runs
            offline.
          </p>
        )}
      </section>

      <div className="mt-5">
        <SeverityBreakdown incident={incident} escalation={escalation} priority={priority} />
      </div>

      <section className="mt-5" aria-labelledby="status-controls-title">
        <h3 id="status-controls-title" className="section-title text-sm">
          Update status
        </h3>
        <p className="mt-0.5 text-xs text-slate-400">Every change is added to the history with a timestamp.</p>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STATUSES.map((status) => {
            const active = incident.status === status
            const blocked = status === 'Assigned' && !incident.assignedTeamId
            return (
              <button
                key={status}
                type="button"
                disabled={active || blocked}
                onClick={() => onUpdateStatus(status)}
                aria-pressed={active}
                title={blocked ? 'Assign a response team first' : undefined}
                className={`rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
                  active
                    ? 'cursor-default border-white/25 bg-white/15 text-white'
                    : blocked
                      ? 'cursor-not-allowed border-white/10 bg-white/[0.02] text-slate-500'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/10'
                }`}
              >
                {status}
                {active && <span className="ml-1 text-[10px] font-normal text-slate-400">current</span>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="mt-5" aria-labelledby="history-title">
        <h3 id="history-title" className="section-title mb-3 text-sm">
          Status history
        </h3>
        <StatusTimeline history={incident.history} newestFirst />
      </section>

      <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
        {confirmDelete ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs text-red-200 sm:mr-0">Delete {incident.trackingId} permanently?</span>
            <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary !px-3 !py-1.5 text-xs" onClick={onDelete}>
              <Icon name="trash" className="size-3.5" />
              Confirm delete
            </button>
          </div>
        ) : (
          <button type="button" className="btn-danger !px-3 !py-2 text-xs" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" className="size-3.5" />
            Delete incident
          </button>
        )}
      </div>
    </Modal>
  )
}
