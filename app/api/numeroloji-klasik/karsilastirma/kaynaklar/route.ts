import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { isUuid } from "@/lib/numeroloji-klasik/input";
import { classicError, classicJson, classicNotFound } from "@/lib/numeroloji-klasik/server/http";
import { listClassicSources, listLegacySources, maskClientId, validateCompareQuery } from "@/lib/numeroloji-klasik/server/compareService";

export const runtime = "nodejs";

/**
 * GET /api/numeroloji-klasik/karsilastirma/kaynaklar?clientId=<uuid>&qa=<A araması ≤ 60>&qb=<B araması ≤ 60>[&taraf=a|b]
 *   → { ok, legacy: [{ id, fullName, birthDate, createdAt, methodologyVersion, clientId }],
 *            classic: [{ id, title, kind, createdAt, clientId }] }   (her biri Türkçe A–Z, en çok 50; tenant oturumdan)
 *   30.10.2026: A (Bütüncül) ve B (Klasik) için AYRI arama (qa / qb); taraf=a|b yalnız o tarafı döner.
 *   Eski tek `q` parametresi geriye uyumluluk için iki tarafa birden uygulanır.
 * Mevcut Numeroloji kayıtları YALNIZ select ile okunur (analysis_data taşınmaz). clientId → clients izni zorunlu;
 * clients izni yoksa yanıttaki her clientId null.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const clientIdRaw = sp.get("clientId");
  const canSeeClients = resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients");
  let clientId: string | null = null;
  if (clientIdRaw !== null && clientIdRaw !== "") {
    if (!isUuid(clientIdRaw)) return classicJson(400, { ok: false, code: "INVALID_CLIENT_ID", error: "Geçersiz danışan kimliği." });
    if (!canSeeClients) {
      return classicJson(403, { ok: false, code: "CLIENTS_PERMISSION_REQUIRED", error: "Danışana göre listelemek için Danışan Yönetimi izniniz olmalı." });
    }
    clientId = clientIdRaw.toLowerCase();
  }
  const both = validateCompareQuery(sp.get("q"));
  if (!both.ok) return classicJson(400, { ok: false, code: both.code, error: both.error, ...(both.field ? { field: both.field } : {}) });
  const qa = validateCompareQuery(sp.get("qa") ?? both.value);
  if (!qa.ok) return classicJson(400, { ok: false, code: qa.code, error: qa.error, field: "qa" });
  const qb = validateCompareQuery(sp.get("qb") ?? both.value);
  if (!qb.ok) return classicJson(400, { ok: false, code: qb.code, error: qb.error, field: "qb" });
  const taraf = sp.get("taraf");
  if (taraf !== null && taraf !== "a" && taraf !== "b") return classicJson(400, { ok: false, code: "INVALID_SIDE", error: "Geçersiz taraf.", field: "taraf" });

  const [legacy, classic] = await Promise.all([
    taraf === "b" ? Promise.resolve({ ok: true as const, value: [] }) : listLegacySources(guard.db, guard.tenantId, { clientId, q: qa.value }),
    taraf === "a" ? Promise.resolve({ ok: true as const, value: [] }) : listClassicSources(guard.db, guard.tenantId, { clientId, q: qb.value }),
  ]);
  if (!legacy.ok || !classic.ok) return classicError("DB_ERROR");
  return classicJson(200, {
    ok: true,
    legacy: legacy.value.map((x) => maskClientId(x, canSeeClients)),
    classic: classic.value.map((x) => maskClientId(x, canSeeClients)),
  });
}
