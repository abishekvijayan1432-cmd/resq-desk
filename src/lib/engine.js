/**
 * ResQ Desk — core logic.
 *
 * Contains the deterministic severity engine (kept in one place so it is easy
 * to explain), auto-escalation, duplicate detection, offline triage assistant,
 * localStorage persistence, demo data and small formatting helpers.
 *
 * No network requests are made anywhere in this app: it works fully offline.
 */

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

export const CATEGORIES = [
  { id: 'fire', label: 'Fire Emergency', short: 'Fire', basePoints: 30, responder: 'Fire Brigade', icon: 'flame' },
  { id: 'road', label: 'Road Accident', short: 'Road Accident', basePoints: 20, responder: 'Ambulance + Traffic Police', icon: 'car' },
  { id: 'medical', label: 'Medical Emergency', short: 'Medical', basePoints: 25, responder: 'Ambulance Service', icon: 'medical' },
  { id: 'flood', label: 'Flood', short: 'Flood', basePoints: 25, responder: 'Flood Rescue Team', icon: 'flood' },
  { id: 'collapse', label: 'Building Collapse', short: 'Collapse', basePoints: 35, responder: 'Search & Rescue Team', icon: 'building' },
  { id: 'other', label: 'Other Emergencies', short: 'Other', basePoints: 10, responder: 'Local Police Control', icon: 'alertTriangle' },
]

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((category) => [category.id, category]))

export function getCategory(id) {
  return CATEGORY_MAP[id] || CATEGORY_MAP.other
}

/* -------------------------------------------------------------------------- */
/* Statuses & severity levels                                                 */
/* -------------------------------------------------------------------------- */

export const STATUSES = ['Reported', 'Assigned', 'In Progress', 'Resolved']
export const SEVERITY_LEVELS = ['Low', 'Medium', 'High', 'Critical']
export const SEVERITY_RANK = { Low: 1, Medium: 2, High: 3, Critical: 4 }

export const ESCALATION_GRACE_MINUTES = 10
export const ESCALATION_STEP_MINUTES = 10
export const DUPLICATE_WINDOW_MINUTES = 60

/* -------------------------------------------------------------------------- */
/* Severity engine                                                            */
/* -------------------------------------------------------------------------- */

/** Points for the number of people affected. */
function peopleTier(value) {
  const count = Math.max(0, Math.floor(Number(value) || 0))
  if (count >= 16) return { points: 30, label: `${count} people affected` }
  if (count >= 6) return { points: 20, label: `${count} people affected` }
  if (count >= 2) return { points: 10, label: `${count} people affected` }
  if (count === 1) return { points: 5, label: '1 person affected' }
  return { points: 0, label: '0 people affected' }
}

/** Keyword groups. A group only scores once, even if several words match. */
const KEYWORD_GROUPS = [
  { terms: ['trapped', 'stuck'], points: 20 },
  { terms: ['unconscious', 'not breathing', 'no pulse'], points: 25 },
  { terms: ['child', 'children', 'baby', 'elderly', 'pregnant'], points: 15 },
  { terms: ['spreading', 'explosion', 'gas leak', 'collapsing'], points: 15 },
  { terms: ['bleeding', 'fracture', 'severe', 'burn'], points: 10 },
  { terms: ['hospital', 'school', 'highway', 'station'], points: 10 },
]

const KEYWORD_CAP = 40

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matcher(term) {
  return new RegExp(`\\b${escapeRegExp(term)}(?:s|es)?\\b`, 'i')
}

/** Score description keywords, capped at 40 points in total. */
export function scoreKeywords(description) {
  const text = String(description || '')
  const matched = []

  for (const group of KEYWORD_GROUPS) {
    const term = group.terms.find((candidate) => matcher(candidate).test(text))
    if (term) matched.push({ label: term, points: group.points })
  }

  let used = 0
  let capped = false
  const applied = []

  for (const item of matched) {
    if (used + item.points > KEYWORD_CAP) {
      capped = true
      continue
    }
    applied.push({ kind: 'keyword', label: `"${item.label}"`, points: item.points })
    used += item.points
  }

  return { points: used, reasons: applied, capped }
}

/** Convert a numeric score into a severity level. */
export function scoreToLevel(score) {
  if (score >= 75) return 'Critical'
  if (score >= 50) return 'High'
  if (score >= 30) return 'Medium'
  return 'Low'
}

/**
 * THE severity function — takes a report and returns the score, level and a
 * human-readable list of reasons (e.g. Fire Emergency +30, 12 people +20,
 * "trapped" +20) that powers the "Why is this Critical?" panel.
 */
export function calculateSeverity({ category, peopleAffected, description }) {
  const cat = CATEGORY_MAP[category] || null
  const people = peopleTier(peopleAffected)
  const keywords = scoreKeywords(description)

  const reasons = []
  let score = 0

  if (cat) {
    reasons.push({ kind: 'base', label: cat.label, points: cat.basePoints })
    score += cat.basePoints
  }
  if (people.points > 0) {
    reasons.push({ kind: 'people', label: people.label, points: people.points })
    score += people.points
  }
  reasons.push(...keywords.reasons)
  score += keywords.points

  return {
    score,
    level: scoreToLevel(score),
    reasons,
    basePoints: cat ? cat.basePoints : 0,
    peoplePoints: people.points,
    keywordPoints: keywords.points,
    capped: keywords.capped,
  }
}

/* -------------------------------------------------------------------------- */
/* Auto-escalation                                                            */
/* -------------------------------------------------------------------------- */

/** When the current status started. */
export function getStatusSince(incident) {
  const history = Array.isArray(incident.history) ? incident.history : []
  const entry = [...history].reverse().find((item) => item.status === incident.status)
  return entry?.at || incident.createdAt || new Date().toISOString()
}

export function bumpSeverity(level, steps) {
  const index = SEVERITY_LEVELS.indexOf(level)
  const next = Math.min(SEVERITY_LEVELS.length - 1, Math.max(0, index + steps))
  return SEVERITY_LEVELS[next]
}

/**
 * AUTO-ESCALATION: an incident that stays "Reported" gets one level per 10
 * minutes after the first 10-minute grace period, up to Critical. Once a team
 * is assigned (or response starts), the clock stops.
 */
export function getEscalation(incident, now = Date.now()) {
  const baseLevel = incident.level || scoreToLevel(incident.score || 0)
  const active = incident.status === 'Reported'
  const since = getStatusSince(incident)
  const minutes = Math.max(0, Math.floor((now - Date.parse(since)) / 60000))

  let steps = 0
  if (active && minutes > ESCALATION_GRACE_MINUTES) {
    steps = 1 + Math.floor((minutes - ESCALATION_GRACE_MINUTES) / ESCALATION_STEP_MINUTES)
  }
  const maxSteps = SEVERITY_LEVELS.length - 1 - SEVERITY_LEVELS.indexOf(baseLevel)
  steps = Math.max(0, Math.min(steps, maxSteps))

  return {
    level: bumpSeverity(baseLevel, steps),
    baseLevel,
    steps,
    minutes,
    active,
    escalated: steps > 0,
    unattended: active && minutes > ESCALATION_GRACE_MINUTES,
  }
}

/**
 * Operational priority = displayed severity score + up to 20 points for time
 * since reporting. This is what the queue sorts on after severity level, so
 * two equally severe incidents are ordered by age (brief requirement).
 */
export function getPriority(incident, now = Date.now()) {
  const escalation = getEscalation(incident, now)
  const unresolved = incident.status !== 'Resolved' && !incident.mergedInto
  const minutes = Math.max(0, Math.floor((now - Date.parse(incident.createdAt)) / 60000))
  const agePoints = unresolved ? Math.min(20, Math.floor(minutes / 10) * 2) : 0
  return {
    ...escalation,
    agePoints,
    index: Math.min(100, (incident.score || 0) + agePoints),
  }
}

export function comparePriority(a, b, now = Date.now()) {
  const rankA = SEVERITY_RANK[getEscalation(a, now).level]
  const rankB = SEVERITY_RANK[getEscalation(b, now).level]
  if (rankA !== rankB) return rankB - rankA
  const indexDiff = getPriority(b, now).index - getPriority(a, now).index
  if (indexDiff !== 0) return indexDiff
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

/* -------------------------------------------------------------------------- */
/* Duplicate detection                                                        */
/* -------------------------------------------------------------------------- */

const LOCATION_STOP_WORDS = new Set([
  'the', 'near', 'at', 'on', 'of', 'in', 'and', 'by', 'to', 'block', 'street',
  'road', 'lane', 'sector', 'opposite', 'behind', 'exit',
])

export function normalizeLocation(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function locationsSimilar(a, b) {
  const left = normalizeLocation(a)
  const right = normalizeLocation(b)
  if (!left || !right) return false
  if (left === right || left.includes(right) || right.includes(left)) return true

  const tokens = (value) => new Set(value.split(' ').filter((word) => word.length > 2 && !LOCATION_STOP_WORDS.has(word)))
  const leftTokens = tokens(left)
  const rightTokens = tokens(right)
  if (!leftTokens.size || !rightTokens.size) return false

  let shared = 0
  leftTokens.forEach((word) => {
    if (rightTokens.has(word)) shared += 1
  })
  return shared / Math.min(leftTokens.size, rightTokens.size) >= 0.6
}

/** Flag a possible duplicate: same category, similar location, unresolved and recent. */
export function findDuplicate({ category, location, createdAt }, incidents) {
  const time = Date.parse(createdAt || Date.now())
  return (
    incidents.find(
      (incident) =>
        incident.category === category &&
        incident.status !== 'Resolved' &&
        Math.abs(time - Date.parse(incident.createdAt)) <= DUPLICATE_WINDOW_MINUTES * 60000 &&
        locationsSimilar(location, incident.location),
    ) || null
  )
}

/* -------------------------------------------------------------------------- */
/* Offline "AI" scene analysis (advisory triage, no internet)                  */
/* -------------------------------------------------------------------------- */

const CATEGORY_ACTIONS = {
  fire: [
    'Evacuate a 100 m perimeter and keep access roads clear for fire engines.',
    'Check for gas cylinders, chemicals or fuel near the fire.',
    'Request a second fire unit if flames are spreading.',
  ],
  road: [
    'Secure the scene and warn approaching traffic.',
    'Request an ambulance and traffic police.',
    'Do not move injured people unless there is immediate danger.',
  ],
  medical: [
    'Send the nearest ambulance with a paramedic on board.',
    'Start CPR or basic first aid if trained.',
    'Clear a path for the stretcher crew and keep the patient warm.',
  ],
  flood: [
    'Move people to higher ground and avoid walking or driving through water.',
    'Deploy boats, ropes and rescue swimmers.',
    'Check for children, elderly and pregnant residents first.',
  ],
  collapse: [
    'Request heavy rescue equipment and search dogs.',
    'Establish a collapse exclusion zone around the structure.',
    'Shut off gas and electricity to the site.',
  ],
  other: [
    'Send the nearest patrol to assess the scene.',
    'Keep bystanders back from the hazard.',
    'Escalate to a specialist unit if the risk grows.',
  ],
}

const KEYWORD_ACTIONS = [
  { terms: ['trapped', 'stuck'], action: 'Request cutting and heavy-lift rescue equipment.' },
  { terms: ['unconscious', 'not breathing', 'no pulse'], action: 'Begin rescue breathing or CPR if trained.' },
  { terms: ['child', 'children', 'baby', 'elderly', 'pregnant'], action: 'Prioritise children, elderly and pregnant people for evacuation.' },
  { terms: ['spreading', 'explosion', 'gas leak', 'collapsing'], action: 'Expand the exclusion zone and request additional units.' },
  { terms: ['bleeding', 'fracture', 'severe', 'burn'], action: 'Apply direct pressure to control severe bleeding.' },
  { terms: ['hospital', 'school', 'highway', 'station'], action: 'Alert site management and control traffic in the area.' },
]

/**
 * Lightweight on-device scene analysis. It explains the computed priority,
 * suggests a responder and lists immediate actions. Runs without any API key
 * or internet connection.
 */
export function analyzeScene(report) {
  const severity = calculateSeverity(report)
  const category = getCategory(report.category)
  const description = String(report.description || '')
  const people = Math.max(0, Math.floor(Number(report.peopleAffected) || 0))

  const actions = [...(CATEGORY_ACTIONS[category.id] || CATEGORY_ACTIONS.other)]
  for (const rule of KEYWORD_ACTIONS) {
    if (rule.terms.some((term) => matcher(term).test(description))) actions.push(rule.action)
  }

  const factors = severity.reasons.map((reason) => `${reason.label} (+${reason.points})`)
  const topSignal =
    severity.reasons.find((reason) => reason.kind === 'keyword')?.label ||
    severity.reasons.find((reason) => reason.kind === 'people')?.label ||
    category.label

  return {
    priority: severity.level,
    score: severity.score,
    summary: `${category.label} at ${report.location || 'an unknown location'}, affecting ${people} ${
      people === 1 ? 'person' : 'people'
    }. The strongest risk signal is ${String(topSignal).replace(/"/g, '')}. Suggested priority: ${severity.level} (${severity.score}/100).`,
    factors,
    responder: category.responder,
    actions: [...new Set(actions)].slice(0, 4),
    generatedAt: new Date().toISOString(),
    model: 'ResQ offline triage',
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function toCoord(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `inc-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function timeAgo(iso, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return `${hours}h ${rest}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function normalizeTrackingId(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  const match = /^INC-?(\d{4})-?(\d{1,6})$/.exec(raw)
  if (match) return `INC-${match[1]}-${match[2].padStart(4, '0')}`
  return raw
}

export function nextTrackingId(incidents, date = new Date()) {
  const year = date.getFullYear()
  let max = 0
  for (const incident of incidents) {
    const match = /^INC-\d{4}-(\d{1,6})$/.exec(incident.trackingId || '')
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `INC-${year}-${String(max + 1).padStart(4, '0')}`
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

export const STORAGE_KEY = 'resq-desk.incidents.v1'

function normalizeStoredIncident(incident) {
  if (!incident || typeof incident !== 'object' || !incident.trackingId) return null
  const createdAt = incident.createdAt || new Date().toISOString()
  // Round 1 stored `Pending`; Round 2 replaces it with `Assigned`.
  const migratedStatus = incident.status === 'Pending' ? 'Reported' : incident.status
  const status = STATUSES.includes(migratedStatus) ? migratedStatus : 'Reported'
  const history = Array.isArray(incident.history) ? incident.history : []
  return {
    ...incident,
    id: incident.id || createId(),
    createdAt,
    status,
    lat: toCoord(incident.lat),
    lng: toCoord(incident.lng),
    assignedTeamId: incident.assignedTeamId || null,
    history:
      history.length > 0 ? history : [{ status, at: createdAt, note: 'Report received.' }],
    reasons: Array.isArray(incident.reasons) ? incident.reasons : [],
    peopleAffected: Number(incident.peopleAffected) || 0,
  }
}

export function loadIncidents() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeStoredIncident).filter(Boolean)
  } catch (error) {
    console.error('ResQ Desk: could not read saved incidents', error)
    return []
  }
}

export function saveIncidents(incidents) {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(incidents))
    return true
  } catch (error) {
    console.error('ResQ Desk: could not save incidents', error)
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* Incident mutations                                                         */
/* -------------------------------------------------------------------------- */

/** Create a stored incident from validated form values. */
export function buildIncident(form, existing, now = new Date()) {
  const severity = calculateSeverity(form)
  const createdAt = now.toISOString()
  const duplicate = findDuplicate(
    { category: form.category, location: form.location, createdAt },
    existing,
  )

  const incident = {
    id: createId(),
    trackingId: nextTrackingId(existing, now),
    title: String(form.title || '').trim(),
    description: String(form.description || '').trim(),
    category: form.category,
    location: String(form.location || '').trim(),
    peopleAffected: Math.max(0, Math.floor(Number(form.peopleAffected) || 0)),
    contact: String(form.contact || '').trim(),
    createdAt,
    status: 'Reported',
    lat: toCoord(form.lat),
    lng: toCoord(form.lng),
    locationAccuracy: toCoord(form.locationAccuracy),
    locationSource: form.locationSource || 'manual',
    score: severity.score,
    level: severity.level,
    reasons: severity.reasons,
    basePoints: severity.basePoints,
    peoplePoints: severity.peoplePoints,
    keywordPoints: severity.keywordPoints,
    capped: severity.capped,
    history: [{ status: 'Reported', at: createdAt, note: 'Report received from public reporter.' }],
    duplicateOf: duplicate?.trackingId || null,
    aiAnalysis: analyzeScene(form),
  }
  return incident
}

/** Move an incident to a new status, keeping a timestamped history entry. */
export function setIncidentStatus(incident, status, now = new Date()) {
  if (!STATUSES.includes(status) || incident.status === status) return incident
  const notes = {
    Reported: 'Re-opened as Reported by control room.',
    Assigned: 'Response team assigned.',
    'In Progress': 'Responders are on scene — In Progress.',
    Resolved: 'Marked Resolved by control room.',
  }
  return {
    ...incident,
    status,
    history: [...(incident.history || []), { status, at: now.toISOString(), note: notes[status] }],
  }
}

/** Merge a duplicate into an original. The duplicate is resolved and linked. */
export function mergeIncidents(incidents, sourceId, targetId, now = new Date()) {
  const source = incidents.find((incident) => incident.id === sourceId)
  const target = incidents.find((incident) => incident.id === targetId)
  if (!source || !target) return incidents
  const at = now.toISOString()

  return incidents.map((incident) => {
    if (incident.id === source.id) {
      return {
        ...incident,
        status: 'Resolved',
        mergedInto: target.trackingId,
        history: [
          ...(incident.history || []),
          { status: 'Resolved', at, note: `Merged into ${target.trackingId} as a duplicate.` },
        ],
      }
    }
    if (incident.id === target.id) {
      return {
        ...incident,
        history: [
          ...(incident.history || []),
          { status: incident.status, at, note: `Duplicate report ${source.trackingId} merged into this incident.` },
        ],
      }
    }
    return incident
  })
}

/* -------------------------------------------------------------------------- */
/* Demo data                                                                  */
/* -------------------------------------------------------------------------- */

const DEMO_SEEDS = [
  {
    title: 'Chemical warehouse fire, workers trapped',
    description:
      'Thick smoke is pouring from a chemical warehouse. At least 18 workers are trapped inside and the fire is spreading toward the fuel storage area.',
    category: 'fire',
    location: 'Warehouse 7, Industrial Estate, Sector 12',
    lat: 9.9975,
    lng: 76.304,
    peopleAffected: 18,
    contact: '+91 98470 01420',
    status: 'Reported',
    ageMinutes: 34,
    transitions: [['Reported', 0, 'Report received from site security.']],
  },
  {
    title: 'Multi-vehicle collision on Highway 21',
    description:
      'Three cars collided near Exit 4. One driver is unconscious, a child is bleeding heavily and a passenger may have a fracture.',
    category: 'road',
    location: 'Highway 21 near Exit 4',
    lat: 10.018,
    lng: 76.329,
    peopleAffected: 5,
    contact: '+91 98470 01730',
    status: 'Assigned',
    assignedTeamId: 'team-pol-01',
    ageMinutes: 26,
    transitions: [
      ['Reported', 0, 'Report received from a passing motorist.'],
      ['Assigned', 4, 'Traffic & Police — East dispatched. Ambulance requested.'],
    ],
  },
  {
    title: 'Elderly resident collapsed and not breathing',
    description:
      'An elderly woman collapsed in the apartment hallway and is not breathing. Neighbours are performing CPR.',
    category: 'medical',
    location: 'Block C, Sunrise Apartments, 4th Street',
    lat: 9.9715,
    lng: 76.2835,
    peopleAffected: 1,
    contact: '',
    status: 'In Progress',
    assignedTeamId: 'team-med-01',
    ageMinutes: 12,
    transitions: [
      ['Reported', 0, 'Report received from a neighbour.'],
      ['Assigned', 4, 'Medical — City Hospital dispatched.'],
      ['In Progress', 9, 'Paramedic unit is on scene.'],
    ],
  },
  {
    title: 'River embankment breach flooding colony',
    description:
      'The embankment has breached and water is spreading through low-lying streets. Around 40 families are stuck on rooftops, including children and elderly residents.',
    category: 'flood',
    location: 'Riverside Colony near Krishna Bridge',
    lat: 9.958,
    lng: 76.252,
    peopleAffected: 45,
    contact: '+91 98470 01990',
    status: 'Assigned',
    assignedTeamId: 'team-flood-01',
    ageMinutes: 125,
    transitions: [
      ['Reported', 0, 'Report received from a ward volunteer.'],
      ['Assigned', 8, 'Flood Response — River Team dispatched with two boats.'],
    ],
  },
  {
    title: 'Concrete slab collapse at construction site',
    description:
      'A concrete slab collapsed at an under-construction site. Six workers are trapped under debris, one has a severe leg fracture and another is unconscious.',
    category: 'collapse',
    location: 'MG Road construction site, opposite City Mall',
    lat: 9.9825,
    lng: 76.272,
    peopleAffected: 6,
    contact: '+91 98470 01100',
    status: 'In Progress',
    assignedTeamId: 'team-res-01',
    ageMinutes: 300,
    transitions: [
      ['Reported', 0, 'Report received from the site supervisor.'],
      ['Assigned', 6, 'Search & Rescue — Collapse Unit assigned.'],
      ['In Progress', 14, 'Search and rescue team on scene.'],
    ],
  },
  {
    title: 'Rear-end collision, one minor injury',
    description:
      'Two cars bumped near Exit 4. Both drivers are out and walking; one passenger has minor bruising.',
    category: 'road',
    location: 'Highway 21, near Exit 4',
    lat: 10.0172,
    lng: 76.3282,
    peopleAffected: 1,
    contact: '',
    status: 'Reported',
    ageMinutes: 8,
    transitions: [['Reported', 0, 'Report received from a driver.']],
  },
  {
    title: 'Downed power line blocking Green Park Lane',
    description:
      'A tree fell and brought down a power line. The line is sparking but the street was evacuated and cordoned off.',
    category: 'other',
    location: 'Green Park Lane, Green Park',
    lat: 9.944,
    lng: 76.312,
    peopleAffected: 0,
    contact: '+91 98470 01040',
    status: 'Resolved',
    assignedTeamId: 'team-gen-01',
    ageMinutes: 2880,
    transitions: [
      ['Reported', 0, 'Report received from a resident.'],
      ['Assigned', 5, 'Civil Defence — General dispatched.'],
      ['In Progress', 12, 'Crew isolated the line.'],
      ['Resolved', 38, 'Line isolated and street cleared.'],
    ],
  },
]

export function createDemoIncidents(existing = [], now = new Date()) {
  if (existing.some((incident) => incident.source === 'demo')) return []

  const working = [...existing]
  const created = []

  for (const seed of DEMO_SEEDS) {
    const createdDate = new Date(now.getTime() - seed.ageMinutes * 60000)
    const createdAt = createdDate.toISOString()
    const severity = calculateSeverity(seed)
    const trackingId = nextTrackingId(working, createdDate)
    const history = seed.transitions.map(([status, offset, note]) => ({
      status,
      at: new Date(createdDate.getTime() + offset * 60000).toISOString(),
      note,
    }))
    const duplicate = findDuplicate(
      { category: seed.category, location: seed.location, createdAt },
      working,
    )

    const assignedEntry = [...history].reverse().find((entry) => entry.status === 'Assigned')
    const incident = {
      id: createId(),
      trackingId,
      source: 'demo',
      title: seed.title,
      description: seed.description,
      category: seed.category,
      location: seed.location,
      lat: seed.lat ?? null,
      lng: seed.lng ?? null,
      locationSource: 'demo',
      peopleAffected: seed.peopleAffected,
      contact: seed.contact,
      createdAt,
      status: seed.status,
      assignedTeamId: seed.assignedTeamId || null,
      assignedAt: assignedEntry?.at || null,
      score: severity.score,
      level: severity.level,
      reasons: severity.reasons,
      basePoints: severity.basePoints,
      peoplePoints: severity.peoplePoints,
      keywordPoints: severity.keywordPoints,
      capped: severity.capped,
      history,
      duplicateOf: duplicate?.trackingId || null,
      aiAnalysis: null,
    }

    working.push(incident)
    created.push(incident)
  }

  return created
}
