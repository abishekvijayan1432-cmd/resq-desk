import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CATEGORIES, CATEGORY_MAP } from '../lib/engine'
import { CATEGORY_HEX, Icon } from './ui'

function ChartTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-lg border border-white/15 bg-navy-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-white">{point.label}</p>
      <p className="mt-0.5 text-slate-400">
        {point.count} incident{point.count === 1 ? '' : 's'}
      </p>
    </div>
  )
}

export default function CategoryChart({ incidents }) {
  const axisLabels = {
    fire: 'Fire',
    road: 'Road',
    medical: 'Medical',
    flood: 'Flood',
    collapse: 'Collapse',
    other: 'Other',
  }
  const data = CATEGORIES.map((category) => ({
    name: axisLabels[category.id] || category.short,
    label: category.label,
    count: incidents.filter((incident) => incident.category === category.id).length,
    color: CATEGORY_HEX[category.id],
  }))
  const hasData = data.some((point) => point.count > 0)

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="category-chart-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="category-chart-title" className="section-title">
            Incidents by category
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">All reports, including resolved incidents.</p>
        </div>
        <span className="chip border-white/10 bg-white/5 text-slate-300">
          <Icon name="activity" className="size-3.5" />
          {incidents.length} total
        </span>
      </div>

      {!hasData ? (
        <div className="mt-8 flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-center">
          <Icon name="activity" className="size-6 text-slate-500" />
          <p className="mt-2 text-sm text-slate-400">No incidents to chart yet.</p>
        </div>
      ) : (
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} content={<ChartTooltip />} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={44}>
                {data.map((point) => (
                  <Cell key={point.name} fill={point.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
        {CATEGORIES.map((category) => (
          <li key={category.id} className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: CATEGORY_HEX[category.id] }}
              aria-hidden="true"
            />
            {CATEGORY_MAP[category.id].label}
          </li>
        ))}
      </ul>
    </section>
  )
}
