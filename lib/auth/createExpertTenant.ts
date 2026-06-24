import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";
import { getServerDb } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

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

async function isTenantSlugTaken(db: SupabaseClient, slug: string): Promise<boolean> {
  const { data, error } = await db
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

/** E-posta / isim tabanlı benzersiz slug — service_role ile çalışır (server-only) */
export async function createUniqueTenantSlug(
  fullName: string,
  email: string,
): Promise<string> {
  const db = getServerDb();
  const mail = email.trim().toLowerCase();
  const localPart = mail.split("@")[0] ?? "";
  const fromName = slugifyTenantBase(fullName);
  const fromEmail = slugifyTenantBase(localPart);
  const base = fromName || fromEmail || "uzman";

  if (!(await isTenantSlugTaken(db, base))) return base;

  const withTime = `${base}-${Date.now().toString(36).slice(-6)}`;
  if (!(await isTenantSlugTaken(db, withTime))) return withTime;

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

  try {
    const slug = await createUniqueTenantSlug(input.fullName, email);
    const now = new Date().toISOString();

    const db = getServerDb();
    const { error } = await db.from("tenants").insert({
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
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Tenant oluşturulamadı.",
    };
  }
}

/** Kullanıcı kaydı başarısız olursa yalnızca oluşturulan tenant'ı geri alır */
export async function deleteTenantById(tenantId: string): Promise<void> {
  if (!tenantId || tenantId === ADMIN_LIBRARY_TENANT_ID) return;
  try {
    const db = getServerDb();
    await db.from("tenants").delete().eq("id", tenantId);
  } catch (err) {
    console.error("[createExpertTenant] tenant rollback hatası:", err);
  }
}
