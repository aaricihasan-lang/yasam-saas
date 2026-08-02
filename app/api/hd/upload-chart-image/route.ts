import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isOwnedChartImagePath } from "@/lib/human-design/api/chartImagePath";

export const runtime = "nodejs";

/**
 * POST /api/hd/upload-chart-image — Human Design harita görseli yükleme (HD-0 güvenlik).
 *
 * Güvenlik modeli:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
 *   - tenantId YALNIZ guard'dan; istekten (body/form) GÜVENİLMEZ.
 *   - Danışan sahipliği tenant-scoped doğrulanır (IDOR guard).
 *   - Demo hesap yazamaz (guard sonucundan).
 *   - Bucket PRIVATE; DB'de yalnız kalıcı storage PATH saklanır (public/signed URL DEĞİL).
 *   - Storage path server-side üretilir: {tenantId}/{clientId}/{uuid}.{ext}
 *     (dosya adı kullanıcıdan alınmaz).
 *   - Yanıt no-store; ham Supabase/PostgreSQL hata metni kullanıcıya SIZDIRILMAZ.
 *
 * Route bucket OLUŞTURMAZ ve bucket ayarı DEĞİŞTİRMEZ (migration işi).
 */

const BUCKET = "hd-chart-images";
const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_TTL = 3600;

// MIME allow-list → güvenli uzantı (uzantı MIME'dan türetilir, dosya adından DEĞİL).
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return fail(403, "Demo hesabında harita görseli yüklenemez.");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Geçerli form verisi gerekli.");
  }

  const file = form.get("file");
  const clientId = String(form.get("clientId") ?? "").trim();

  if (!(file instanceof File) || !clientId) {
    return fail(400, "file ve clientId gerekli.");
  }

  // MIME allow-list (dosya adı/uzantısı değil, gerçek tip).
  const ext = EXT_BY_MIME[file.type];
  if (!ext) {
    return fail(400, "Sadece JPG, PNG veya WebP yüklenebilir.");
  }
  if (file.size > MAX_BYTES) {
    return fail(400, "Dosya boyutu 5 MB'ı geçemez.");
  }

  // Danışan sahipliği — tenant guard'dan (IDOR koruması).
  const { data: client, error: clientErr } = await guard.db
    .from("human_design_clients")
    .select("id, chart_image_url")
    .eq("id", clientId)
    .eq("tenant_id", guard.tenantId)
    .maybeSingle();

  if (clientErr) {
    console.error("[hd/upload-chart-image] client lookup:", clientErr.message);
    return fail(500, "Danışan doğrulanamadı.");
  }
  if (!client) {
    return fail(403, "Danışan doğrulanamadı.");
  }

  const previousPath =
    typeof client.chart_image_url === "string" ? client.chart_image_url.trim() : "";

  // Server-side üretilen kalıcı path — kullanıcı girdisinden bağımsız.
  const storagePath = `${guard.tenantId}/${clientId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await guard.db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    // Bucket eksikliği dahil tüm storage hataları maskeli loglanır; kullanıcıya genel mesaj.
    console.error("[hd/upload-chart-image] upload:", uploadError.message);
    return fail(500, "Görsel yüklenemedi. Lütfen daha sonra tekrar deneyin.");
  }

  // DB'ye YALNIZ kalıcı path yaz (public/signed URL değil).
  const { error: updateError } = await guard.db
    .from("human_design_clients")
    .update({ chart_image_url: storagePath, updated_at: new Date().toISOString() })
    .eq("id", clientId)
    .eq("tenant_id", guard.tenantId);

  if (updateError) {
    // DB güncellemesi başarısız → yeni yüklenen dosyayı geri al (yetim bırakma).
    await guard.db.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    console.error("[hd/upload-chart-image] db update:", updateError.message);
    return fail(500, "Görsel kaydedilemedi.");
  }

  // DB başarıyla güncellendikten SONRA eski dosyayı temizlemeyi dene (best-effort).
  // Temizlik hatası yeni yüklemeyi veri kaybına uğratmaz; yalnız maskeli loglanır.
  // Yalnız bu tenant/client'a ait path silinir (legacy URL/başka path atlanır).
  if (
    previousPath !== storagePath &&
    isOwnedChartImagePath(previousPath, guard.tenantId, clientId)
  ) {
    const { error: removeErr } = await guard.db.storage.from(BUCKET).remove([previousPath]);
    if (removeErr) {
      console.error("[hd/upload-chart-image] eski dosya temizlenemedi:", removeErr.message);
    }
  }

  // Kısa ömürlü signed URL (yalnız önizleme için) — DB'ye YAZILMAZ.
  // storagePath yanıta KOYULMAZ: istemci path değerine ihtiyaç duymaz (görsel yalnız
  // clientId → signed-URL route ile çözülür; kalıcı path DB'de tutulur).
  let signedUrl: string | null = null;
  const { data: signed, error: signErr } = await guard.db.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_TTL);
  if (signErr) {
    console.error("[hd/upload-chart-image] sign:", signErr.message);
  } else {
    signedUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json(
    { ok: true, hasImage: true, signedUrl },
    { status: 200, headers: NO_STORE },
  );
}
