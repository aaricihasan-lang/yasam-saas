import { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/http/apiError";
import { guardWorkspace, json, onlyKeys, readJson } from "@/lib/workspace/http";
import { UUID_RE, parseDesign, parseExpectedVersion } from "@/lib/workspace/schema";
import { getDesign, writeDesign, type DesignAction } from "@/lib/workspace/service";
import { verifyDesignAssets } from "@/lib/workspace/assets";

export const runtime = "nodejs";

/**
 * GET  /api/settings/workspace/design — uzmanın KENDİ ofis tasarımı (uygulanan, taslak, ≤10 geçmiş, version).
 *      Kayıt yoksa applied=null → mevcut ana sayfa aynen kullanılır.
 * POST /api/settings/workspace/design — { action, expectedVersion, draft?, historyId? }
 *      action: saveDraft | discardDraft | apply | restore | loadHistory | reset
 *      Sürüm tutmazsa 409 + güncel durum (çift sekme). apply / restore: sunucunun ölçebildiği kontrast yetersizse 422
 *      (CONTRAST_INSUFFICIENT); taslak kaydı engellenmez.
 *
 * Güvenlik: bayrak (EXPERT_WORKSPACE_DESIGN_ENABLED) kapalıyken 404. user/tenant yalnız oturumdan; gövdede user_id /
 * tenant_id / dosya yolu kabul edilmez (bilinmeyen alan → 400). Demo hesap/tenant yazamaz (403). Modül yetkisi değişmez.
 */
const ROUTE = "api/settings/workspace/design";
const ACTIONS = ["saveDraft", "discardDraft", "apply", "restore", "loadHistory", "reset"] as const;

export async function GET(req: NextRequest): Promise<Response> {
  const g = await guardWorkspace(req, "read");
  if (!g.ok) return g.response;
  const r = await getDesign(g.db, g.owner);
  if (!r.ok) return serverErrorResponse({ route: ROUTE, action: "get", tenantId: g.owner.tenantId, cause: r.cause });
  return json({ ok: true, design: r.state });
}

export async function POST(req: NextRequest): Promise<Response> {
  const g = await guardWorkspace(req, "write");
  if (!g.ok) return g.response;
  const b = await readJson(req);
  if (!b.ok) return b.response;
  const body = b.body;

  const extra = onlyKeys(body, ["action", "expectedVersion", "draft", "historyId"]);
  if (extra) return json({ ok: false, error: "Bilinmeyen alan.", path: extra }, 400);
  if (!ACTIONS.includes(body.action as (typeof ACTIONS)[number])) return json({ ok: false, error: "Geçersiz işlem.", path: "action" }, 400);
  const action = body.action as (typeof ACTIONS)[number];
  const ev = parseExpectedVersion(body.expectedVersion);
  if (!ev.ok) return json({ ok: false, error: ev.error, path: ev.path }, 400);

  const needsDraft = action === "saveDraft";
  const mayDraft = action === "saveDraft" || action === "apply";
  const needsHistory = action === "restore" || action === "loadHistory";
  if (!mayDraft && body.draft !== undefined) return json({ ok: false, error: "Bu işlem taslak almaz.", path: "draft" }, 400);
  if (!needsHistory && body.historyId !== undefined) return json({ ok: false, error: "Bu işlem geçmiş kimliği almaz.", path: "historyId" }, 400);
  if (needsDraft && body.draft === undefined) return json({ ok: false, error: "Taslak gerekli.", path: "draft" }, 400);

  let a: DesignAction;
  if (mayDraft && body.draft !== undefined) {
    // P2: görsel yalnız sunucunun verdiği assetId ile; sahiplik + tür sunucuda doğrulanır (dosya yolu / URL yine reddedilir).
    const d = parseDesign(body.draft, { allowAssets: true });
    if (!d.ok) return json({ ok: false, error: d.error, path: d.path }, 400);
    const own = await verifyDesignAssets(g.db, g.owner, d.value);
    if (!own.ok) return own.status >= 500
      ? serverErrorResponse({ route: ROUTE, action: "verifyAssets", tenantId: g.owner.tenantId, cause: own.cause })
      : json({ ok: false, code: own.code, error: own.error }, own.status);
    a = action === "saveDraft" ? { action, draft: d.value } : { action: "apply", draft: d.value };
  } else if (needsHistory) {
    if (typeof body.historyId !== "string" || !UUID_RE.test(body.historyId)) return json({ ok: false, error: "Geçersiz geçmiş kimliği.", path: "historyId" }, 400);
    a = { action: action as "restore" | "loadHistory", historyId: body.historyId };
  } else {
    a = { action: action as "discardDraft" | "apply" | "reset" };
  }

  const r = await writeDesign(g.db, g.owner, ev.value, a);
  if (r.ok) return json({ ok: true, design: r.state });
  if (r.kind === "conflict") return json({ ok: false, code: "VERSION_CONFLICT", error: "Tasarım başka bir sekmede değişti. Güncel hâli yüklendi; değişikliğinizi yeniden deneyin.", design: r.current }, 409);
  if (r.kind === "invalid") return json({ ok: false, error: r.error }, 400);
  if (r.kind === "contrast") return json({ ok: false, code: "CONTRAST_INSUFFICIENT", error: "Okunabilirlik yetersiz: tasarım bu hâliyle uygulanamaz. Renkleri düzeltip yeniden deneyin.", issues: r.issues }, 422);
  return serverErrorResponse({ route: ROUTE, action, tenantId: g.owner.tenantId, cause: r.cause });
}
