/** Format elapsed milliseconds into a clean string like "0.4s" or "32.1s" */
export const formatDuration = (totalMs: number): string => {
  if (totalMs === 0) return '';
  if (totalMs < 1000) return `${totalMs}ms`;
  const totalSeconds = totalMs / 1000;
  if (totalSeconds < 60) {
    return `${Math.max(0, totalSeconds).toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${Math.floor(seconds)}s`;
};