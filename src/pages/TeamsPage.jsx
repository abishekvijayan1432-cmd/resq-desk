import { useMemo, useState } from 'react'
import { CATEGORIES, getCategory } from '../lib/engine'
import {
  TEAM_STATUS_STYLES,
  buildTeam,
  formatDistance,
  formatEta,
  haversineKm,
  validateTeam,
} from '../lib/teams'
import {
  CATEGORY_TINTS,
  CategoryIcon,
  ConfirmDialog,
  EmptyState,
  Icon,
  Modal,
} from '../components/ui'

const FILTERS = ['All', 'Available', 'On assignment', 'Off duty']

const EMPTY_TEAM = {
  name: '',
  code: '',
  category: '',
  base: '',
  lat: '',
  lng: '',
  phone: '',
}

function TeamModal({ team, teams, onSave, onClose }) {
  const [values, setValues] = useState(() =>
    team
      ? {
          name: team.name,
          code: team.code,
          category: team.category,
          base: team.base || '',
          lat: String(team.lat ?? ''),
          lng: String(team.lng ?? ''),
          phone: team.phone || '',
        }
      : EMPTY_TEAM,
  )
  const [errors, setErrors] = useState({})
  const [locating, setLocating] = useState(false)
  const [locationNote, setLocationNote] = useState('')

  function update(field, value) {
    setValues((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => {
      if (!previous[field]) return previous
      const next = { ...previous }
      delete next[field]
      return next
    })
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationNote('Location is not available in this browser.')
      return
    }
    setLocating(true)
    setLocationNote('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        update('lat', position.coords.latitude.toFixed(6))
        update('lng', position.coords.longitude.toFixed(6))
        setLocationNote('Current position captured on this device.')
        setLocating(false)
      },
      () => {
        setLocationNote('Could not read GPS. Enter coordinates manually.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  }

  function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validateTeam(values, teams, team?.id)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (team) {
      onSave({
        ...team,
        name: values.name.trim(),
        code: values.code.trim() || team.code,
        category: values.category,
        base: values.base.trim(),
        lat: Number(values.lat),
        lng: Number(values.lng),
        phone: values.phone.trim(),
      })
    } else {
      onSave(buildTeam(values, teams))
    }
    onClose()
  }

  return (
    <Modal onClose={onClose} ariaLabel={team ? `Edit ${team.name}` : 'Add a response team'}>
      <form onSubmit={handleSubmit} noValidate className="sm:max-w-2xl">
        <header className="pr-10">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-sky-300 uppercase">
            Resource management
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-white">
            {team ? 'Edit response team' : 'Add a response team'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Coordinates let the control room calculate distance and dispatch the nearest suitable
            unit — even without internet.
          </p>
        </header>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="team-name" className="field-label">
              Team name <span className="text-red-400">*</span>
            </label>
            <input
              id="team-name"
              value={values.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="e.g. Fire & Rescue — Central"
              aria-invalid={Boolean(errors.name)}
              className={`field-input mt-1.5 ${errors.name ? 'field-input-invalid' : ''}`}
              autoFocus
            />
            {errors.name && <p className="mt-1 text-xs text-red-300">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="team-code" className="field-label">
              Team ID / code
            </label>
            <input
              id="team-code"
              value={values.code}
              onChange={(event) => update('code', event.target.value.toUpperCase())}
              placeholder="Auto-generated"
              aria-invalid={Boolean(errors.code)}
              className={`field-input mt-1.5 font-mono uppercase ${errors.code ? 'field-input-invalid' : ''}`}
            />
            {errors.code ? (
              <p className="mt-1 text-xs text-red-300">{errors.code}</p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">Shown on the dispatch board.</p>
            )}
          </div>

          <div>
            <label htmlFor="team-category" className="field-label">
              Response category <span className="text-red-400">*</span>
            </label>
            <select
              id="team-category"
              value={values.category}
              onChange={(event) => update('category', event.target.value)}
              aria-invalid={Boolean(errors.category)}
              className={`field-input mt-1.5 ${errors.category ? 'field-input-invalid' : ''}`}
            >
              <option value="">Select category</option>
              {CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            {errors.category && <p className="mt-1 text-xs text-red-300">{errors.category}</p>}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="team-base" className="field-label">
              Base / current location
            </label>
            <input
              id="team-base"
              value={values.base}
              onChange={(event) => update('base', event.target.value)}
              placeholder="Station or depot name"
              className="field-input mt-1.5"
            />
          </div>

          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-400">
              Coordinates are required so the nearest-unit calculation works.
            </p>
            <button
              type="button"
              className="btn-secondary !px-3 !py-1.5 text-xs"
              onClick={useMyLocation}
              disabled={locating}
            >
              <Icon name="crosshair" className="size-3.5" />
              {locating ? 'Locating…' : 'Use my location'}
            </button>
          </div>

          <div>
            <label htmlFor="team-lat" className="field-label">
              Latitude <span className="text-red-400">*</span>
            </label>
            <input
              id="team-lat"
              value={values.lat}
              onChange={(event) => update('lat', event.target.value)}
              inputMode="decimal"
              placeholder="9.9860"
              aria-invalid={Boolean(errors.lat)}
              className={`field-input mt-1.5 font-mono ${errors.lat ? 'field-input-invalid' : ''}`}
            />
            {errors.lat && <p className="mt-1 text-xs text-red-300">{errors.lat}</p>}
          </div>

          <div>
            <label htmlFor="team-lng" className="field-label">
              Longitude <span className="text-red-400">*</span>
            </label>
            <input
              id="team-lng"
              value={values.lng}
              onChange={(event) => update('lng', event.target.value)}
              inputMode="decimal"
              placeholder="76.2810"
              aria-invalid={Boolean(errors.lng)}
              className={`field-input mt-1.5 font-mono ${errors.lng ? 'field-input-invalid' : ''}`}
            />
            {errors.lng && <p className="mt-1 text-xs text-red-300">{errors.lng}</p>}
          </div>

          <div>
            <label htmlFor="team-phone" className="field-label">
              Radio / phone
            </label>
            <input
              id="team-phone"
              value={values.phone}
              onChange={(event) => update('phone', event.target.value)}
              placeholder="112"
              inputMode="tel"
              aria-invalid={Boolean(errors.phone)}
              className={`field-input mt-1.5 ${errors.phone ? 'field-input-invalid' : ''}`}
            />
            {errors.phone && <p className="mt-1 text-xs text-red-300">{errors.phone}</p>}
          </div>

          <div className="flex items-end">
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-slate-400">
              New teams start as <strong className="text-emerald-300">Available</strong>. Availability
              changes automatically when you assign an incident.
            </p>
          </div>
        </div>

        {locationNote && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-sky-200">
            <Icon name="info" className="size-3.5" />
            {locationNote}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            <Icon name={team ? 'check' : 'userPlus'} className="size-4" />
            {team ? 'Save team' : 'Add team'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function TeamsPage({
  teams,
  incidents,
  onAdd,
  onUpdate,
  onDelete,
  onToggle,
  onOpenMap,
  onLoadDemo,
}) {
  const [filter, setFilter] = useState('All')
  const [modal, setModal] = useState(null) // { mode: 'add' } | { mode: 'edit', team }
  const [deleteTeam, setDeleteTeam] = useState(null)

  const stats = useMemo(() => {
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
  }, [teams])

  const categoriesCovered = useMemo(
    () => new Set(teams.filter((team) => team.available).map((team) => team.category)).size,
    [teams],
  )

  const filtered = useMemo(() => {
    return teams.filter((team) => {
      if (filter === 'All') return true
      if (filter === 'Available') return team.available && !team.assignedIncidentId
      if (filter === 'On assignment') return Boolean(team.assignedIncidentId)
      return !team.available && !team.assignedIncidentId
    })
  }, [teams, filter])

  const totals = { All: teams.length }
  for (const key of FILTERS.slice(1)) {
    totals[key] = teams.filter((team) => {
      if (key === 'Available') return team.available && !team.assignedIncidentId
      if (key === 'On assignment') return Boolean(team.assignedIncidentId)
      return !team.available && !team.assignedIncidentId
    }).length
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-sky-300 uppercase">
            Resource management
          </p>
          <h1 className="mt-1.5 font-display text-2xl font-bold text-white sm:text-3xl">
            Response teams
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Coordinate every unit in one roster. Availability updates the moment a team is assigned
            or released.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary !px-3 !py-2 text-xs" onClick={onOpenMap}>
            <Icon name="map" className="size-3.5" />
            Response map
          </button>
          <button type="button" className="btn-primary !px-3 !py-2 text-xs" onClick={() => setModal({ mode: 'add' })}>
            <Icon name="userPlus" className="size-3.5" />
            Add team
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total teams', value: stats.total, hint: 'On the roster', icon: 'users', accent: 'border-sky-400/25 bg-sky-400/10 text-sky-300' },
          { label: 'Available', value: stats.available, hint: 'Ready to dispatch', icon: 'checkCircle', accent: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
          { label: 'On assignment', value: stats.busy, hint: 'Committed to incidents', icon: 'radio', accent: 'border-violet-400/25 bg-violet-500/10 text-violet-300' },
          { label: 'Off duty', value: stats.offDuty, hint: `${categoriesCovered}/6 categories covered`, icon: 'clock', accent: 'border-yellow-400/25 bg-yellow-400/10 text-yellow-300' },
        ].map((item) => (
          <div key={item.label} className="panel p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
                {item.label}
              </p>
              <span className={`grid size-8 place-items-center rounded-lg border ${item.accent}`}>
                <Icon name={item.icon} className="size-4" />
              </span>
            </div>
            <p className="mt-2 font-display text-3xl font-bold text-white tabular-nums">{item.value}</p>
            <p className="mt-0.5 text-xs text-slate-400">{item.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter teams">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              aria-pressed={filter === item}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                filter === item
                  ? 'border-white/25 bg-white/15 text-white'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              {item}
              <span className="ml-1.5 font-mono text-[10px] opacity-70">{totals[item] ?? 0}</span>
            </button>
          ))}
        </div>
        <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
          <Icon name="radio" className="size-3.5" />
          Availability is shared with the control room instantly
        </p>
      </div>

      {teams.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="users"
            title="No response teams on the roster"
            message="Load the demo roster to explore nearest-unit dispatch, or add your first team with its station coordinates."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="btn-primary" onClick={onLoadDemo}>
                  <Icon name="sparkles" className="size-4" />
                  Load demo roster
                </button>
                <button type="button" className="btn-secondary" onClick={() => setModal({ mode: 'add' })}>
                  <Icon name="userPlus" className="size-4" />
                  Add team
                </button>
              </div>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="filter"
            title={`No ${filter.toLowerCase()} teams`}
            message="Try another availability filter to see the rest of the roster."
            action={
              <button type="button" className="btn-secondary" onClick={() => setFilter('All')}>
                Show all teams
              </button>
            }
          />
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {filtered.map((team) => {
            const category = getCategory(team.category)
            const status = team.assignedIncidentId ? 'busy' : team.available ? 'available' : 'offline'
            const style = TEAM_STATUS_STYLES[status]
            const assigned = team.assignedIncidentId
              ? incidents.find((incident) => incident.id === team.assignedIncidentId)
              : null
            const distance = assigned ? haversineKm(team, assigned) : null

            return (
              <li key={team.id}>
                <article className="panel p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span
                      className={`grid size-11 shrink-0 place-items-center rounded-xl border ${CATEGORY_TINTS[category.id]}`}
                    >
                      <CategoryIcon category={category.id} className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-[11px] tracking-wide text-slate-400">
                          {team.code}
                        </span>
                        <span className={`chip ${style.chip}`}>
                          <span className={`size-1.5 rounded-full ${style.dot}`} />
                          {style.label}
                        </span>
                      </div>
                      <h2 className="mt-0.5 font-display text-base leading-snug font-semibold text-white">
                        {team.name}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-400">{category.label}</p>
                    </div>
                    <a
                      href={`tel:${team.phone || '112'}`}
                      className="btn-secondary shrink-0 !rounded-full !p-2"
                      aria-label={`Call ${team.name} at ${team.phone || '112'}`}
                    >
                      <Icon name="phone" className="size-4" />
                    </a>
                  </div>

                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div className="flex items-start gap-1.5 text-slate-400">
                      <Icon name="mapPin" className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        <span className="sr-only">Base: </span>
                        {team.base || 'Base not set'}
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5 text-slate-400">
                      <Icon name="crosshair" className="mt-0.5 size-3.5 shrink-0" />
                      <span className="font-mono">
                        {Number.isFinite(Number(team.lat)) ? Number(team.lat).toFixed(4) : '—'},{' '}
                        {Number.isFinite(Number(team.lng)) ? Number(team.lng).toFixed(4) : '—'}
                      </span>
                    </div>
                  </dl>

                  {assigned ? (
                    <div className="mt-3 rounded-xl border border-violet-400/25 bg-violet-500/[0.07] px-3 py-2.5">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] tracking-wide text-violet-300 uppercase">
                        <Icon name="route" className="size-3.5" />
                        Assigned incident
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-100">{assigned.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                        <span className="font-mono">{assigned.trackingId}</span>
                        {distance != null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatDistance(distance)} away</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatEta(distance)}</span>
                          </>
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="chip border-white/10 bg-white/5 text-slate-300">
                        <Icon name="checkCircle" className="size-3" />
                        Ready
                      </span>
                      {team.source === 'demo' && (
                        <span className="chip border-white/10 bg-white/5 text-slate-400">Demo unit</span>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                    <button
                      type="button"
                      className="btn-secondary !px-2.5 !py-1.5 text-xs"
                      onClick={() => onToggle(team)}
                      disabled={Boolean(team.assignedIncidentId)}
                      title={
                        team.assignedIncidentId
                          ? 'Release the incident before changing availability'
                          : undefined
                      }
                    >
                      <Icon name="radio" className="size-3.5" />
                      {team.available ? 'Set off duty' : 'Mark available'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !px-2.5 !py-1.5 text-xs"
                      onClick={() => setModal({ mode: 'edit', team })}
                    >
                      <Icon name="edit" className="size-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost ml-auto !px-2.5 !py-1.5 text-xs text-red-300 hover:text-red-200"
                      onClick={() => setDeleteTeam(team)}
                    >
                      <Icon name="trash" className="size-3.5" />
                      Remove
                    </button>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}

      <section className="panel mt-6 p-4 sm:p-5" aria-labelledby="dispatch-model-title">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-sky-400/25 bg-sky-400/10 text-sky-300">
            <Icon name="navigation" className="size-4" />
          </span>
          <div>
            <h2 id="dispatch-model-title" className="font-display text-sm font-semibold text-white">
              How nearest-unit dispatch works
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
              Available teams are ranked by category suitability first, then great-circle distance
              from their station to the incident coordinates. ETA assumes a 30 km/h urban average
              plus two minutes of mobilisation. All of this is calculated on the device with no map
              provider or internet connection.
            </p>
          </div>
        </div>
      </section>

      {modal && (
        <TeamModal
          team={modal.mode === 'edit' ? modal.team : null}
          teams={teams}
          onSave={(team) => (modal.mode === 'edit' ? onUpdate(team) : onAdd(team))}
          onClose={() => setModal(null)}
        />
      )}

      {deleteTeam && (
        <ConfirmDialog
          title={`Remove ${deleteTeam.name}?`}
          message={
            deleteTeam.assignedIncidentId
              ? 'This team is currently on assignment. Release the incident first, then remove the team.'
              : 'The team will be removed from the roster. This does not delete any incident reports.'
          }
          confirmLabel="Remove team"
          onCancel={() => setDeleteTeam(null)}
          onConfirm={() => {
            onDelete(deleteTeam)
            setDeleteTeam(null)
          }}
        />
      )}
    </div>
  )
}
