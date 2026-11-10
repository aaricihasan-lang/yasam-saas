import { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/http/apiError";
import { guardProfile, json, readJsonObject } from "@/lib/profile/http";
import { parseLogoSelection } from "@/lib/profile/logoSchema";
import { describeReportLogo } from "@/lib/profile/reportLogo";
import { getProfile, writeLogoSelection, type Owner, type ProfileState } from "@/lib/profile/service";
import { findOwnAsset } from "@/lib/workspace/assets";
import { workspaceAccess } from "@/lib/workspace/access";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/settings/profile/logo — uzmanın KENDİ rapor logosu seçimi + durumu.
 *     { ok, logo: { source, assetId, status }, workspace: { access, logoAssetId }, brandingEnabled, version, updatedAt, readOnly }
 *     status: none | ok | missing (özel logo silinmiş → "yeniden seçin") | workspace_empty | access_off.
 *     Ham Storage yolu / URL DÖNMEZ; önizleme mevcut güvenli görsel ucundan (/api/settings/workspace/assets/{id}) alınır.
 * PUT /api/settings/profile/logo — { source: "none"|"workspace"|"custom", assetId?, expectedVersion }
 *     Yalnız logo_source / logo_asset_id yazılır (profil metinleri değişmez); sürüm profil ile ORTAK → çakışmada 409.
 *     custom: görsel uzmanın KENDİ tenant + kullanıcısına ait, silinmemiş ve kind='logo' olmalı; başka uzmanın / başka
 *     tenant'ın / silinmiş / olmayan / fotoğraf türündeki görsel AYNI 400 yanıtını alır (varlık bilgisi sızmaz).
 *     workspace / custom: Kişisel Dijital Ofis görsel erişimi açık olmalı (kapalıysa 403 LOGO_ACCESS_OFF); none her zaman serbest.
 *     Demo hesap / demo tenant 403 (yazma yok). tenant / kullanıcı YALNIZ oturumdan.
 */
const ROUTE = "api/settings/profile/logo";

const UNAVAILABLE = { ok: false, code: "PROFILE_UNAVAILABLE", error: "Profil şu anda kullanılamıyor. Lütfen daha sonra yeniden deneyin." };
const ASSET_INVALID = { ok: false, code: "LOGO_ASSET_INVALID", error: "Logo bulunamadı veya kullanılamıyor. Listeden yeniden seçin.", path: "assetId" };
const ACCESS_OFF = { ok: false, code: "LOGO_ACCESS_OFF", error: "Logo seçimi Kişisel Dijital Ofis görsel alanını kullanır; hesabınızda şu an açık değil." };
const ACCESS_ERROR = { ok: false, code: "LOGO_ACCESS_ERROR", error: "Erişim doğrulanamadı. Lütfen daha sonra yeniden deneyin." };

async function view(db: SupabaseClient, owner: Owner, state: ProfileState, readOnly: boolean) {
  const d = await describeReportLogo(db, owner, state);
  return {
    ok: true,
    logo: { source: state.logoSource, assetId: state.logoSource === "custom" ? state.logoAssetId : null, status: d.status },
    workspace: { access: d.access, logoAssetId: d.access ? d.workspaceLogoAssetId : null },
    checkFailed: d.error,
    brandingEnabled: state.reportBrandingEnabled,
    version: state.version,
    updatedAt: state.updatedAt,
    readOnly,
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  const g = await guardProfile(req, "read");
  if (!g.ok) return g.response;
  const r = await getProfile(g.db, g.owner);
  if (r.ok) return json(await view(g.db, g.owner, r.state, g.readOnly));
  if (r.kind === "unavailable") return json(UNAVAILABLE, 503);
  return serverErrorResponse({ route: ROUTE, action: "get", tenantId: g.owner.tenantId, cause: r.cause });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const g = await guardProfile(req, "write");
  if (!g.ok) return g.response;
  const b = await readJsonObject(req);
  if (!b.ok) return b.response;
  const p = parseLogoSelection(b.body);
  if (!p.ok) return json({ ok: false, error: p.error, path: p.path }, 400);
  const sel = p.value;

  if (sel.source !== "none") {
    const access = await workspaceAccess(g.db, g.owner.userId, g.owner.tenantId);
    if (access.reason === "error") return json(ACCESS_ERROR, 503);
    if (!access.allowed) return json(ACCESS_OFF, 403);
  }
  if (sel.source === "custom" && sel.assetId) {
    const a = await findOwnAsset(g.db, g.owner, sel.assetId);
    if (!a.ok) return serverErrorResponse({ route: ROUTE, action: "verify_asset", tenantId: g.owner.tenantId, cause: a.cause });
    if (!a.asset || a.asset.kind !== "logo") return json(ASSET_INVALID, 400);
  }

  const r = await writeLogoSelection(g.db, g.owner, p.expectedVersion, sel);
  if (r.ok) return json(await view(g.db, g.owner, r.state, false));
  if (r.kind === "conflict") {
    return json({ ...(await view(g.db, g.owner, r.current, false)), ok: false, code: "VERSION_CONFLICT", error: "Profiliniz başka bir sekmede değişti. Güncel hâli yüklendi; seçiminizi yeniden kaydedin." }, 409);
  }
  if (r.kind === "invalid") return json({ ok: false, error: "Logo seçimi geçersiz.", path: "source" }, 400);
  if (r.kind === "unavailable") return json(UNAVAILABLE, 503);
  return serverErrorResponse({ route: ROUTE, action: "put", tenantId: g.owner.tenantId, cause: r.cause });
}
