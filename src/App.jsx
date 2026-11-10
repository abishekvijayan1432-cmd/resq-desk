import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  analyzeScene,
  buildIncident,
  createDemoIncidents,
  getEscalation,
  loadIncidents,
  mergeIncidents,
  saveIncidents,
  setIncidentStatus,
  STORAGE_KEY,
  STATUSES,
} from './lib/engine'
import {
  createDemoTeams,
  formatDistance,
  loadTeams,
  reconcileTeams,
  saveTeams,
  teamDistanceToIncident,
  TEAM_STORAGE_KEY,
} from './lib/teams'
import { Icon, Logo, ToastStack, useNow } from './components/ui'
import SOSSheet from './components/SOSSheet'
import ReportPage from './pages/ReportPage'
import TrackPage from './pages/TrackPage'
import ControlRoomPage from './pages/ControlRoomPage'
import TeamsPage from './pages/TeamsPage'
import MapPage from './pages/MapPage'

const PAGES = ['control', 'report', 'map', 'teams', 'track']

const NAV = [
  { id: 'control', label: 'Control Room', short: 'Control', icon: 'monitor' },
  { id: 'report', label: 'Report Emergency', short: 'Report', icon: 'plus' },
  { id: 'map', label: 'Response Map', short: 'Map', icon: 'map' },
  { id: 'teams', label: 'Response Teams', short: 'Teams', icon: 'users' },
  { id: 'track', label: 'Track a Report', short: 'Track', icon: 'search' },
]

export default function App() {
  const [incidents, setIncidents] = useState(() => loadIncidents())
  const [teams, setTeams] = useState(() => reconcileTeams(loadTeams(), incidents))
  const [page, setPage] = useState(() => {
    if (typeof window === 'undefined') return 'control'
    const requested = new URLSearchParams(window.location.search).get('page')
    return PAGES.includes(requested) ? requested : 'control'
  })
  const [trackingId, setTrackingId] = useState('')
  const [focusIncidentId, setFocusIncidentId] = useState(null)
  const [sosOpen, setSosOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const now = useNow(60000)

  const criticalCount = useMemo(
    () => incidents.filter((incident) => getEscalation(incident, now).level === 'Critical').length,
    [incidents, now],
  )
  const openCount = useMemo(
    () => incidents.filter((incident) => incident.status !== 'Resolved').length,
    [incidents],
  )

  // Persist every change to localStorage.
  useEffect(() => {
    saveIncidents(incidents)
  }, [incidents])

  useEffect(() => {
    saveTeams(teams)
  }, [teams])

  // Keep multiple tabs in sync.
  useEffect(() => {
    function handleStorage(event) {
      if (event.key === STORAGE_KEY) setIncidents(loadIncidents())
      if (event.key === TEAM_STORAGE_KEY) setTeams(loadTeams())
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // Reflect real connectivity in the header.
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Bounded number of toasts; each auto-dismisses.
  const pushToast = useCallback((message, tone = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((previous) => [...previous.slice(-2), { id, message, tone }])
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id))
    }, 4500)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [page])

  function handleCreate(values) {
    const incident = buildIncident(values, incidents)
    setIncidents((previous) => [incident, ...previous])
    pushToast(`Report received. Tracking ID ${incident.trackingId}.`)
    return incident
  }

  function handleAssign(incidentId, teamId) {
    const incident = incidents.find((item) => item.id === incidentId)
    const team = teams.find((item) => item.id === teamId)
    if (!incident || !team) return
    if (!team.available || team.assignedIncidentId) {
      pushToast(`${team.name} is no longer available.`, 'error')
      return
    }

    const at = new Date().toISOString()
    const distance = teamDistanceToIncident(team, incident)
    const becameAssigned = incident.status === 'Reported'
    const nextStatus = becameAssigned ? 'Assigned' : incident.status
    const note = `${team.name} (${team.code}) assigned${
      distance != null ? ` · ${formatDistance(distance)} from scene` : ''
    }.`

    setIncidents((previous) =>
      previous.map((item) => {
        if (item.id !== incidentId) return item
        return {
          ...item,
          status: nextStatus,
          assignedTeamId: team.id,
          assignedAt: at,
          history: [
            ...(item.history || []),
            ...(becameAssigned
              ? [{ status: 'Assigned', at, note }]
              : [{ status: item.status, at, note }]),
          ],
        }
      }),
    )

    setTeams((previous) =>
      previous.map((item) => {
        if (item.id === teamId) {
          return { ...item, available: false, assignedIncidentId: incidentId }
        }
        // Release any team previously attached to this incident.
        if (item.assignedIncidentId === incidentId) {
          return { ...item, assignedIncidentId: null, available: true }
        }
        return item
      }),
    )
    pushToast(`${team.name} assigned to ${incident.trackingId}.`)
  }

  function releaseTeamForIncident(incidentId) {
    setTeams((previous) =>
      previous.map((team) =>
        team.assignedIncidentId === incidentId
          ? { ...team, assignedIncidentId: null, available: true }
          : team,
      ),
    )
  }

  function handleUnassign(incidentId) {
    const incident = incidents.find((item) => item.id === incidentId)
    if (!incident) return
    const at = new Date().toISOString()
    setIncidents((previous) =>
      previous.map((item) =>
        item.id === incidentId
          ? {
              ...item,
              status: item.status === 'Resolved' ? item.status : 'Reported',
              assignedTeamId: null,
              assignedAt: null,
              history: [
                ...(item.history || []),
                {
                  status: item.status === 'Resolved' ? item.status : 'Reported',
                  at,
                  note: 'Response team released; incident returned to the dispatch queue.',
                },
              ],
            }
          : item,
      ),
    )
    releaseTeamForIncident(incidentId)
    pushToast(`${incident.trackingId} is back in the dispatch queue.`)
  }

  function handleUpdateStatus(id, status) {
    const target = incidents.find((incident) => incident.id === id)
    if (!target) return
    if (!STATUSES.includes(status)) return
    if (status === 'Assigned' && !target.assignedTeamId) {
      pushToast('Assign a response team before moving to Assigned.', 'error')
      return
    }

    if (target.status === 'Resolved' && status !== 'Resolved' && status !== 'Reported') {
      pushToast('Reopen the incident as Reported, then assign a team.', 'error')
      return
    }

    let next = setIncidentStatus(target, status)
    if (status === 'Reported') {
      next = { ...next, assignedTeamId: null, assignedAt: null }
    }
    setIncidents((previous) =>
      previous.map((incident) => (incident.id === id ? next : incident)),
    )

    if (target.assignedTeamId && (status === 'Resolved' || status === 'Reported')) {
      releaseTeamForIncident(id)
    }
    pushToast(`${target.trackingId} moved to ${status}.`)
  }

  function handleDelete(id) {
    const target = incidents.find((incident) => incident.id === id)
    setIncidents((previous) => previous.filter((incident) => incident.id !== id))
    releaseTeamForIncident(id)
    pushToast(`${target?.trackingId || 'Incident'} deleted.`)
  }

  function handleMerge(sourceId, targetId) {
    setIncidents((previous) => mergeIncidents(previous, sourceId, targetId))
    releaseTeamForIncident(sourceId)
    pushToast('Duplicate merged into the original report.')
  }

  function handleAnalyze(id) {
    setIncidents((previous) =>
      previous.map((incident) =>
        incident.id === id ? { ...incident, aiAnalysis: analyzeScene(incident) } : incident,
      ),
    )
    pushToast('Scene analysis generated on this device.')
  }

  function handleLoadDemo() {
    const created = createDemoIncidents(incidents)
    if (!created.length) {
      pushToast('Demo incidents are already loaded.', 'error')
      return
    }
    const nextIncidents = [...created, ...incidents]
    setIncidents(nextIncidents)
    setTeams((previous) => {
      const hasDemoTeams = previous.some((team) => team.source === 'demo')
      const merged = hasDemoTeams ? previous : [...previous, ...createDemoTeams()]
      return reconcileTeams(merged, nextIncidents)
    })
    pushToast(`${created.length} demo incidents and response teams loaded.`)
  }

  function handleClearAll() {
    setIncidents([])
    setTeams([])
    pushToast('All incidents and response teams cleared from this browser.')
  }

  function handleAddTeam(team) {
    setTeams((previous) => [...previous, team])
    pushToast(`${team.name} added to the response roster.`)
  }

  function handleUpdateTeam(team) {
    setTeams((previous) => previous.map((item) => (item.id === team.id ? team : item)))
    pushToast(`${team.name} updated.`)
  }

  function handleDeleteTeam(team) {
    if (team.assignedIncidentId) {
      pushToast('Reassign or release this team’s incident before deleting it.', 'error')
      return
    }
    setTeams((previous) => previous.filter((item) => item.id !== team.id))
    pushToast(`${team.name} removed from the roster.`)
  }

  function handleToggleTeam(team) {
    if (team.assignedIncidentId) {
      pushToast('This team is on assignment. Release the incident first.', 'error')
      return
    }
    setTeams((previous) =>
      previous.map((item) =>
        item.id === team.id ? { ...item, available: !item.available } : item,
      ),
    )
    pushToast(`${team.name} marked ${team.available ? 'off duty' : 'available'}.`)
  }

  function openTrack(id) {
    setTrackingId(id || '')
    setPage('track')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only rounded-md bg-sky-500 px-4 py-2 font-semibold text-navy-950 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[70]"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setPage('control')}
            className="flex items-center gap-2.5 self-start rounded-lg pr-1 text-left"
            aria-label="ResQ Desk home — control room"
          >
            <Logo className="size-10" />
            <span>
              <span className="block font-display text-lg leading-tight font-bold tracking-tight text-white">
                ResQ Desk
              </span>
              <span className="block text-[10px] tracking-[0.14em] text-slate-400 uppercase">
                Emergency Response
              </span>
            </span>
          </button>

          <div className="flex items-center gap-3">
            <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
              {NAV.map((item) => {
                const active = page === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPage(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`nav-tab ${active ? 'nav-tab-active' : ''}`}
                  >
                    <Icon name={item.icon} className="size-4" />
                    <span className="hidden lg:inline">{item.label}</span>
                    <span className="lg:hidden">{item.short}</span>
                    {item.id === 'control' && criticalCount > 0 && (
                      <span
                        className="ml-0.5 rounded-full bg-red-500/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white"
                        aria-label={`${criticalCount} critical incidents`}
                      >
                        {criticalCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold tracking-wide sm:px-2.5 ${
                online
                  ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                  : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
              }`}
              title={
                online
                  ? 'Connected. All data still stays on this device.'
                  : 'Offline. Reports, teams and dispatch still work.'
              }
            >
              <span
                className={`size-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400'}`}
              />
              <span className="sm:hidden">{online ? 'Online' : 'Offline'}</span>
              <span className="hidden sm:inline">{online ? 'Online' : 'Offline'} · local-first</span>
            </span>
            <button
              type="button"
              onClick={() => setSosOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500"
              aria-label="Open emergency SOS toolkit"
            >
              <Icon name="phone" className="size-4" />
              SOS
            </button>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-24 sm:py-8 lg:pb-8"
      >
        {page === 'report' && (
          <ReportPage incidents={incidents} onCreate={handleCreate} onTrack={openTrack} />
        )}
        {page === 'track' && (
          <TrackPage incidents={incidents} teams={teams} initialTrackingId={trackingId} />
        )}
        {page === 'control' && (
          <ControlRoomPage
            incidents={incidents}
            teams={teams}
            onUpdateStatus={handleUpdateStatus}
            onDelete={handleDelete}
            onMerge={handleMerge}
            onAnalyze={handleAnalyze}
            onAssign={handleAssign}
            onUnassign={handleUnassign}
            onLoadDemo={handleLoadDemo}
            onClearAll={handleClearAll}
            onOpenTeams={() => setPage('teams')}
            onOpenMap={() => setPage('map')}
            initialSelectedId={focusIncidentId}
            onClearFocus={() => setFocusIncidentId(null)}
          />
        )}
        {page === 'teams' && (
          <TeamsPage
            teams={teams}
            incidents={incidents}
            onAdd={handleAddTeam}
            onUpdate={handleUpdateTeam}
            onDelete={handleDeleteTeam}
            onToggle={handleToggleTeam}
            onOpenMap={() => setPage('map')}
            onLoadDemo={handleLoadDemo}
          />
        )}
        {page === 'map' && (
          <MapPage
            incidents={incidents}
            teams={teams}
            onAssign={handleAssign}
            onOpenIncident={(id) => {
              setFocusIncidentId(id)
              setPage('control')
            }}
          />
        )}
      </main>

      <footer className="mt-auto border-t border-white/10 bg-navy-950/60 pb-20 lg:pb-0">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-[11px] leading-relaxed text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-semibold text-slate-400">ResQ Desk</span> — emergency coordination
            demo. For a life-threatening emergency, call your local emergency number first.
          </p>
          <p className="inline-flex items-center gap-1.5">
            <Icon name="shield" className="size-3.5" />
            Data and dispatch stay on this device · no login
          </p>
        </div>
      </footer>

      {/* Mobile bottom navigation keeps all five operational areas one thumb away. */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="grid grid-cols-5">
          {NAV.map((item) => {
            const active = page === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPage(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition ${
                  active ? 'text-white' : 'text-slate-400 active:text-slate-200'
                }`}
              >
                <span
                  className={`grid size-8 place-items-center rounded-lg ${
                    active ? 'bg-red-500/15 text-red-300' : ''
                  }`}
                >
                  <Icon name={item.icon} className="size-[18px]" />
                </span>
                {item.short}
                {item.id === 'control' && criticalCount > 0 && (
                  <span className="absolute top-1.5 right-[22%] grid size-3.5 place-items-center rounded-full bg-red-500 font-mono text-[8px] font-bold text-white">
                    {criticalCount}
                  </span>
                )}
                {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-red-400" />}
              </button>
            )
          })}
        </div>
      </nav>

      {sosOpen && <SOSSheet onClose={() => setSosOpen(false)} />}

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((previous) => previous.filter((toast) => toast.id !== id))}
      />
    </div>
  )
}
