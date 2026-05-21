import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";

export type CreateTenantInput = {
  fullName: string;
  email: string;
};

export type CreateTenantResult =
  | { ok: true; tenantId: string }
  | { ok: false; error: string };

/** Türkçe karakterleri ASCII slug için dönüştürür */
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

/** Görünen tenant adı — ad soyad veya e-posta öneki */
export function buildTenantDisplayName(fullName: string, email: string): string {
  const name = fullName.trim();
  if (name) return `${name} Çalışma Alanı`;
  const local = email.trim().toLowerCase().split("@")[0]?.trim();
  if (local) return `${local} Çalışma Alanı`;
  return "Uzman Çalışma Alanı";
}

async function isTenantSlugTaken(slug: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[createExpertTenant] slug kontrolü:", error);
    return true;
  }

  return Boolean(data?.id);
}

/** E-posta / isim tabanlı benzersiz slug */
export async function createUniqueTenantSlug(
  fullName: string,
  email: string,
): Promise<string> {
  const mail = email.trim().toLowerCase();
  const localPart = mail.split("@")[0] ?? "";
  const fromName = slugifyTenantBase(fullName);
  const fromEmail = slugifyTenantBase(localPart);
  const base = fromName || fromEmail || "uzman";

  if (!(await isTenantSlugTaken(base))) return base;

  const withTime = `${base}-${Date.now().toString(36).slice(-6)}`;
  if (!(await isTenantSlugTaken(withTime))) return withTime;

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Yeni expert (ve genel yeni üye) için ayrı tenant oluşturur.
 * Admin kütüphane tenant_id asla atanmaz.
 */
export async function createTenantForNewUser(
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "Geçerli bir e-posta gerekli." };
  }

  const tenantId = crypto.randomUUID();
  if (tenantId === ADMIN_LIBRARY_TENANT_ID) {
    return { ok: false, error: "Tenant kimliği oluşturulamadı." };
  }

  const slug = await createUniqueTenantSlug(input.fullName, email);
  const now = new Date().toISOString();

  const { error } = await supabase.from("tenants").insert({
    id: tenantId,
    name: buildTenantDisplayName(input.fullName, email),
    slug,
    status: "active",
    created_at: now,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, tenantId };
}

/** Kullanıcı kaydı başarısız olursa yalnızca oluşturulan tenant'ı geri alır */
export async function deleteTenantById(tenantId: string): Promise<void> {
  if (!tenantId || tenantId === ADMIN_LIBRARY_TENANT_ID) return;
  await supabase.from("tenants").delete().eq("id", tenantId);
}
