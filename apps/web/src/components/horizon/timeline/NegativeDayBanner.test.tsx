import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { NegativeDayBanner } from './NegativeDayBanner';
import type { NegativeDay } from '@/lib/horizon/projection/types';

const mockDismissAction = vi.fn();
const mockUndismissAction = vi.fn();
vi.mock('@/app/actions/horizon-projection', () => ({
  dismissNegativeDayAction: (...args: unknown[]) => mockDismissAction(...args),
  undismissNegativeDayAction: (...args: unknown[]) =>
    mockUndismissAction(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NegativeDayBanner', () => {
  const mockNegativeDay: NegativeDay = {
    date: '2026-08-24',
    shortfallMinor: 50000,
    shortfallCurrency: 'USD',
    trigger: 'total',
    negativeAccountIds: [],
    suggestions: [
      {
        kind: 'shiftPayment',
        id: 'shift1',
        scope: { kind: 'total' },
        sourceId: 's1',
        eventLabel: 'Rent',
        eventDate: '2026-08-22',
        amountMinor: 50000,
        suggestedDate: '2026-08-26',
      },
    ],
    dismissed: false,
    dismissedReason: null,
  };

  it('renders null when there are no negative days', () => {
    const { container } = render(
      <NegativeDayBanner negativeDays={[]} reportingCurrency="USD" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders null when all negative days are dismissed', () => {
    const dismissed: NegativeDay = {
      ...mockNegativeDay,
      dismissed: true,
      dismissedReason: 'Budget adjustment',
    };

    const { container } = render(
      <NegativeDayBanner negativeDays={[dismissed]} reportingCurrency="USD" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('lists every non-dismissed negative date', () => {
    render(
      <NegativeDayBanner
        negativeDays={[mockNegativeDay]}
        reportingCurrency="USD"
      />
    );

    expect(screen.getByText('2026-08-24')).toBeInTheDocument();
  });

  it('shows dismiss button and allows opening the form', () => {
    render(
      <NegativeDayBanner
        negativeDays={[mockNegativeDay]}
        reportingCurrency="USD"
      />
    );

    const dismissButtons = screen.getAllByRole('button', { name: /Dismiss/i });
    expect(dismissButtons.length).toBeGreaterThan(0);

    fireEvent.click(dismissButtons[0]);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('requires non-empty reason before dismissal', () => {
    render(
      <NegativeDayBanner
        negativeDays={[mockNegativeDay]}
        reportingCurrency="USD"
      />
    );

    const dismissButtons = screen.getAllByRole('button', { name: /Dismiss/i });
    fireEvent.click(dismissButtons[0]);

    const buttons = screen.getAllByRole('button');
    const submitButton = buttons[buttons.length - 2]; // Second-to-last button (first submit)
    expect(submitButton).toBeDisabled();

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '   ' } });
    expect(submitButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'Budget adjustment' } });
    expect(submitButton).not.toBeDisabled();
  });

  it('calls dismissNegativeDayAction with correct data', async () => {
    mockDismissAction.mockResolvedValue({ ok: true });

    render(
      <NegativeDayBanner
        negativeDays={[mockNegativeDay]}
        reportingCurrency="USD"
      />
    );

    const dismissButtons = screen.getAllByRole('button', { name: /Dismiss/i });
    fireEvent.click(dismissButtons[0]);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Budget adjustment' } });

    const buttons = screen.getAllByRole('button');
    const submitButton = buttons[buttons.length - 2];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockDismissAction).toHaveBeenCalledWith({
        negativeDate: '2026-08-24',
        shortfallMinor: 50000,
        currency: 'USD',
        reason: 'Budget adjustment',
      });
    });
  });

  it('shows success toast on successful dismissal', async () => {
    mockDismissAction.mockResolvedValue({ ok: true });

    render(
      <NegativeDayBanner
        negativeDays={[mockNegativeDay]}
        reportingCurrency="USD"
      />
    );

    const dismissButtons = screen.getAllByRole('button', { name: /Dismiss/i });
    fireEvent.click(dismissButtons[0]);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Budget adjustment' } });

    const buttons = screen.getAllByRole('button');
    const submitButton = buttons[buttons.length - 2];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalled();
    });
  });

  it('shows error toast on failed dismissal', async () => {
    mockDismissAction.mockResolvedValue({
      ok: false,
      error: 'Save failed',
    });

    render(
      <NegativeDayBanner
        negativeDays={[mockNegativeDay]}
        reportingCurrency="USD"
      />
    );

    const dismissButtons = screen.getAllByRole('button', { name: /Dismiss/i });
    fireEvent.click(dismissButtons[0]);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Budget adjustment' } });

    const buttons = screen.getAllByRole('button');
    const submitButton = buttons[buttons.length - 2];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Save failed');
    });
  });

  it('handles shiftPayment suggestion with null suggestedDate', () => {
    const dayWithNullDate: NegativeDay = {
      ...mockNegativeDay,
      suggestions: [
        {
          kind: 'shiftPayment',
          id: 'shift1',
          scope: { kind: 'total' },
          sourceId: 's1',
          eventLabel: 'Rent',
          eventDate: '2026-08-22',
          amountMinor: 50000,
          suggestedDate: null,
        },
      ],
    };

    render(
      <NegativeDayBanner
        negativeDays={[dayWithNullDate]}
        reportingCurrency="USD"
      />
    );

    const container = screen.getByText('2026-08-24').closest('div');
    expect(container).toBeInTheDocument();
  });

  it('handles holdBack suggestion with null from', () => {
    const dayWithNullFrom: NegativeDay = {
      ...mockNegativeDay,
      suggestions: [
        {
          kind: 'holdBack',
          id: 'hold1',
          scope: { kind: 'total' },
          amountMinor: 50000,
          from: null,
        },
      ],
    };

    render(
      <NegativeDayBanner
        negativeDays={[dayWithNullFrom]}
        reportingCurrency="USD"
      />
    );

    expect(screen.getByText('2026-08-24')).toBeInTheDocument();
  });

  it('handles account-scoped suggestions', () => {
    const dayWithAccountScope: NegativeDay = {
      ...mockNegativeDay,
      trigger: 'account',
      suggestions: [
        {
          kind: 'bringForward',
          id: 'bring1',
          scope: { kind: 'account', accountId: 'acc123', currency: 'USD' },
          sourceId: 's1',
          eventLabel: 'Deposit',
          eventDate: '2026-08-25',
          amountMinor: 50000,
          toDate: '2026-08-24',
        },
      ],
    };

    render(
      <NegativeDayBanner
        negativeDays={[dayWithAccountScope]}
        reportingCurrency="USD"
      />
    );

    expect(screen.getByText(/Deposit/)).toBeInTheDocument();
  });

  it('closes dismiss form on cancel', () => {
    render(
      <NegativeDayBanner
        negativeDays={[mockNegativeDay]}
        reportingCurrency="USD"
      />
    );

    const dismissButtons = screen.getAllByRole('button', { name: /Dismiss/i });
    fireEvent.click(dismissButtons[0]);
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    const cancelButton = buttons[buttons.length - 1];
    fireEvent.click(cancelButton);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('handles multiple non-dismissed negative days', () => {
    const day2: NegativeDay = {
      ...mockNegativeDay,
      date: '2026-08-25',
    };

    render(
      <NegativeDayBanner
        negativeDays={[mockNegativeDay, day2]}
        reportingCurrency="USD"
      />
    );

    expect(screen.getByText('2026-08-24')).toBeInTheDocument();
    expect(screen.getByText('2026-08-25')).toBeInTheDocument();
  });

  it('renders trigger badges for different trigger types', () => {
    const dayWithAccountTrigger: NegativeDay = {
      ...mockNegativeDay,
      trigger: 'account',
    };

    const dayWithBothTrigger: NegativeDay = {
      ...mockNegativeDay,
      date: '2026-08-25',
      trigger: 'both',
    };

    render(
      <NegativeDayBanner
        negativeDays={[dayWithAccountTrigger, dayWithBothTrigger]}
        reportingCurrency="USD"
      />
    );

    const accountText = screen.getAllByText(/Account/i);
    expect(accountText.length).toBeGreaterThan(0);
  });
});
