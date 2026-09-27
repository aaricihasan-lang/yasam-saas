"use client";

import { useCallback, useRef, useState } from "react";
import { createSubmitLock } from "@/lib/ui/submitLock";

/**
 * Çift gönderim (double submit) kilidi.
 *
 * React state tek başına yetmez (aynı tick'teki ikinci tık state güncellenmeden
 * geçer); bu hook senkron ref kilidi kullanır. İşlem bitince (başarı, hata veya
 * zaman aşımı) kilit `finally` içinde açılır.
 *
 * Kullanım:
 *   const { run, pending } = useSubmitLock();
 *   const onSave = () => run(async (signal) => { await fetch(url, { signal, ... }); });
 *   <button disabled={pending} ...>
 *
 * `run` kilitliyken çağrılırsa hiçbir şey yapmaz ve `undefined` döner.
 */
export function useSubmitLock(opts?: { timeoutMs?: number }) {
  const lockRef = useRef(createSubmitLock(opts?.timeoutMs));
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T,>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
      return lockRef.current.run(fn, setPending);
    },
    [],
  );

  return { run, pending, isLocked: () => lockRef.current.isLocked() };
}
