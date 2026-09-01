/**
 * Yaşam Hafızası™ — Inngest event adları (CANONICAL, tek kaynak).
 * ====================================================================
 *
 * Outbox drain artık EVENT-DRIVEN: DB outbox INSERT/re-enqueue → güvenli webhook
 * bridge → `inngest.send(<bu event>)` → worker uyanır ve queue'yu drain eder.
 * Ayrıca 15dk'lık safety cron kaçan event / stale lease / orphan pending'i toplar.
 *
 * SINIR — bu dosya YALNIZ sabit string tanımıdır:
 *   IO / server-only / DB / Inngest client / process.env İÇERMEZ. Hem worker (server)
 *   hem webhook route hem harness güvenle import eder (tek kaynak → drift yok).
 *
 * Event payload'ı KASITLI olarak minimumdur (`{ source }`): worker zaten DB'den
 * claim ettiği için event yalnız "uyan ve queue'yu kontrol et" sinyalidir. Payload'a
 * ham row / tenant / client / danışan / içerik / analiz verisi KOYULMAZ.
 */

/** Professional outbox (public.yasam_hafizasi_outbox) enqueue sinyali. */
export const YH_OUTBOX_ENQUEUED_EVENT = "yasam-hafizasi/outbox.enqueued";

/** Client (danışan) outbox (public.yasam_hafizasi_client_outbox) enqueue sinyali. */
export const YH_CLIENT_OUTBOX_ENQUEUED_EVENT = "yasam-hafizasi/client-outbox.enqueued";

/** Webhook → inngest.send minimum payload biçimi (PII/row/secret İÇERMEZ). */
export interface YhOutboxEnqueuedEventData {
  readonly source: "supabase-webhook";
}
