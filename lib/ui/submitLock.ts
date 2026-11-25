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

/**
 * I18N (QTM-DY-01) — dil-bağımsız zaman aşımı kodu. SubmitTimeoutError'ın Türkçe iletisi (testlerce kilitli,
 * kaynak dil) DEĞİŞMEZ; çağıran ekran dilinde göstermek için bu saf yardımcıdan dönen katalog anahtarını
 * `common` ad alanında çevirir: `tc(submitErrorMessageKey(err)!)` → tr "İşlem zaman aşımına uğradı. Lütfen tekrar
 * deneyin." (birebir) · en çevirisi. Zaman aşımı değilse null (çağıran kendi genel hata metnini kullanır).
 */
export const SUBMIT_TIMEOUT_CODE = "SUBMIT_TIMEOUT" as const;
export type SubmitErrorCode = typeof SUBMIT_TIMEOUT_CODE;
/** `common` ad alanı altındaki katalog anahtarı (messages/<dil>/common.submitLock.json). */
export const SUBMIT_TIMEOUT_MESSAGE_KEY = "submitLock.timeout" as const;

export function submitErrorCode(err: unknown): SubmitErrorCode | null {
  return err instanceof SubmitTimeoutError ? SUBMIT_TIMEOUT_CODE : null;
}

export function submitErrorMessageKey(err: unknown): typeof SUBMIT_TIMEOUT_MESSAGE_KEY | null {
  return submitErrorCode(err) === SUBMIT_TIMEOUT_CODE ? SUBMIT_TIMEOUT_MESSAGE_KEY : null;
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
