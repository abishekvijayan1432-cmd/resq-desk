/**
 * Response teams, distance calculation and dispatch ranking.
 *
 * Everything in this module is local: teams are stored in localStorage and
 * distances are computed with the haversine formula from coordinates captured
 * on the device. No map tiles, geocoding API or network request is required.
 */

import { CATEGORY_MAP, createId, getCategory } from './engine'

export const TEAM_STORAGE_KEY = 'resq-desk.teams.v1'

export const TEAM_STATUS_STYLES = {
  available: {
    chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
    dot: 'bg-emerald-400',
    label: 'Available',
  },
  busy: {
    chip: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    dot: 'bg-amber-400',
    label: 'On assignment',
  },
  offline: {
    chip: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
    dot: 'bg-slate-400',
    label: 'Off duty',
  },
}

/** Demo teams, clustered around the demo city (Kochi, Kerala). */
export const DEMO_TEAMS = [
  {
    id: 'team-fire-01',
    code: 'FIRE-01',
    name: 'Fire & Rescue — Central',
    category: 'fire',
    base: 'Central Fire Station, MG Road',
    lat: 9.986,
    lng: 76.281,
    phone: '112',
    available: true,
  },
  {
    id: 'team-fire-02',
    code: 'FIRE-02',
    name: 'Fire & Rescue — North',
    category: 'fire',
    base: 'North Industrial Fire Post, Sector 12',
    lat: 10.0105,
    lng: 76.3055,
    phone: '112',
    available: true,
  },
  {
    id: 'team-med-01',
    code: 'MED-01',
    name: 'Medical — City Hospital',
    category: 'medical',
    base: 'City Hospital, 4th Street',
    lat: 9.972,
    lng: 76.289,
    phone: '108',
    available: false,
  },
  {
    id: 'team-med-02',
    code: 'MED-02',
    name: 'Medical — Rapid Response',
    category: 'medical',
    base: 'Rapid Response Depot, Riverside',
    lat: 9.955,
    lng: 76.27,
    phone: '108',
    available: true,
  },
  {
    id: 'team-pol-01',
    code: 'POL-01',
    name: 'Traffic & Police — East',
    category: 'road',
    base: 'East Traffic Control, Highway 21',
    lat: 10.009,
    lng: 76.322,
    phone: '100',
    available: false,
  },
  {
    id: 'team-res-01',
    code: 'RES-01',
    name: 'Search & Rescue — Collapse Unit',
    category: 'collapse',
    base: 'Civil Defence Yard, Old Town',
    lat: 9.976,
    lng: 76.262,
    phone: '112',
    available: false,
  },
  {
    id: 'team-flood-01',
    code: 'FLD-01',
    name: 'Flood Response — River Team',
    category: 'flood',
    base: 'River Patrol Jetty, Krishna Bridge',
    lat: 9.952,
    lng: 76.245,
    phone: '112',
    available: false,
  },
  {
    id: 'team-gen-01',
    code: 'GEN-01',
    name: 'Civil Defence — General',
    category: 'other',
    base: 'District Control Centre, Green Park',
    lat: 9.94,
    lng: 76.3,
    phone: '1077',
    available: true,
  },
]

export function createDemoTeams() {
  return DEMO_TEAMS.map((team) => ({
    ...team,
    assignedIncidentId: null,
    createdAt: new Date().toISOString(),
    source: 'demo',
  }))
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

export function hasCoords(point) {
  return (
    point &&
    Number.isFinite(Number(point.lat)) &&
    Number.isFinite(Number(point.lng)) &&
    Math.abs(Number(point.lat)) <= 90 &&
    Math.abs(Number(point.lng)) <= 180
  )
}

/** Great-circle distance in kilometres. Returns null when coordinates are missing. */
export function haversineKm(a, b) {
  if (!hasCoords(a) || !hasCoords(b)) return null
  const toRad = (degrees) => (degrees * Math.PI) / 180
  const lat1 = Number(a.lat)
  const lng1 = Number(a.lng)
  const lat2 = Number(b.lat)
  const lng2 = Number(b.lng)
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function formatDistance(km) {
  if (km == null || !Number.isFinite(km)) return 'Distance unavailable'
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`
  return `${km.toFixed(km < 10 ? 1 : 0)} km`
}

/** Rough urban ETA: 30 km/h average + 2 minutes mobilisation. */
export function etaMinutes(km) {
  if (km == null || !Number.isFinite(km)) return null
  return Math.max(2, Math.round((km / 30) * 60) + 2)
}

export function formatEta(km) {
  const minutes = etaMinutes(km)
  return minutes == null ? 'ETA unknown' : `~${minutes} min`
}

export function teamDistanceToIncident(team, incident) {
  return haversineKm(team, incident)
}

/**
 * Rank available teams for an incident.
 * Suitable category matches come first, then nearest, then generalist units.
 */
export function rankTeamsForIncident(teams, incident) {
  return teams
    .filter((team) => team.available && !team.assignedIncidentId)
    .map((team) => {
      const distance = teamDistanceToIncident(team, incident)
      const matched = team.category === incident.category
      const generalist = team.category === 'other'
      return { ...team, distance, matched, generalist }
    })
    .sort((a, b) => {
      if (a.matched !== b.matched) return a.matched ? -1 : 1
      if (a.distance == null && b.distance != null) return 1
      if (a.distance != null && b.distance == null) return -1
      if (a.distance != null && b.distance != null && a.distance !== b.distance) {
        return a.distance - b.distance
      }
      return a.name.localeCompare(b.name)
    })
}

export function bestTeamForIncident(teams, incident) {
  return rankTeamsForIncident(teams, incident)[0] || null
}

export function teamStatus(team) {
  if (team.assignedIncidentId) return 'busy'
  if (team.available) return 'available'
  return 'offline'
}

/* -------------------------------------------------------------------------- */
/* Team CRUD                                                                  */
/* -------------------------------------------------------------------------- */

export function nextTeamCode(teams, category) {
  const prefix = (CATEGORY_MAP[category]?.short || 'TEAM')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 4)
    .toUpperCase()
  let index = teams.filter((team) => team.category === category).length + 1
  let code = `${prefix}-${String(index).padStart(2, '0')}`
  const existing = new Set(teams.map((team) => team.code))
  while (existing.has(code)) {
    index += 1
    code = `${prefix}-${String(index).padStart(2, '0')}`
  }
  return code
}

export function buildTeam(values, teams = []) {
  return {
    id: createId(),
    code: String(values.code || '').trim() || nextTeamCode(teams, values.category),
    name: String(values.name || '').trim(),
    category: values.category || 'other',
    base: String(values.base || '').trim(),
    lat: Number(values.lat),
    lng: Number(values.lng),
    phone: String(values.phone || '').trim(),
    available: values.available !== false,
    assignedIncidentId: null,
    createdAt: new Date().toISOString(),
    source: 'custom',
  }
}

export function validateTeam(values, teams = [], editingId = null) {
  const errors = {}
  if (!values.name?.trim()) errors.name = 'Team name is required.'
  else if (values.name.trim().length < 3) errors.name = 'Use at least 3 characters.'
  if (!values.category) errors.category = 'Choose a response category.'
  if (values.lat === '' || values.lat == null || Number.isNaN(Number(values.lat))) {
    errors.lat = 'Latitude is required.'
  } else if (Math.abs(Number(values.lat)) > 90) {
    errors.lat = 'Latitude must be between -90 and 90.'
  }
  if (values.lng === '' || values.lng == null || Number.isNaN(Number(values.lng))) {
    errors.lng = 'Longitude is required.'
  } else if (Math.abs(Number(values.lng)) > 180) {
    errors.lng = 'Longitude must be between -180 and 180.'
  }
  if (values.code?.trim()) {
    const duplicate = teams.find(
      (team) =>
        team.id !== editingId &&
        team.code.toLowerCase() === values.code.trim().toLowerCase(),
    )
    if (duplicate) errors.code = `Team code ${duplicate.code} is already used.`
  }
  if (values.phone?.trim() && !/^[+()\-\d\s]{3,20}$/.test(values.phone.trim())) {
    errors.phone = 'Enter a valid phone number.'
  }
  return errors
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

export function normalizeStoredTeam(team) {
  if (!team || typeof team !== 'object' || !team.name) return null
  return {
    ...team,
    id: team.id || createId(),
    code: team.code || nextTeamCode([], team.category || 'other'),
    category: CATEGORY_MAP[team.category] ? team.category : 'other',
    lat: Number(team.lat),
    lng: Number(team.lng),
    phone: String(team.phone || ''),
    available: team.available !== false,
    assignedIncidentId: team.assignedIncidentId || null,
    createdAt: team.createdAt || new Date().toISOString(),
  }
}

export function loadTeams() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(TEAM_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeStoredTeam).filter(Boolean)
  } catch (error) {
    console.error('ResQ Desk: could not read saved teams', error)
    return []
  }
}

export function saveTeams(teams) {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teams))
    return true
  } catch (error) {
    console.error('ResQ Desk: could not save teams', error)
    return false
  }
}

/**
 * Make stored team availability agree with incident assignments. Teams marked
 * available are kept available; teams with an unresolved assignment become busy.
 */
export function reconcileTeams(teams, incidents) {
  return teams.map((team) => {
    const active = incidents.find(
      (incident) =>
        incident.assignedTeamId === team.id &&
        incident.status !== 'Resolved' &&
        !incident.mergedInto,
    )
    if (active) {
      return { ...team, available: false, assignedIncidentId: active.id }
    }
    if (team.assignedIncidentId) {
      const stillAssigned = incidents.find(
        (incident) => incident.id === team.assignedIncidentId && incident.status !== 'Resolved',
      )
      if (!stillAssigned) return { ...team, assignedIncidentId: null, available: true }
    }
    return team
  })
}

export function teamSummary(teams) {
  return teams.reduce(
    (totals, team) => {
      totals.total += 1
      if (team.assignedIncidentId) totals.busy += 1
      else if (team.available) totals.available += 1
      else totals.offDuty += 1
      return totals
    },
    { total: 0, available: 0, busy: 0, offDuty: 0 },
  )
}

export function categoryTeamLabel(id) {
  return getCategory(id).short
}
