import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { CLASSIC_DUPLICATE_MAX, findClassicDuplicates, formatBirthTr, validateDuplicateCheck } from "@/lib/numeroloji-klasik/duplicate";
import { classicError, classicJson, classicNotFound, readClassicBody, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { listPersonAnalysesForDuplicateCheck } from "@/lib/numeroloji-klasik/server/repository";

export const runtime = "nodejs";

/**
 * POST /api/numeroloji-klasik/analyses/mukerrer — Kaydet öncesi mükerrer kişi analizi kontrolü (SALT OKUMA).
 *   Gövde: { fullName, birth: { year, month, day }, excludeId? } (kişisel bilgi URL'ye yazılmaz → POST).
 *   Yanıt: { ok, total, matches: [{ id, title, fullName, birthDate, createdAt }] } — en yeni önce, en çok 20.
 *
 * Güvenlik: bayrak kapalı → 404; requireModuleAccess("numerology"); tenant YALNIZ oturumdan; yalnız kendi
 * tenant'ının silinmemiş kişi analizleri okunur; hiçbir kayıt oluşturulmaz / değiştirilmez; 0 sağlayıcı çağrısı;
 * yanıt no-store.
 */
export async function POST(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;

  const body = await readClassicBody(req);
  if (!body.ok) return validationResponse(body);
  const v = validateDuplicateCheck(body.value);
  if (!v.ok) return validationResponse(v);

  const r = await listPersonAnalysesForDuplicateCheck(guard.db, guard.tenantId);
  if (!r.ok) return classicError("DB_ERROR");
  const all = findClassicDuplicates(r.value, v.value);
  return classicJson(200, {
    ok: true,
    total: all.length,
    matches: all.slice(0, CLASSIC_DUPLICATE_MAX).map((m) => ({
      id: m.id,
      title: m.title,
      fullName: m.fullName,
      birthDate: formatBirthTr(m.birth),
      createdAt: m.createdAt,
    })),
  });
}
