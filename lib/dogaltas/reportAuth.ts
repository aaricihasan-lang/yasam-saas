/**
 * lib/dogaltas/reportAuth.ts — Doğaltaş rapor/export rotaları için TEK doğrulanmış
 * oturum kapısı (F-018).
 *
 * Önceki durum: 6 rapor rotası kimliği (userId/tenantId) request BODY'sinden alıyor,
 * yalnız service_role IDOR lookup + assertUserModuleAccess ile doğruluyordu → geçerli
 * bir userId+tenantId bilen biri OTURUM TOKEN'ı olmadan aggregate DOCX üretebiliyordu.
 *
 * Bu kapı, CRUD rotalarıyla AYNI modeli kullanır: `requireModuleAccess` →
 * x-user-id + x-session-token binding + kişiye özel modül izni. tenantId/userId
 * SUNUCUDAN (doğrulanmış oturumdan) türetilir; client body/query'deki userId/tenantId
 * authorization için KULLANILMAZ (spoof edilse bile kapsam değişmez). service_role db
 * yalnız sunucuda kalır (guard.db). Demo hesap export sunucu seviyesinde engellenir.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DogaltasReportAuth =
  | { ok: true; db: SupabaseClient; userId: string; tenantId: string; email: string }
  | { ok: false; response: Response };

export async function requireDogaltasReportAccess(
  req: NextRequest,
): Promise<DogaltasReportAuth> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return { ok: false, response: guard.response };

  // Demo hesap: export sunucu seviyesinde engellenir (mevcut davranış korunur).
  if (guard.is_demo_account) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Demo hesabında bu işlem kullanılamaz." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, db: guard.db, userId: guard.userId, tenantId: guard.tenantId, email: guard.email };
}
