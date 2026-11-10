/**
 * F3B harness STUB'ı — `@/lib/profile/reportBranding` (yalnız rota düzeyi örnek / regresyon koşuları). Dönen markalama ve
 * çağrı kaydı `globalThis.__F3B_BRANDING` / `__F3B_CALLS`. Gerçek çözücü + PG izolasyonu routes.harness.ts'te test edilir.
 */
type G = { __F3B_BRANDING?: unknown; __F3B_CALLS?: { owner: unknown; account: unknown; opts: unknown }[] };

export const SIGNATURE_INCLUDES_PROFILE_NAME = true;
export const NAMED_BY_FORM_INCLUDES_CONTACT_NOTE = true;

export async function resolveReportBranding(_db: unknown, owner: unknown, account: unknown, opts: unknown = {}): Promise<unknown> {
  const g = globalThis as G;
  (g.__F3B_CALLS ??= []).push({ owner, account, opts });
  return g.__F3B_BRANDING ?? null;
}

export async function readAccountFullName(): Promise<string | null> {
  return null;
}
