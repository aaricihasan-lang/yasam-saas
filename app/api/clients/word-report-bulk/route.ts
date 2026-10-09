import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { Packer } from "docx";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { BULK_WORD_MAX_CLIENTS } from "@/lib/danisan/bulkWord";
import {
  buildClientsBulkFullReport,
  type ClientRow,
} from "@/app/api/clients/[id]/word-report/clientReportBuilder";
import {
  isBulkReadError,
  loadClientDatasetsBulk,
} from "@/app/api/clients/[id]/word-report/clientReportData";

export const runtime = "nodejs";
// WT7: toplu TAM rapor (her danışan tekli raporun tüm içeriği) — görsel indirme + DOCX üretimi uzun sürebilir.
export const maxDuration = 300;

/**
 * POST /api/clients/word-report-bulk — WT7 TOPLU TAM DANIŞAN DOSYASI
 *
 * Eskiden yalnız ad/telefon/sağlık notu özetiydi; artık seçilen her danışan için TEKLİ Word
 * raporunun AYNI içeriği (aynı builder gövdesi) üretilir — tekli raporda olan alan atlanmaz.
 *
 * KAPSAM (yalnız iki mod; "görünen/ilk sayfa" kapsamı YOK):
 *   - exportMode "selected" + clientIds (boş → 400; tümü bu tenant'ta bulunmalı, yoksa 409)
 *   - exportMode "all" → tenant'ın GERÇEK tüm danışanları (sayfalı okuma, kesilme yok)
 *   ("filtered" eski istemci uyumu için "selected" ile aynı işlenir.)
 *
 * SINIR: MAX_BULK_REPORT_CLIENTS aşılırsa pahalı okuma/DOCX'ten ÖNCE 413 + açık mesaj;
 * kayıt ASLA sessizce kırpılmaz. Yanıt akış (stream) olarak döner → Vercel 4.5 MB gövde
 * sınırı büyük dosyalarda devreye girmez.
 */

// DYA-05 → WT7: tam içerikli toplu dosya için sonlu üst sınır (bellek/süre ölçümüyle belirlendi;
// 1/3/10/50/100 sentetik danışan testi — scripts/wt7). Aşımda kullanıcıya açık hata gösterilir.
const MAX_BULK_REPORT_CLIENTS = BULK_WORD_MAX_CLIENTS;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const ID_CHUNK = 150;

type ExportMode = "all" | "selected" | "filtered";

function tooMany(n: number, scope: "selected" | "all"): Response {
  const error = scope === "all"
    ? `Toplam danışan sayısı (${n}) tek Word dosyası sınırını (${MAX_BULK_REPORT_CLIENTS}) aşıyor. Lütfen danışanları seçerek en fazla ${MAX_BULK_REPORT_CLIENTS}'lik gruplar halinde indirin.`
    : `Seçilen danışan sayısı (${n}) tek Word dosyası sınırını (${MAX_BULK_REPORT_CLIENTS}) aşıyor. Lütfen seçimi en fazla ${MAX_BULK_REPORT_CLIENTS} danışana düşürün.`;
  return Response.json({ ok: false, error, limit: MAX_BULK_REPORT_CLIENTS, count: n }, { status: 413 });
}

/** DOCX'i parça parça akıtır (Vercel gövde sınırı akışta uygulanmaz). */
function docxStreamResponse(buffer: Buffer, filename: string, clientCount: number): Response {
  const CHUNK = 256 * 1024;
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= buffer.length) { controller.close(); return; }
      const end = Math.min(offset + CHUNK, buffer.length);
      controller.enqueue(new Uint8Array(buffer.subarray(offset, end)));
      offset = end;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Report-Client-Count": String(clientCount),
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;

  // Kanonik oturum + modül kapısı: x-user-id + x-session-token + token↔user binding.
  // tenant_id SUNUCUDA guard'dan gelir; body'deki tenantId/userId'ye ASLA güvenilmez.
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", clientIds } = (body ?? {}) as {
    exportMode?: ExportMode;
    clientIds?: unknown;
  };

  // DEMO VİTRİN: toplu Word de salt-okunur çıktı (DB yazımı/ücretli servis yok) → demo hesapta açık.

  if (exportMode !== "all" && exportMode !== "selected" && exportMode !== "filtered")
    return Response.json({ ok: false, error: "Geçersiz dışa aktarma kapsamı." }, { status: 400 });

  let clients: ClientRow[] = [];

  if (exportMode === "selected" || exportMode === "filtered") {
    // Boş seçim ASLA "tümü"ne düşmez (eski davranış sessizce tüm tenant'ı basıyordu).
    if (!Array.isArray(clientIds) || clientIds.length === 0)
      return Response.json({ ok: false, error: "Word için en az bir danışan seçin." }, { status: 400 });
    // Geçersiz id sessizce elenmez → tüm istek reddedilir.
    if (!clientIds.every((x) => typeof x === "string" && UUID_RE.test(x)))
      return Response.json({ ok: false, error: "Geçersiz danışan seçimi." }, { status: 400 });
    const ids = Array.from(new Set(clientIds as string[]));
    if (ids.length > MAX_BULK_REPORT_CLIENTS) return tooMany(ids.length, "selected");

    const found = new Map<string, ClientRow>();
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const { data, error } = await db
        .from("clients")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("id", ids.slice(i, i + ID_CHUNK));
      if (error)
        return serverErrorResponse({
          route: "clients/word-report-bulk", action: "POST-clients", tenantId, cause: error,
          usage: { guard, req, module: "clients", failedAction: "report_generated", subEntity: "client" },
        });
      for (const c of (data ?? []) as ClientRow[]) found.set(c.id, c);
    }
    const missing = ids.length - found.size;
    if (found.size === 0)
      return Response.json({ ok: false, error: "Bu seçim için danışan bulunamadı." }, { status: 404 });
    if (missing > 0)
      return Response.json(
        { ok: false, error: `Seçilen danışanlardan ${missing} tanesi bulunamadı (silinmiş olabilir). Listeyi yenileyip tekrar deneyin.` },
        { status: 409 },
      );
    // Seçim sırası korunur (kullanıcının listede gördüğü sıra).
    clients = ids.map((id) => found.get(id)!);
  } else {
    // "all" — önce say; sınır aşılırsa pahalı okumaya hiç başlamadan reddet.
    const { count, error: countError } = await db
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (countError)
      return serverErrorResponse({ route: "clients/word-report-bulk", action: "POST-count", tenantId, cause: countError });
    if ((count ?? 0) > MAX_BULK_REPORT_CLIENTS) return tooMany(count ?? 0, "all");

    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from("clients")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error)
        return serverErrorResponse({
          route: "clients/word-report-bulk", action: "POST", tenantId, cause: error,
          usage: { guard, req, module: "clients", failedAction: "report_generated", subEntity: "client" },
        });
      const rows = (data ?? []) as ClientRow[];
      clients.push(...rows);
      if (rows.length < PAGE) break;
    }
    if (!clients.length)
      return Response.json({ ok: false, error: "Henüz danışan yok." }, { status: 404 });
    // Sayım ile okuma arasında eşzamanlı ekleme → sınır yine korunur (kırpma yok, açık hata).
    if (clients.length > MAX_BULK_REPORT_CLIENTS) return tooMany(clients.length, "all");
  }

  let items;
  try {
    items = await loadClientDatasetsBulk(db, tenantId, clients);
  } catch (e) {
    return serverErrorResponse({
      route: "clients/word-report-bulk", action: isBulkReadError(e) ? `POST-read-${e.table}` : "POST-read", tenantId,
      cause: isBulkReadError(e) ? e.cause : e,
      usage: { guard, req, module: "clients", failedAction: "report_generated", subEntity: "client" },
    });
  }

  const { doc, filename } = buildClientsBulkFullReport(items, { expertName: expertDisplayName(guard.profile) });
  const buffer = await Packer.toBuffer(doc);
  // Toplu rapor = tek kullanıcı eylemi → tek olay + itemCount (danışan sayısı).
  await trackUsage(guard, req, { module: "clients", action: "report_generated", subEntity: "client", itemCount: items.length });
  return docxStreamResponse(buffer, filename, items.length);
}
