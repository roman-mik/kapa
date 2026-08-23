import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { EventOrderPicker } from './EventOrderPicker';

const mockSetEventOrder = vi.fn();
vi.mock('@/app/actions/horizon-settings', () => ({
  setEventOrder: (...args: unknown[]) => mockSetEventOrder(...args),
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

const defaultOrder = [
  'income',
  'oneOffIn',
  'obligation',
  'dailyExpense',
  'oneOffOut',
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EventOrderPicker', () => {
  it('renders the five kinds in the given order', () => {
    render(<EventOrderPicker initialOrder={[...defaultOrder]} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Income'),
      expect.stringContaining('One-off in'),
      expect.stringContaining('Obligation'),
      expect.stringContaining('Daily expense'),
      expect.stringContaining('One-off out'),
    ]);
  });

  it('disables moving the first item up and the last item down', () => {
    render(<EventOrderPicker initialOrder={[...defaultOrder]} />);
    expect(
      screen.getByRole('button', { name: 'Move Income up' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move One-off out down' })
    ).toBeDisabled();
  });

  it('reorders and persists via the action on success', async () => {
    mockSetEventOrder.mockResolvedValue({ ok: true });
    render(<EventOrderPicker initialOrder={[...defaultOrder]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move One-off in up' }));

    await waitFor(() =>
      expect(mockSetEventOrder).toHaveBeenCalledWith({
        eventOrder: [
          'oneOffIn',
          'income',
          'obligation',
          'dailyExpense',
          'oneOffOut',
        ],
      })
    );
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Event order updated.')
    );
    expect(screen.getAllByRole('listitem')[0].textContent).toContain(
      'One-off in'
    );
  });

  it('reverts the order and shows an error toast when the action fails', async () => {
    mockSetEventOrder.mockResolvedValue({ ok: false, error: 'Save failed' });
    render(<EventOrderPicker initialOrder={[...defaultOrder]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move One-off in up' }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Save failed')
    );
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('Income');
  });
});
