"use client";

/**
 * FAZ 2 — Profesyonel (canonical) Word raporu · client hattı.
 * Auth deseni diğer HD client helper'larıyla AYNI (x-user-id + x-session-token).
 *   • createProfessionalReport(chartId) → snapshot oluştur + kaydet → report_id
 *   • downloadProfessionalReport(reportId) → DONMUŞ snapshot'tan DOCX indir
 * service_role tarayıcıya gelmez; tüm iş server route'ta.
 */

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { HD_REPORT_REDACTED_HEADER, type HdCommentarySelection } from "@/lib/human-design/reporting/reportV2Shared";

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export type CreateResult =
  | {
      ok: true;
      id: string;
      omittedCount: number;
      /** AŞAMA 4B: BodyGraph kaynağı ("roxy_render" | "uploaded_image" | "missing"); eski yanıtlarda yok. */
      bodygraph?: string;
      /** AŞAMA 4B: Sistem Yorumu durumu ("included" | "not_selected" | "not_permitted" | "unavailable"). */
      systemReading?: string;
      expertEntries?: number;
    }
  | { ok: false; error: string; code?: string };

export type CreateOptions = {
  /** Yorum kaynağı tercihi — YETKİ DEĞİL (sunucu hd_system_reading'i ayrıca doğrular). */
  commentary?: HdCommentarySelection;
  /** Kayıtlı renderer'dan üretilmiş BodyGraph PNG'si (data URL). */
  bodygraphPng?: string;
  /** Roxy haritasında BodyGraph görseli olmadan oluşturmaya AÇIK onay. */
  allowMissingBodygraph?: boolean;
  /** "Raporu Hazırlayan" (yalnız bu yeni rapor; boşsa gönderilmez → satır oluşmaz). */
  preparedBy?: string;
};

/**
 * P2-2: `requestId` bir KULLANICI EYLEMİNİ temsil eder (uuid). Ağ tekrarı/çift tıklama aynı
 * requestId ile gönderilir → sunucu aynı raporu döner, yeni satır oluşturmaz.
 */
export async function createProfessionalReport(chartId: string, requestId?: string, opts: CreateOptions = {}): Promise<CreateResult> {
  const body: Record<string, unknown> = { chartId };
  if (requestId) body.requestId = requestId;
  if (opts.commentary) body.commentary = opts.commentary;
  if (opts.bodygraphPng) body.bodygraphPng = opts.bodygraphPng;
  if (opts.allowMissingBodygraph) body.allowMissingBodygraph = true;
  if (opts.preparedBy && opts.preparedBy.trim()) body.preparedBy = opts.preparedBy.trim();
  let res: Response;
  try {
    res = await fetch("/api/hd/reports/professional", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && typeof j.id === "string") {
    return {
      ok: true,
      id: j.id,
      omittedCount: typeof j.omittedCount === "number" ? j.omittedCount : 0,
      bodygraph: typeof j.bodygraph === "string" ? j.bodygraph : undefined,
      systemReading: typeof j.systemReading === "string" ? j.systemReading : undefined,
      expertEntries: typeof j.expertEntries === "number" ? j.expertEntries : undefined,
    };
  }
  return {
    ok: false,
    error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
    code: typeof j.code === "string" ? j.code : undefined,
  };
}

function filenameFromDisposition(header: string | null): string {
  if (!header) return "Human-Design-Raporu.docx";
  const m = /filename="?([^"]+)"?/i.exec(header);
  return m?.[1] ?? "Human-Design-Raporu.docx";
}

/**
 * `systemReadingRedacted`: rapordaki Sistem Yorumu, hesabın GÜNCEL yetkisi kapalı olduğu için
 * bu indirmede çıkarıldı (sunucu kararı; kayıtlı rapor değişmedi).
 */
export type DownloadResult = { ok: true; systemReadingRedacted: boolean } | { ok: false; error: string };

export const HD_REPORT_REDACTED_MESSAGE =
  "Bu rapordaki Sistem Yorumu bölümü, hesabınızın güncel yetkisi kapalı olduğu için indirilen dosyadan çıkarıldı. Kayıtlı rapor değiştirilmedi.";

export async function downloadProfessionalReport(reportId: string): Promise<DownloadResult> {
  let res: Response;
  try {
    res = await fetch("/api/hd/reports/professional/download", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reportId }),
    });
  } catch {
    return { ok: false, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
  }
  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get("Content-Disposition"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true, systemReadingRedacted: res.headers.get(HD_REPORT_REDACTED_HEADER) === "system-reading" };
}

/**
 * Bu analizle eşleşen, Word'e girecek AKTİF Bilgi Bankası açıklaması sayısı (yalnız sayı).
 * Hata / ağ sorunu → null (uyarı gösterilmez; Word akışı engellenmez).
 */
export async function fetchKnowledgeMatchCount(chartId: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/hd/reports/professional/knowledge-match?chartId=${encodeURIComponent(chartId)}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; count?: unknown };
    return res.ok && j.ok === true && typeof j.count === "number" ? j.count : null;
  } catch {
    return null;
  }
}
