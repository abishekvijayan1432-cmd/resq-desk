import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { teamSummary } from '../lib/teams'
import { Icon } from './ui'

const SLICES = [
  { key: 'available', label: 'Available', color: '#34d399' },
  { key: 'busy', label: 'On assignment', color: '#fbbf24' },
  { key: 'offDuty', label: 'Off duty', color: '#64748b' },
]

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0]
  return (
    <div className="rounded-lg border border-white/15 bg-navy-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-white">{point.name}</p>
      <p className="mt-0.5 text-slate-400">{point.value} team{point.value === 1 ? '' : 's'}</p>
    </div>
  )
}

export default function TeamChart({ teams }) {
  const stats = teamSummary(teams)
  const values = {
    available: stats.available,
    busy: stats.busy,
    offDuty: stats.offDuty,
  }
  const data = SLICES.map((slice) => ({ ...slice, value: values[slice.key] })).filter(
    (slice) => slice.value > 0,
  )
  const readiness = stats.total ? Math.round((stats.available / stats.total) * 100) : 0

  return (
    <section className="panel flex flex-col p-4 sm:p-5" aria-labelledby="team-chart-title">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="team-chart-title" className="section-title">
            Team availability
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">Live response capacity.</p>
        </div>
        <span className="chip border-white/10 bg-white/5 text-slate-300">
          <Icon name="users" className="size-3.5" />
          {stats.total}
        </span>
      </div>

      {stats.total === 0 ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-10 text-center">
          <Icon name="users" className="size-6 text-slate-500" />
          <p className="mt-2 text-sm text-slate-400">No teams on the roster.</p>
        </div>
      ) : (
        <>
          <div className="relative mt-2 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={48}
                  outerRadius={68}
                  paddingAngle={3}
                  stroke="none"
                >
                  {data.map((slice) => (
                    <Cell key={slice.key} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="font-display text-2xl font-bold text-white">{stats.available}</p>
              <p className="text-[9px] tracking-wide text-slate-500 uppercase">ready now</p>
            </div>
          </div>

          <ul className="mt-1 space-y-1.5">
            {SLICES.map((slice) => (
              <li key={slice.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-slate-300">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: slice.color }}
                    aria-hidden="true"
                  />
                  {slice.label}
                </span>
                <span className="font-mono text-[11px] text-slate-400">{values[slice.key]}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 rounded-lg border border-white/10 bg-navy-950/40 px-3 py-2">
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span className="tracking-wide uppercase">Readiness</span>
              <span className="font-mono text-slate-300">{readiness}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${readiness}%` }}
              />
            </div>
          </div>
        </>
      )}
    </section>
  )
}
