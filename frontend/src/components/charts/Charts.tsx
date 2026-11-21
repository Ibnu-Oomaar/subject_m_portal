import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Thin wrappers over Recharts that use the theme's colour tokens, so charts follow light/dark mode. */
const AXIS = { fontSize: 11, fill: 'var(--muted-foreground)' };
const tooltipStyle = {
  contentStyle: { background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--popover-foreground)', boxShadow: '0 4px 12px rgb(0 0 0 / 0.12)' },
  labelStyle: { color: 'var(--muted-foreground)', marginBottom: 2 },
  cursor: { fill: 'var(--muted)', opacity: 0.5 },
};
export const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

export interface Series {
  key: string;
  name: string;
  color?: string;
}
interface BaseProps {
  data: Array<Record<string, string | number | null>>;
  xKey: string;
  series: Series[];
  height?: number;
  yMax?: number;
  unit?: string;
  ariaLabel: string;
}

export function BarChartView({ data, xKey, series, height = 220, yMax, unit = '', ariaLabel }: BaseProps) {
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={3}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, yMax ?? 'auto']} unit={unit} allowDecimals={false} />
          <Tooltip {...tooltipStyle} formatter={(v) => (v === null || v === undefined ? '—' : `${v}${unit}`)} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Missing values are left as gaps (connectNulls is off): a term with no results is not drawn as zero. */
export function LineChartView({ data, xKey, series, height = 220, yMax = 100, unit = '', ariaLabel }: BaseProps) {
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, yMax]} unit={unit} />
          <Tooltip {...tooltipStyle} formatter={(v) => (v === null || v === undefined ? 'No result' : `${v}${unit}`)} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3.5, strokeWidth: 0, fill: s.color ?? CHART_COLORS[i % CHART_COLORS.length] }} activeDot={{ r: 5 }} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** True when a chart would have nothing to draw (every value missing). */
export const hasValues = (data: BaseProps['data'], keys: string[]): boolean => data.some((d) => keys.some((k) => d[k] !== null && d[k] !== undefined));
