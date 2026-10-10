import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isUuid, professionalReportIdFor } from "@/lib/human-design/api/deterministicId";
import { isOwnedChartImagePath } from "@/lib/human-design/api/chartImagePath";
import {
  copyChartImageToReportSnapshot,
  removeHdStorageObjects,
  uploadReportSnapshotPng,
} from "@/lib/human-design/api/hdStorage";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { trackUsage } from "@/lib/usage/trackUsage";
import { checkRateLimit } from "@/lib/rateLimit";
import { createReportSnapshotV2FromChart } from "@/lib/human-design/reporting/reportSnapshotV2Service";
import { parseCommentarySelection, sanitizePreparedBy, type HdCommentarySelection } from "@/lib/human-design/reporting/reportSnapshotV2";
import { decodePngBase64, validateBodygraphPng } from "@/lib/human-design/reporting/bodygraphPng";
import { saveCanonicalReport, findReportBrief } from "@/lib/human-design/api/reportPersistence";
import { hdReportTitle } from "@/lib/human-design/reporting/wordReport";

export const runtime = "nodejs";

/**
 * POST /api/hd/reports/professional — PROFESYONEL Word raporu snapshot'ı OLUŞTUR (hd-report-2).
 *
 * Gövde (JSON): { chartId, requestId?, commentary?: "none"|"expert"|"system"|"both" (yoksa "none"),
 *                 bodygraphPng?: "data:image/png;base64,…", allowMissingBodygraph?: true,
 *                 preparedBy?: string (Raporu Hazırlayan; ≤120 karakter, yalnız bu rapora) }
 *
 * Güvenlik / sözleşme (AŞAMA 4B):
 *   - requireModuleAccess(req, "human_design") → token↔user binding + modül izni.
 *   - tenantId + userId YALNIZ guard'dan; body'den GÜVENİLMEZ. chart_id tenant-scoped (yoksa 404).
 *   - Demo hesap YAZAMAZ → 403. Android → 403 (Word kapalı; boşuna üretim yok).
 *   - Sistem Yorumu yetkisi SUNUCUDA (hd_system_reading) doğrulanır; `commentary` seçimi YETKİ
 *     DEĞİLDİR. Yetki yoksa: Sistem Yorumu hiç okunmaz/eklenmez.
 *   - Bilgi Bankası açıklamaları ("Bilgi ve Açıklamalar") YALNIZ açıkça seçilirse; YALNIZ bu tenant'ın
 *     aktif, haritanın kodlarıyla eşleşen kayıtları; admin merkezî içeriği v2'ye GİRMEZ.
 *   - "Özel Çalışma Notları" (expert_notes) HİÇBİR seçimle rapora girmez: rapor sorgusu bu kolonu
 *     okumaz (listKnowledgeForReport) ve snapshot beyaz listesi yalnız kategori/başlık/kod/metin alır.
 *   - RoxyAPI ÇAĞRILMAZ: yalnız kayıtlı computed_result / provider_raw okunur.
 *   - BodyGraph PNG'si (tarayıcıda kayıtlı renderer'dan) sunucuda doğrulanır (imza/CRC/çözme/
 *     piksel/oran/bayt) ve YALNIZ `{tenant}/report-snapshots/{reportId}.png` yoluna yazılır.
 *     Roxy haritasında görsel yoksa rapor ancak açık onayla (`allowMissingBodygraph`) üretilir.
 *   - DONMUŞ snapshot INSERT edilir (report_kind='canonical', schema_version='hd-report-2').
 *   - İdempotency: (tenant, requestId) → deterministik rapor id'si (çift tıklama = tek satır).
 *   - Rate limit: tenant başına 10/60s. Yanıt no-store.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
/** JSON gövde üst sınırı (PNG base64 dahil); Vercel ~4,5 MB sınırının altında anlaşılır red. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<Response> {
  // Android'de Word (.docx) kapalı: snapshot yalnız Word indirmesi için üretilir → boşuna
  // üretim/rate-limit tüketimi olmasın (download ucu ile aynı guard).
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında profesyonel rapor oluşturulamaz." },
      { status: 403, headers: NO_STORE },
    );
  }

  const rl = checkRateLimit(`hd-word:${guard.tenantId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Çok fazla rapor isteği. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, code: "PAYLOAD_TOO_LARGE", error: "İstek çok büyük." }, { status: 413, headers: NO_STORE });
  }

  let raw: Record<string, unknown> | null;
  try {
    raw = (await req.json()) as Record<string, unknown> | null;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ ok: false, error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  const chartId = typeof raw.chartId === "string" ? raw.chartId.trim() : "";
  if (!chartId) {
    return NextResponse.json({ ok: false, error: "chartId gerekli." }, { status: 400, headers: NO_STORE });
  }

  // Yetki SUNUCUDA: hd_system_reading (admin her zaman). İstemci seçimi yalnız TERCİHTİR.
  const systemReadingPermitted = hasModulePermissionForProfile(guard.profile, "hd_system_reading");
  // İçerik seçimi gönderilmezse VARSAYILAN "none": yalnız teknik harita içeriği. Bilgi Bankası
  // açıklamaları ve Sistem Yorumu yalnız uzman açıkça seçerse (sistem ayrıca yetki + veri ister).
  let requested: HdCommentarySelection = "none";
  if (raw.commentary !== undefined) {
    const parsed = parseCommentarySelection(raw.commentary);
    if (!parsed) {
      return NextResponse.json({ ok: false, code: "INVALID_COMMENTARY", error: "Geçersiz yorum seçimi." }, { status: 400, headers: NO_STORE });
    }
    requested = parsed;
  }

  // BodyGraph PNG'si (opsiyonel) — biçim/boyut doğrulaması harita okunmadan ÖNCE (ucuz red).
  let png: { buf: Buffer; width: number; height: number; sha256: string } | null = null;
  if (raw.bodygraphPng !== undefined && raw.bodygraphPng !== null) {
    const buf = decodePngBase64(raw.bodygraphPng);
    const check = validateBodygraphPng(buf);
    if (!buf || !check.ok) {
      return NextResponse.json(
        { ok: false, code: "BODYGRAPH_INVALID", error: check.ok ? "BodyGraph görseli okunamadı." : check.error },
        { status: 422, headers: NO_STORE },
      );
    }
    png = { buf, width: check.width, height: check.height, sha256: check.sha256 };
  }
  const allowMissingBodygraph = raw.allowMissingBodygraph === true;

  // P2-2 — idempotency: istemci her KULLANICI EYLEMİ için bir requestId (uuid) üretir ve
  // ağ tekrarı/çift tıklamada AYNISINI gönderir. Rapor id'si (tenant, requestId)'den
  // deterministik türetilir → aynı eylem ikinci kez satır oluşturamaz (PRIMARY KEY).
  const requestId = isUuid(raw.requestId) ? raw.requestId : null;
  const reportId = requestId ? professionalReportIdFor(guard.tenantId, requestId) : randomUUID();
  if (requestId) {
    const prior = await findReportBrief(guard.db, guard.tenantId, reportId);
    if (prior.error) {
      return NextResponse.json({ ok: false, error: "Rapor durumu okunamadı. Lütfen tekrar deneyin." }, { status: 500, headers: NO_STORE });
    }
    if (prior.row) {
      if (prior.row.report_kind === "canonical" && (prior.row.chart_id === chartId || prior.row.chart_id === null)) {
        return NextResponse.json({ ok: true, id: prior.row.id, reused: true, omittedCount: 0 }, { status: 200, headers: NO_STORE });
      }
      return NextResponse.json({ ok: false, error: "Bu istek kimliği başka bir rapora ait." }, { status: 409, headers: NO_STORE });
    }
  }

  // "Raporu Hazırlayan": istemcinin yazdığı ad/unvan (yalnız bu rapor); profil adı OTOMATİK yazılmaz.
  if (raw.preparedBy !== undefined && raw.preparedBy !== null && typeof raw.preparedBy !== "string") {
    return NextResponse.json({ ok: false, code: "INVALID_PREPARED_BY", error: "Geçersiz hazırlayan bilgisi." }, { status: 400, headers: NO_STORE });
  }
  const preparedBy = sanitizePreparedBy(raw.preparedBy);

  const built = await createReportSnapshotV2FromChart(guard.db, guard.tenantId, chartId, {
    requested,
    systemReadingPermitted,
    preparedBy,
  });
  if (!built.ok) {
    if (built.status >= 500) {
      await trackUsage(guard, req, { module: "human_design", action: "action_failed", failedAction: "record_created", subEntity: "report", errorClass: "server" });
    }
    return NextResponse.json({ ok: false, code: built.code, error: built.error }, { status: built.status, headers: NO_STORE });
  }
  if (png && !built.isRoxy) {
    return NextResponse.json(
      { ok: false, code: "BODYGRAPH_NOT_APPLICABLE", error: "BodyGraph görseli yalnız otomatik hesaplanmış haritalarda kabul edilir." },
      { status: 400, headers: NO_STORE },
    );
  }

  // BodyGraph: (1) doğrulanmış renderer PNG'si → (2) danışanın yüklenmiş görseli (owned kopya)
  // → (3) yok. Roxy haritasında (3) yalnız açık onayla (sessizce eksik "tam rapor" YOK).
  let storedImagePath: string | null = null;
  if (png) {
    const up = await uploadReportSnapshotPng(guard.db, guard.tenantId, reportId, png.buf);
    if (up.error || !up.path) {
      return NextResponse.json({ ok: false, error: "BodyGraph görseli rapora kaydedilemedi. Lütfen tekrar deneyin." }, { status: 503, headers: NO_STORE });
    }
    storedImagePath = up.path;
    built.snapshot.bodygraph = { status: "roxy_render", width: png.width, height: png.height, sha256: png.sha256 };
  } else if (
    built.uploadedImagePath &&
    built.clientId &&
    isOwnedChartImagePath(built.uploadedImagePath, guard.tenantId, built.clientId)
  ) {
    const copied = await copyChartImageToReportSnapshot(guard.db, guard.tenantId, built.clientId, built.uploadedImagePath, reportId);
    if (copied.error || !copied.path) {
      return NextResponse.json(
        { ok: false, error: "Harita görseli rapora kopyalanamadı. Lütfen tekrar deneyin." },
        { status: 503, headers: NO_STORE },
      );
    }
    storedImagePath = copied.path;
    built.snapshot.bodygraph = { status: "uploaded_image" };
  } else if (built.isRoxy && !allowMissingBodygraph) {
    return NextResponse.json(
      {
        ok: false,
        code: "BODYGRAPH_REQUIRED",
        error: "BodyGraph görseli oluşturulamadı. Tekrar deneyin ya da raporu BodyGraph görseli olmadan oluşturmayı açıkça onaylayın.",
      },
      { status: 422, headers: NO_STORE },
    );
  }
  if (storedImagePath) built.snapshot.chartImage = { storagePath: storedImagePath, includedAtGeneration: true };

  const saved = await saveCanonicalReport(guard.db, guard.tenantId, guard.userId, {
    id: reportId,
    chartId,
    clientId: built.clientId,
    title: hdReportTitle(built.clientName),
    snapshot: built.snapshot,
    // v2'de admin canonical içeriği yok → provenance yalnız yorum kaynaklarının özeti.
    provenance: {
      schema: built.snapshot.schemaVersion,
      expertEntries: built.snapshot.commentary.expert.entries.length,
      systemReading: built.snapshot.commentary.system.status,
      bodygraph: built.snapshot.bodygraph.status,
    },
  });
  if (saved.error || !saved.id) {
    // Satır oluşmadı → bu isteğin yazdığı görsel yetim kalmasın.
    if (storedImagePath) await removeHdStorageObjects(guard.db, [storedImagePath], "professional-report-rollback");
    return NextResponse.json({ ok: false, error: saved.error ?? "Rapor kaydedilemedi." }, { status: 400, headers: NO_STORE });
  }
  if (saved.duplicate) {
    // Aynı istek eşzamanlı geldi: satır diğer istekte oluştu → yeni satır YOK.
    return NextResponse.json({ ok: true, id: saved.id, reused: true, omittedCount: 0 }, { status: 200, headers: NO_STORE });
  }

  // USAGE360: donmuş snapshot KAYDI oluşturuldu → record_created (Word indirme ayrı eylem).
  await trackUsage(guard, req, { module: "human_design", action: "record_created", subEntity: "report", resourceId: saved.id });
  return NextResponse.json(
    {
      ok: true,
      id: saved.id,
      omittedCount: 0,
      bodygraph: built.snapshot.bodygraph.status,
      systemReading: built.snapshot.commentary.system.status,
      expertEntries: built.snapshot.commentary.expert.entries.length,
    },
    { status: 200, headers: NO_STORE },
  );
}
