/**
 * Hand-rolled SVG waterfall chart for projection events.
 * Each bar shows the balance change from an event or aggregated same-day same-kind events.
 * Bars are colored by event kind, with the running balance shown between bars.
 */

import type { ProjectionEvent } from '@/lib/horizon/projection/types';

interface WaterfallChartProps {
  events: ProjectionEvent[];
  reportingCurrency: string;
}

interface BarData {
  date: string;
  kind: string;
  balanceBeforeMinor: number;
  balanceAfterMinor: number;
  label: string;
  amountMinor: number;
}

function getKindColor(kind: string): string {
  const colors: Record<string, string> = {
    income: '#16a34a',
    oneOffIn: '#0ea5e9',
    obligation: '#dc2626',
    dailyExpense: '#f59e0b',
    oneOffOut: '#7c3aed',
  };
  return colors[kind] || '#6b7280';
}

export function WaterfallChart({
  events,
  reportingCurrency,
}: WaterfallChartProps) {
  if (events.length === 0) {
    return null;
  }

  const unconvertibleEvents = events.filter((e) => !e.unconvertible);

  if (unconvertibleEvents.length === 0) {
    return null;
  }

  const barData: BarData[] = [];
  const eventsByDayKind = new Map<string, ProjectionEvent[]>();

  for (const event of unconvertibleEvents) {
    const key = `${event.date}:${event.kind}`;
    if (!eventsByDayKind.has(key)) {
      eventsByDayKind.set(key, []);
    }
    eventsByDayKind.get(key)!.push(event);
  }

  for (const [key, dayKindEvents] of eventsByDayKind) {
    const [date, kind] = key.split(':');
    const firstEvent = dayKindEvents[0];
    const lastEvent = dayKindEvents[dayKindEvents.length - 1];

    const totalAmount = dayKindEvents.reduce(
      (sum, e) => sum + (e.convertedMinor ?? 0),
      0
    );

    barData.push({
      date,
      kind,
      balanceBeforeMinor: firstEvent.balanceBeforeMinor,
      balanceAfterMinor: lastEvent.balanceAfterMinor,
      label:
        dayKindEvents.length === 1
          ? firstEvent.label
          : `${dayKindEvents.length} events`,
      amountMinor: totalAmount,
    });
  }

  barData.sort((a, b) => {
    const dateA = a.date;
    const dateB = b.date;
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    return a.balanceBeforeMinor - b.balanceBeforeMinor;
  });

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = 1200 - padding.left - padding.right;
  const chartHeight = 350 - padding.top - padding.bottom;

  const allBalances = [
    ...barData.map((b) => b.balanceBeforeMinor),
    ...barData.map((b) => b.balanceAfterMinor),
  ];
  const minBalance = Math.min(...allBalances);
  const maxBalance = Math.max(...allBalances);
  const range = maxBalance - minBalance || 1;

  const scaleY = (value: number) => {
    return chartHeight - ((value - minBalance) / range) * chartHeight;
  };

  const scaleX = (index: number) => {
    return (index / Math.max(1, barData.length - 1)) * chartWidth;
  };

  const zeroY = scaleY(0);
  const isZeroVisible = zeroY >= 0 && zeroY <= chartHeight;

  return (
    <svg
      viewBox={`0 0 1200 350`}
      width="100%"
      role="img"
      aria-label={`Waterfall chart showing ${barData.length} events across ${reportingCurrency}, ranging from ${Math.floor(minBalance).toLocaleString()} to ${Math.floor(maxBalance).toLocaleString()}`}
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
        <line
          x1={padding.left}
          y1={padding.top + zeroY}
          x2={padding.left + chartWidth}
          y2={padding.top + zeroY}
          stroke="currentColor"
          strokeDasharray="4"
          opacity="0.3"
        />
      )}

      {/* Bars */}
      {barData.map((bar, index) => {
        const x = padding.left + scaleX(index);
        const barWidth = Math.max(10, chartWidth / (barData.length * 1.5));
        const y1 = padding.top + scaleY(bar.balanceBeforeMinor);
        const y2 = padding.top + scaleY(bar.balanceAfterMinor);
        const barHeight = Math.abs(y2 - y1);
        const barY = Math.min(y1, y2);

        const color = getKindColor(bar.kind);

        return (
          <g key={`${bar.date}:${bar.kind}`}>
            {/* Bar */}
            <rect
              x={x - barWidth / 2}
              y={barY}
              width={barWidth}
              height={barHeight}
              fill={color}
              opacity="0.8"
              data-kind={bar.kind}
              data-date={bar.date}
            />

            {/* Amount label above bar */}
            <text
              x={x}
              y={barY - 5}
              fontSize="11"
              textAnchor="middle"
              fill="currentColor"
              className="font-mono"
            >
              {Math.round(bar.amountMinor).toLocaleString()}
            </text>

            {/* Running balance line to next bar */}
            {index < barData.length - 1 && (
              <>
                <line
                  x1={x + barWidth / 2}
                  y1={padding.top + scaleY(bar.balanceAfterMinor)}
                  x2={padding.left + scaleX(index + 1) - barWidth / 2}
                  y2={padding.top + scaleY(bar.balanceAfterMinor)}
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.3"
                />
                <line
                  x1={padding.left + scaleX(index + 1) - barWidth / 2}
                  y1={padding.top + scaleY(bar.balanceAfterMinor)}
                  x2={padding.left + scaleX(index + 1) - barWidth / 2}
                  y2={
                    padding.top + scaleY(barData[index + 1].balanceBeforeMinor)
                  }
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.3"
                />
              </>
            )}
          </g>
        );
      })}

      {/* X-axis labels (dates) */}
      {barData.map((bar, index) => {
        const x = padding.left + scaleX(index);
        if (
          index % Math.ceil(barData.length / 8) !== 0 &&
          index !== barData.length - 1
        ) {
          return null;
        }

        return (
          <text
            key={`label-${index}`}
            x={x}
            y={padding.top + chartHeight + 25}
            fontSize="11"
            textAnchor="middle"
            fill="currentColor"
          >
            {bar.date}
          </text>
        );
      })}

      {/* Legend */}
      {Array.from(new Set(barData.map((b) => b.kind))).map((kind, idx) => {
        const x = padding.left + (idx % 3) * 250;
        const y = padding.top + chartHeight + 50 + Math.floor(idx / 3) * 20;

        return (
          <g key={`legend-${kind}`}>
            <rect
              x={x}
              y={y - 12}
              width={12}
              height={12}
              fill={getKindColor(kind)}
              opacity="0.8"
            />
            <text x={x + 18} y={y} fontSize="12" fill="currentColor">
              {kind}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
