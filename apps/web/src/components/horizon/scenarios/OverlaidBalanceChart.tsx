/**
 * E3: N-series version of `BalanceLineChart` — one labeled line per
 * scenario (baseline included), same SVG scaling approach.
 */
import type { ScenarioResult } from '@/lib/horizon/scenarios/compareScenarios';

const PALETTE = [
  'rgb(59, 130, 246)', // blue — baseline
  'rgb(234, 88, 12)', // orange
  'rgb(168, 85, 247)', // purple
  'rgb(20, 184, 166)', // teal
];

export function OverlaidBalanceChart({
  results,
  reportingCurrency,
}: {
  results: ScenarioResult[];
  reportingCurrency: string;
}) {
  if (results.length === 0 || results[0].dailyBalances.length === 0) {
    return null;
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = 1000 - padding.left - padding.right;
  const chartHeight = 300 - padding.top - padding.bottom;

  const allBalances = results.flatMap((r) => r.dailyBalances.map((b) => b.totalMinor));
  const minBalance = Math.min(...allBalances);
  const maxBalance = Math.max(...allBalances);
  const range = maxBalance - minBalance || 1;

  const dayCount = results[0].dailyBalances.length;
  const scaleY = (value: number) =>
    chartHeight - ((value - minBalance) / range) * chartHeight;
  const scaleX = (index: number) => (index / (dayCount - 1)) * chartWidth;

  const zeroY = scaleY(0);
  const isZeroVisible = zeroY >= 0 && zeroY <= chartHeight;

  return (
    <svg
      viewBox="0 0 1000 320"
      width="100%"
      role="img"
      aria-label={`Balance projection for ${results.length} scenarios, ranging from ${Math.floor(minBalance).toLocaleString()} to ${Math.floor(maxBalance).toLocaleString()} ${reportingCurrency}`}
    >
      {isZeroVisible && (
        <line
          x1={padding.left}
          y1={padding.top + zeroY}
          x2={padding.left + chartWidth}
          y2={padding.top + zeroY}
          stroke="currentColor"
          strokeDasharray="4,4"
          opacity="0.3"
        />
      )}

      <g clipPath="url(#scenarioChartClip)">
        {results.map((r, i) => {
          const points = r.dailyBalances.map((b, idx) => {
            const x = scaleX(idx);
            const y = scaleY(b.totalMinor);
            return `${x},${y}`;
          });
          return (
            <path
              key={r.scenarioId ?? 'baseline'}
              d={`M ${points.join(' L ')}`}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth="2"
              transform={`translate(${padding.left}, ${padding.top})`}
            />
          );
        })}
      </g>

      <defs>
        <clipPath id="scenarioChartClip">
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

      {/* Legend */}
      {results.map((r, i) => (
        <g key={r.scenarioId ?? 'baseline'} transform={`translate(${padding.left + i * 200}, 310)`}>
          <rect width="10" height="10" fill={PALETTE[i % PALETTE.length]} />
          <text x="14" y="9" fontSize="11" fill="currentColor">
            {r.scenarioId === null ? 'Baseline' : r.scenarioName}
          </text>
        </g>
      ))}
    </svg>
  );
}
