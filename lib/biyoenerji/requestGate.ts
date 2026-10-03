"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  currentBioOwnerTicket,
  isBioOwnerTicketCurrent,
  type BioOwnerTicket,
} from "@/lib/biyoenerji/listCache";

/**
 * A7 + A8 — Biyoenerji liste/arama istek kapısı.
 *
 * Her yükleme `begin()` ile bir bilet alır: monoton sıra numarası + isteğin başladığı
 * andaki oturum sahibi + oturum dönemi. Yanıt döndüğünde `isCurrent(ticket)`:
 *   - daha yeni bir yükleme başladıysa (A8: eski arama/filtre yanıtı) → false,
 *   - kullanıcı çıkış yaptıysa / başka hesapla girildiyse (A7) → false.
 * false ise çağıran HİÇBİR state (satır, sayım, sayfalama, hata, loading), cache veya
 * devam isteği yazmaz/başlatmaz. Böylece eski yanıt yeni sonucu ezemez, A'nın geç yanıtı
 * B'ye sızamaz.
 */
export type BioRequestTicket = BioOwnerTicket & { seq: number };

export function useBioRequestGate() {
  const seqRef = useRef(0);

  /**
   * Yeni sorgu (reset: arama/filtre/yenileme) sırayı ilerletir. "Daha Fazla Göster" (append)
   * AYNI sorgunun devamıdır → sırayı ilerletmez (o sorgunun süren sayım isteği geçerli kalır);
   * arada yeni bir sorgu başlarsa append yanıtı da eskir.
   */
  const begin = useCallback((opts?: { append?: boolean }): BioRequestTicket => {
    if (!opts?.append) seqRef.current += 1;
    return { seq: seqRef.current, ...currentBioOwnerTicket() };
  }, []);

  const isCurrent = useCallback(
    (t: BioRequestTicket): boolean => t.seq === seqRef.current && isBioOwnerTicketCurrent(t),
    [],
  );

  // Kararlı nesne: useCallback bağımlılığına eklenebilir, yükleyiciyi yeniden üretmez.
  return useMemo(() => ({ begin, isCurrent }), [begin, isCurrent]);
}
