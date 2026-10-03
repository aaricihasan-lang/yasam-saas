/**
 * lib/backup/storagePaths.ts — Restore'da storage yolu tenant doğrulaması (SAF).
 *
 * Bir yedek satırı başka tenant'ın storage objesine işaret edemez: yol `${tenantId}/` (veya modülün
 * bilinen tenant-önekli şeması: `catalog/${tenantId}/`, `healing-guides/${tenantId}/`) ile başlamalı.
 * data: URI'ler (satır içi base64 foto) ve storage DIŞI http(s) bağlantılar serbesttir; Supabase
 * storage URL'leri (`/storage/v1/object/...`) yola çözülüp aynı kurala tabi tutulur.
 */
import type { RegistryEntry, StoragePrefixKind } from "./types";

export function storagePrefix(kind: StoragePrefixKind, tenantId: string): string {
  if (kind === "catalog_tenant") return `catalog/${tenantId}/`;
  if (kind === "healing_tenant") return `healing-guides/${tenantId}/`;
  return `${tenantId}/`;
}

const PATH_KEYS = new Set(["file_path", "path", "storage_path", "url", "src", "image_url", "file_url"]);

function collectCandidates(value: unknown, out: string[], depth = 0): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectCandidates(v, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string" ? PATH_KEYS.has(k) : true) collectCandidates(v, out, depth + 1);
    }
  }
}

/** Supabase storage URL'sinden obje yolunu çıkarır; storage URL'si değilse null. */
export function storagePathFromUrl(url: string): string | null {
  const m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/([^?#]+)/i.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function isSafeOwnedPath(path: string, prefixes: string[]): boolean {
  const p = path.trim();
  if (!p) return true;
  if (p.startsWith("/") || p.includes("..") || p.includes("\\") || p.includes("//") || p.includes("://")) return false;
  let decoded = p;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    return false;
  }
  if (decoded.includes("..") || decoded.includes("\\")) return false;
  return prefixes.some((pre) => p.startsWith(pre));
}

/** Bir kolon değerindeki (iç içe) ilk yabancı yol; temizse null. */
function firstForeignIn(value: unknown, prefixes: string[]): string | null {
  const candidates: string[] = [];
  collectCandidates(value, candidates);
  for (const raw of candidates) {
    const s = raw.trim();
    if (!s || s.startsWith("data:")) continue;
    if (/^https?:\/\//i.test(s)) {
      const path = storagePathFromUrl(s);
      if (path !== null && !isSafeOwnedPath(path, prefixes)) return s;
      continue;
    }
    if (!s.includes("/") && !s.includes("\\")) continue;
    if (!isSafeOwnedPath(s, prefixes)) return s;
  }
  return null;
}

/**
 * Satırın storage referansları bu tenant'a mı ait? İlk ihlali döndürür (kolon + değer); temizse null.
 * Sade metin (bölü işareti içermeyen) değerler yol sayılmaz (ör. açıklama etiketi).
 */
export function findForeignStoragePath(
  e: RegistryEntry,
  row: Record<string, unknown>,
  tenantId: string,
): { column: string; value: string } | null {
  for (const ref of e.storageRefs) {
    if (!(ref.column in row)) continue;
    const prefixes = ref.prefixes.map((k) => storagePrefix(k, tenantId));
    const bad = firstForeignIn(row[ref.column], prefixes);
    if (bad !== null) return { column: ref.column, value: bad };
  }
  return null;
}

/**
 * Restore için yabancı yolları ayıklar (yeni satır nesnesi döner; girdi değişmez).
 *
 * - Görsel LİSTESİ kolonları (dizi: images / photos): yalnız yabancı yol içeren ÖĞELER çıkarılır,
 *   satırın geri kalanı (metin içeriği) korunur. Ör. masaüstü aktarımından kalan `images/healing/x.jpg`
 *   gibi hiçbir hesaba ait olmayan (uygulamanın da gösteremediği) eski göreli yollar.
 * - Tekil dosya kolonu (dosya kaydının kendisi: file_path, storage_path …) yabancıysa satır
 *   KURTARILAMAZ → `blocking` döner (çağıran satırı `foreign_storage_path` ile reddeder).
 * Yabancı yol hiçbir koşulda yazılmaz.
 */
export function stripForeignStoragePaths(
  e: RegistryEntry,
  row: Record<string, unknown>,
  tenantId: string,
): { row: Record<string, unknown>; removed: number; blocking: { column: string; value: string } | null } {
  let out = row;
  let removed = 0;
  for (const ref of e.storageRefs) {
    if (!(ref.column in row)) continue;
    const prefixes = ref.prefixes.map((k) => storagePrefix(k, tenantId));
    const value = row[ref.column];
    if (Array.isArray(value)) {
      const kept = value.filter((item) => firstForeignIn(item, prefixes) === null);
      if (kept.length !== value.length) {
        removed += value.length - kept.length;
        out = { ...out, [ref.column]: kept };
      }
      continue;
    }
    const bad = firstForeignIn(value, prefixes);
    if (bad !== null) return { row, removed: 0, blocking: { column: ref.column, value: bad } };
  }
  return { row: out, removed, blocking: null };
}
