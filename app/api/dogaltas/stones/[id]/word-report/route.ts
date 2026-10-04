import type { NextRequest } from "next/server";
import { requireDogaltasReportAccess } from "@/lib/dogaltas/reportAuth";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { isUuid } from "@/lib/dogaltas/validation";
import { sanitizeXmlDeep } from "@/lib/dogaltas/reportSanitize";
import { STONE_PHOTO_BUCKET, isOwnedStonePhotoPath } from "@/lib/dogaltas/stonePhoto";
import { stoneReadTenantIds } from "@/lib/dogaltas/stoneTenantScope";
import { Packer } from "docx";
import { extractFirstImageRef, fetchStorageImageBuffer } from "@/lib/docx/reportHelpers";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
// Saf belge kurucusu (FA-02 tarih Europe/Istanbul + FA-16 bilgilendirme notu) — harness test eder.
import { buildStoneReportDoc, type StoneReportRow } from "./buildStoneReport";

export const runtime = "nodejs";


type StoneRow = StoneReportRow;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  const { id: stoneId } = await params;
  // F-019: geçersiz UUID DB'ye gitmeden reddedilir (ham PG hatası sızmaz).
  if (!isUuid(stoneId))
    return Response.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });

  // F-018: doğrulanmış oturum kapısı — tenantId/userId SUNUCUDAN (body'den DEĞİL).
  const auth = await requireDogaltasReportAccess(req);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth;
  // Usage360 kimliği yalnız doğrulanmış rapor kapısından; demo orada zaten 403.
  const usageGuard = { ...auth, is_demo_account: false };

  // Detay GET ile AYNI okuma görünürlüğü (tek kaynak). Rapor kapısı demo'yu zaten
  // 403'ler → burada isDemo=false: normal uzman yalnız kendi tenant'ının taşını raporlar;
  // kütüphane/başka tenant taşı id ile istenirse 404 (içerik sızmaz).
  const tenantIds = stoneReadTenantIds(tenantId, false);

  const { data, error } = await db
    .from("stones")
    .select("*")
    .in("tenant_id", tenantIds)
    .eq("id", stoneId)
    .maybeSingle();

  if (error)
    return serverErrorResponse({ route: "dogaltas/stones/[id]/word-report", action: "POST", tenantId, cause: error, usage: { guard: usageGuard, req, module: "stones", failedAction: "report_generated", subEntity: "stone" } });

  if (!data)
    return Response.json({ ok: false, error: "Taş kaydı bulunamadı." }, { status: 404 });

  // RPT-XML: rapor motoruna girmeden önce string alanlar XML 1.0 güvenli hale
  // getirilir (illegal kontrol karakteri temizliği; TR/Unicode/emoji korunur).
  const stone = sanitizeXmlDeep(data as StoneRow);

  // Resim — SSRF kapanışı: yalnız taşın SAHİBİ tenant'a ait canonical
  // dogaltas-photos file_path (service_role download). Satır zaten izinli
  // tenant'lara (oturum tenant'ı veya Admin Kütüphanesi) kısıtlı okundu →
  // stone.tenant_id güvenilir; yabancı/traversal path reddedilir. Legacy remote
  // url ARTIK fetch edilmez. Geçersiz görsel raporu patlatmaz (görselsiz devam).
  const imgRef = extractFirstImageRef(stone.images);
  const candidatePath = imgRef?.file_path;
  let imageBuf: Buffer | null = null;
  if (isOwnedStonePhotoPath(candidatePath, stone.tenant_id)) {
    imageBuf = await fetchStorageImageBuffer(db, STONE_PHOTO_BUCKET, candidatePath).catch(() => null);
  }

  const { doc, filename } = buildStoneReportDoc({
    stone,
    imageBuf,
    isLibrary: stone.tenant_id !== tenantId,
    expertName: expertDisplayName(auth.profile),
  });

  const buffer = await Packer.toBuffer(doc);
  // Usage360: Word dosyası BAŞARIYLA üretildi → tek rapor olayı (konu: taş).
  await trackUsage(usageGuard, req, { module: "stones", action: "report_generated", subEntity: "stone", resourceId: stoneId });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
