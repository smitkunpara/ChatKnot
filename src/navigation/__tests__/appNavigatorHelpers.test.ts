import { shouldShowStartupWarnings } from '../appNavigatorHelpers';

describe('shouldShowStartupWarnings', () => {
  it('returns false when warnings are empty', () => {
    expect(shouldShowStartupWarnings([])).toBe(false);
  });

  it('returns true when one or more warnings exist', () => {
    expect(shouldShowStartupWarnings(['missing model'])).toBe(true);
  });

  it('returns true when multiple warnings exist', () => {
    expect(shouldShowStartupWarnings(['warning1', 'warning2'])).toBe(true);
  });

  it('returns true for array with empty string warning', () => {
    expect(shouldShowStartupWarnings([''])).toBe(true);
  });
});
