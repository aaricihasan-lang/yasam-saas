/**
 * Yaşam Hafızası™ — Outbox Webhook Bridge (SAF karar; loop-prevention çekirdeği).
 * ====================================================================
 *
 * Supabase Database Webhook payload'ını (public.yasam_hafizasi_outbox /
 * public.yasam_hafizasi_client_outbox INSERT/UPDATE/DELETE) alır ve YALNIZ bir
 * KARAR döndürür: "hangi Inngest event'i gönderilsin, yoksa no-op mu, yoksa reddet mi".
 *
 * SINIR — bu dosyada BULUNMAZ:
 *   Next / NextRequest / fetch / process.env / getServerDb / Supabase / Inngest client /
 *   crypto / IO. Secret doğrulaması + inngest.send route katmanındadır. Böylece bu saf
 *   karar (özellikle SONSUZ-LOOP KORUMASI) DB'siz/ağ'sız harness ile doğrulanabilir.
 *
 * ─── EN KRİTİK GARANTİ: WORKER STATE-TRANSITION LOOP'U İMKÂNSIZ ───
 *   Enqueue trigger'ı (BF-11C / client CDC) her GERÇEK olayda `event_version = nextval(...)`
 *   ile sürümü KOŞULSUZ artırır (INSERT ve ON CONFLICT DO UPDATE dallarının İKİSİNDE de).
 *   Worker durum makinesi RPC'leri (claim/complete/fail/sweep) event_version'ı ASLA
 *   değiştirmez. Dolayısıyla:
 *     - INSERT                         → yeni enqueue      → event GÖNDER
 *     - UPDATE (event_version arttı)   → gerçek re-enqueue → event GÖNDER
 *     - UPDATE (event_version aynı)    → worker transition → NO-OP (event YOK)
 *     - DELETE                         → yeni iş değil      → NO-OP
 *   Sürüm doğrulanamıyorsa FAIL-SAFE yön NO-OP'tur (loop üretmemek > tek event kaçırmak;
 *   kaçan gerçek enqueue'yu 15dk safety cron zaten toparlar).
 */

import {
  YH_OUTBOX_ENQUEUED_EVENT,
  YH_CLIENT_OUTBOX_ENQUEUED_EVENT,
} from "../../inngest/events";

/** Kabul edilen kaynak tablolar (fail-closed allowlist). */
export const YH_OUTBOX_TABLE = "yasam_hafizasi_outbox";
export const YH_CLIENT_OUTBOX_TABLE = "yasam_hafizasi_client_outbox";

const TABLE_EVENT: ReadonlyMap<string, string> = new Map([
  [YH_OUTBOX_TABLE, YH_OUTBOX_ENQUEUED_EVENT],
  [YH_CLIENT_OUTBOX_TABLE, YH_CLIENT_OUTBOX_ENQUEUED_EVENT],
]);

/** Karar tipi (route bunu HTTP + inngest.send'e çevirir). */
export type WebhookDecision =
  | { readonly kind: "send"; readonly event: string; readonly table: string; readonly reason: string }
  | { readonly kind: "noop"; readonly reason: string }
  | { readonly kind: "reject"; readonly status: 400; readonly reason: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function reject(reason: string): WebhookDecision {
  return { kind: "reject", status: 400, reason };
}

/**
 * event_version'ı güvenle sayıya çevirir. Supabase bigint'i number ya da string
 * serialize edebilir; ikisini de kabul et, aksi halde null (→ fail-safe no-op).
 */
function eventVersionOf(row: unknown): number | null {
  if (!isRecord(row)) return null;
  const v = row.event_version;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Supabase Database Webhook payload'ı → karar. Beklenen payload biçimi:
 *   { type: "INSERT"|"UPDATE"|"DELETE", schema: "public", table: string,
 *     record: <yeni satır>|null, old_record: <eski satır>|null }
 * Row içeriği İŞLENMEZ (yalnız table/type + event_version delta'sı okunur; PII yok).
 */
export function decideWebhookAction(payload: unknown): WebhookDecision {
  if (!isRecord(payload)) return reject("payload-not-object");

  // schema verilmişse yalnız public kabul (yanlış bağlanmaya karşı savunma).
  const schema = payload.schema;
  if (schema !== undefined && schema !== "public") return reject("unexpected-schema");

  const table = payload.table;
  if (typeof table !== "string" || table.length === 0) return reject("missing-table");
  const eventName = TABLE_EVENT.get(table);
  if (eventName === undefined) return reject("unknown-table");

  const type = payload.type;
  if (typeof type !== "string") return reject("missing-type");

  switch (type) {
    case "INSERT":
      return { kind: "send", event: eventName, table, reason: "insert-enqueue" };
    case "UPDATE": {
      const next = eventVersionOf(payload.record);
      const prev = eventVersionOf(payload.old_record);
      if (next !== null && prev !== null && next > prev) {
        return { kind: "send", event: eventName, table, reason: "reenqueue-version-bump" };
      }
      // Sürüm artmadı/okunamadı → worker transition veya belirsiz → LOOP KORUMASI: no-op.
      return { kind: "noop", reason: "worker-transition-or-no-version-bump" };
    }
    case "DELETE":
      // Outbox satır silinmesi worker için yeni iş değil (kaynak DELETE ayrıca 'delete'
      // operation'lı enqueue üretir). Event gönderme.
      return { kind: "noop", reason: "outbox-row-delete-ignored" };
    default:
      return reject("unexpected-type");
  }
}
