import { NextRequest, NextResponse } from "next/server";
import { requireStoreAdmin } from "@/lib/store/adminStoreGuard";
import {
  storeError,
  invalidBody,
  asPlainObject,
  onlyAllowedKeys,
} from "@/lib/store/adminHttp";
import { slugifyStore, isValidStoreSlug } from "@/lib/store/slug";

export const runtime = "nodejs";

/**
 * /api/admin/magaza/categories — OWNER-ONLY kategori liste + oluşturma.
 *   - requireStoreAdmin → verifyAdminRequest + requireMainAdmin (ana yönetici).
 *   - Body allowlist; mass-assignment yok; slug server-üretimi/doğrulaması.
 *   - Duplicate slug → 409; ham DB metni sızmaz.
 */

const SLUG_MAX = 200;
const CREATE_KEYS = ["name", "slug", "description", "is_active", "sort_order"] as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { data, error } = await db
    .from("store_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return storeError("Kategoriler alınamadı.", "STORE_CATEGORY_LIST_FAILED", 500);
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return invalidBody();
  }
  const obj = asPlainObject(raw);
  if (!obj || !onlyAllowedKeys(obj, CREATE_KEYS)) return invalidBody();

  // name zorunlu
  if (typeof obj.name !== "string" || obj.name.trim() === "" || obj.name.length > 200) {
    return invalidBody();
  }
  const name = obj.name.trim();

  // slug: verilmişse doğrula, verilmemişse addan üret
  let slug: string;
  if ("slug" in obj && obj.slug !== undefined && obj.slug !== null && obj.slug !== "") {
    if (!isValidStoreSlug(obj.slug, SLUG_MAX)) return invalidBody();
    slug = obj.slug;
  } else {
    slug = slugifyStore(name);
    if (!isValidStoreSlug(slug, SLUG_MAX)) {
      return storeError("Ürün adından geçerli bir slug üretilemedi.", "STORE_SLUG_UNRESOLVED", 400);
    }
  }

  // description
  let description = "";
  if ("description" in obj && obj.description !== undefined && obj.description !== null) {
    if (typeof obj.description !== "string" || obj.description.length > 2000) return invalidBody();
    description = obj.description;
  }

  // is_active
  let is_active = true;
  if ("is_active" in obj && obj.is_active !== undefined) {
    if (typeof obj.is_active !== "boolean") return invalidBody();
    is_active = obj.is_active;
  }

  // sort_order
  let sort_order = 0;
  if ("sort_order" in obj && obj.sort_order !== undefined) {
    if (typeof obj.sort_order !== "number" || !Number.isInteger(obj.sort_order)) return invalidBody();
    sort_order = obj.sort_order;
  }

  const { data, error } = await db
    .from("store_categories")
    .insert({ name, slug, description, is_active, sort_order })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return storeError("Bu slug ile bir kategori zaten var.", "STORE_CATEGORY_DUPLICATE", 409);
    }
    if (error.code === "23514") {
      return storeError("Geçersiz kategori verisi.", "STORE_CATEGORY_INVALID", 400);
    }
    return storeError("Kategori oluşturulamadı.", "STORE_CATEGORY_CREATE_FAILED", 500);
  }

  return NextResponse.json({ ok: true, row: data }, { status: 201 });
}
