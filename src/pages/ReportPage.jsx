import { useMemo, useRef, useState } from 'react'
import {
  CATEGORIES,
  analyzeScene,
  calculateSeverity,
  findDuplicate,
  getCategory,
} from '../lib/engine'
import {
  CATEGORY_TINTS,
  CategoryIcon,
  Icon,
  SEVERITY_STYLES,
  SeverityBadge,
} from '../components/ui'

const EMPTY_FORM = {
  title: '',
  description: '',
  category: '',
  location: '',
  peopleAffected: '',
  contact: '',
}

const CONTACT_PATTERN = /^[+()\-\d\s]{6,}$|^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

function validate(values) {
  const errors = {}
  if (!values.title.trim()) errors.title = 'Incident title is required.'
  else if (values.title.trim().length < 5) errors.title = 'Use at least 5 characters.'

  if (!values.description.trim()) errors.description = 'Incident description is required.'
  else if (values.description.trim().length < 15)
    errors.description = 'Add at least 15 characters so responders understand the scene.'

  if (!values.category) errors.category = 'Choose an emergency category.'

  if (!values.location.trim()) errors.location = 'Location is required.'
  else if (values.location.trim().length < 4) errors.location = 'Add a more specific location.'

  if (values.peopleAffected !== '') {
    const people = Number(values.peopleAffected)
    if (!Number.isInteger(people) || people < 0)
      errors.peopleAffected = 'Enter a whole number of 0 or more.'
  }

  if (values.contact.trim() && !CONTACT_PATTERN.test(values.contact.trim()))
    errors.contact = 'Enter a valid phone number or email, or leave it blank.'

  return errors
}

function Field({ id, label, required, hint, error, children }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="field-label">
          {label}
          {required && (
            <span className="ml-1 text-red-400" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </label>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-300"
        >
          <Icon name="alertCircle" className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

export default function ReportPage({ incidents, onCreate, onTrack }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submittedOnce, setSubmittedOnce] = useState(false)
  const [confirmation, setConfirmation] = useState(null)
  const [copied, setCopied] = useState(false)
  const [coords, setCoords] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locationNote, setLocationNote] = useState('')
  const formRef = useRef(null)

  const severity = useMemo(
    () =>
      calculateSeverity({
        category: form.category,
        peopleAffected: form.peopleAffected,
        description: form.description,
      }),
    [form.category, form.peopleAffected, form.description],
  )

  const analysis = useMemo(
    () =>
      analyzeScene({
        category: form.category,
        location: form.location,
        peopleAffected: form.peopleAffected,
        description: form.description,
      }),
    [form.category, form.location, form.peopleAffected, form.description],
  )

  const duplicate = useMemo(() => {
    if (!form.category || form.location.trim().length < 4) return null
    return findDuplicate(
      { category: form.category, location: form.location, createdAt: new Date().toISOString() },
      incidents,
    )
  }, [form.category, form.location, incidents])

  const selectedCategory = form.category ? getCategory(form.category) : null
  const severityStyle = SEVERITY_STYLES[severity.level]

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => {
      if (!previous[field]) return previous
      const next = { ...previous }
      delete next[field]
      return next
    })
    if (confirmation) setConfirmation(null)
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setLocationNote('GPS is not available in this browser. Enter a landmark instead.')
      return
    }
    setLocating(true)
    setLocationNote('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6))
        const lng = Number(position.coords.longitude.toFixed(6))
        setCoords({ lat, lng, accuracy: position.coords.accuracy })
        setLocationNote(
          `GPS pinned on this device${Number.isFinite(position.coords.accuracy) ? ` · ±${Math.round(position.coords.accuracy)} m` : ''}. Nearest-team distance will be calculated from this point.`,
        )
        setForm((previous) =>
          previous.location.trim()
            ? previous
            : { ...previous, location: `${lat.toFixed(5)}, ${lng.toFixed(5)}` },
        )
        setErrors((previous) => {
          if (!previous.location) return previous
          const next = { ...previous }
          delete next.location
          return next
        })
        setLocating(false)
      },
      () => {
        setLocationNote('Could not read GPS. Allow location permission, or type a landmark.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 },
    )
  }

  function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validate(form)
    setErrors(nextErrors)
    setSubmittedOnce(true)

    if (Object.keys(nextErrors).length > 0) {
      requestAnimationFrame(() => {
        const firstInvalid = formRef.current?.querySelector('[aria-invalid="true"]')
        firstInvalid?.focus()
        firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      return
    }

    const incident = onCreate({
      ...form,
      lat: coords?.lat,
      lng: coords?.lng,
      locationAccuracy: coords?.accuracy,
      locationSource: coords ? 'gps' : 'manual',
    })
    setForm(EMPTY_FORM)
    setCoords(null)
    setLocationNote('')
    setErrors({})
    setSubmittedOnce(false)
    setConfirmation(incident)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function copyTrackingId() {
    try {
      await navigator.clipboard.writeText(confirmation.trackingId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (confirmation) {
    const confirmSeverity = SEVERITY_STYLES[confirmation.level]
    return (
      <div className="mx-auto max-w-2xl">
        <div className="panel overflow-hidden">
          <div className="border-b border-emerald-400/20 bg-emerald-500/10 px-6 py-8 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full border border-emerald-400/40 bg-emerald-400/15 text-emerald-300">
              <Icon name="check" className="size-7" strokeWidth={2.5} />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold text-white">Report received</h1>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-300">
              The control room can see this emergency immediately. Keep the tracking ID safe to
              follow the response.
            </p>
          </div>

          <div className="p-6">
            <div className="rounded-xl border border-white/10 bg-navy-950/60 p-4 text-center">
              <p className="text-xs font-medium tracking-widest text-slate-400 uppercase">
                Tracking ID
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-white sm:text-3xl">
                {confirmation.trackingId}
              </p>
              <button type="button" onClick={copyTrackingId} className="btn-secondary mt-3 !px-3 !py-1.5 text-xs">
                <Icon name={copied ? 'check' : 'copy'} className="size-3.5" />
                {copied ? 'Copied' : 'Copy ID'}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <SeverityBadge level={confirmation.level} />
              <span className="chip border-white/10 bg-white/5 text-slate-300">
                <CategoryIcon category={confirmation.category} className="size-3.5" />
                {getCategory(confirmation.category).label}
              </span>
              <span className="chip border-white/10 bg-white/5 text-slate-300">
                <Icon name="mapPin" className="size-3.5" />
                {confirmation.location}
              </span>
            </div>

            <dl className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-400">Suggested responder</dt>
                <dd className="mt-0.5 font-medium text-white">
                  {getCategory(confirmation.category).responder}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Priority score</dt>
                <dd className={`mt-0.5 font-semibold ${confirmSeverity.text}`}>
                  {confirmation.score} / 100 · {confirmation.level}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">People affected</dt>
                <dd className="mt-0.5 text-slate-200">{confirmation.peopleAffected}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Status</dt>
                <dd className="mt-0.5 text-slate-200">Reported</dd>
              </div>
            </dl>

            {confirmation.duplicateOf && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
                <Icon name="alertTriangle" className="mt-0.5 size-4 shrink-0" />
                This may duplicate an existing report ({confirmation.duplicateOf}). The control room
                will merge it if needed.
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-primary flex-1" onClick={() => onTrack(confirmation.trackingId)}>
                <Icon name="search" className="size-4" />
                Track this report
              </button>
              <button type="button" className="btn-secondary flex-1" onClick={() => setConfirmation(null)}>
                Report another emergency
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-red-400 uppercase">Emergency intake</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold text-white sm:text-3xl">Report an emergency</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Share what you can see. Clear details help the control room prioritise response.
          </p>
        </div>
        <span className="chip border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
          Works offline
        </span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="panel p-5 sm:p-6">
          <div className="flex items-center gap-2 border-b border-white/10 pb-4">
            <span className="grid size-8 place-items-center rounded-lg bg-red-500/15 text-red-300">
              <Icon name="alertCircle" className="size-4" />
            </span>
            <h2 className="section-title">Incident details</h2>
          </div>

          {submittedOnce && Object.keys(errors).length > 0 && (
            <div role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-3.5 py-3 text-sm text-red-200">
              Please fix {Object.keys(errors).length} highlighted field
              {Object.keys(errors).length === 1 ? '' : 's'} before submitting.
            </div>
          )}

          <div className="mt-5 space-y-5">
            <Field id="title" label="Incident title" required error={errors.title} hint="Short and specific">
              <input
                id="title"
                name="title"
                type="text"
                value={form.title}
                onChange={(event) => update('title', event.target.value)}
                placeholder="e.g. Kitchen fire spreading through apartment block"
                maxLength={120}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? 'title-error' : undefined}
                className={`field-input ${errors.title ? 'field-input-invalid' : ''}`}
              />
            </Field>

            <Field
              id="description"
              label="Incident description"
              required
              error={errors.description}
              hint="Mention trapped people, injuries and spreading hazards"
            >
              <textarea
                id="description"
                name="description"
                rows={5}
                value={form.description}
                onChange={(event) => update('description', event.target.value)}
                placeholder="What happened? Who is in danger? Is the hazard spreading?"
                aria-invalid={Boolean(errors.description)}
                aria-describedby={errors.description ? 'description-error' : 'description-hint'}
                className={`field-input resize-y ${errors.description ? 'field-input-invalid' : ''}`}
              />
              <p id="description-hint" className="mt-1 text-[11px] text-slate-500">
                Keywords like “trapped”, “unconscious” or “children” automatically raise the priority.
              </p>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="category" label="Emergency category" required error={errors.category}>
                <select
                  id="category"
                  name="category"
                  value={form.category}
                  onChange={(event) => update('category', event.target.value)}
                  aria-invalid={Boolean(errors.category)}
                  aria-describedby={errors.category ? 'category-error' : undefined}
                  className={`field-input appearance-none bg-[length:16px] bg-[right_0.9rem_center] bg-no-repeat pr-10 ${
                    form.category ? 'text-slate-100' : 'text-slate-500'
                  } ${errors.category ? 'field-input-invalid' : ''}`}
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%2394a3b8' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                  }}
                >
                  <option value="" className="bg-navy-900">
                    Select category
                  </option>
                  {CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id} className="bg-navy-900">
                      {category.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                id="peopleAffected"
                label="People affected"
                error={errors.peopleAffected}
                hint="Optional, default 0"
              >
                <input
                  id="peopleAffected"
                  name="peopleAffected"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={form.peopleAffected}
                  onChange={(event) => update('peopleAffected', event.target.value)}
                  placeholder="0"
                  aria-invalid={Boolean(errors.peopleAffected)}
                  aria-describedby={errors.peopleAffected ? 'peopleAffected-error' : undefined}
                  className={`field-input ${errors.peopleAffected ? 'field-input-invalid' : ''}`}
                />
              </Field>
            </div>

            <Field id="location" label="Location" required error={errors.location} hint="Landmark, street or building">
              <div className="relative">
                <Icon
                  name="mapPin"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
                />
                <input
                  id="location"
                  name="location"
                  type="text"
                  value={form.location}
                  onChange={(event) => update('location', event.target.value)}
                  placeholder="e.g. Sector 12, near the water tower"
                  maxLength={160}
                  aria-invalid={Boolean(errors.location)}
                  aria-describedby={errors.location ? 'location-error' : undefined}
                  className={`field-input pl-9 ${errors.location ? 'field-input-invalid' : ''}`}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">
                  {coords
                    ? `GPS pinned · ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                    : 'Pin your position so dispatch can calculate distance to the nearest team.'}
                </p>
                <button
                  type="button"
                  onClick={captureLocation}
                  disabled={locating}
                  className="btn-secondary !px-2.5 !py-1 text-[11px]"
                >
                  <Icon name="crosshair" className="size-3.5" />
                  {locating ? 'Locating…' : coords ? 'Update GPS pin' : 'Use my location'}
                </button>
              </div>
              {locationNote && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-sky-200">
                  <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
                  {locationNote}
                </p>
              )}
            </Field>

            {duplicate && (
              <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-400/35 bg-amber-400/10 px-3.5 py-3 text-xs leading-relaxed text-amber-200">
                <Icon name="merge" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <strong className="font-semibold">Possible duplicate of {duplicate.trackingId}.</strong>{' '}
                  A similar {getCategory(form.category).label.toLowerCase()} was reported nearby in the
                  last hour. Submit anyway if this is a separate incident — the control room can merge
                  duplicate reports.
                </span>
              </div>
            )}

            <Field id="contact" label="Contact information" error={errors.contact} hint="Optional">
              <div className="relative">
                <Icon
                  name="phone"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
                />
                <input
                  id="contact"
                  name="contact"
                  type="text"
                  value={form.contact}
                  onChange={(event) => update('contact', event.target.value)}
                  placeholder="Phone number or email"
                  maxLength={120}
                  autoComplete="off"
                  aria-invalid={Boolean(errors.contact)}
                  aria-describedby={errors.contact ? 'contact-error' : undefined}
                  className={`field-input pl-9 ${errors.contact ? 'field-input-invalid' : ''}`}
                />
              </div>
            </Field>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-slate-500">
              Your report is stored in this browser. No login required.
            </p>
            <button type="submit" className="btn-primary w-full sm:w-auto">
              <Icon name="alertTriangle" className="size-4" />
              Submit emergency report
            </button>
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24" aria-label="Live triage preview">
          <section className="panel overflow-hidden">
            <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="section-title text-sm">Live severity preview</h2>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-slate-400 uppercase">
                  <span className="live-dot size-1.5 rounded-full bg-emerald-400" />
                  Live
                </span>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <SeverityBadge level={severity.level} />
                <span className={`font-display text-2xl font-bold tabular-nums ${severityStyle.text}`}>
                  {severity.score}
                  <span className="ml-1 text-xs font-medium text-slate-500">pts</span>
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${severityStyle.dot}`}
                  style={{ width: `${Math.min(100, severity.score)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>0</span>
                <span>30</span>
                <span>50</span>
                <span>75+</span>
              </div>

              <ul className="mt-4 space-y-1.5">
                {severity.reasons.length === 0 && (
                  <li className="text-xs leading-relaxed text-slate-500">
                    Select a category and describe the emergency to calculate a priority.
                  </li>
                )}
                {severity.reasons.map((reason, index) => (
                  <li key={`${reason.label}-${index}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      {reason.kind === 'base' && selectedCategory && (
                        <CategoryIcon category={selectedCategory.id} className="size-3.5" />
                      )}
                      {reason.label}
                    </span>
                    <span className={`font-mono font-semibold ${severityStyle.text}`}>+{reason.points}</span>
                  </li>
                ))}
              </ul>
              {severity.capped && <p className="mt-2 text-[11px] text-slate-500">Keyword points capped at 40.</p>}
              {selectedCategory && (
                <p className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-400">
                  Suggested responder:{' '}
                  <strong className="font-medium text-slate-200">{selectedCategory.responder}</strong>
                </p>
              )}
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                <Icon
                  name={coords ? 'checkCircle' : 'crosshair'}
                  className={`size-3.5 ${coords ? 'text-emerald-400' : ''}`}
                />
                {coords ? 'GPS pinned — nearest-unit distance enabled' : 'Optional GPS pin for dispatch distance'}
              </p>
            </div>
          </section>

          <section className="panel p-4" aria-labelledby="ai-panel-title">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg border border-violet-400/30 bg-violet-500/10 text-violet-300">
                  <Icon name="sparkles" className="size-4" />
                </span>
                <div>
                  <h2 id="ai-panel-title" className="font-display text-sm font-semibold text-white">
                    AI scene analysis
                  </h2>
                  <p className="text-[10px] text-slate-500">On-device triage · no internet needed</p>
                </div>
              </div>
              <span className="chip border-violet-400/30 bg-violet-500/10 text-violet-200">Advisory</span>
            </div>

            {form.description.trim().length < 10 ? (
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                Start typing the description — the scene analysis will estimate priority, suggest a
                responder and list immediate actions.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge level={analysis.priority} />
                  <span className="text-xs text-slate-400">AI priority · {analysis.score}/100</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-300">{analysis.summary}</p>
                <div>
                  <h3 className="text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
                    Immediate actions
                  </h3>
                  <ul className="mt-1.5 space-y-1.5">
                    {analysis.actions.slice(0, 3).map((action) => (
                      <li key={action} className="flex items-start gap-2 text-xs leading-snug text-slate-300">
                        <Icon name="check" className="mt-0.5 size-3.5 shrink-0 text-violet-300" />
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="border-t border-white/10 pt-2 text-[10px] leading-relaxed text-slate-500">
                  AI advice is advisory only. The rule-based score and human judgement decide dispatch.
                </p>
              </div>
            )}
          </section>

          <p className="px-1 text-[11px] leading-relaxed text-slate-500">
            In a life-threatening emergency, call your local emergency number first. This tool helps
            coordinate reports, it does not replace emergency services.
          </p>
        </aside>
      </div>
    </div>
  )
}
