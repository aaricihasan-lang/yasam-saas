/**
 * lib/archive/server/audit.ts — Premium Word Arşivi denetim kaydı (YALNIZ SUNUCU).
 *
 * Mevcut `security_events` tablosuna (Admin › Üye detayı › Güvenlik olaylarında görünür; migration GEREKMEZ)
 * severity "low" olay yazılır: kim (user_id), ne zaman (created_at), kapsam ve sonuç. İzin listesiyle kurulur:
 * danışan adı / kimliği, sağlık notu, analiz içeriği, dosya adı ASLA yazılmaz (yalnız sayılar ve modül anahtarları).
 * Yazım başarısız olursa arşiv engellenmez (kendi verisini dışa aktarma hakkı) — çağıran uyarı gösterir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { EXPORT_MODULE_ORDER } from "@/lib/backup/registry";
import type { ArchiveOptions } from "../types";

assertServerOnly("lib/archive/server/audit");

export const ARCHIVE_AUDIT_EVENT = "data_archive_export";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["complete", "partial", "failed", "cancelled"]);

export type ArchiveAuditResult = {
  status: string;
  ok: number;
  failed: number;
  skipped: number;
  records: number;
  bytes: number;
  duration_ms: number;
};

/** Kapsam özeti — yalnız modül anahtarları, danışan SAYISI, tarih günleri ve içerik türü bayrakları. */
export function auditScope(opts: ArchiveOptions): Record<string, unknown> {
  return {
    modules: opts.modules.filter((m) => EXPORT_MODULE_ORDER.includes(m)),
    client_filter_count: opts.clientIds ? opts.clientIds.length : null,
    date_from: opts.dateFrom,
    date_to: opts.dateTo,
    include: { ...opts.include },
  };
}

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.trunc(v), 1e12) : 0);

export function sanitizeAuditResult(raw: unknown): ArchiveAuditResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const status = String(r.status ?? "");
  if (!STATUSES.has(status)) return null;
  return {
    status,
    ok: count(r.ok),
    failed: count(r.failed),
    skipped: count(r.skipped),
    records: count(r.records),
    bytes: count(r.bytes),
    duration_ms: count(r.duration_ms),
  };
}

export async function writeArchiveAudit(
  db: SupabaseClient,
  userId: string,
  archiveId: string,
  phase: "started" | "finished",
  payload: { scope?: Record<string, unknown>; jobs?: number; result?: ArchiveAuditResult },
): Promise<boolean> {
  if (!UUID_RE.test(archiveId)) return false;
  const metadata: Record<string, unknown> = { archive_id: archiveId, phase };
  if (payload.scope) metadata.scope = payload.scope;
  if (typeof payload.jobs === "number") metadata.jobs = count(payload.jobs);
  if (payload.result) metadata.result = payload.result;
  const message =
    phase === "started"
      ? "Premium Word Arşivi başlatıldı"
      : `Premium Word Arşivi tamamlandı (${payload.result?.status ?? "bilinmiyor"})`;
  try {
    const { error } = await db.from("security_events").insert({
      user_id: userId,
      event_type: ARCHIVE_AUDIT_EVENT,
      severity: "low",
      message,
      metadata,
    });
    return !error;
  } catch {
    return false;
  }
}
