/**
 * lib/archive/server/media.ts — Premium Word Arşivi: kayıtlara bağlı KULLANICI görselleri (YALNIZ SUNUCU).
 *
 * İki saklama biçimi:
 *   - Depolama yolu (taş kataloğu, Şifa Rehberi, HD harita görseli, Kişisel Ofis, profil fotoğrafı) → yol, kaynağın tenant
 *     öneki + yol güvenliği ile doğrulanır; yalnız o nesne için 60 sn imzalı bağlantı döner.
 *   - Kayıt içine gömülü görsel (data: URI — Ürün & Stok fotoğrafları, aromaterapi yağ görselleri) → sunucu çözer, dosya döner.
 * Satır her istekte registry kapsamıyla (tenant + kullanıcı sahipliği; child_of → ebeveyn tenant'ı) YENİDEN okunur.
 * Ortak kataloglar (Doğaltaş Kütüphanesi, mağaza ürünleri, HD eğitim) kullanıcıya ait değildir → burada YOK.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { getRegistryEntry, MODULE_LABELS } from "@/lib/backup/registry";
import { storagePathFromUrl, storagePrefix } from "@/lib/backup/storagePaths";
import type { StoragePrefixKind } from "@/lib/backup/types";
import { safeFileName } from "../zip";

assertServerOnly("lib/archive/server/media");

type Row = Record<string, unknown>;

export const SIGNED_MEDIA_TTL = 60;

export type MediaSourceDef = {
  table: string;
  columns: string[];
  label: string;
  /** Depolama yolu kabul edilirse kova + tenant öneki. Yoksa yalnız gömülü (data:) görseller. */
  storage: { bucket: string | "from_url"; prefix: StoragePrefixKind } | null;
  /** Plan aşamasında satırı adlandırmak için (klasör). */
  titleColumn: string | null;
  /** true → kolonlar yalnız gömülü görsel taşır; plan satır içeriğini OKUMAZ (yalnız kimlik). */
  inlineOnly: boolean;
};

export const MEDIA_SOURCES: Record<string, MediaSourceDef> = {
  clients: { table: "clients", columns: ["profile_image_url"], label: "Danışan profil fotoğrafları", storage: { bucket: "from_url", prefix: "tenant" }, titleColumn: null, inlineOnly: false },
  stones: { table: "stones", columns: ["images"], label: "Doğaltaş taş fotoğrafları", storage: { bucket: "dogaltas-photos", prefix: "catalog_tenant" }, titleColumn: "stone_name", inlineOnly: false },
  healing_guides: { table: "healing_guides", columns: ["images"], label: "Şifa Rehberi görselleri", storage: { bucket: "stone-photos", prefix: "healing_tenant" }, titleColumn: "title", inlineOnly: false },
  healing_guide_sections: { table: "healing_guide_sections", columns: ["images"], label: "Şifa Rehberi bölüm görselleri", storage: { bucket: "stone-photos", prefix: "healing_tenant" }, titleColumn: "title", inlineOnly: false },
  human_design_clients: { table: "human_design_clients", columns: ["chart_image_url"], label: "Human Design harita görselleri", storage: { bucket: "hd-chart-images", prefix: "tenant" }, titleColumn: "name", inlineOnly: false },
  human_design_charts: { table: "human_design_charts", columns: ["chart_image_url"], label: "Human Design harita görselleri", storage: { bucket: "hd-chart-images", prefix: "tenant" }, titleColumn: "client_name", inlineOnly: false },
  expert_workspace_assets: { table: "expert_workspace_assets", columns: ["desktop_path", "mobile_path"], label: "Kişisel Ofis görselleri", storage: { bucket: "expert-workspace", prefix: "tenant" }, titleColumn: null, inlineOnly: false },
  oil_inventory: { table: "oil_inventory", columns: ["photos"], label: "Ürün & Stok fotoğrafları", storage: null, titleColumn: null, inlineOnly: true },
  soap_cream_inventory: { table: "soap_cream_inventory", columns: ["photos"], label: "Ürün & Stok fotoğrafları", storage: null, titleColumn: null, inlineOnly: true },
  accessory_inventory: { table: "accessory_inventory", columns: ["photos"], label: "Ürün & Stok fotoğrafları", storage: null, titleColumn: null, inlineOnly: true },
  other_inventory: { table: "other_inventory", columns: ["photos"], label: "Ürün & Stok fotoğrafları", storage: null, titleColumn: null, inlineOnly: true },
  aromatherapy_oils: { table: "aromatherapy_oils", columns: ["images"], label: "Aromaterapi yağ görselleri", storage: null, titleColumn: null, inlineOnly: true },
};

/** Arşive dosya olarak GİRMEYEN depolama alanları ve gerekçesi (plan / BENİOKU "kapsam dışı"). */
export const MEDIA_NOT_ARCHIVED: { scope: string; reason: string }[] = [
  { scope: "Doğaltaş Kütüphanesi görselleri", reason: "ortak katalog (platforma ait, lisanslı) — kullanıcı dosyası değil" },
  { scope: "Mağaza ürün görselleri", reason: "ortak katalog (yönetici) — kullanıcı dosyası değil" },
  { scope: "HD Hazır Eğitim Haritaları", reason: "ortak katalog (platform) — kullanıcı dosyası değil" },
  { scope: "Belge / video çeviri geçici dosyaları", reason: "geçici iş dosyası (sonuç Word'leri indirilmek üzere üretilir, saklanmaz)" },
  { scope: "Video eğitim kayıtlarının Word / PDF yolu", reason: "uygulama bu yollara dosya yazmıyor (yalnız metin kaydı; Word dökümünde)" },
];

export type MediaItem = { kind: "data"; mime: string; base64: string } | { kind: "path"; bucket: string; path: string };

const PATH_KEYS = new Set(["file_path", "path", "storage_path", "url", "src", "image_url", "file_url"]);
const DATA_RE = /^data:(image\/(?:png|jpe?g|webp|gif|heic|heif|avif|bmp));base64,([A-Za-z0-9+/=\s]+)$/i;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif", "image/avif": "avif", "image/bmp": "bmp" };

function candidates(v: unknown, out: string[], depth = 0): void {
  if (depth > 5 || v === null || v === undefined) return;
  if (typeof v === "string") {
    out.push(v);
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) candidates(x, out, depth + 1);
    return;
  }
  if (typeof v === "object") {
    for (const [k, x] of Object.entries(v as Row)) if (typeof x !== "string" || PATH_KEYS.has(k)) candidates(x, out, depth + 1);
  }
}

function safeRelative(p: string, prefix: string): boolean {
  if (!p || p.startsWith("/") || p.includes("..") || p.includes("\\") || p.includes("//") || p.includes("://")) return false;
  if (/%2e|%2f|%5c/i.test(p)) return false;
  return p.startsWith(prefix);
}

/** Satırdaki görseller (sıralı; doğrulanmamış / yabancı yol ATLANIR ve sayılır). */
export function extractMedia(def: MediaSourceDef, row: Row, tenantId: string): { items: MediaItem[]; rejected: number } {
  const raw: string[] = [];
  for (const c of def.columns) candidates(row[c], raw);
  const items: MediaItem[] = [];
  let rejected = 0;
  for (const s0 of raw) {
    const s = s0.trim();
    if (!s) continue;
    const d = DATA_RE.exec(s);
    if (d) {
      items.push({ kind: "data", mime: d[1].toLowerCase().replace("image/jpg", "image/jpeg"), base64: d[2].replace(/\s+/g, "") });
      continue;
    }
    if (s.startsWith("data:")) {
      rejected++;
      continue;
    }
    if (!def.storage) {
      if (s.includes("/")) rejected++;
      continue;
    }
    const prefix = storagePrefix(def.storage.prefix, tenantId);
    if (/^https?:\/\//i.test(s)) {
      const m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\//i.exec(s);
      const path = storagePathFromUrl(s);
      const bucket = def.storage.bucket === "from_url" ? m?.[1] ?? null : def.storage.bucket;
      if (bucket && path && safeRelative(path, prefix) && (def.storage.bucket === "from_url" || m?.[1] === bucket)) items.push({ kind: "path", bucket, path });
      else rejected++;
      continue;
    }
    if (!s.includes("/")) continue; // düz metin (ör. açıklama) — yol değil
    if (def.storage.bucket !== "from_url" && safeRelative(s, prefix)) items.push({ kind: "path", bucket: def.storage.bucket, path: s });
    else rejected++;
  }
  return { items, rejected };
}

/** Tek satırı registry kapsamıyla okur (tenant, kullanıcı sahipliği, child_of ebeveyn tenant'ı). */
export async function readMediaRow(db: SupabaseClient, tenantId: string, userId: string, table: string, rowId: string): Promise<Row | null | "error"> {
  const def = MEDIA_SOURCES[table];
  const e = getRegistryEntry(table);
  if (!def || !e) return null;
  const cols = ["id", ...def.columns, ...(def.titleColumn ? [def.titleColumn] : [])];
  if (typeof e.tenantScope === "object") cols.push(e.tenantScope.fk);
  let q = db.from(table).select([...new Set(cols)].join(", ")).eq("id", rowId);
  if (e.tenantScope === "direct") q = q.eq("tenant_id", tenantId);
  if (e.ownerScope && "column" in e.ownerScope) q = q.eq(e.ownerScope.column, userId);
  const { data, error } = (await q.maybeSingle()) as { data: Row | null; error: unknown };
  if (error) return "error";
  if (!data) return null;
  if (typeof e.tenantScope === "object") {
    const { data: parent } = (await db.from(e.tenantScope.parent).select("id").eq("tenant_id", tenantId).eq("id", String(data[e.tenantScope.fk])).maybeSingle()) as { data: Row | null };
    if (!parent) return null;
  }
  return data;
}

export function mediaFileName(def: MediaSourceDef, row: Row, item: MediaItem, index: number): string {
  const title = def.titleColumn && typeof row[def.titleColumn] === "string" ? String(row[def.titleColumn]).trim() : "";
  const base = title || `${def.label.replace(/ görselleri| fotoğrafları/i, "")} ${String(row.id).slice(0, 8)}`;
  const ext = item.kind === "data" ? EXT[item.mime] ?? "img" : (item.path.split(".").pop() ?? "img").toLowerCase().slice(0, 5);
  return safeFileName(`${base} (${index + 1}).${ext}`);
}

export function mediaModuleOf(table: string): string {
  const e = getRegistryEntry(table);
  return e?.module ?? "general";
}

export function mediaFolderLabel(table: string): string {
  return `${MODULE_LABELS[mediaModuleOf(table)] ?? ""}/${MEDIA_SOURCES[table].label}`;
}
