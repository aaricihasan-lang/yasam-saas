/**
 * Senkron gönderim kilidi — React'ten bağımsız, test edilebilir çekirdek.
 * useSubmitLock bu çekirdeği kullanır.
 */

export const DEFAULT_SUBMIT_TIMEOUT_MS = 30_000;

export class SubmitTimeoutError extends Error {
  constructor() {
    super("İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.");
    this.name = "SubmitTimeoutError";
  }
}

export type SubmitLock = {
  run<T>(fn: (signal: AbortSignal) => Promise<T>, onPending?: (pending: boolean) => void): Promise<T | undefined>;
  isLocked(): boolean;
};

export function createSubmitLock(timeoutMs: number = DEFAULT_SUBMIT_TIMEOUT_MS): SubmitLock {
  let locked = false;
  return {
    isLocked: () => locked,
    async run(fn, onPending) {
      if (locked) return undefined;
      locked = true;
      onPending?.(true);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new SubmitTimeoutError());
          }, timeoutMs);
        });
        return await Promise.race([fn(controller.signal), timeout]);
      } finally {
        if (timer) clearTimeout(timer);
        locked = false;
        onPending?.(false);
      }
    },
  };
}
