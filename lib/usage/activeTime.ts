/**
 * USAGE360 — AKTİF SÜRE / ZİYARET SABİTLERİ (saf).
 *
 * Owner onaylı model (AŞAMA 1 §J/K):
 *   * İstemci yalnız sayfa GÖRÜNÜR ve son 5 dk içinde gerçek etkileşim varken ≤60 sn'de bir ping atar.
 *   * Sunucu aynı auth oturumunda 45 sn'den sık ping'i kabul etmez (iki sekme çift saymaz).
 *   * 30 dk sessizlik → yeni kullanım ziyareti.
 *   * Kredi (iki kabul edilen ping arası, sn): Δ≤0→0 · Δ≤150→min(Δ,90) · Δ>150→30.
 *     SQL karşılığı: public.usage360_active_credit (harness ikisini karşılaştırır).
 *   * Kredi ÖNCEKİ aktif modüle yazılır (modül geçişinde süre yeni modüle kaymaz).
 * Sonuç: açık unutulan sekme ≈ son etkileşimden sonraki ≤5 dk + tek ping kredisi kadar sayılır.
 */
export const PING_INTERVAL_MS = 60_000;
export const SERVER_MIN_PING_GAP_SECONDS = 45;
export const INTERACTION_IDLE_MS = 5 * 60_000;
export const VISIT_GAP_SECONDS = 30 * 60;
export const CREDIT_CONTIGUOUS_MAX_DELTA_SECONDS = 150;
export const CREDIT_CONTIGUOUS_CAP_SECONDS = 90;
export const CREDIT_RESUME_SECONDS = 30;

export function computeActiveCredit(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
  if (deltaSeconds <= CREDIT_CONTIGUOUS_MAX_DELTA_SECONDS) {
    return Math.floor(Math.min(deltaSeconds, CREDIT_CONTIGUOUS_CAP_SECONDS));
  }
  return CREDIT_RESUME_SECONDS;
}

/**
 * İstemci ping kararı (saf; UsageTracker kullanır). Ping YALNIZ:
 *   görünür ∧ son etkileşim ≤ 5 dk ∧ son ping'ten ≥ 60 sn.
 * Gizli sekme / 5 dk etkileşimsizlik → ping YOK.
 */
export function shouldSendPing(input: {
  visible: boolean;
  nowMs: number;
  lastInteractionMs: number | null;
  lastPingMs: number | null;
}): boolean {
  if (!input.visible) return false;
  if (input.lastInteractionMs == null) return false;
  if (input.nowMs - input.lastInteractionMs > INTERACTION_IDLE_MS) return false;
  if (input.lastPingMs != null && input.nowMs - input.lastPingMs < PING_INTERVAL_MS) return false;
  return true;
}
