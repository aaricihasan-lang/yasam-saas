/**
 * BF-11F-B — Uzman tenant için SAF slug/ad yardımcıları.
 *
 * NOT: Eski çok-adımlı akış (tenant INSERT + users INSERT + hata-yutan rollback)
 * KALDIRILDI. Tenant+user artık `public.provision_expert(jsonb)` RPC'sinde TEK
 * TRANSACTION'da oluşturulur (bkz. lib/auth/provisionExpert.ts). Bu dosya yalnız
 * route'ların RPC'ye geçireceği görünen tenant adı + slug tabanını üretir; DB'ye
 * DOKUNMAZ (slug tekilliği DB tarafında UNIQUE(slug) + race-safe üretimle çözülür).
 */

/** Türkçe karakterleri ASCII slug için dönüştürür (SAF; ≤48 karakter). */
export function slugifyTenantBase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Görünen tenant adı — ad soyad veya e-posta öneki (SAF). */
export function buildTenantDisplayName(fullName: string, email: string): string {
  const name = fullName.trim();
  if (name) return `${name} Çalışma Alanı`;
  const local = email.trim().toLowerCase().split("@")[0]?.trim();
  if (local) return `${local} Çalışma Alanı`;
  return "Uzman Çalışma Alanı";
}

/**
 * RPC'ye geçirilecek slug TABANI (SAF; boş olmayan). Ad → e-posta öneki → 'uzman'
 * sırasıyla. Tekillik/suffix DB tarafında (UNIQUE(slug) + race-safe) çözülür.
 */
export function buildTenantSlugBase(fullName: string, email: string): string {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  const fromName = slugifyTenantBase(fullName);
  const fromEmail = slugifyTenantBase(local);
  return fromName || fromEmail || "uzman";
}
