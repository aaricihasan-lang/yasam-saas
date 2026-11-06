import { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/http/apiError";
import { guardWorkspace, json, onlyKeys, readJson } from "@/lib/workspace/http";
import { parseExpectedVersion, parseUiPrefs } from "@/lib/workspace/schema";
import { getPrefs, writePrefs } from "@/lib/workspace/service";

export const runtime = "nodejs";

/**
 * GET /api/settings/workspace/prefs — uzmanın KENDİ arayüz tercihleri (gizlenen modüller, Favorilerim ≤8, kart görünümü,
 *     görünüm modu, okuma ayarı). Kayıt yoksa varsayılanlar (version 0).
 * PUT /api/settings/workspace/prefs — { expectedVersion, prefs } tam değer; sürüm tutmazsa 409.
 *
 * Tercihler tasarım taslağından BAĞIMSIZDIR (Owner kararı 3) ve modül YETKİSİNİ değiştirmez: yalnız expert_ui_prefs
 * yazılır; users.module_permissions ve erişim kararı (requireModuleAccess) bu uçtan etkilenmez.
 */
const ROUTE = "api/settings/workspace/prefs";

export async function GET(req: NextRequest): Promise<Response> {
  const g = await guardWorkspace(req, "read");
  if (!g.ok) return g.response;
  const r = await getPrefs(g.db, g.owner);
  if (!r.ok) return serverErrorResponse({ route: ROUTE, action: "get", tenantId: g.owner.tenantId, cause: r.cause });
  return json({ ok: true, prefs: r.state });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const g = await guardWorkspace(req, "write");
  if (!g.ok) return g.response;
  const b = await readJson(req);
  if (!b.ok) return b.response;
  const extra = onlyKeys(b.body, ["expectedVersion", "prefs"]);
  if (extra) return json({ ok: false, error: "Bilinmeyen alan.", path: extra }, 400);
  const ev = parseExpectedVersion(b.body.expectedVersion);
  if (!ev.ok) return json({ ok: false, error: ev.error, path: ev.path }, 400);
  const p = parseUiPrefs(b.body.prefs);
  if (!p.ok) return json({ ok: false, error: p.error, path: p.path }, 400);

  const r = await writePrefs(g.db, g.owner, ev.value, p.value);
  if (r.ok) return json({ ok: true, prefs: r.state });
  if (r.kind === "conflict") return json({ ok: false, code: "VERSION_CONFLICT", error: "Tercihler başka bir sekmede değişti. Güncel hâli yüklendi.", prefs: r.current }, 409);
  if (r.kind === "invalid") return json({ ok: false, error: r.error }, 400);
  return serverErrorResponse({ route: ROUTE, action: "put", tenantId: g.owner.tenantId, cause: r.cause });
}
