import type { NextRequest } from "next/server";
import { requireDogaltasReportAccess } from "@/lib/dogaltas/reportAuth";
import { serverErrorResponse } from "@/lib/http/apiError";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { isUuid } from "@/lib/dogaltas/validation";
import { sanitizeXmlDeep } from "@/lib/dogaltas/reportSanitize";
import { STONE_PHOTO_BUCKET, isOwnedStonePhotoPath } from "@/lib/dogaltas/stonePhoto";
import { Packer } from "docx";
import { extractFirstImageRef, fetchStorageImageBuffer } from "@/lib/docx/reportHelpers";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
// Saf belge kurucusu (FA-02 tarih Europe/Istanbul + FA-16 bilgilendirme notu) — harness test eder.
import { buildStoneReportDoc, type StoneReportRow } from "./buildStoneReport";

export const runtime = "nodejs";

const ADMIN_LIBRARY_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";

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

  // Kütüphane taşları da dahil et
  const tenantIds = tenantId === ADMIN_LIBRARY_TENANT_ID
    ? [tenantId]
    : [tenantId, ADMIN_LIBRARY_TENANT_ID];

  const { data, error } = await db
    .from("stones")
    .select("*")
    .in("tenant_id", tenantIds)
    .eq("id", stoneId)
    .maybeSingle();

  if (error)
    return serverErrorResponse({ route: "dogaltas/stones/[id]/word-report", action: "POST", tenantId, cause: error });

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
    isLibrary: stone.tenant_id === ADMIN_LIBRARY_TENANT_ID,
    expertName: expertDisplayName(auth.profile),
  });

  const buffer = await Packer.toBuffer(doc);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
