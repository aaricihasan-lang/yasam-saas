/**
 * BF-12B — Storage yedekleme motoru: port + fixture + supabase adaptörü.
 *
 * - Tenant atıfı path sözleşmesinden (stone-photos karışık şema dahil).
 * - Opaque artifact adı: ham path'i açığa çıkarmaz (deterministik HMAC-benzeri hash).
 * - Pre/post list fingerprint karşılaştırması → drift'te FAIL-CLOSED (engine'de).
 * - YALNIZ list/read/download; delete/upload/update YOK.
 */
import { createHash } from "node:crypto";
import type { StorageListItem, StorageReader } from "./types";
import { classifyTenant } from "./constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path sözleşmesinden tenant atıfı + sınıf etiketi. */
export function classifyStoragePath(
  bucket: string,
  path: string,
): { tenantId: string | null; label: string } {
  const segs = path.split("/");
  let candidate: string;
  if (bucket === "stone-photos" && (segs[0] === "catalog" || segs[0] === "healing-guides")) {
    candidate = segs[1] ?? "";
  } else {
    candidate = segs[0] ?? "";
  }
  if (UUID_RE.test(candidate)) {
    const klass = classifyTenant(candidate);
    return { tenantId: candidate, label: klass === "unmatched_orphan" ? "unmatched_uuid_tenant" : klass };
  }
  return { tenantId: null, label: "non_tenant_prefix" };
}

/** Opaque artifact adı — ham path'i sızdırmaz; backup içinde deterministik. */
export function opaqueObjectName(bucket: string, path: string, saltHex: string): string {
  const h = createHash("sha256").update(`${saltHex}\n${bucket}\n${path}`).digest("hex");
  return `obj_${h.slice(0, 40)}.bin.enc`;
}

/** Liste fingerprint (identity + size + updatedAt) — drift tespiti. */
export function fingerprintList(items: StorageListItem[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const it of items) {
    const key = `${it.bucket}/${it.path}`;
    m.set(key, `${it.size}|${it.updatedAt}`);
  }
  return m;
}

/** İki listenin identity/size/updatedAt fingerprint'i eşleşiyor mu? */
export function listsMatch(a: StorageListItem[], b: StorageListItem[]): boolean {
  const fa = fingerprintList(a);
  const fb = fingerprintList(b);
  if (fa.size !== fb.size) return false;
  for (const [k, v] of fa) {
    if (fb.get(k) !== v) return false;
  }
  return true;
}

// ─── Fixture storage ──────────────────────────────────────────────────────────

export interface FixtureObject {
  buffer: Buffer;
  updatedAt: string;
}
/** bucket → (path → object). */
export type FixtureStorageData = Map<string, Map<string, FixtureObject>>;

export class FixtureStorage implements StorageReader {
  constructor(private readonly data: FixtureStorageData) {}

  async listAll(): Promise<StorageListItem[]> {
    const out: StorageListItem[] = [];
    for (const [bucket, objs] of this.data) {
      for (const [path, o] of objs) {
        out.push({ bucket, path, size: o.buffer.length, updatedAt: o.updatedAt });
      }
    }
    out.sort((x, y) => (`${x.bucket}/${x.path}` < `${y.bucket}/${y.path}` ? -1 : 1));
    return out;
  }

  async download(bucket: string, path: string): Promise<Buffer> {
    const o = this.data.get(bucket)?.get(path);
    if (!o) throw new Error(`Fixture storage obje yok: ${bucket}/${path}`);
    return o.buffer;
  }

  source(): "fixture" | "production" {
    return "fixture";
  }
}

// ─── Supabase storage adaptörü (design-only; bu fazda çalıştırılmaz) ───────────

interface SbListEntry {
  name: string;
  updated_at?: string | null;
  metadata?: { size?: number | null } | null;
}
interface SbBucket {
  name: string;
}
interface SbStorageApi {
  listBuckets(): Promise<{ data: SbBucket[] | null; error: unknown }>;
  from(bucket: string): {
    list(
      prefix: string,
      opts: { limit: number; offset: number; sortBy?: { column: string; order: string } },
    ): Promise<{ data: SbListEntry[] | null; error: unknown }>;
    download(path: string): Promise<{ data: Blob | null; error: unknown }>;
  };
}
interface SbClientLike {
  storage: SbStorageApi;
}

/**
 * Gerçek Supabase Storage reader (service_role; YALNIZ read/list/download).
 * BU FAZDA ÇALIŞTIRILMAZ. Recursive list + sayfalama ile tüm objeleri gezer.
 */
export async function createSupabaseStorageReader(cfg: {
  url: string;
  serviceRoleKey: string;
}): Promise<StorageReader> {
  const specifier = "@supabase/supabase-js";
  const mod = (await import(specifier)) as {
    createClient: (url: string, key: string, opts?: unknown) => SbClientLike;
  };
  const client = mod.createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false },
  });

  async function listBucketRecursive(bucket: string, prefix: string): Promise<StorageListItem[]> {
    const out: StorageListItem[] = [];
    const pageSize = 1000;
    let offset = 0;
    for (;;) {
      const { data, error } = await client.storage
        .from(bucket)
        .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`Storage list hatası (${bucket}/${prefix}): ${String(error)}`);
      const entries = data ?? [];
      if (entries.length === 0) break;
      for (const e of entries) {
        const full = prefix ? `${prefix}/${e.name}` : e.name;
        const size = e.metadata?.size;
        if (size === null || size === undefined) {
          // Klasör → recurse.
          const nested = await listBucketRecursive(bucket, full);
          out.push(...nested);
        } else {
          out.push({ bucket, path: full, size: Number(size), updatedAt: String(e.updated_at ?? "") });
        }
      }
      if (entries.length < pageSize) break;
      offset += pageSize;
    }
    return out;
  }

  return {
    async listAll(): Promise<StorageListItem[]> {
      const { data, error } = await client.storage.listBuckets();
      if (error) throw new Error(`Storage listBuckets hatası: ${String(error)}`);
      const buckets = (data ?? []).map((b) => b.name).sort();
      const all: StorageListItem[] = [];
      for (const b of buckets) all.push(...(await listBucketRecursive(b, "")));
      return all;
    },
    async download(bucket: string, path: string): Promise<Buffer> {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`Storage download hatası (${bucket}/${path}): ${String(error)}`);
      const ab = await data.arrayBuffer();
      return Buffer.from(ab);
    },
    source() {
      return "production";
    },
  };
}
