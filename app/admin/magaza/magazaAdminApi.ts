"use client";

/**
 * app/admin/magaza/magazaAdminApi.ts — Doğal Pazar admin API client (client-safe, typed).
 *
 * Mevcut admin auth modeli: x-admin-id + x-session-token başlıkları. service_role ASLA
 * istemciye çıkmaz; owner-only guard sunucuda (requireStoreAdmin) çalışır.
 */

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type {
  StoreCategory,
  StoreProduct,
  StoreProductAdminRow,
  StoreProductAdminDetail,
  StoreProductImage,
  StoreSettings,
  StorefrontProductCard,
  StorefrontProductDetail,
} from "@/lib/store/types";

const BASE = "/api/admin/magaza";

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; status: number; code: string; error: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

function adminHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = { "x-admin-id": readYasamUser()?.id ?? "" };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

type RawBody = { ok?: boolean; error?: string; code?: string } & Record<string, unknown>;

async function toResult<T>(res: Response, pick: (b: RawBody) => T): Promise<ApiResult<T>> {
  let body: RawBody = {};
  try {
    body = (await res.json()) as RawBody;
  } catch {
    /* boş gövde */
  }
  if (res.ok && body.ok) return { ok: true, data: pick(body) };
  return {
    ok: false,
    status: res.status,
    code: typeof body.code === "string" ? body.code : `HTTP_${res.status}`,
    error: typeof body.error === "string" ? body.error : `İşlem başarısız (HTTP ${res.status}).`,
  };
}

async function jsonFetch(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: adminHeaders(body !== undefined),
    cache: "no-store",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function qs(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

// ---- Kategoriler ----
export const categoriesApi = {
  list: async (): Promise<ApiResult<StoreCategory[]>> =>
    toResult(await jsonFetch("GET", "/categories"), (b) => (b.rows as StoreCategory[]) ?? []),
  create: async (body: Record<string, unknown>): Promise<ApiResult<StoreCategory>> =>
    toResult(await jsonFetch("POST", "/categories", body), (b) => b.row as StoreCategory),
  update: async (id: string, body: Record<string, unknown>): Promise<ApiResult<StoreCategory>> =>
    toResult(await jsonFetch("PATCH", `/categories/${id}`, body), (b) => b.row as StoreCategory),
  remove: async (id: string): Promise<ApiResult<true>> =>
    toResult(await jsonFetch("DELETE", `/categories/${id}`), () => true),
};

// ---- Ürünler ----
export const productsApi = {
  list: async (params: { q?: string; category?: string; status?: string }): Promise<ApiResult<StoreProductAdminRow[]>> =>
    toResult(await jsonFetch("GET", `/products${qs(params)}`), (b) => (b.rows as StoreProductAdminRow[]) ?? []),
  detail: async (id: string): Promise<ApiResult<StoreProductAdminDetail>> =>
    toResult(await jsonFetch("GET", `/products/${id}`), (b) => b.row as StoreProductAdminDetail),
  create: async (body: Record<string, unknown>): Promise<ApiResult<StoreProduct>> =>
    toResult(await jsonFetch("POST", "/products", body), (b) => b.row as StoreProduct),
  update: async (id: string, body: Record<string, unknown>): Promise<ApiResult<StoreProduct>> =>
    toResult(await jsonFetch("PATCH", `/products/${id}`, body), (b) => b.row as StoreProduct),
};

// ---- Görseller ----
export const imagesApi = {
  upload: async (
    productId: string,
    file: File,
    altText?: string,
  ): Promise<ApiResult<{ row: StoreProductImage; url: string }>> => {
    const form = new FormData();
    form.append("file", file);
    if (altText) form.append("alt_text", altText);
    const res = await fetch(`${BASE}/products/${productId}/images`, {
      method: "POST",
      headers: adminHeaders(false),
      cache: "no-store",
      body: form,
    });
    return toResult(res, (b) => ({ row: b.row as StoreProductImage, url: b.url as string }));
  },
  remove: async (productId: string, imageId: string): Promise<ApiResult<true>> =>
    toResult(await jsonFetch("DELETE", `/products/${productId}/images/${imageId}`), () => true),
  setPrimary: async (productId: string, imageId: string): Promise<ApiResult<StoreProductImage>> =>
    toResult(
      await jsonFetch("PATCH", `/products/${productId}/images/${imageId}`, { is_primary: true }),
      (b) => b.row as StoreProductImage,
    ),
};

// ---- Ayarlar ----
export const settingsApi = {
  get: async (): Promise<ApiResult<StoreSettings>> =>
    toResult(await jsonFetch("GET", "/settings"), (b) => b.row as StoreSettings),
  update: async (body: Record<string, unknown>): Promise<ApiResult<StoreSettings>> =>
    toResult(await jsonFetch("PATCH", "/settings", body), (b) => b.row as StoreSettings),
};

// ---- Sahip önizleme (gerçek storefront verisi; owner-gate'li) ----
type PreviewCategory = { slug: string; name: string };
export type StorefrontPreview = {
  products: StorefrontProductCard[];
  categories: PreviewCategory[];
  whatsapp_number: string | null;
  whatsapp_enabled: boolean;
};
export type StorefrontDetailPreview = {
  product: StorefrontProductDetail;
  categories: PreviewCategory[];
  related: StorefrontProductCard[];
  whatsapp_number: string | null;
  whatsapp_enabled: boolean;
};

export const previewApi = {
  storefront: async (): Promise<ApiResult<StorefrontPreview>> =>
    toResult(await jsonFetch("GET", "/storefront"), (b) => ({
      products: (b.products as StorefrontProductCard[]) ?? [],
      categories: (b.categories as PreviewCategory[]) ?? [],
      whatsapp_number: (b.whatsapp_number as string | null) ?? null,
      whatsapp_enabled: b.whatsapp_enabled === true,
    })),
  product: async (slug: string): Promise<ApiResult<StorefrontDetailPreview>> =>
    toResult(await jsonFetch("GET", `/storefront/${encodeURIComponent(slug)}`), (b) => ({
      product: b.product as StorefrontProductDetail,
      categories: (b.categories as PreviewCategory[]) ?? [],
      related: (b.related as StorefrontProductCard[]) ?? [],
      whatsapp_number: (b.whatsapp_number as string | null) ?? null,
      whatsapp_enabled: b.whatsapp_enabled === true,
    })),
};

/** Public bucket ürün görseli path → gösterim URL'i (admin önizleme için). */
export function storePhotoPublicUrl(filePath: string | null): string | null {
  if (!filePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/store-product-images/${filePath}`;
}
