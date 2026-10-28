import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { classicError, classicJson, classicNotFound } from "@/lib/numeroloji-klasik/server/http";
import { CLASSIC_CATALOG_KINDS, getCatalogEntry, listCatalog, type ClassicCatalogKind } from "@/lib/numeroloji-klasik/server/repository";

export const runtime = "nodejs";

/**
 * GET /api/numeroloji-klasik/catalog?kind=pythagorean_meaning|chaldean_compound|lucky_association[&number=n][&lang=tr|en]
 * Sabit sayı kütüphanesi — yalnız DB'den okunur (0 sağlayıcı çağrısı). Kişisel veri yok.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") ?? "pythagorean_meaning";
  const lang = sp.get("lang") ?? "tr";
  const numberRaw = sp.get("number");
  if (!(CLASSIC_CATALOG_KINDS as readonly string[]).includes(kind)) return classicJson(400, { ok: false, code: "INVALID_KIND", error: "Katalog türü geçersiz." });
  if (lang !== "tr" && lang !== "en") return classicJson(400, { ok: false, code: "INVALID_LANG", error: "Dil geçersiz." });

  if (numberRaw !== null) {
    if (!/^\d{1,2}$/.test(numberRaw)) return classicJson(400, { ok: false, code: "INVALID_NUMBER", error: "Sayı geçersiz." });
    const r = await getCatalogEntry(guard.db, kind as ClassicCatalogKind, Number(numberRaw), lang);
    if (!r.ok) return r.reason === "not_found" ? classicNotFound() : classicError("DB_ERROR");
    return classicJson(200, { ok: true, entry: { kind: r.value.kind, number: r.value.number, lang: r.value.lang, payload: r.value.payload } });
  }
  const r = await listCatalog(guard.db, kind as ClassicCatalogKind, lang);
  if (!r.ok) return classicError("DB_ERROR");
  return classicJson(200, { ok: true, entries: r.value.map((x) => ({ kind: x.kind, number: x.number, lang: x.lang, payload: x.payload })) });
}
