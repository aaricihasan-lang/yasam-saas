import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdminForAdminTarget } from "@/lib/admin/adminGuards";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { isUuid, rpcErrorStatus } from "@/lib/admin/memberRequestValidation";
import { readTechniqueGrants, validateTechniqueGrants } from "@/lib/astrology/access/techniqueGrants";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "no-store" } as const;

function bad(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status, headers: NO_STORE });
}

/**
 * Admin > Üye Detayı > Modül İzinleri · GÖKYÜZÜ ATLASI — TEKNİK İZİNLERİ (owner kararı 2026-11-03).
 *
 * GET → { moduleEnabled, grants } (grants: null = kayıt yok = hiçbir teknik).
 * PUT { grants: {mode:"all"} | {mode:"list", techniques:[…]}, enableModule?: boolean }
 *   → admin_set_astrology_technique_grants: teknik izinleri + (enableModule ise) Astroloji modül anahtarı TEK işlemde ve aynı
 *     işlemde denetim kaydıyla yazılır (kısmi kayıt yok). Boş seçim 400 EMPTY_SELECTION. Panel "İptal" edilirse istek GÖNDERİLMEZ.
 * Yetki: modül anahtarlarıyla AYNI kural (aktif admin; hedef admin ise yalnız ana yönetici; DB yalnız uzman hedefi kabul eder).
 * Uzman / anonim → verifyAdminRequest reddeder (başka uzmanın iznini değiştiremez).
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");
  const { data, error } = await db.from("users").select("role, module_permissions, astrology_technique_grants").eq("id", id).maybeSingle();
  if (error || !data) return bad("Kullanıcı bulunamadı.", 404);
  const row = data as { role?: unknown; module_permissions?: unknown; astrology_technique_grants?: unknown };
  const perms = row.module_permissions && typeof row.module_permissions === "object" ? (row.module_permissions as Record<string, unknown>) : {};
  return NextResponse.json(
    {
      ok: true,
      isExpert: String(row.role ?? "").trim().toLowerCase() === "expert",
      moduleEnabled: perms.astrology === true,
      grants: readTechniqueGrants(row.astrology_technique_grants),
    },
    { headers: NO_STORE },
  );
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");

  const adminTarget = await requireMainAdminForAdminTarget(db, adminId, id);
  if (!adminTarget.ok) return bad(adminTarget.error, adminTarget.status);

  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const body = parsed.value;
  if (body.enableModule !== undefined && typeof body.enableModule !== "boolean") return bad("enableModule true/false olmalıdır.");
  const v = validateTechniqueGrants(body.grants);
  if (!v.ok) return bad(v.error, 400, { code: v.code });

  const { data, error } = await db.rpc("admin_set_astrology_technique_grants", {
    p_user_id: id,
    p_actor_admin_id: adminId,
    p_grants: v.grants,
    p_enable_module: body.enableModule === true,
  });
  if (error) {
    const status = rpcErrorStatus(error);
    return bad(
      status === 409
        ? "Teknik izinleri yalnız uzman hesaplarında yönetilebilir."
        : status === 400
          ? "Geçersiz teknik izinleri."
          : "Teknik izinleri kaydedilemedi.",
      status,
    );
  }
  const result = (data ?? {}) as { grants?: unknown; module_enabled?: unknown; module_permissions?: unknown };
  return NextResponse.json(
    {
      ok: true,
      grants: readTechniqueGrants(result.grants),
      moduleEnabled: result.module_enabled === true,
      modulePermissions: result.module_permissions ?? {},
    },
    { headers: NO_STORE },
  );
}
