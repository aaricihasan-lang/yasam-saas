import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { buildTenantDisplayName, buildTenantSlugBase } from "@/lib/auth/createExpertTenant";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { buildPremiumMembershipPayload } from "@/lib/auth/membership";
import { ADMIN_MODULE_ALIAS_KEYS, validateApprovalModules } from "@/lib/admin/userManagement";
import { moduleFilterDbKeys, parseMemberCounts, parseMemberListQuery, roleMatchFromQuery } from "@/lib/admin/memberListQuery";
import { newPasswordPolicyMessage } from "@/lib/auth/passwordPolicy";
import { rpcErrorStatus } from "@/lib/admin/memberRequestValidation";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * GET /api/admin/users — SUNUCU TARAFI liste (MEM-016).
 * Query: view(members|archive) · q · approval · active · role · payment
 *        · due(all|overdue|due30|no_date|d0_7|d8_30|d31_60|d61_90|d90p)
 *        · activity(all|today|d7|d30|idle30|idle60|idle90|unmeasured) · module(<canonical modül>) · security(all|alert)
 *        · sort(default|next_payment_asc|next_payment_desc|activity_desc|activity_asc|d7_desc|d30_desc|created_desc|name_asc)
 *        · page · pageSize(10|20|50)
 * - 360° (20271006000000): aktivite Usage360 rollup'ından (usage_daily) SUNUCUDA hesaplanır; satırlara
 *   last_activity / d7 / d30 / activity_state eklenir + `measurement` (ölçüm başlangıcı). Tarayıcıya tüm
 *   üyeler çekilmez; filtre + sıralama + sayfalama tek RPC'de.
 * - Arama: ad + e-posta (Türkçe katlamalı, DB public.admin_search_fold) + rol kelimesi ("uzman",
 *   "yönetici"/"admin"). Filtreler + sayfalama + toplam aynı sorguda; sayaçlar GLOBAL.
 * - "members" görünümü arşivi (onaylı + pasif uzman) HARİÇ tutar; "archive" yalnız onları döner.
 * - Şüpheli olay sayıları YALNIZ sayfadaki kullanıcılar için (tüm tablo çekilmez).
 */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const parsed = parseMemberListQuery(req.nextUrl.searchParams);
  if (!parsed.ok) return bad(parsed.error);
  const q = parsed.value;

  const { data, error } = await db.rpc("admin_list_users", {
    p_q: q.q,
    p_role_match: roleMatchFromQuery(q.q),
    p_view: q.view,
    p_approval: q.approval,
    p_active: q.active,
    p_role: q.role,
    p_payment: q.payment,
    p_limit: q.pageSize,
    p_offset: (q.page - 1) * q.pageSize,
    // M4 (20271001000300): yenileme filtresi + sıralama — değerler parseMemberListQuery allowlist'inden.
    p_due: q.due,
    p_sort: q.sort,
    // 360° (20271006000000) — varsayılanlı yeni parametreler; değerler allowlist'ten.
    p_activity: q.activity,
    p_module_keys: moduleFilterDbKeys(q.module),
    p_security: q.security,
  });
  if (error) {
    return bad(rpcErrorStatus(error) === 400 ? "Geçersiz filtre." : "Üye listesi okunamadı.", rpcErrorStatus(error) === 400 ? 400 : 500);
  }
  const result = (data ?? {}) as { total?: unknown; rows?: unknown; counts?: unknown; measurement?: unknown };
  const users = Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  const total = Math.max(0, Math.trunc(Number(result.total) || 0));

  const suspiciousCounts: Record<string, number> = {};
  const ids = users.map((u) => String(u.id ?? "")).filter(Boolean);
  if (ids.length > 0) {
    const { data: events } = await db
      .from("security_events")
      .select("user_id")
      .in("user_id", ids)
      .in("severity", ["medium", "high"]);
    for (const ev of (events ?? []) as { user_id: string }[]) {
      suspiciousCounts[ev.user_id] = (suspiciousCounts[ev.user_id] ?? 0) + 1;
    }
  }

  return NextResponse.json(
    {
      users,
      total,
      page: q.page,
      pageSize: q.pageSize,
      counts: parseMemberCounts(result.counts),
      measurement: result.measurement ?? null,
      suspiciousCounts,
    },
    { headers: NO_STORE },
  );
}

/**
 * POST /api/admin/users — Yeni Uzman / Yeni Admin (tek provisioning yolu).
 *
 * Premium-only model: admin'in oluşturduğu UZMAN doğrudan onaylı + aktif + Premium olur ve
 * YALNIZ seçilen modüllere erişir (≥1 modül ZORUNLU) — onay akışıyla AYNI atomik RPC zinciri
 * (admin_create_user_with_modules → provision_expert + admin_approve_expert_with_modules, tek tx).
 * "Onaylı ama 0 modül / trial" hesap üretilemez. Yeni ADMIN yalnız ana yöneticiye açık.
 * `active` alanı KABUL EDİLMEZ (durum ürün kuralından türer).
 */
export async function POST(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;

  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const body = parsed.value;

  const allowed = new Set(["fullName", "email", "password", "role", "modules"]);
  for (const k of Object.keys(body)) if (!allowed.has(k)) return bad("Beklenmeyen alan.");

  const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (!fullName || !email || !password) return bad("Ad soyad, e-posta ve parola zorunludur.");
  if (fullName.length < 2 || fullName.length > 120 || /[\u0000-\u001f\u007f]/.test(fullName)) {
    return bad("Ad soyad 2–120 karakter olmalıdır.");
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad("Geçerli bir e-posta adresi girin.");
  // Ortak parola politikası (lib/auth/passwordPolicy — tek kaynak: min 6, bariz parola reddi).
  const pwPolicy = newPasswordPolicyMessage(password, email);
  if (pwPolicy) return bad(pwPolicy);
  if (body.role !== "admin" && body.role !== "expert") return bad("Geçersiz rol. Kabul edilenler: admin, expert");
  const role = body.role;

  let modules: Record<string, boolean> | null = null;
  let selected: string[] = [];
  if (role === "expert") {
    const v = validateApprovalModules(body.modules);
    if (!v.ok) return bad(v.error);
    modules = v.fullMap;
    selected = v.selected;
  } else {
    if (body.modules !== undefined && !(Array.isArray(body.modules) && body.modules.length === 0)) {
      return bad("Yönetici hesaplarında modül seçimi yapılmaz.");
    }
    // Yeni admin oluşturma yalnız ANA YÖNETİCİYE açıktır (Faz 1/P1).
    const main = await requireMainAdmin(db, adminId);
    if (!main.ok) return bad(main.error, main.status);
  }

  // Şifreyi server-side bcrypt ile hashle (pgcrypto RPC; DB mutasyonu değil).
  const { data: hashResult, error: hashError } = await db.rpc("hash_password", { p_plain: password });
  if (hashError || !hashResult) return bad("Parola işlenemedi.", 500);

  const { data, error } = await db.rpc("admin_create_user_with_modules", {
    p_payload: {
      email,
      password_hash: hashResult as string,
      full_name: fullName,
      tenant_name: buildTenantDisplayName(fullName, email),
      tenant_slug_base: buildTenantSlugBase(fullName, email),
      actor_admin_id: adminId,
      role,
    },
    p_membership: buildPremiumMembershipPayload(),
    p_modules: modules ?? {},
    p_remove_keys: [...ADMIN_MODULE_ALIAS_KEYS],
  });
  if (error) {
    const status = rpcErrorStatus(error);
    return bad(status === 400 ? "Geçersiz kayıt bilgisi veya modül seçimi." : "Kayıt oluşturulamadı.", status === 400 ? 400 : 500);
  }
  const res = (data ?? {}) as { outcome?: string; user_id?: string };
  if (res.outcome === "provisioned") {
    return NextResponse.json(
      { ok: true, userId: res.user_id, role, modules: selected, moduleCount: selected.length },
      { status: 201, headers: NO_STORE },
    );
  }
  if (res.outcome === "already_exists") return bad("Bu e-posta adresi zaten kayıtlı.", 409);
  if (res.outcome === "idempotency_key_conflict") return bad("İşlem kimliği çakışması.", 409);
  return bad("Kayıt oluşturulamadı.", 500);
}
