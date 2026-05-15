/**
 * Defers work scheduled from useEffect so setState is not invoked synchronously
 * in the effect body (react-hooks/set-state-in-effect).
 */
export function runInEffect(fn: () => void): void {
  queueMicrotask(fn);
}
