import { shouldShowStartupWarnings } from '../appNavigatorHelpers';

describe('shouldShowStartupWarnings', () => {
  it('returns false when warnings are empty', () => {
    expect(shouldShowStartupWarnings([])).toBe(false);
  });

  it('returns true when one or more warnings exist', () => {
    expect(shouldShowStartupWarnings(['missing model'])).toBe(true);
  });
});
