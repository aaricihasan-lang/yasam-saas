import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { isUuid } from "@/lib/admin/memberRequestValidation";
import { ADMIN_MODULE_ALIAS_KEYS, validateApprovalModules } from "@/lib/admin/userManagement";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

/**
 * POST /api/admin/trials/[id]/convert — ÖDEME SONRASI deneme üyesini Pro üyeliğe geçir (yalnız admin;
 * otomatik ödeme / otomatik aktivasyon YOK).
 *
 * { modules: string[] } — yönetici, mevcut onay ekranındaki gibi açılacak modülleri SEÇER (Dijital İçerik
 * dahil hiçbir modül otomatik açılmaz). Pro = mevcut ücretli üyelik (package_type=premium,
 * yh_grade_expert_premium). user_id ve tenant AYNI kalır → danışanlar, analizler ve raporlar korunur.
 * İşlem yönetici denetim kaydına (admin_audit_log: user_approved, source=trial_convert_to_pro) ve deneme
 * yönetim kaydına yazılır; açık Pro talebi "converted" olarak kapanır. Tek işlem (transaction).
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");
  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  for (const k of Object.keys(parsed.value)) if (k !== "modules") return bad("Beklenmeyen alan.");
  const mods = validateApprovalModules(parsed.value.modules);
  if (!mods.ok) return bad(mods.error);

  const { data, error } = await guard.db.rpc("admin_trial_convert_to_pro", {
    p_actor: guard.adminId,
    p_user_id: id,
    p_modules: mods.fullMap,
    p_remove_keys: [...ADMIN_MODULE_ALIAS_KEYS],
  });
  if (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "TR404") return bad("Bu hesap bir deneme üyesi değil.", 404);
    if (code === "TR409") return bad("Bu üye zaten Pro üyeliğe geçmiş.", 409);
    if (code === "TR400") return bad("Pro üyelik için en az bir modül seçilmelidir.");
    if (code === "TR401") return bad("Yetki yok.", 403);
    return bad("Pro üyeliğe geçiş tamamlanamadı (tekrar deneyin).", 500);
  }
  return NextResponse.json({ ok: true, modules: mods.selected, result: data }, { headers: NO_STORE });
}
