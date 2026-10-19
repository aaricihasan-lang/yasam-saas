import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import {
  saveComputedChart,
  listComputedCharts,
  getComputedChart,
  listManualChartsWithClients,
  getManualChartByClient,
  updateManualChartById,
  deleteManualChartsByClient,
} from "@/lib/human-design/api/chartPersistence";
import { validateManualChartCodes } from "@/lib/human-design/manualChartConsistency";
import { invalidIdResponse, isOptionalUuid, isUuid } from "@/lib/human-design/api/requestIds";
import { deleteHdAnalysis, previewHdAnalysisDelete } from "@/lib/human-design/api/hdAnalysisDelete";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { quotaCheck } from "@/lib/security/testQuotaExemption";

export const runtime = "nodejs";

/**
 * /api/hd/charts — hesaplanmış HD haritalarının güvenli kalıcılığı (FAZ 9B).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id + user_id YALNIZ guard'dan; request gövdesinden GÜVENİLMEZ.
 *   - Tüm sorgular tenant-scoped + source='computed' (manuel akış izole).
 *   - POST: recompute-on-save (client computed_result'ına güvenilmez).
 *   - Yanıt no-store; doğum verisi LOGLANMAZ; demo hesap yazamaz.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

// ── Manuel harita kaydetme gövdesini oku + doğrula (POST/PATCH ortak) ──
async function readManualBody(
  req: NextRequest,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Geçerli JSON gövdesi gerekli." },
        { status: 400, headers: NO_STORE },
      ),
    };
  }
  if (!isObj(raw)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "İstek gövdesi nesne olmalı." },
        { status: 400, headers: NO_STORE },
      ),
    };
  }
  return { ok: true, body: raw };
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında harita kaydedilemez." },
      { status: 403, headers: NO_STORE },
    );
  }

  // ── Manuel harita upsert — AŞAMA 3C: YENİ manuel kayıt KAPALI (410). Otomatik hesaplama
  //    (POST /api/hd/charts/roxy) tek üretim yoludur. Mevcut manuel kayıtların okunması (GET
  //    scope=manual), açılması ve silinmesi aynen çalışır; veri silinmez.
  if (new URL(req.url).searchParams.get("scope") === "manual") {
    return NextResponse.json(
      {
        ok: false,
        code: "MANUAL_CHART_CLOSED",
        error: "Yeni manuel Human Design kaydı artık kullanılmıyor. Human Design Hesaplama bölümünden otomatik hesaplama yapın.",
      },
      { status: 410, headers: NO_STORE },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isObj(raw)) {
    return NextResponse.json(
      { ok: false, code: "INVALID_BODY", error: "İstek gövdesi nesne olmalı." },
      { status: 400, headers: NO_STORE },
    );
  }

  // input alanı ya da düz gövde; computed_result gönderilse bile YOK SAYILIR.
  const input = isObj(raw.input) ? raw.input : raw;

  // HD-28 (#7) girdi sınırları + HD-27 kimlik biçimi.
  const clientIdIn = strOrNull(raw.client_id);
  if (clientIdIn && !isUuid(clientIdIn)) return invalidIdResponse("client_id");
  const tooLong = ([["client_name", 120], ["birth_place", 200], ["notes", 5000], ["location_id", 200]] as const)
    .find(([k, max]) => (strOrNull(raw[k]) ?? "").length > max);
  if (tooLong) {
    return NextResponse.json(
      { ok: false, code: "FIELD_TOO_LONG", error: `${tooLong[0]} en fazla ${tooLong[1]} karakter olabilir.` },
      { status: 400, headers: NO_STORE },
    );
  }

  // HD-28 (GUV-04): kayıt oluşturan uç için kullanıcı başına instance-bağımsız sınır.
  // Geçici test kotası muafiyeti (yetkili test hesabı + ≤8 saat): hacim kontrolü atlanır; diğer herkes için aynen.
  const rl = await quotaCheck("hd-chart-save-user", guard.userId, () => hitDbRateLimit(guard.db, rateLimitBucket("hd-chart-save-user", guard.userId), 30, 60 * 60), { isDemo: guard.is_demo_account, tenantId: guard.tenantId });
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Kısa sürede çok fazla kayıt yapıldı. Lütfen daha sonra tekrar deneyin." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSec || 60) } },
    );
  }

  const res = await saveComputedChart(guard.db, guard.tenantId, guard.userId, {
    date: str(input.date),
    time: str(input.time),
    timezone: str(input.timezone),
    client_id: strOrNull(raw.client_id),
    client_name: strOrNull(raw.client_name),
    birth_place: strOrNull(raw.birth_place),
    location_id: strOrNull(raw.location_id),
    notes: strOrNull(raw.notes),
  });

  if (!res.ok) {
    if (res.status >= 500) {
      await trackUsage(guard, req, { module: "human_design", action: "action_failed", failedAction: "record_created", subEntity: "chart", errorClass: "server" });
    }
    return NextResponse.json(
      { ok: false, code: res.code, error: res.error },
      { status: res.status, headers: NO_STORE },
    );
  }
  await trackUsage(guard, req, { module: "human_design", action: "record_created", subEntity: "chart", resourceId: res.id });
  return NextResponse.json({ ok: true, id: res.id }, { status: 200, headers: NO_STORE });
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);

  // ── "Analizi Sil" onay penceresi: KESİN kapsam (salt okunur; hesaplanmış + manuel) ──
  const deletePreview = url.searchParams.get("delete_preview");
  if (deletePreview !== null) {
    if (!isUuid(deletePreview)) return invalidIdResponse("delete_preview");
    const p = await previewHdAnalysisDelete(guard.db, guard.tenantId, deletePreview);
    if (!p.ok) return NextResponse.json({ ok: false, code: p.code, error: p.error }, { status: p.status, headers: NO_STORE });
    const { ok: _ok, ...scope } = p;
    void _ok;
    return NextResponse.json({ ok: true, scope }, { status: 200, headers: NO_STORE });
  }

  // ── Manuel/legacy harita akışı (source null|'manual') — computed'dan izole ──
  if (url.searchParams.get("scope") === "manual") {
    const clientId = url.searchParams.get("client_id");
    if (!isOptionalUuid(clientId)) return invalidIdResponse("client_id");
    if (clientId) {
      const { row, error } = await getManualChartByClient(guard.db, guard.tenantId, clientId);
      if (error) return NextResponse.json({ ok: false, error }, { status: 500, headers: NO_STORE });
      return NextResponse.json({ ok: true, row }, { status: 200, headers: NO_STORE });
    }
    const { rows, error } = await listManualChartsWithClients(guard.db, guard.tenantId);
    if (error) return NextResponse.json({ ok: false, error }, { status: 500, headers: NO_STORE });
    return NextResponse.json({ ok: true, rows }, { status: 200, headers: NO_STORE });
  }

  const id = url.searchParams.get("id");
  if (!isOptionalUuid(id)) return invalidIdResponse("id");

  if (id) {
    const { row, error } = await getComputedChart(guard.db, guard.tenantId, id);
    if (error) {
      return NextResponse.json({ ok: false, code: "DB_ERROR", error }, { status: 500, headers: NO_STORE });
    }
    if (!row) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", error: "Kayıt bulunamadı." },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json({ ok: true, data: row }, { status: 200, headers: NO_STORE });
  }

  const clientId = url.searchParams.get("client_id") ?? undefined;
  if (!isOptionalUuid(clientId)) return invalidIdResponse("client_id");
  const { rows, error } = await listComputedCharts(guard.db, guard.tenantId, { clientId });
  if (error) {
    return NextResponse.json({ ok: false, code: "DB_ERROR", error }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, data: rows }, { status: 200, headers: NO_STORE });
}

// PATCH — yalnız manuel harita güncelleme (id ile). Computed akışında PATCH yoktur.
export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (new URL(req.url).searchParams.get("scope") !== "manual") {
    return NextResponse.json(
      { ok: false, error: "Desteklenmeyen işlem." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında güncelleme yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }
  const parsed = await readManualBody(req);
  if (!parsed.ok) return parsed.response;
  const id = str(parsed.body.id).trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Güncellenecek haritanın id'si gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isUuid(id)) return invalidIdResponse("id");
  const codes = validateManualChartCodes(parsed.body);
  if (!codes.ok) {
    return NextResponse.json({ ok: false, code: "INVALID_CHART_CODE", error: codes.error }, { status: 400, headers: NO_STORE });
  }
  const { ok, error } = await updateManualChartById(guard.db, guard.tenantId, id, parsed.body);
  if (!ok) {
    return NextResponse.json({ ok: false, error: error ?? "Güncellenemedi." }, { status: 400, headers: NO_STORE });
  }
  await trackUsage(guard, req, { module: "human_design", action: "record_updated", subEntity: "chart", resourceId: id });
  return NextResponse.json({ ok: true, id }, { status: 200, headers: NO_STORE });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında silme yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }

  const url = new URL(req.url);

  // ── Manuel harita silme (id VEYA clientId ile) — computed'dan izole ──
  if (url.searchParams.get("scope") === "manual") {
    const mid = url.searchParams.get("id");
    const clientId = url.searchParams.get("clientId");
    if (!isOptionalUuid(mid)) return invalidIdResponse("id");
    if (!isOptionalUuid(clientId)) return invalidIdResponse("clientId");
    if (mid) {
      // "Analizi Sil": yalnız bu manuel analiz + ona bağlı raporlar (profil ve diğer analizler korunur).
      const r = await deleteHdAnalysis(guard.db, guard.tenantId, mid, { source: "manual", expectReports: readExpectReports(url) });
      if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.error }, { status: r.status, headers: NO_STORE });
      await trackUsage(guard, req, { module: "human_design", action: "record_deleted", subEntity: "chart", resourceId: mid });
      return NextResponse.json({ ok: true, deletedId: mid, deletedReports: r.deletedReports, warnings: r.warnings }, { status: 200, headers: NO_STORE });
    }
    if (clientId) {
      const { ok, error } = await deleteManualChartsByClient(guard.db, guard.tenantId, clientId);
      if (!ok) return NextResponse.json({ ok: false, error: error ?? "Silinemedi." }, { status: 400, headers: NO_STORE });
      await trackUsage(guard, req, { module: "human_design", action: "record_deleted", subEntity: "chart", resourceId: `client:${clientId}` });
      return NextResponse.json({ ok: true, deletedClientId: clientId }, { status: 200, headers: NO_STORE });
    }
    return NextResponse.json(
      { ok: false, error: "Silme için id veya clientId gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }

  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, code: "MISSING_ID", error: "Silinecek kaydın id'si gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isUuid(id)) return invalidIdResponse("id");

  // "Analizi Sil": yalnız bu hesaplanmış analiz + ona bağlı raporlar (profil ve diğer analizler korunur).
  const r = await deleteHdAnalysis(guard.db, guard.tenantId, id, { source: "computed", expectReports: readExpectReports(url) });
  if (!r.ok) {
    return NextResponse.json({ ok: false, code: r.code === "NOT_FOUND" ? "DELETE_FAILED" : r.code, error: r.error }, { status: r.status === 404 ? 400 : r.status, headers: NO_STORE });
  }
  await trackUsage(guard, req, { module: "human_design", action: "record_deleted", subEntity: "chart", resourceId: id });
  return NextResponse.json({ ok: true, deletedId: id, deletedReports: r.deletedReports, warnings: r.warnings }, { status: 200, headers: NO_STORE });
}

/** Onay penceresinde gösterilen rapor sayısı (verildiyse) — sonradan artmışsa silme 409 ile durur. */
function readExpectReports(url: URL): number | undefined {
  const v = url.searchParams.get("expect_reports");
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}
