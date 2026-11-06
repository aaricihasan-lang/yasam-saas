import { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/http/apiError";
import { deleteAsset, readAssetVariant } from "@/lib/workspace/assets";
import { ASSET_VARIANT_MAX_BYTES } from "@/lib/workspace/catalog";
import { guardWorkspace, json, onlyKeys, readJson } from "@/lib/workspace/http";
import { UUID_RE } from "@/lib/workspace/schema";

export const runtime = "nodejs";

const ROUTE = "api/settings/workspace/assets/[assetId]";

/**
 * GET /api/settings/workspace/assets/{assetId}?v=desktop|mobile — görsel baytları sunucudan akar (imzalı URL yok).
 * Sahiplik: tenant + kullanıcı + silinmemiş; başka uzmanın / tenant'ın assetId'si → 404.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ assetId: string }> }): Promise<Response> {
  const g = await guardWorkspace(req, "read");
  if (!g.ok) return g.response;
  const { assetId } = await ctx.params;
  if (!UUID_RE.test(assetId)) return json({ ok: false, error: "Görsel bulunamadı." }, 404);
  const v = req.nextUrl.searchParams.get("v") ?? "desktop";
  if (v !== "desktop" && v !== "mobile") return json({ ok: false, error: "Varyant desktop veya mobile olmalı." }, 400);
  const r = await readAssetVariant(g.db, g.owner, assetId, v);
  if (!r.ok) {
    if (r.status >= 500) return serverErrorResponse({ route: ROUTE, action: "read", tenantId: g.owner.tenantId, cause: r.cause });
    return json({ ok: false, code: r.code, error: r.error }, r.status);
  }
  // Vercel işlev yanıtı ~4,5 MB ile sınırlı; varyantlar işlemede ASSET_VARIANT_MAX_BYTES ile tavanlanır (savunma kontrolü).
  if (r.bytes.length > ASSET_VARIANT_MAX_BYTES) return json({ ok: false, code: "variant_too_large", error: "Görsel okunamadı." }, 502);
  return new Response(new Uint8Array(r.bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(r.bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ETag: `"${r.sha256.slice(0, 32)}-${v}"`,
    },
  });
}

/**
 * DELETE /api/settings/workspace/assets/{assetId} — { confirm: true } ile AÇIK kullanıcı eylemi.
 * Görsel uygulanan / taslak / geçmiş tasarımlardan birinde kullanılıyorsa 409 (silinmez). Satır silinmez; deleted_at.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ assetId: string }> }): Promise<Response> {
  const g = await guardWorkspace(req, "write");
  if (!g.ok) return g.response;
  const { assetId } = await ctx.params;
  if (!UUID_RE.test(assetId)) return json({ ok: false, error: "Görsel bulunamadı." }, 404);
  const b = await readJson(req);
  if (!b.ok) return b.response;
  const extra = onlyKeys(b.body, ["confirm"]);
  if (extra) return json({ ok: false, error: "Bilinmeyen alan.", path: extra }, 400);
  if (b.body.confirm !== true) return json({ ok: false, code: "confirm_required", error: "Silme için açık onay (confirm: true) gerekli." }, 400);
  const r = await deleteAsset(g.db, g.owner, assetId);
  if (r.ok) return json({ ok: true });
  if (r.status >= 500) return serverErrorResponse({ route: ROUTE, action: "delete", tenantId: g.owner.tenantId, cause: r.cause });
  return json({ ok: false, code: r.code, error: r.error, where: (r as { where?: string[] }).where }, r.status);
}
