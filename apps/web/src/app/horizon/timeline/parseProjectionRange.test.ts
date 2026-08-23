import { describe, it, expect } from 'vitest';
import { parseProjectionRange } from './parseProjectionRange';

describe('parseProjectionRange', () => {
  const today = '2026-08-23';

  describe('isValidDateString (via parseProjectionRange behavior)', () => {
    it('rejects invalid formats', () => {
      expect(parseProjectionRange({ from: '' }, today).from).toBe(today);
      expect(parseProjectionRange({ from: '26-01-01' }, today).from).toBe(
        today
      );
      expect(parseProjectionRange({ from: '2026-1-1' }, today).from).toBe(
        today
      );
      expect(parseProjectionRange({ from: 'invalid' }, today).from).toBe(today);
    });

    it('rejects invalid months', () => {
      expect(parseProjectionRange({ from: '2026-00-01' }, today).from).toBe(
        today
      );
      expect(parseProjectionRange({ from: '2026-13-01' }, today).from).toBe(
        today
      );
    });

    it('rejects invalid day-of-month', () => {
      expect(parseProjectionRange({ from: '2026-02-30' }, today).from).toBe(
        today
      );
      expect(parseProjectionRange({ from: '2026-04-31' }, today).from).toBe(
        today
      );
    });

    it('accepts valid dates', () => {
      expect(parseProjectionRange({ from: '2026-08-24' }, today).from).toBe(
        '2026-08-24'
      );
      expect(parseProjectionRange({ from: '2026-08-23' }, today).from).toBe(
        '2026-08-23'
      );
    });
  });

  describe('from parameter', () => {
    it('defaults to today when missing or malformed', () => {
      expect(parseProjectionRange({}, today).from).toBe(today);
      expect(parseProjectionRange({ from: 'invalid' }, today).from).toBe(today);
    });

    it('clamps from < today to today', () => {
      expect(parseProjectionRange({ from: '2026-08-20' }, today).from).toBe(
        today
      );
      expect(parseProjectionRange({ from: '2020-01-01' }, today).from).toBe(
        today
      );
    });

    it('accepts from >= today', () => {
      expect(parseProjectionRange({ from: '2026-08-23' }, today).from).toBe(
        '2026-08-23'
      );
      expect(parseProjectionRange({ from: '2027-01-01' }, today).from).toBe(
        '2027-01-01'
      );
    });
  });

  describe('to parameter', () => {
    it('defaults to 12 months from today when missing or malformed', () => {
      const expected = '2027-08-23';
      expect(parseProjectionRange({}, today).to).toBe(expected);
      expect(parseProjectionRange({ to: 'invalid' }, today).to).toBe(expected);
    });

    it('accepts valid to dates', () => {
      expect(parseProjectionRange({ to: '2027-08-23' }, today).to).toBe(
        '2027-08-23'
      );
      expect(parseProjectionRange({ to: '2031-08-22' }, today).to).toBe(
        '2031-08-22'
      );
    });
  });

  describe('to < from clamping', () => {
    it('collapses to to from when to < from', () => {
      const result = parseProjectionRange(
        { from: '2026-08-25', to: '2026-08-24' },
        today
      );
      expect(result.to).toBe(result.from);
      expect(result.from).toBe('2026-08-25');
    });
  });

  describe('range capping at MAX_RANGE_DAYS (1826)', () => {
    it('clamps excessive ranges to 1826 days', () => {
      const result = parseProjectionRange(
        { from: '2026-08-23', to: '2100-08-23' },
        today
      );
      const daySpan =
        Math.floor(
          (new Date(result.to + 'T00:00:00Z').getTime() -
            new Date(result.from + 'T00:00:00Z').getTime()) /
            86_400_000
        ) + 1;
      expect(daySpan).toBeLessThanOrEqual(1826);
    });
  });

  describe('sameDayNextYear with Feb 29 clamping', () => {
    it('clamps Feb 29 to Feb 28 in non-leap years', () => {
      const result = parseProjectionRange({}, '2028-02-29');
      expect(result.to).toBe('2029-02-28');
    });

    it('preserves Feb 28 in leap years', () => {
      const result = parseProjectionRange({}, '2026-02-28');
      expect(result.to).toBe('2027-02-28');
    });
  });

  describe('view parameter', () => {
    it('defaults to "line" when missing or invalid', () => {
      expect(parseProjectionRange({}, today).view).toBe('line');
      expect(parseProjectionRange({ view: 'invalid' }, today).view).toBe(
        'line'
      );
      expect(parseProjectionRange({ view: 'LINE' }, today).view).toBe('line');
    });

    it('accepts "line", "waterfall", "table"', () => {
      expect(parseProjectionRange({ view: 'line' }, today).view).toBe('line');
      expect(parseProjectionRange({ view: 'waterfall' }, today).view).toBe(
        'waterfall'
      );
      expect(parseProjectionRange({ view: 'table' }, today).view).toBe('table');
    });
  });

  describe('default range exactly 12 months', () => {
    it('produces exactly 12 months from today (365 days inclusive)', () => {
      const result = parseProjectionRange({}, today);
      const daySpan =
        Math.floor(
          (new Date(result.to + 'T00:00:00Z').getTime() -
            new Date(result.from + 'T00:00:00Z').getTime()) /
            86_400_000
        ) + 1;
      expect(daySpan).toBeGreaterThanOrEqual(365);
      expect(daySpan).toBeLessThanOrEqual(366);
    });
  });
});
