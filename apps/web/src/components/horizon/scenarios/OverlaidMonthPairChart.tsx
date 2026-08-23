/**
 * E3: N-series month-end + monthly-minimum overlay, always plotted as a
 * pair per scenario (§2-D2: month-end is never shown alone). Solid line =
 * month end, dashed line = monthly minimum, both in the scenario's color.
 */
import type { ScenarioResult } from '@/lib/horizon/scenarios/compareScenarios';

const PALETTE = [
  'rgb(59, 130, 246)',
  'rgb(234, 88, 12)',
  'rgb(168, 85, 247)',
  'rgb(20, 184, 166)',
];

export function OverlaidMonthPairChart({
  results,
  reportingCurrency,
}: {
  results: ScenarioResult[];
  reportingCurrency: string;
}) {
  const months = results[0]?.monthPoints.map((m) => m.month) ?? [];
  if (months.length === 0) return null;

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = 1000 - padding.left - padding.right;
  const chartHeight = 300 - padding.top - padding.bottom;

  const allValues = results.flatMap((r) =>
    r.monthPoints.flatMap((m) => [m.end.balanceMinor, m.minimum.balanceMinor])
  );
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const range = maxValue - minValue || 1;

  const scaleY = (value: number) =>
    chartHeight - ((value - minValue) / range) * chartHeight;
  const scaleX = (index: number) =>
    months.length > 1 ? (index / (months.length - 1)) * chartWidth : 0;

  return (
    <svg
      viewBox="0 0 1000 320"
      width="100%"
      role="img"
      aria-label={`Month-end and monthly-minimum balances for ${results.length} scenarios, in ${reportingCurrency}`}
    >
      <g clipPath="url(#scenarioMonthPairClip)">
        {results.map((r, i) => {
          const endPoints = r.monthPoints.map((m, idx) => {
            const x = scaleX(idx);
            const y = scaleY(m.end.balanceMinor);
            return `${x},${y}`;
          });
          const minPoints = r.monthPoints.map((m, idx) => {
            const x = scaleX(idx);
            const y = scaleY(m.minimum.balanceMinor);
            return `${x},${y}`;
          });
          const color = PALETTE[i % PALETTE.length];
          return (
            <g key={r.scenarioId ?? 'baseline'}>
              <path
                d={`M ${endPoints.join(' L ')}`}
                fill="none"
                stroke={color}
                strokeWidth="2"
                transform={`translate(${padding.left}, ${padding.top})`}
              />
              <path
                d={`M ${minPoints.join(' L ')}`}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeDasharray="4,3"
                opacity="0.7"
                transform={`translate(${padding.left}, ${padding.top})`}
              />
            </g>
          );
        })}
      </g>

      <defs>
        <clipPath id="scenarioMonthPairClip">
          <rect
            x={padding.left}
            y={padding.top}
            width={chartWidth}
            height={chartHeight}
          />
        </clipPath>
      </defs>

      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={padding.top + chartHeight}
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.3"
      />
      <line
        x1={padding.left}
        y1={padding.top + chartHeight}
        x2={padding.left + chartWidth}
        y2={padding.top + chartHeight}
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.3"
      />

      {results.map((r, i) => (
        <g key={r.scenarioId ?? 'baseline'} transform={`translate(${padding.left + i * 200}, 310)`}>
          <rect width="10" height="10" fill={PALETTE[i % PALETTE.length]} />
          <text x="14" y="9" fontSize="11" fill="currentColor">
            {r.scenarioId === null ? 'Baseline' : r.scenarioName} (— end, ┄ min)
          </text>
        </g>
      ))}
    </svg>
  );
}
