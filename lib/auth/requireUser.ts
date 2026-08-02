import { NextResponse, type NextRequest } from "next/server";
import { verifyUserRequest, type UserGuardOk } from "@/lib/auth/userGuard";
import { assertUserModuleAccess, type ModuleGateKey } from "@/lib/auth/moduleAccess";

export type RequireUserResult =
  | { ok: true; user: UserGuardOk }
  | { ok: false; response: NextResponse };

/**
 * İnce kimlik kapısı — Dijital İçerik Merkezi'nin AI/işlem uçları için.
 *
 * Neden: /api/ders-notu/* ve /api/belge-ceviri/* altındaki dönüştürme/çeviri/OCR
 * uçları kimlik taşımıyordu → internetteki herkes geçerli payload ile OpenAI
 * harcaması tetikleyebiliyordu (cost-abuse). Bu kapı:
 *   - x-user-id + x-session-token binding'ini zorunlu kılar (verifyUserRequest),
 *   - demo hesabı sunucu tarafında engeller (client engeli tek başına yeterli değil).
 *
 * Başarıda doğrulanmış kullanıcıyı döndürür (userId, tenantId, db, is_demo_account).
 * verifyUserRequest yalnız header okur; request gövdesi (formData) bozulmadan kalır.
 */
export async function requireDigitalContentUser(
  req: NextRequest,
  moduleKey?: ModuleGateKey,
): Promise<RequireUserResult> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return { ok: false, response: guard.response };
  if (guard.is_demo_account) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Demo hesabında bu işlem kullanılamaz." },
        { status: 403 },
      ),
    };
  }
  // P3: kişiye özel modül izni server-side zorlanır (belge_ceviri / ders_notu).
  if (moduleKey) {
    const gate = await assertUserModuleAccess(guard.db, guard.userId, moduleKey);
    if (!gate.ok) return { ok: false, response: gate.response };
  }
  return { ok: true, user: guard };
}
