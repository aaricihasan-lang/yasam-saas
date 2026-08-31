import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { getActiveSessionUserId } from "@/lib/auth/sessionSecurity";
import { resolveModuleAccess, type ModuleGateKey } from "@/lib/auth/moduleAccess";
import type { SupabaseClient } from "@supabase/supabase-js";

export type UserGuardOk = {
  ok: true;
  userId: string;
  tenantId: string;
  email: string;
  is_demo_account: boolean;
  db: SupabaseClient;
  /**
   * PERF-2C/2D: Yalnızca `verifyUserRequest(req, { includeProfile: true })` ile
   * çağrıldığında dolar. Güvenli whitelist (PROFILE_USER_SELECT) kolonlarını içerir;
   * password/password_hash gibi hassas alanlar ASLA bulunmaz. Diğer çağrılarda
   * undefined kalır → mevcut ~181 route ek kolon çekmez.
   */
  profile?: Record<string, unknown>;
};

export type UserGuardFail = {
  ok: false;
  response: NextResponse;
};

export type UserGuardResult = UserGuardOk | UserGuardFail;

export type VerifyUserOptions = {
  /** true → users SELECT tek seferde profil whitelist kolonlarını da alır (PERF-2C/2D). */
  includeProfile?: boolean;
};

// Varsayılan (auth) kolonları — mevcut davranış. Literal tip: supabase-js sorgu
// sonucunu doğru çıkarabilsin (birleştirilmiş string `string`'e genişler ve tipi bozar).
const DEFAULT_USER_SELECT = "id, tenant_id, email, active, approval_status, is_demo_account" as const;

// Profil route'u için genişletilmiş GÜVENLİ whitelist. password/password_hash YOK.
// (app/api/auth/profile/route.ts eski PROFILE_SELECT sözleşmesiyle birebir aynı.)
// Tek-satır literal — `as const` ile tip korunur (ternary'de GenericStringError'ı önler).
const PROFILE_USER_SELECT =
  "id, email, full_name, name, role, active, approval_status, module_permissions, package_type, membership_status, subscription_status, trial_started_at, trial_ends_at, membership_started_at, membership_ends_at, plan, admin_level, tenant_id, status, is_demo_account" as const;

/**
 * Kullanıcı kimlik doğrulaması — settings API route'ları için.
 *
 * Güvenlik modeli (Faz 0):
 *   1. x-user-id zorunlu.
 *   2. x-session-token zorunlu — yalnızca x-user-id'ye GÜVENİLMEZ (spoof edilebilir).
 *   3. Token user_sessions'da aktif olmalı.
 *   4. Token'ın sahibi x-user-id ile aynı olmalı (binding) — başkasının
 *      geçerli token'ı kendi x-user-id'siyle birlikte kullanılamaz.
 */
export async function verifyUserRequest(
  req: NextRequest,
  options?: VerifyUserOptions,
): Promise<UserGuardResult> {
  const includeProfile = options?.includeProfile === true;
  const userId = req.headers.get("x-user-id")?.trim() ?? "";
  const sessionToken = req.headers.get("x-session-token")?.trim() ?? "";

  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Yetki gerekli." }, { status: 401 }),
    };
  }

  // x-session-token zorunlu — yalnızca x-user-id ile kimlik kabul edilmez.
  if (!sessionToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Oturum doğrulaması gerekli." }, { status: 401 }),
    };
  }

  let db: SupabaseClient;
  try {
    db = getServerDb();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sunucu yapılandırma hatası." }, { status: 500 }),
    };
  }

  // Kolon seçimi opt-in'e göre: her dal LİTERAL select kullanır (supabase-js sonuç
  // tipini derleme-zamanı parse eder; ternary-içi select union'ı parser'ı bozar →
  // her dal ayrı literal select ile kurulur). PERF-2C/2D: includeProfile ile aynı
  // users lookup'ı genişletilmiş güvenli whitelist kolonlarını da alır.
  const usersQuery = includeProfile
    ? db
        .from("users")
        .select(PROFILE_USER_SELECT)
        .eq("id", userId)
        .eq("active", true)
        .maybeSingle()
    : db
        .from("users")
        .select(DEFAULT_USER_SELECT)
        .eq("id", userId)
        .eq("active", true)
        .maybeSingle();

  // Token doğrulaması (user_sessions) ve kullanıcı kaydı (users) BAĞIMSIZ girdilere
  // (sessionToken / userId header'ları) dayanır ve ayrı tablolara vurur → paralel
  // çalıştırılır. Güvenlik kontrolleri aşağıda aynı sırayla, aynı status ve gövdeyle
  // değerlendirilir (davranış korunur; users satırı yalnız binding geçerse döner).
  const [tokenUserId, userRes] = await Promise.all([
    getActiveSessionUserId(db, sessionToken),
    usersQuery,
  ]);

  // Token aktif mi + hangi kullanıcıya ait?
  if (!tokenUserId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Oturum geçersiz veya süresi dolmuş." },
        { status: 401 },
      ),
    };
  }

  // Binding: token'ın sahibi, iddia edilen x-user-id ile aynı olmalı.
  if (tokenUserId !== userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Oturum kimliği uyuşmuyor." }, { status: 403 }),
    };
  }

  const { data, error } = userRes;

  if (error || !data || !data.tenant_id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Yetki yok." }, { status: 403 }),
    };
  }

  // Pending/rejected server-side engel (Faz 1/P1): onay bekleyen veya reddedilen
  // kullanıcı korumalı uçlara erişemez. Yalnız istemci yönlendirmesine güvenilmez.
  // approved veya (legacy) boş → serbest; pending/rejected → 403.
  const approval = String(data.approval_status ?? "").trim().toLowerCase();
  if (approval === "pending" || approval === "rejected") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Hesabınız henüz onaylanmadı." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    userId,
    tenantId: String(data.tenant_id),
    email: String(data.email ?? ""),
    is_demo_account: data.is_demo_account === true,
    db,
    // includeProfile=false ise undefined → diğer route'lar ek kolon/veri taşımaz.
    profile: includeProfile ? (data as Record<string, unknown>) : undefined,
  };
}

/**
 * Faz 1/P3 — MODÜL KAPILI kullanıcı doğrulaması. `verifyUserRequest` (header-token
 * bağlama + pending/rejected gate) üzerine, kişiye özel SERVER-SIDE modül iznini
 * ekler. verifyUserRequest ile AYNI dönüş şeklini verir (drop-in): mevcut route'lar
 * `guard.userId/tenantId/db/email` kullanımını değiştirmeden korur.
 *
 * includeProfile zorlanır (role + module_permissions tek users lookup'ında gelir →
 * ek sorgu YOK). Modül reddi → 403 (no-store). admin/cosmic_calendar geçer;
 * human_design normal modül (module_permissions.human_design=true ile geçer);
 * digital_content hub alt-modülden açılır.
 */
export async function requireModuleAccess(
  req: NextRequest,
  moduleKey: ModuleGateKey,
  options?: VerifyUserOptions,
): Promise<UserGuardResult> {
  const guard = await verifyUserRequest(req, { ...options, includeProfile: true });
  if (!guard.ok) return guard;

  const profile = guard.profile ?? {};
  if (!resolveModuleAccess(profile.role, profile.module_permissions, moduleKey)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Bu modül hesabınız için aktif değil. Yöneticinizle iletişime geçin." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  return guard;
}

/**
 * ADMIN-ONLY kullanıcı-header doğrulaması (owner/admin özel içerik izolasyonu).
 *
 * `requireModuleAccess` yalnız modül iznini (module_permissions.<key>) kontrol eder;
 * bir modül uzmanlara AÇIK olsa bile o modülün ADMIN/OWNER'a özel bilgi/corpus
 * yüzeyleri (ör. Human Design merkezî canonical Bilgi Bankası + profesyonel canonical
 * rapor) yalnız `users.role === 'admin'` için servis edilmelidir.
 *
 * Bu guard x-user-id + x-session-token binding'i (verifyUserRequest) üzerine SERVER-SIDE
 * rol kontrolü ekler: role !== 'admin' → 403 (no-store, fail-closed). service_role
 * sorgusu YALNIZ bu kontrolden SONRA çalışır → non-admin için canonical bypass olmaz.
 * Dönüş şekli `verifyUserRequest`/`requireModuleAccess` ile birebir aynıdır (drop-in).
 */
export async function requireAdminUserRequest(
  req: NextRequest,
  options?: VerifyUserOptions,
): Promise<UserGuardResult> {
  const guard = await verifyUserRequest(req, { ...options, includeProfile: true });
  if (!guard.ok) return guard;

  const role = String((guard.profile?.role ?? "")).trim().toLowerCase();
  if (role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "ADMIN_ONLY", error: "Bu içerik yalnız yöneticiye özeldir." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  return guard;
}
