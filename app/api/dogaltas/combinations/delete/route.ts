import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/dogaltas/validation";
import { serverErrorResponse } from "@/lib/http/apiError";

export const runtime = "nodejs";

/**
 * POST /api/dogaltas/combinations/delete
 *
 * Kullanıcının kendi tenant'ındaki kombinasyon VARYANTLARINI benzersiz kayıt
 * kimliği (id) bazlı siler (tekli veya toplu).
 *
 * F-06 (veri kaybı) kapanışı:
 *   Eskiden silme başlık (issue) alanı üzerinden toplu yapılıyordu.
 *   Aynı başlıkta birden fazla varyant olduğunda UI "1 kombinasyon" derken backend
 *   o başlığın TÜM varyantlarını siliyordu. Artık silme yalnız gerçek satır id'si
 *   ile yapılır → seçilen kayıt neyse yalnız o silinir; "gruptaki tüm varyantları
 *   sil" istendiğinde UI o grubun tüm satır id'lerini açıkça gönderir.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id SUNUCUDAN (oturumdan) alınır; client'tan GELMEZ.
 *   - DELETE her zaman tenant_id = session tenant ile sınırlıdır → başka tenant'ın
 *     id'si gönderilse bile 0 satır etkilenir.
 *   - Malformed/UUID olmayan id reddedilir (DB'ye gitmeden).
 *   - Demo hesap: gerçek delete YAPILMAZ; başarılı gibi döner.
 *   - Ham DB hatası yanıta sızmaz (serverErrorResponse).
 */

const MAX_IDS = 500;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const rawIds = Array.isArray(body.ids)
    ? Array.from(new Set(body.ids.map((i) => String(i).trim()).filter((i) => i.length > 0)))
    : [];

  if (rawIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Silinecek kayıt belirtilmedi." }, { status: 400 });
  }
  if (rawIds.length > MAX_IDS) {
    return NextResponse.json(
      { ok: false, error: `Tek istekte en fazla ${MAX_IDS} kayıt silinebilir.` },
      { status: 400 },
    );
  }
  // Tüm id'ler geçerli UUID olmalı — biri bile bozuksa tüm istek reddedilir
  // (kısmi/sürpriz silme yok). DB'ye malformed id gitmez.
  if (!rawIds.every((id) => isUuid(id))) {
    return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  }

  // Demo hesap: gerçek silme yapılmaz; başarılı gibi dönülür.
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  }

  const { error, count } = await db
    .from("combinations")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId) // SUNUCUDAN — tenant dışı silme engellenir
    .in("id", rawIds);

  if (error) {
    return serverErrorResponse({
      route: "dogaltas/combinations/delete",
      action: "DELETE",
      tenantId,
      cause: error,
    });
  }

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
