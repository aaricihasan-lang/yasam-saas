/**
 * lib/archive/server/data.ts — Premium Word Arşivi: modül kayıt dökümü (YALNIZ SUNUCU).
 *
 * - Okuma lib/backup/engine ile (keyset, tenant + uzman sahipliği); danışan / tarih süzgeci sayım ve sayfaya AYNI
 *   uygulanır → plan sayısı ile okunan satır karşılaştırılabilir (eksik arşiv başarılı gösterilmez).
 * - Parça bütçesi: en fazla PART_MAX_RECORDS kayıt / PART_MAX_CHARS metin → her Word dosyası küçük kalır
 *   (Vercel yanıt sınırı, sunucu belleği, süre). Büyük modül birden çok "Bölüm N" dosyasına bölünür; 12.000 kayıt
 *   tavanı yoktur.
 * - Bağlı kayıt kimlikleri okunabilir ada çevrilir (danışan "Ad Soyad", HD danışanı, doğum profili, taş).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { countTableRows, fetchTablePage, type RowFilter } from "@/lib/backup/engine";
import { getRegistryEntry, MODULE_LABELS } from "@/lib/backup/registry";
import { MIGRATION_SCHEMA } from "@/lib/backup/schema.generated";
import type { RegistryEntry } from "@/lib/backup/types";
import { buildArchiveDocx, type WordTableData } from "@/lib/backup/wordExport";
import { clientLinkColumn, istanbulDayStartIso, moduleTables, nextDay } from "../scope";
import type { ArchiveOptions, DataPartState } from "../types";

assertServerOnly("lib/archive/server/data");

type Row = Record<string, unknown>;

export const PART_MAX_RECORDS = 1500;
export const PART_MAX_CHARS = 2_500_000;
const LABEL_CHUNK = 100;

export type TableScope =
  | { entry: RegistryEntry; filters: RowFilter[]; skip: null }
  | { entry: RegistryEntry; filters: null; skip: string };

type ProbeCache = Map<string, boolean>;

/** Tabloda `created_at` var mı: migration şeması → kesin; şeması repo dışı eski tablo → canlı yoklama (limit 0). */
async function hasCreatedAt(db: SupabaseClient, e: RegistryEntry, cache: ProbeCache): Promise<boolean> {
  const schema = MIGRATION_SCHEMA[e.table];
  if (schema) return schema.columns.includes("created_at");
  const hit = cache.get(e.table);
  if (hit !== undefined) return hit;
  const r = (await db.from(e.table).select("created_at").limit(0)) as { error: unknown };
  const ok = !r.error;
  cache.set(e.table, ok);
  return ok;
}

/** Seçeneklere göre tablonun süzgeçleri veya kapsam dışı gerekçesi. */
export async function tableScope(db: SupabaseClient, e: RegistryEntry, opts: ArchiveOptions, cache: ProbeCache): Promise<TableScope> {
  const filters: RowFilter[] = [];
  if (opts.clientIds) {
    const col = clientLinkColumn(e);
    if (!col) return { entry: e, filters: null, skip: "danışana bağlı olmayan kayıt (danışan seçimi yapıldı)" };
    filters.push({ column: col, op: "in", values: opts.clientIds });
  }
  if (opts.dateFrom || opts.dateTo) {
    if (!(await hasCreatedAt(db, e, cache))) return { entry: e, filters: null, skip: "kayıt tarihi alanı yok (tarih aralığı seçildi)" };
    if (opts.dateFrom) filters.push({ column: "created_at", op: "gte", value: istanbulDayStartIso(opts.dateFrom) });
    if (opts.dateTo) filters.push({ column: "created_at", op: "lt", value: istanbulDayStartIso(nextDay(opts.dateTo)) });
  }
  return { entry: e, filters, skip: null };
}

export type ModuleDataPlan = {
  module: string;
  tables: { entry: RegistryEntry; label: string; expected: number | null; error: string | null; skip: string | null }[];
  records: number;
};

/** Modülün tablo bazında kayıt sayıları (süzgeçli) + kapsam dışı tablolar. */
export async function planModuleData(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  module: string,
  opts: ArchiveOptions,
  cache: ProbeCache = new Map(),
): Promise<ModuleDataPlan> {
  const out: ModuleDataPlan = { module, tables: [], records: 0 };
  for (const e of moduleTables(module)) {
    const sc = await tableScope(db, e, opts, cache);
    if (sc.skip !== null) {
      out.tables.push({ entry: e, label: e.label, expected: 0, error: null, skip: sc.skip });
      continue;
    }
    const c = await countTableRows(db, e, tenantId, { ownerUserId: userId, filters: sc.filters });
    out.tables.push({ entry: e, label: e.label, expected: c.count, error: c.error, skip: null });
    out.records += c.count ?? 0;
  }
  return out;
}

// ─── Okunabilir adlar ────────────────────────────────────────────────────────

const LABEL_SOURCES: Record<string, { columns: string; label: (r: Row) => string }> = {
  clients: { columns: "id, ad, soyad", label: (r) => [r.ad, r.soyad].filter((x) => typeof x === "string" && x.trim()).join(" ").trim() },
  human_design_clients: { columns: "id, name", label: (r) => String(r.name ?? "").trim() },
  human_design_charts: { columns: "id, client_name", label: (r) => String(r.client_name ?? "").trim() },
  astro_birth_profiles: { columns: "id, label", label: (r) => String(r.label ?? "").trim() },
  stones: { columns: "id, stone_name", label: (r) => String(r.stone_name ?? "").trim() },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Satırlardaki bağlı kimlikleri (registry FK ebeveynleri) okunabilir ada çevirir — tenant + uzman sahipliği ile. */
export async function resolveRefLabels(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  tables: { entry: RegistryEntry; rows: Row[] }[],
): Promise<Map<string, string>> {
  const want = new Map<string, Set<string>>();
  for (const { entry, rows } of tables) {
    const refs = [...entry.fkParents.filter((p) => LABEL_SOURCES[p.table]).map((p) => ({ column: p.column, table: p.table }))];
    if (entry.table === "human_design_clients") refs.push({ column: "journey_client_id", table: "clients" });
    for (const ref of refs) {
      for (const r of rows) {
        const v = r[ref.column];
        if (typeof v === "string" && UUID_RE.test(v)) {
          if (!want.has(ref.table)) want.set(ref.table, new Set());
          want.get(ref.table)!.add(v.toLowerCase());
        }
      }
    }
  }
  const labels = new Map<string, string>();
  for (const [table, ids] of want) {
    const src = LABEL_SOURCES[table];
    const parent = getRegistryEntry(table);
    const owner = parent?.ownerScope && "column" in parent.ownerScope ? parent.ownerScope.column : null;
    const all = [...ids];
    for (let i = 0; i < all.length; i += LABEL_CHUNK) {
      let q = db.from(table).select(src.columns).eq("tenant_id", tenantId);
      if (owner) q = q.eq(owner, userId);
      const res = (await q.in("id", all.slice(i, i + LABEL_CHUNK))) as { data: Row[] | null; error: unknown };
      if (res.error) continue; // ad çözülemezse "bağlantılı kayıt (ref.)" yazılır — veri kaybı değil
      for (const r of res.data ?? []) {
        const l = src.label(r);
        if (l) labels.set(String(r.id).toLowerCase(), l);
      }
    }
  }
  return labels;
}

// ─── Parça ───────────────────────────────────────────────────────────────────

export function encodeDataState(s: DataPartState): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

export function decodeDataState(raw: unknown): DataPartState | null | "invalid" {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 4096) return "invalid";
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>;
    if (!Number.isInteger(v.t) || (v.t as number) < 0 || (v.t as number) > 500) return "invalid";
    if (!Number.isInteger(v.n) || (v.n as number) < 1 || (v.n as number) > 100_000) return "invalid";
    if (!(v.c === null || typeof v.c === "string")) return "invalid";
    const i = v.i === undefined ? 0 : v.i;
    if (!Number.isInteger(i) || (i as number) < 0) return "invalid";
    return { t: v.t as number, c: v.c as string | null, n: v.n as number, i: i as number };
  } catch {
    return "invalid";
  }
}

export type DataPartResult = {
  buffer: Buffer | null;
  next: DataPartState | null;
  rows: number;
  errors: string[];
  fileName: string;
};

/**
 * Bir veri parçası: `state.t` tablosundan `state.c` imlecinden başlayarak bütçe dolana kadar okur, Word üretir.
 * Kayıt yoksa (tüm tablolar boş / kapsam dışı) buffer null döner.
 */
export async function buildDataPart(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  module: string,
  opts: ArchiveOptions,
  state: DataPartState | null,
  now: Date = new Date(),
): Promise<DataPartResult> {
  const cache: ProbeCache = new Map();
  const tables = moduleTables(module);
  let t = state?.t ?? 0;
  let cursor = state?.c ?? null;
  const part = state?.n ?? 1;
  let emitted = state?.c ? (state?.i ?? 0) : 0;
  const collected: WordTableData[] = [];
  let records = 0;
  let chars = 0;
  const errors: string[] = [];

  while (t < tables.length && records < PART_MAX_RECORDS && chars < PART_MAX_CHARS) {
    const e = tables[t];
    const sc = await tableScope(db, e, opts, cache);
    if (sc.skip !== null) {
      t++;
      cursor = null;
      emitted = 0;
      continue;
    }
    const continued = cursor !== null;
    const bucket: WordTableData = {
      entry: e,
      rows: [],
      expected_count: null,
      complete: true,
      error: null,
      titleSuffix: continued ? " (önceki bölümden devam)" : "",
      firstIndex: emitted + 1,
    };
    let tableDone = false;
    while (records < PART_MAX_RECORDS && chars < PART_MAX_CHARS) {
      const page = await fetchTablePage(db, e, tenantId, cursor, {
        ownerUserId: userId,
        filters: sc.filters,
        includeCount: false,
        pageSize: Math.min(500, PART_MAX_RECORDS - records),
      });
      if (!page.ok) {
        errors.push(`${MODULE_LABELS[module] ?? module} › ${e.label}: ${page.error ?? "okunamadı"}`);
        bucket.complete = false;
        bucket.error = page.error ?? "okunamadı";
        tableDone = true;
        break;
      }
      if (page.error) {
        errors.push(`${MODULE_LABELS[module] ?? module} › ${e.label}: ${page.error}`);
        bucket.complete = false;
        bucket.error = page.error;
      }
      for (const r of page.rows) chars += JSON.stringify(r).length;
      bucket.rows.push(...page.rows);
      records += page.rows.length;
      if (page.done) {
        tableDone = true;
        break;
      }
      if (page.next_cursor === cursor) {
        errors.push(`${e.label}: sayfalama ilerlemedi`);
        bucket.complete = false;
        tableDone = true;
        break;
      }
      cursor = page.next_cursor;
    }
    if (bucket.rows.length > 0 || !bucket.complete) collected.push(bucket);
    emitted += bucket.rows.length;
    if (tableDone) {
      t++;
      cursor = null;
      emitted = 0;
    }
  }

  const next: DataPartState | null = t < tables.length ? { t, c: cursor, n: part + 1, i: cursor ? emitted : 0 } : null;
  const rowsTotal = collected.reduce((s, b) => s + b.rows.length, 0);
  const label = MODULE_LABELS[module] ?? module;
  const fileName = `${label} — Kayıt Dökümü — Bölüm ${part}.docx`;
  if (rowsTotal === 0 && errors.length === 0) return { buffer: null, next, rows: 0, errors, fileName };

  const refLabels = await resolveRefLabels(db, tenantId, userId, collected);
  const notes: string[] = [`Bölüm ${part}${next ? " (devamı sonraki bölümde)" : " (son bölüm)"} · ${rowsTotal} kayıt`];
  if (opts.clientIds) notes.push(`Danışan seçimi: ${opts.clientIds.length} danışan (yalnız danışana bağlı kayıtlar).`);
  if (opts.dateFrom || opts.dateTo) notes.push(`Kayıt tarihi aralığı: ${opts.dateFrom ?? "başlangıç"} – ${opts.dateTo ?? "bugün"} (Europe/Istanbul).`);
  const built = await buildArchiveDocx({
    title: `${label} — Kayıt Dökümü`,
    modules: [{ key: module, label, tables: collected }],
    refLabels,
    notes,
    now,
  });
  return { buffer: built.buffer, next, rows: rowsTotal, errors, fileName };
}
