import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { getActiveSessionUserId } from "@/lib/auth/sessionSecurity";
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
const DEFAULT_USER_SELECT = "id, tenant_id, email, active, is_demo_account" as const;

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
