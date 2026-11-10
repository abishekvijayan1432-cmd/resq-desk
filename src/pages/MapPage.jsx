import { useEffect, useMemo, useState } from 'react'
import {
  comparePriority,
  getCategory,
  getEscalation,
  getPriority,
  timeAgo,
} from '../lib/engine'
import {
  bestTeamForIncident,
  formatDistance,
  formatEta,
  haversineKm,
  rankTeamsForIncident,
  TEAM_STATUS_STYLES,
  teamStatus,
} from '../lib/teams'
import {
  CATEGORY_TINTS,
  CategoryIcon,
  EmptyState,
  Icon,
  SEVERITY_STYLES,
  SeverityBadge,
  StatusBadge,
  useNow,
} from '../components/ui'

const WIDTH = 800
const HEIGHT = 520
const PAD_X = 64
const PAD_TOP = 52
const PAD_BOTTOM = 82

const ZONE_LABELS = [
  { name: 'Riverside', lat: 9.9525, lng: 76.2485 },
  { name: 'Highway 21', lat: 10.0215, lng: 76.3325 },
  { name: 'Green Park', lat: 9.9385, lng: 76.3165 },
]

const TEAM_LETTER = {
  fire: 'F',
  road: 'P',
  medical: 'M',
  flood: 'W',
  collapse: 'R',
  other: 'C',
}

function buildProjection(incidents, teams) {
  const points = [
    ...incidents.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)),
    ...teams.filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))),
  ].map((item) => ({ lat: Number(item.lat), lng: Number(item.lng) }))

  if (points.length === 0) return null

  let minLat = Math.min(...points.map((point) => point.lat))
  let maxLat = Math.max(...points.map((point) => point.lat))
  let minLng = Math.min(...points.map((point) => point.lng))
  let maxLng = Math.max(...points.map((point) => point.lng))

  const latPad = Math.max((maxLat - minLat) * 0.12, 0.002)
  const lngPad = Math.max((maxLng - minLng) * 0.12, 0.002)
  minLat -= latPad
  maxLat += latPad
  minLng -= lngPad
  maxLng += lngPad

  const latSpan = maxLat - minLat
  const lngSpan = maxLng - minLng
  const scale = Math.min(
    (WIDTH - PAD_X * 2) / lngSpan,
    (HEIGHT - PAD_TOP - PAD_BOTTOM) / latSpan,
  )
  const offsetX = (WIDTH - lngSpan * scale) / 2
  const offsetY = PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM - latSpan * scale) / 2

  return {
    project: (point) => ({
      x: offsetX + (Number(point.lng) - minLng) * scale,
      y: offsetY + (maxLat - Number(point.lat)) * scale,
    }),
    scale,
    centerLat: (minLat + maxLat) / 2,
  }
}

function routePath(from, to) {
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.max(1, Math.hypot(dx, dy))
  const bend = Math.min(40, length * 0.18)
  const controlX = midX - (dy / length) * bend
  const controlY = midY + (dx / length) * bend
  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`
}

export default function MapPage({ incidents, teams, onAssign, onOpenIncident }) {
  const now = useNow(30000)
  const [showResolved, setShowResolved] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState(null)

  const projection = useMemo(() => buildProjection(incidents, teams), [incidents, teams])
  const mappedIncidents = useMemo(
    () =>
      incidents.filter(
        (incident) => Number.isFinite(incident.lat) && Number.isFinite(incident.lng),
      ),
    [incidents],
  )
  const visibleIncidents = useMemo(
    () => (showResolved ? mappedIncidents : mappedIncidents.filter((item) => item.status !== 'Resolved')),
    [mappedIncidents, showResolved],
  )
  const sortedIncidents = useMemo(
    () => [...visibleIncidents].sort((a, b) => comparePriority(a, b, now)),
    [visibleIncidents, now],
  )

  const [selectedId, setSelectedId] = useState(() => sortedIncidents[0]?.id || null)

  useEffect(() => {
    if (selectedId && !visibleIncidents.some((item) => item.id === selectedId)) {
      setSelectedId(sortedIncidents[0]?.id || null)
    }
    if (!selectedId && sortedIncidents[0]) setSelectedId(sortedIncidents[0].id)
  }, [visibleIncidents, sortedIncidents, selectedId])

  const selected = visibleIncidents.find((item) => item.id === selectedId) || sortedIncidents[0] || null
  const escalation = selected ? getEscalation(selected, now) : null
  const priority = selected ? getPriority(selected, now) : null
  const assignedTeam = selected?.assignedTeamId
    ? teams.find((team) => team.id === selected.assignedTeamId)
    : null
  const suggestedTeam = selected ? bestTeamForIncident(teams, selected) : null
  const routeTeam = assignedTeam || suggestedTeam
  const routeDistance = selected && routeTeam ? haversineKm(routeTeam, selected) : null
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || null
  const selectedTeamIncident = selectedTeam?.assignedIncidentId
    ? incidents.find((incident) => incident.id === selectedTeam.assignedIncidentId)
    : null
  const rankedTeams = selected ? rankTeamsForIncident(teams, selected).slice(0, 4) : []

  if (!projection) {
    return (
      <div>
        <header>
          <p className="text-xs font-semibold tracking-[0.18em] text-sky-300 uppercase">
            Location intelligence
          </p>
          <h1 className="mt-1.5 font-display text-2xl font-bold text-white sm:text-3xl">
            Response map
          </h1>
        </header>
        <div className="mt-5">
          <EmptyState
            icon="map"
            title="No coordinates to map yet"
            message="Pin a location when reporting an incident, or give response teams station coordinates. The map is built entirely on this device and works offline."
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-sky-300 uppercase">
            Location intelligence
          </p>
          <h1 className="mt-1.5 font-display text-2xl font-bold text-white sm:text-3xl">
            Response map
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Incident and team positions, nearest-unit recommendations and route distance — drawn
            from coordinates on this device. No map tiles, no signal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
            <Icon name="shield" className="size-3.5" />
            Offline map
          </span>
          <button
            type="button"
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              showResolved
                ? 'border-white/25 bg-white/15 text-white'
                : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/10'
            }`}
            onClick={() => setShowResolved((value) => !value)}
            aria-pressed={showResolved}
          >
            {showResolved ? 'Showing resolved' : 'Open incidents only'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="panel overflow-hidden" aria-labelledby="map-title">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon name="map" className="size-4 text-sky-300" />
              <h2 id="map-title" className="font-display text-sm font-semibold text-white">
                {selected ? `${getCategory(selected.category).short} incident · sector view` : 'Sector view'}
              </h2>
            </div>
            <p className="text-[10px] tracking-wide text-slate-500 uppercase">
              Schematic streets · real coordinates
            </p>
          </div>

          <div className="relative bg-[#061020]">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="block h-auto w-full"
              role="img"
              aria-label={`Map of ${visibleIncidents.length} incidents and ${teams.length} response teams`}
            >
              <defs>
                <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.07)" strokeWidth="1" />
                </pattern>
                <radialGradient id="map-glow" cx="50%" cy="45%" r="60%">
                  <stop offset="0%" stopColor="#0b2440" />
                  <stop offset="100%" stopColor="#050d19" />
                </radialGradient>
                <filter id="pin-shadow" x="-100%" y="-100%" width="300%" height="300%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.55" />
                </filter>
              </defs>

              <rect width={WIDTH} height={HEIGHT} fill="url(#map-glow)" />
              <rect width={WIDTH} height={HEIGHT} fill="url(#map-grid)" />

              {/* Schematic river + main arterials, purely illustrative. */}
              <path
                d={`M ${WIDTH * 0.07} 0 C ${WIDTH * 0.14} ${HEIGHT * 0.3}, ${WIDTH * 0.02} ${HEIGHT * 0.55}, ${WIDTH * 0.12} ${HEIGHT} L 0 ${HEIGHT} L 0 0 Z`}
                fill="rgba(34,211,238,0.09)"
                stroke="rgba(34,211,238,0.28)"
                strokeWidth="1.5"
              />
              <path d={`M ${WIDTH * 0.2} ${HEIGHT * 0.82} L ${WIDTH * 0.95} ${HEIGHT * 0.18}`} stroke="rgba(148,163,184,0.22)" strokeWidth="10" strokeLinecap="round" />
              <path d={`M ${WIDTH * 0.2} ${HEIGHT * 0.82} L ${WIDTH * 0.95} ${HEIGHT * 0.18}`} stroke="rgba(10,21,38,0.9)" strokeWidth="7" strokeDasharray="14 10" strokeLinecap="round" />
              <path d={`M ${WIDTH * 0.15} ${HEIGHT * 0.35} L ${WIDTH * 0.82} ${HEIGHT * 0.78}`} stroke="rgba(148,163,184,0.12)" strokeWidth="4" />
              <path d={`M ${WIDTH * 0.45} ${HEIGHT * 0.05} L ${WIDTH * 0.52} ${HEIGHT * 0.95}`} stroke="rgba(148,163,184,0.1)" strokeWidth="3" />

              {ZONE_LABELS.map((zone) => {
                const point = projection.project(zone)
                if (point.x < 20 || point.x > WIDTH - 20 || point.y < 20 || point.y > HEIGHT - 20) return null
                return (
                  <text
                    key={zone.name}
                    x={point.x}
                    y={point.y}
                    textAnchor="middle"
                    fill="rgba(148,163,184,0.32)"
                    fontSize="10"
                    letterSpacing="1.6"
                    style={{ textTransform: 'uppercase' }}
                  >
                    {zone.name}
                  </text>
                )
              })}

              {selected && routeTeam && Number.isFinite(routeTeam.lat) && Number.isFinite(routeTeam.lng) && (
                <g>
                  <path
                    d={routePath(projection.project(routeTeam), projection.project(selected))}
                    fill="none"
                    stroke={assignedTeam ? '#34d399' : '#38bdf8'}
                    strokeWidth="2.4"
                    strokeDasharray="7 6"
                    strokeLinecap="round"
                    opacity="0.9"
                  />

                </g>
              )}

              {visibleIncidents.map((incident) => {
                const point = projection.project(incident)
                const level = getEscalation(incident, now).level
                const style = SEVERITY_STYLES[level]
                const active = incident.id === selected?.id
                return (
                  <g
                    key={incident.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${incident.trackingId}, ${level}, ${incident.title}`}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedId(incident.id)
                      setSelectedTeamId(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedId(incident.id)
                        setSelectedTeamId(null)
                      }
                    }}
                  >
                    {level === 'Critical' && (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="17"
                        fill="none"
                        stroke={style.hex}
                        strokeWidth="1.5"
                        opacity="0.55"
                        className="map-pin-pulse"
                      />
                    )}
                    {active && (
                      <circle cx={point.x} cy={point.y} r="15" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.75" />
                    )}
                    <path
                      d={`M ${point.x} ${point.y - 13} c 7 0 11 5 11 11 c 0 8 -11 18 -11 18 c 0 0 -11 -10 -11 -18 c 0 -6 4 -11 11 -11 z`}
                      fill={style.hex}
                      stroke="#050a14"
                      strokeWidth="2"
                      filter="url(#pin-shadow)"
                    />
                    <circle cx={point.x} cy={point.y - 2} r="4" fill="#071021" />
                    {active && (
                      <text
                        x={point.x + 15}
                        y={point.y + 4}
                        fill="#e2e8f0"
                        fontSize="10"
                        fontWeight="600"
                        fontFamily="ui-monospace, monospace"
                      >
                        {incident.trackingId.slice(-4)}
                      </text>
                    )}
                  </g>
                )
              })}

              {teams.map((team) => {
                if (!Number.isFinite(Number(team.lat)) || !Number.isFinite(Number(team.lng))) return null
                const point = projection.project(team)
                const status = teamStatus(team)
                const color = status === 'available' ? '#34d399' : status === 'busy' ? '#fbbf24' : '#64748b'
                const active = team.id === selectedTeamId
                return (
                  <g
                    key={team.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${team.name}, ${TEAM_STATUS_STYLES[status].label}`}
                    className="cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedTeamId(team.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedTeamId(team.id)
                      }
                    }}
                  >
                    <rect
                      x={point.x - 9}
                      y={point.y - 9}
                      width="18"
                      height="18"
                      rx="5"
                      fill="#071528"
                      stroke={color}
                      strokeWidth={active ? 3 : 2}
                    />
                    <text
                      x={point.x}
                      y={point.y + 3.5}
                      textAnchor="middle"
                      fill={color}
                      fontSize="9"
                      fontWeight="700"
                    >
                      {TEAM_LETTER[team.category] || 'T'}
                    </text>
                    {(team.id === routeTeam?.id || active) && (
                      <text
                        x={point.x}
                        y={point.y + 23}
                        textAnchor="middle"
                        fill="rgba(226,232,240,0.85)"
                        fontSize="9"
                        fontWeight="600"
                        fontFamily="ui-monospace, monospace"
                      >
                        {team.code}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Scale bar, derived from the real projection. */}
              {projection && (
                <g transform={`translate(${PAD_X} ${HEIGHT - 26})`}>
                  <path d="M 0 0 h 120" stroke="rgba(226,232,240,0.55)" strokeWidth="2" />
                  <path d="M 0 -4 v 8 M 120 -4 v 8" stroke="rgba(226,232,240,0.55)" strokeWidth="2" />
                  <text x="126" y="4" fill="rgba(148,163,184,0.9)" fontSize="10">
                    {(120 * (111.32 * Math.cos((projection.centerLat * Math.PI) / 180)) / projection.scale).toFixed(1)} km
                  </text>
                </g>
              )}
            </svg>

          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/10 px-4 py-2.5 text-[10px] text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-red-500" /> Incident
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-emerald-400" /> Team available
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-amber-400" /> Team busy
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-t border-dashed border-sky-400" /> Route / distance
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-slate-500">
              <Icon name="shield" className="size-3" /> No tiles needed
            </span>
          </div>

          {selectedTeam && (
            <div className="border-t border-white/10 bg-navy-900/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] tracking-wide text-slate-500 uppercase">Selected unit</p>
                  <p className="mt-0.5 font-display text-sm font-semibold text-white">
                    {selectedTeam.name}{' '}
                    <span className="font-mono text-[11px] font-normal text-slate-400">
                      {selectedTeam.code}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {selectedTeam.base || 'Base not set'} · {formatDistance(haversineKm(selectedTeam, selected))}
                    {selected && <> from this incident</>}
                  </p>
                  {selectedTeamIncident && (
                    <p className="mt-1 text-xs text-violet-200">
                      Assigned to {selectedTeamIncident.trackingId} · {selectedTeamIncident.title}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 text-xs"
                  onClick={() => setSelectedTeamId(null)}
                >
                  <Icon name="x" className="size-3.5" />
                  Clear
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4" aria-label="Dispatch details">
          {selected && escalation && priority ? (
            <section className="panel p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs tracking-wider text-slate-400">
                  {selected.trackingId}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <SeverityBadge level={escalation.level} baseLevel={escalation.baseLevel} />
                  <StatusBadge status={selected.status} />
                </div>
              </div>
              <h2 className="mt-2 font-display text-lg leading-snug font-bold text-white">
                {selected.title}
              </h2>
              <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-400">
                <Icon name="mapPin" className="mt-0.5 size-3.5 shrink-0" />
                {selected.location}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-navy-950/40 p-2.5 text-center">
                <div>
                  <p className="text-[9px] tracking-wide text-slate-500 uppercase">Priority</p>
                  <p className={`mt-0.5 font-display text-base font-bold ${SEVERITY_STYLES[escalation.level].text}`}>
                    {priority.index}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] tracking-wide text-slate-500 uppercase">Age</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-200">
                    {timeAgo(selected.createdAt, now).replace(' ago', '')}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] tracking-wide text-slate-500 uppercase">People</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-200">{selected.peopleAffected}</p>
                </div>
              </div>

              {assignedTeam ? (
                <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] p-3">
                  <p className="flex items-center gap-1.5 text-[10px] tracking-wide text-emerald-300 uppercase">
                    <Icon name="route" className="size-3.5" />
                    Assigned team
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">{assignedTeam.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {assignedTeam.code} · {formatDistance(routeDistance)} · {formatEta(routeDistance)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={`tel:${assignedTeam.phone || '112'}`} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                      <Icon name="phone" className="size-3.5" />
                      Call unit
                    </a>
                    <button
                      type="button"
                      className="btn-ghost !px-2.5 !py-1.5 text-xs"
                      onClick={() => onOpenIncident(selected.id)}
                    >
                      Manage incident
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.07] p-3">
                  <p className="flex items-center gap-1.5 text-[10px] tracking-wide text-sky-300 uppercase">
                    <Icon name="navigation" className="size-3.5" />
                    Nearest suitable team
                  </p>
                  {suggestedTeam ? (
                    <>
                      <p className="mt-1 text-sm font-semibold text-white">{suggestedTeam.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {suggestedTeam.code} · {formatDistance(routeDistance)} · {formatEta(routeDistance)}
                        {!suggestedTeam.matched && ' · cross-trained'}
                      </p>
                      <button
                        type="button"
                        className="btn-primary mt-2 !px-3 !py-1.5 text-xs"
                        onClick={() => onAssign(selected.id, suggestedTeam.id)}
                      >
                        <Icon name="check" className="size-3.5" />
                        Dispatch nearest
                      </button>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      No available teams. Mark a unit available on the Response Teams page.
                    </p>
                  )}
                </div>
              )}

              {rankedTeams.length > 0 && !assignedTeam && (
                <div className="mt-3">
                  <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                    All suitable units
                  </p>
                  <ul className="mt-1.5 divide-y divide-white/10 rounded-lg border border-white/10">
                    {rankedTeams.map((team) => {
                      const isBest = suggestedTeam?.id === team.id
                      return (
                        <li key={team.id} className="flex items-center gap-2 px-2.5 py-2">
                          <span className={`grid size-6 shrink-0 place-items-center rounded border ${CATEGORY_TINTS[team.category]}`}>
                            <CategoryIcon category={team.category} className="size-3" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-slate-200">
                              {team.name}
                              {isBest && (
                                <span className="ml-1.5 rounded bg-sky-400/15 px-1 py-0.5 text-[8px] font-bold tracking-wide text-sky-300 uppercase">
                                  Best
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {formatDistance(team.distance)} · {formatEta(team.distance)}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn-ghost !px-2 !py-1 text-[11px]"
                            onClick={() => onAssign(selected.id, team.id)}
                          >
                            Assign
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                <p className="font-mono text-[10px] text-slate-500">
                  {Number(selected.lat).toFixed(5)}, {Number(selected.lng).toFixed(5)}
                </p>
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 text-[11px]"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${selected.trackingId} · ${selected.lat}, ${selected.lng} · https://maps.google.com/?q=${selected.lat},${selected.lng}`,
                      )
                    } catch {
                      /* clipboard can be unavailable offline */
                    }
                  }}
                >
                  <Icon name="copy" className="size-3" />
                  Copy GPS
                </button>
              </div>
            </section>
          ) : (
            <EmptyState
              icon="map"
              title="No open incidents on the map"
              message="Resolved incidents are hidden by default. Turn on “Showing resolved” to see them."
            />
          )}

          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <h2 className="font-display text-sm font-semibold text-white">Map queue</h2>
              <span className="text-[10px] text-slate-500">
                {sortedIncidents.length} plotted
              </span>
            </div>
            {sortedIncidents.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">No incidents to show.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-white/10 overflow-y-auto">
                {sortedIncidents.map((incident) => {
                  const itemEscalation = getEscalation(incident, now)
                  const active = incident.id === selected?.id
                  return (
                    <li key={incident.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(incident.id)
                          setSelectedTeamId(null)
                        }}
                        aria-pressed={active}
                        className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition ${
                          active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <span
                          className={`mt-1 size-2.5 shrink-0 rounded-full ${SEVERITY_STYLES[itemEscalation.level].dot}`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] text-slate-500">
                              {incident.trackingId}
                            </span>
                            <span className={`text-[10px] font-semibold ${SEVERITY_STYLES[itemEscalation.level].text}`}>
                              {itemEscalation.level}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-medium text-slate-200">
                            {incident.title}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-slate-500">
                            {incident.status} · {timeAgo(incident.createdAt, now)}
                          </span>
                        </span>
                        <Icon name="chevronRight" className="mt-1 size-3.5 shrink-0 text-slate-500" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <p className="px-1 text-[10px] leading-relaxed text-slate-500">
            Distance is great-circle distance from station to scene; route lines are schematic.
            Always confirm access routes by radio.
          </p>
        </aside>
      </div>
    </div>
  )
}
