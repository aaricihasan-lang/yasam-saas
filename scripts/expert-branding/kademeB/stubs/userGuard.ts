/**
 * F3B regresyon/örnek harness STUB'ı — `@/lib/auth/userGuard` yerine (yalnız scripts/expert-branding/kademeB/install.ts
 * çözümleyici kancasıyla). Sentetik oturum: tenant / kullanıcı / sahte db `globalThis.__F3B` üzerinden. Üretimde KULLANILMAZ.
 */
type G = { __F3B?: { tenantId: string; userId: string; db: unknown; profile: Record<string, unknown> } };

export async function requireModuleAccess(): Promise<unknown> {
  const s = (globalThis as G).__F3B;
  if (!s) throw new Error("F3B stub: oturum yok");
  return { ok: true, tenantId: s.tenantId, userId: s.userId, db: s.db, profile: s.profile, is_demo_account: false };
}
