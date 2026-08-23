import { describe, it, expect } from 'vitest';
import { renderWithIntl as render } from '@/test/intl';
import { HeadlineMetrics } from './HeadlineMetrics';
import type { ProjectionMetrics } from '@/lib/horizon/projection/types';

describe('HeadlineMetrics', () => {
  const mockMetrics: ProjectionMetrics = {
    monthlySurplusMinor: {
      value: 50000,
      inputs: {
        totalInflowMinor: 300000,
        totalOutflowMinor: -250000,
        rangeDays: 30,
        eventDays: 29,
        monthsInRange: '0.99',
      },
      formulaKey: 'projection.metrics.monthlySurplus',
      caveatKey: null,
    },
    annualEquivalentMinor: {
      value: 600000,
      inputs: {
        recurringInflowMinor: 300000,
        recurringOutflowMinor: -250000,
        excludedOneOffInflowMinor: 0,
        excludedOneOffOutflowMinor: 0,
        excludedOneOffCount: 0,
        monthsInRange: '0.99',
      },
      formulaKey: 'projection.metrics.annualEquivalent',
      caveatKey: null,
    },
    runwayMonths: {
      value: 24,
      inputs: {
        openingTotalMinor: 1200000,
        monthlySurplusMinor: 50000,
        note: 'uses all-inclusive surplus',
      },
      formulaKey: 'projection.metrics.runwayMonths',
      caveatKey: null,
    },
    firstNegativeDate: {
      value: null,
      inputs: {
        totalDays: 30,
      },
      formulaKey: 'projection.metrics.firstNegativeDate',
      caveatKey: null,
    },
    breakEvenRateMinor: {
      value: 4500,
      inputs: {
        currentHourlyIncomeMinor: 250000,
        totalHours: '176.00',
        monthlySurplusMinor: 50000,
        monthsInRange: '0.99',
      },
      formulaKey: 'projection.metrics.breakEvenRate',
      caveatKey: null,
    },
  };

  it('renders all five metrics', () => {
    const { container } = render(<HeadlineMetrics metrics={mockMetrics} />);

    const details = container.querySelectorAll('details');
    expect(details).toHaveLength(5);
  });

  it('shows metric values in the summary', () => {
    const { container } = render(<HeadlineMetrics metrics={mockMetrics} />);

    expect(container.textContent).toContain('50,000');
    expect(container.textContent).toContain('600,000');
    expect(container.textContent).toContain('24');
  });

  it('displays "indefinite" for null runway value', () => {
    const metricsWithNullRunway: ProjectionMetrics = {
      ...mockMetrics,
      runwayMonths: {
        value: null,
        inputs: {
          openingTotalMinor: 1000000,
          monthlySurplusMinor: 10000,
          note: '',
        },
        formulaKey: 'projection.metrics.runwayMonths',
        caveatKey: null,
      },
    };

    const { container } = render(
      <HeadlineMetrics metrics={metricsWithNullRunway} />
    );

    expect(container.textContent).toContain('indefinite');
  });

  it('shows inputs when expanded', () => {
    const { container } = render(<HeadlineMetrics metrics={mockMetrics} />);

    const firstDetails = container.querySelector('details');
    expect(firstDetails).toBeTruthy();

    if (firstDetails) {
      firstDetails.setAttribute('open', '');
    }

    expect(container.textContent).toContain('totalInflowMinor');
    expect(container.textContent).toContain('300000');
  });

  it('displays caveat when present', () => {
    const metricsWithCaveat: ProjectionMetrics = {
      ...mockMetrics,
      monthlySurplusMinor: {
        ...mockMetrics.monthlySurplusMinor,
        caveatKey: 'shortRange',
      },
    };

    const { container } = render(
      <HeadlineMetrics metrics={metricsWithCaveat} />
    );

    expect(container.textContent).toContain('Range is less than 28 days');
  });

  it('shows "none" for missing first negative date', () => {
    const { container } = render(<HeadlineMetrics metrics={mockMetrics} />);

    expect(container.textContent).toContain('none');
  });

  it('shows actual date for first negative date when present', () => {
    const metricsWithNegativeDate: ProjectionMetrics = {
      ...mockMetrics,
      firstNegativeDate: {
        value: '2026-09-15',
        inputs: { totalDays: 30 },
        formulaKey: 'projection.metrics.firstNegativeDate',
        caveatKey: null,
      },
    };

    const { container } = render(
      <HeadlineMetrics metrics={metricsWithNegativeDate} />
    );

    expect(container.textContent).toContain('2026-09-15');
  });

  it('is accessible with details/summary elements', () => {
    const { container } = render(<HeadlineMetrics metrics={mockMetrics} />);

    const details = container.querySelectorAll('details');
    const summaries = container.querySelectorAll('summary');

    expect(details).toHaveLength(5);
    expect(summaries).toHaveLength(5);

    summaries.forEach((summary) => {
      expect(summary.getAttribute('role')).not.toBe('button');
    });
  });
});
