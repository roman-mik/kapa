/**
 * Hand-rolled SVG line chart for projection balance over time.
 * Shows balance curve, zero line, and event markers.
 * Paired with table view per §5-D1.
 */

import type {
  ProjectionEvent,
  DailyBalance,
} from '@/lib/horizon/projection/types';

interface BalanceLineChartProps {
  dailyBalances: DailyBalance[];
  events: ProjectionEvent[];
  reportingCurrency: string;
}

export function BalanceLineChart({
  dailyBalances,
  events,
  reportingCurrency,
}: BalanceLineChartProps) {
  if (dailyBalances.length === 0) {
    return null;
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = 1000 - padding.left - padding.right;
  const chartHeight = 300 - padding.top - padding.bottom;

  const balances = dailyBalances.map((b) => b.totalMinor);
  const minBalance = Math.min(...balances);
  const maxBalance = Math.max(...balances);
  const range = maxBalance - minBalance || 1;

  const scaleY = (value: number) => {
    return chartHeight - ((value - minBalance) / range) * chartHeight;
  };

  const scaleX = (index: number) => {
    return (index / (dailyBalances.length - 1)) * chartWidth;
  };

  const points = dailyBalances.map((_, i) => {
    const x = scaleX(i);
    const y = scaleY(dailyBalances[i].totalMinor);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  const zeroY = scaleY(0);
  const isZeroVisible = zeroY >= 0 && zeroY <= chartHeight;

  const eventMarkers = events
    .filter((e) => !e.unconvertible)
    .map((e) => {
      const dayIndex = dailyBalances.findIndex((b) => b.date === e.date);
      if (dayIndex === -1) return null;
      return { dayIndex, event: e };
    })
    .filter((m) => m !== null);

  const hasNegativeDays = dailyBalances.some((b) => b.totalMinor < 0);

  return (
    <svg
      viewBox={`0 0 1000 300`}
      width="100%"
      role="img"
      aria-label={`Balance projection over ${dailyBalances.length} days, ranging from ${Math.floor(minBalance).toLocaleString()} to ${Math.floor(maxBalance).toLocaleString()} ${reportingCurrency}`}
      className="mb-6"
    >
      {/* Y-axis labels */}
      <text
        x="10"
        y={padding.top + 5}
        fontSize="12"
        textAnchor="end"
        fill="currentColor"
      >
        {Math.floor(maxBalance).toLocaleString()}
      </text>
      <text
        x="10"
        y={padding.top + chartHeight / 2 + 5}
        fontSize="12"
        textAnchor="end"
        fill="currentColor"
      >
        {Math.floor((maxBalance + minBalance) / 2).toLocaleString()}
      </text>
      <text
        x="10"
        y={padding.top + chartHeight + 5}
        fontSize="12"
        textAnchor="end"
        fill="currentColor"
      >
        {Math.floor(minBalance).toLocaleString()}
      </text>

      {/* Zero line */}
      {isZeroVisible && (
        <>
          <line
            x1={padding.left}
            y1={padding.top + zeroY}
            x2={padding.left + chartWidth}
            y2={padding.top + zeroY}
            stroke="currentColor"
            strokeDasharray="4,4"
            opacity="0.3"
          />
          <text
            x={padding.left + chartWidth + 5}
            y={padding.top + zeroY + 5}
            fontSize="12"
            fill="currentColor"
            opacity="0.6"
          >
            Zero
          </text>
        </>
      )}

      {/* Chart area (clipped) */}
      <g clipPath="url(#chartClip)">
        {/* Balance line */}
        <path
          d={pathD}
          fill="none"
          stroke={hasNegativeDays ? 'rgb(239, 68, 68)' : 'rgb(34, 197, 94)'}
          strokeWidth="2"
          transform={`translate(${padding.left}, ${padding.top})`}
        />

        {/* Event markers */}
        {eventMarkers.map((m) => {
          if (!m) return null;
          const x = scaleX(m.dayIndex);
          const y = scaleY(dailyBalances[m.dayIndex].totalMinor);
          const isNegativeEvent = m.event.balanceAfterMinor < 0;
          return (
            <circle
              key={`${m.event.date}-${m.event.sourceId}`}
              cx={x}
              cy={y}
              r="3"
              fill={isNegativeEvent ? 'rgb(239, 68, 68)' : 'rgb(34, 197, 94)'}
              opacity="0.7"
              transform={`translate(${padding.left}, ${padding.top})`}
            />
          );
        })}
      </g>

      <defs>
        <clipPath id="chartClip">
          <rect
            x={padding.left}
            y={padding.top}
            width={chartWidth}
            height={chartHeight}
          />
        </clipPath>
      </defs>

      {/* Axes */}
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

      {/* X-axis labels (start, end) */}
      <text
        x={padding.left}
        y={padding.top + chartHeight + 25}
        fontSize="12"
        textAnchor="middle"
        fill="currentColor"
      >
        {dailyBalances[0]?.date}
      </text>
      <text
        x={padding.left + chartWidth}
        y={padding.top + chartHeight + 25}
        fontSize="12"
        textAnchor="middle"
        fill="currentColor"
      >
        {dailyBalances[dailyBalances.length - 1]?.date}
      </text>

      {/* Legend note */}
      <text
        x={padding.left}
        y={290}
        fontSize="11"
        fill="currentColor"
        opacity="0.6"
      >
        {hasNegativeDays
          ? '⚠ Projection includes negative days'
          : 'All days remain positive'}
      </text>
    </svg>
  );
}
