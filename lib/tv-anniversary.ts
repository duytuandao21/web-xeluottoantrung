/** Fixed transition duration; event content/timing comes from TV Display. */
export const TV_ANNIVERSARY = {
  fadeMilliseconds: 700,
} as const;

/** Event dwell time counts visible time, rather than expiring in a hidden tab. */
export function waitForTVVisibleTime(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    let remaining = milliseconds;
    let started = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', synchronize);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const synchronize = () => {
      clearTimeout(timer);
      if (started) remaining -= performance.now() - started;
      started = 0;
      if (signal.aborted || remaining <= 0) return finish();
      if (!document.hidden) {
        started = performance.now();
        timer = setTimeout(finish, remaining);
      }
    };
    document.addEventListener('visibilitychange', synchronize);
    signal.addEventListener('abort', finish, { once: true });
    synchronize();
  });
}
