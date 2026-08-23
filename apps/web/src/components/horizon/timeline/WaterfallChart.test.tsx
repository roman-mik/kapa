import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WaterfallChart } from './WaterfallChart';
import type { ProjectionEvent } from '@/lib/horizon/projection/types';
import type { Money } from '@/lib/types';

describe('WaterfallChart', () => {
  const createEvent = (
    overrides: Partial<ProjectionEvent> = {}
  ): ProjectionEvent => ({
    date: '2026-08-23',
    originalDate: '2026-08-23',
    shifted: false,
    kind: 'income',
    label: 'Salary',
    sourceId: 's1',
    scheduleId: 'sch1',
    occurrenceIndex: 1,
    amountMinor: 100000 as Money,
    currency: 'USD',
    accountId: 'acc1',
    convertedMinor: 100000,
    unconvertible: false,
    recurrence: 'recurring',
    confidence: 'confirmed',
    derivation: 'entered',
    coveredPeriod: null,
    balanceBeforeMinor: 0,
    balanceAfterMinor: 100000,
    ...overrides,
  });

  it('renders an SVG with proper attributes', () => {
    const events = [createEvent()];
    const { container } = render(
      <WaterfallChart events={events} reportingCurrency="USD" />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBeTruthy();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 1200 350');
  });

  it('does not render when events are empty', () => {
    const { container } = render(
      <WaterfallChart events={[]} reportingCurrency="USD" />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeNull();
  });

  it('does not render when all events are unconvertible', () => {
    const events = [
      createEvent({
        unconvertible: true,
        convertedMinor: null,
      }),
    ];

    const { container } = render(
      <WaterfallChart events={events} reportingCurrency="USD" />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeNull();
  });

  it('aggregates same-day same-kind events into one bar', () => {
    const events = [
      createEvent({
        date: '2026-08-23',
        kind: 'income',
        amountMinor: 100000 as Money,
        convertedMinor: 100000,
        balanceBeforeMinor: 0,
        balanceAfterMinor: 100000,
      }),
      createEvent({
        date: '2026-08-23',
        kind: 'income',
        label: 'Bonus',
        amountMinor: 50000 as Money,
        convertedMinor: 50000,
        balanceBeforeMinor: 100000,
        balanceAfterMinor: 150000,
      }),
      createEvent({
        date: '2026-08-24',
        kind: 'obligation',
        label: 'Rent',
        amountMinor: -60000 as Money,
        convertedMinor: -60000,
        balanceBeforeMinor: 150000,
        balanceAfterMinor: 90000,
      }),
    ];

    const { container } = render(
      <WaterfallChart events={events} reportingCurrency="USD" />
    );

    const rects = container.querySelectorAll('rect[data-kind]');
    expect(rects.length).toBe(2);

    const kindDateKey1 = Array.from(rects).find(
      (r) => r.getAttribute('data-kind') === 'income'
    );
    expect(kindDateKey1).toBeTruthy();

    const kindDateKey2 = Array.from(rects).find(
      (r) => r.getAttribute('data-kind') === 'obligation'
    );
    expect(kindDateKey2).toBeTruthy();
  });

  it('shows running balance between bars', () => {
    const events = [
      createEvent({
        date: '2026-08-23',
        kind: 'income',
        balanceBeforeMinor: 0,
        balanceAfterMinor: 100000,
      }),
      createEvent({
        date: '2026-08-24',
        kind: 'obligation',
        balanceBeforeMinor: 100000,
        balanceAfterMinor: 40000,
      }),
    ];

    const { container } = render(
      <WaterfallChart events={events} reportingCurrency="USD" />
    );

    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('sorts bars by date and balance', () => {
    const events = [
      createEvent({
        date: '2026-08-24',
        balanceBeforeMinor: 100000,
        balanceAfterMinor: 80000,
      }),
      createEvent({
        date: '2026-08-23',
        balanceBeforeMinor: 0,
        balanceAfterMinor: 100000,
      }),
    ];

    const { container } = render(
      <WaterfallChart events={events} reportingCurrency="USD" />
    );

    const dateLabels = Array.from(container.querySelectorAll('text')).filter(
      (t) => /^\d{4}-\d{2}-\d{2}$/.test(t.textContent || '')
    );

    expect(dateLabels[0]?.textContent).toBe('2026-08-23');
  });

  it('filters out unconvertible events', () => {
    const events = [
      createEvent({
        date: '2026-08-23',
        unconvertible: false,
      }),
      createEvent({
        date: '2026-08-24',
        unconvertible: true,
        convertedMinor: null,
      }),
    ];

    const { container } = render(
      <WaterfallChart events={events} reportingCurrency="USD" />
    );

    const rects = container.querySelectorAll('rect[data-kind]');
    expect(rects.length).toBe(1);
  });

  it('shows zero line when zero is within range', () => {
    const events = [
      createEvent({
        date: '2026-08-23',
        balanceBeforeMinor: -50000,
        balanceAfterMinor: 50000,
      }),
    ];

    const { container } = render(
      <WaterfallChart events={events} reportingCurrency="USD" />
    );

    const dashLines = Array.from(container.querySelectorAll('line')).filter(
      (l) => l.getAttribute('stroke-dasharray') === '4'
    );

    expect(dashLines.length).toBeGreaterThan(0);
  });

  it('displays legend with all event kinds present', () => {
    const events = [
      createEvent({
        date: '2026-08-23',
        kind: 'income',
        balanceBeforeMinor: 0,
        balanceAfterMinor: 100000,
      }),
      createEvent({
        date: '2026-08-24',
        kind: 'obligation',
        balanceBeforeMinor: 100000,
        balanceAfterMinor: 50000,
      }),
    ];

    const { container } = render(
      <WaterfallChart events={events} reportingCurrency="USD" />
    );

    const legendText = container.textContent;
    expect(legendText).toContain('income');
    expect(legendText).toContain('obligation');
  });

  it('a day with five kinds shows at most five bars', () => {
    const events = [
      createEvent({
        date: '2026-08-23',
        kind: 'income',
        balanceBeforeMinor: 0,
        balanceAfterMinor: 100000,
      }),
      createEvent({
        date: '2026-08-23',
        kind: 'oneOffIn',
        balanceBeforeMinor: 100000,
        balanceAfterMinor: 150000,
      }),
      createEvent({
        date: '2026-08-23',
        kind: 'obligation',
        balanceBeforeMinor: 150000,
        balanceAfterMinor: 100000,
      }),
      createEvent({
        date: '2026-08-23',
        kind: 'dailyExpense',
        balanceBeforeMinor: 100000,
        balanceAfterMinor: 90000,
      }),
      createEvent({
        date: '2026-08-23',
        kind: 'oneOffOut',
        balanceBeforeMinor: 90000,
        balanceAfterMinor: 80000,
      }),
    ];

    const { container } = render(
      <WaterfallChart events={events} reportingCurrency="USD" />
    );

    const rects = container.querySelectorAll('rect[data-kind]');
    expect(rects.length).toBe(5);
  });
});
