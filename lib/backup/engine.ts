/**
 * lib/backup/engine.ts — Yedek dışa aktarma (keyset sayfalama) + geri yükleme (yalnız ekleme) motoru.
 *
 * SUNUCU tarafı (service_role Supabase istemcisi enjekte edilir; test için sahte DB). next/server
 * importu YOK → route'lar ince sarmalayıcıdır, harness motoru doğrudan çağırır.
 *
 * DIŞA AKTARMA:
 *  - PK sıralı keyset sayfalama; sayfa ≤ 500; BOŞ sayfa gelene kadar devam (kısa sayfa "bitti" sayılmaz
 *    → PostgREST max-rows sınırı ne olursa olsun satır kaçmaz).
 *  - Tablo başına `head` count → expected_count; row_count ≠ expected_count ise complete:false.
 *  - child_of tablolar (tenant_id'siz) tenant'ın ebeveyn id'leri üzerinden parçalı `.in()` ile okunur.
 *
 * GERİ YÜKLEME (parça başına):
 *  - Yalnız EKSİK kayıt eklenir: UPDATE/DELETE YOK; tekrar çalıştırılabilir (idempotent); ID remap YOK.
 *  - tenant_id / kullanıcı kolonları SUNUCUDA zorlanır; kolon izin listesi projeksiyonu (generated hariç).
 *  - Lisans (resolveModuleAccess) + üyelik kontrolü; lisanssız → skipped_unlicensed.
 *  - FK ebeveyni aynı tenant'ta olmalı (değilse parent_missing; SET NULL ilişkide null yazılır).
 *  - Storage yolları tenant önekli olmalı.
 *  - Toplu `upsert(rows, { onConflict, ignoreDuplicates: true })` tek ifade; hata → satır satır izolasyon.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";
import { SYSTEM_NUTRITION_TENANT_ID } from "@/lib/beslenme/systemTenant";
import { columnPolicyFor, hasTenantColumn, SAFE_COLUMN_RE } from "./columns";
import { addFailure, computeTableStatus, emptyTableReport } from "./format";
import { getRegistryEntry, isExportable, isOperationalBackupTable, topologicalOrder } from "./registry";
import { stripForeignStoragePaths } from "./storagePaths";
import type { BackupPageResponse, RegistryEntry, RestoreDecision, RestoreTableReport } from "./types";

type Row = Record<string, unknown>;
type DbError = { code?: string; message?: string } | null;
type QueryResult = { data: unknown; error: DbError; count?: number | null };

export const BACKUP_PAGE_SIZE = 500;
export const PARENT_CHUNK = 100;
export const IN_FILTER_CHUNK = 100;
/** Parça yanıtı Vercel 4.5 MB sınırının altında kalsın. */
export const PAGE_MAX_BYTES = 3_000_000;
export const ROW_MAX_BYTES = 4_000_000;
/** Tek istekte taranacak en fazla ebeveyn parçası (child_of). */
const MAX_PARENT_CHUNKS_PER_REQUEST = 40;

// ─── Cursor ──────────────────────────────────────────────────────────────────

type Cursor = { k: string | number | null; p: string | null };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): Cursor | null | "invalid" {
  if (raw === null || raw === undefined || raw === "") return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (!v || typeof v !== "object") return "invalid";
    const o = v as Record<string, unknown>;
    const k = o.k;
    const p = o.p;
    if (!(k === null || typeof k === "string" || typeof k === "number")) return "invalid";
    if (!(p === null || typeof p === "string")) return "invalid";
    return { k, p };
  } catch {
    return "invalid";
  }
}

function keyColumn(e: RegistryEntry): string {
  const cols = e.orderBy;
  if (cols.length !== 1) throw new Error(`${e.table}: keyset tek kolon bekler (orderBy=${cols.join(",")})`);
  return cols[0];
}

function errText(err: DbError): string {
  if (!err) return "bilinmeyen hata";
  return [err.code, err.message].filter(Boolean).join(": ") || "bilinmeyen hata";
}

function nutritionBlocked(e: RegistryEntry, tenantId: string): boolean {
  return e.module === "beslenme" && tenantId === SYSTEM_NUTRITION_TENANT_ID;
}

// ─── Dışa aktarma ────────────────────────────────────────────────────────────

async function parentIdPage(
  db: SupabaseClient,
  parentTable: string,
  tenantId: string,
  after: string | null,
): Promise<{ ids: string[]; error: DbError }> {
  let q = db.from(parentTable).select("id").eq("tenant_id", tenantId);
  if (after !== null) q = q.gt("id", after);
  const res = (await q.order("id", { ascending: true }).limit(PARENT_CHUNK)) as QueryResult;
  if (res.error) return { ids: [], error: res.error };
  return { ids: ((res.data as Row[] | null) ?? []).map((r) => String(r.id)), error: null };
}

/** Tablo başına beklenen satır sayısı (head count). child_of → ebeveyn parçaları üzerinden toplam. */
export async function countTableRows(
  db: SupabaseClient,
  e: RegistryEntry,
  tenantId: string,
): Promise<{ count: number | null; error: string | null }> {
  if (nutritionBlocked(e, tenantId)) return { count: 0, error: null };
  if (e.tenantScope === "direct") {
    const res = (await db
      .from(e.table)
      .select(keyColumn(e), { count: "exact", head: true })
      .eq("tenant_id", tenantId)) as QueryResult;
    if (res.error) return { count: null, error: errText(res.error) };
    return { count: typeof res.count === "number" ? res.count : null, error: null };
  }
  if (typeof e.tenantScope === "object") {
    const { parent, fk } = e.tenantScope;
    let total = 0;
    let after: string | null = null;
    for (let guard = 0; guard < 100_000; guard++) {
      const page = await parentIdPage(db, parent, tenantId, after);
      if (page.error) return { count: null, error: errText(page.error) };
      if (page.ids.length === 0) return { count: total, error: null };
      const res = (await db
        .from(e.table)
        .select(keyColumn(e), { count: "exact", head: true })
        .in(fk, page.ids)) as QueryResult;
      if (res.error) return { count: null, error: errText(res.error) };
      total += typeof res.count === "number" ? res.count : 0;
      after = page.ids[page.ids.length - 1];
    }
    return { count: null, error: "sayım sınırı aşıldı" };
  }
  return { count: null, error: "tenant kapsamı yok" };
}

function trimToBudget(e: RegistryEntry, rows: Row[]): { rows: Row[]; skippedIds: string[]; lastKey: unknown } {
  const key = keyColumn(e);
  const out: Row[] = [];
  const skippedIds: string[] = [];
  let bytes = 0;
  let lastKey: unknown = null;
  for (const r of rows) {
    const size = JSON.stringify(r).length;
    if (size > ROW_MAX_BYTES) {
      // Tek satır yanıt sınırını aşıyor → atlanır ve AÇIKÇA raporlanır (sessiz kayıp yok).
      skippedIds.push(String(r[key]));
      lastKey = r[key];
      continue;
    }
    if (out.length > 0 && bytes + size > PAGE_MAX_BYTES) break;
    out.push(r);
    bytes += size;
    lastKey = r[key];
  }
  return { rows: out, skippedIds, lastKey };
}

/**
 * Tek sayfa okur. `done` YALNIZ boş sayfada true döner (kısa sayfa bitti sayılmaz).
 * İlk çağrıda (cursor yok) expected_count de döner.
 */
export async function fetchTablePage(
  db: SupabaseClient,
  e: RegistryEntry,
  tenantId: string,
  rawCursor: string | null,
  opts: { pageSize?: number; includeCount?: boolean } = {},
): Promise<BackupPageResponse> {
  const base: BackupPageResponse = { ok: true, table: e.table, rows: [], next_cursor: null, done: true };
  if (!isExportable(e)) return { ...base, ok: false, error: "Bu tablo yedek kapsamında değil." };
  const cursor = decodeCursor(rawCursor);
  if (cursor === "invalid") return { ...base, ok: false, error: "Geçersiz cursor." };
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? e.pageSize ?? BACKUP_PAGE_SIZE, BACKUP_PAGE_SIZE));
  const key = keyColumn(e);

  let expected: number | null | undefined;
  let countError: string | null = null;
  if (cursor === null && opts.includeCount !== false) {
    const c = await countTableRows(db, e, tenantId);
    expected = c.count;
    countError = c.error;
  }
  if (nutritionBlocked(e, tenantId)) return { ...base, expected_count: 0 };

  const finish = (rows: Row[], next: Cursor | null, error: string | null): BackupPageResponse => {
    const res: BackupPageResponse = {
      ok: error === null,
      table: e.table,
      rows,
      next_cursor: next ? encodeCursor(next) : null,
      done: next === null,
      error: error ?? countError,
    };
    if (expected !== undefined) res.expected_count = expected;
    return res;
  };

  if (e.tenantScope === "direct") {
    let q = db.from(e.table).select("*").eq("tenant_id", tenantId);
    if (cursor && cursor.k !== null) q = q.gt(key, cursor.k);
    const res = (await q.order(key, { ascending: true }).limit(pageSize)) as QueryResult;
    if (res.error) return finish([], null, errText(res.error));
    const rows = (res.data as Row[] | null) ?? [];
    if (rows.length === 0) return finish([], null, null);
    const t = trimToBudget(e, rows);
    const skippedNote = t.skippedIds.length ? `Çok büyük kayıt atlandı: ${t.skippedIds.join(", ")}` : null;
    return finish(t.rows, { k: t.lastKey as string | number, p: null }, skippedNote);
  }

  if (typeof e.tenantScope === "object") {
    const { parent, fk } = e.tenantScope;
    let parentAfter = cursor ? cursor.p : null;
    let childAfter = cursor ? cursor.k : null;
    for (let i = 0; i < MAX_PARENT_CHUNKS_PER_REQUEST; i++) {
      const page = await parentIdPage(db, parent, tenantId, parentAfter);
      if (page.error) return finish([], null, errText(page.error));
      if (page.ids.length === 0) return finish([], null, null);
      let q = db.from(e.table).select("*").in(fk, page.ids);
      if (childAfter !== null) q = q.gt(key, childAfter);
      const res = (await q.order(key, { ascending: true }).limit(pageSize)) as QueryResult;
      if (res.error) return finish([], null, errText(res.error));
      const rows = (res.data as Row[] | null) ?? [];
      if (rows.length > 0) {
        const t = trimToBudget(e, rows);
        const skippedNote = t.skippedIds.length ? `Çok büyük kayıt atlandı: ${t.skippedIds.join(", ")}` : null;
        return finish(t.rows, { p: parentAfter, k: t.lastKey as string | number }, skippedNote);
      }
      // Bu ebeveyn parçası bitti → sonraki parçaya geç.
      parentAfter = page.ids[page.ids.length - 1];
      childAfter = null;
    }
    // Çok sayıda boş ebeveyn parçası: boş ama BİTMEDİ yanıtı (istemci devam eder).
    return { ...finish([], { p: parentAfter, k: null }, null), done: false };
  }
  return finish([], null, "tenant kapsamı yok");
}

/** Tüm sayfaları okur (Word dışa aktarımı + harness). */
export async function exportTableAll(
  db: SupabaseClient,
  e: RegistryEntry,
  tenantId: string,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<{ rows: Row[]; expected_count: number | null; complete: boolean; error: string | null; truncated: boolean }> {
  const rows: Row[] = [];
  let cursor: string | null = null;
  let expected: number | null = null;
  const errors: string[] = [];
  let truncated = false;
  for (let guard = 0; guard < 1_000_000; guard++) {
    const page: BackupPageResponse = await fetchTablePage(db, e, tenantId, cursor, { pageSize: opts.pageSize });
    if (page.expected_count !== undefined) expected = page.expected_count ?? null;
    if (page.error) errors.push(page.error);
    rows.push(...page.rows);
    if (opts.maxRows !== undefined && rows.length > opts.maxRows) {
      truncated = true;
      break;
    }
    if (page.done || !page.ok) break;
    if (page.next_cursor === cursor) {
      errors.push("sayfalama ilerlemedi");
      break;
    }
    cursor = page.next_cursor;
  }
  const error = errors.length ? [...new Set(errors)].join(" · ") : null;
  const complete = !truncated && error === null && expected !== null && rows.length === expected;
  return { rows, expected_count: expected, complete, error, truncated };
}

// ─── Geri yükleme ────────────────────────────────────────────────────────────

export type RestoreContext = {
  tenantId: string;
  userId: string;
  role: unknown;
  modulePermissions: unknown;
  /** Üyelik aktif mi (admin her zaman true). */
  membershipActive: boolean;
};

/** Tablo için karar: geri yüklenebilir mi, neden atlanır? */
export function decideTable(table: string, ctx: RestoreContext): RestoreDecision {
  const e = getRegistryEntry(table);
  if (!e) {
    return {
      table,
      action: "skip",
      reason: isOperationalBackupTable(table) ? "excluded" : "unknown_table",
      module: null,
      detail: isOperationalBackupTable(table)
        ? "Operasyon yedeği tablosu — asla geri yüklenmez."
        : "Bu sürümde tanınmayan tablo — atlandı.",
    };
  }
  if (!isExportable(e)) {
    return { table, action: "skip", reason: "excluded", module: e.module, detail: e.reason ?? "Yedek kapsamı dışında." };
  }
  if (e.exportOnly) {
    return { table, action: "skip", reason: "export_only", module: e.module, detail: e.reason ?? "Yalnız dışa aktarılır." };
  }
  if (nutritionBlocked(e, ctx.tenantId)) {
    return { table, action: "skip", reason: "system_tenant", module: e.module, detail: "Sistem besin kataloğuna yazılamaz." };
  }
  if (e.module) {
    if (!resolveModuleAccess(ctx.role, ctx.modulePermissions, e.module)) {
      return { table, action: "skip", reason: "unlicensed", module: e.module, detail: "Modül hesabınızda aktif değil." };
    }
    if (!ctx.membershipActive) {
      return { table, action: "skip", reason: "membership_inactive", module: e.module, detail: "Üyeliğiniz aktif değil." };
    }
  }
  const order = topologicalOrder().findIndex((x) => x.table === table);
  return { table, action: "restore", module: e.module, order };
}

/** Plan: dosyadaki tabloların kararları, topolojik sırada (bilinmeyenler sonda). */
export function planRestore(
  tables: Record<string, number>,
  ctx: RestoreContext,
  sourceTenantId: string | null,
): { decisions: RestoreDecision[]; crossTenant: boolean; notes: string[] } {
  const decisions = Object.keys(tables).map((t) => decideTable(t, ctx));
  decisions.sort((a, b) => {
    const oa = a.action === "restore" ? a.order : Number.MAX_SAFE_INTEGER;
    const ob = b.action === "restore" ? b.order : Number.MAX_SAFE_INTEGER;
    return oa - ob || a.table.localeCompare(b.table);
  });
  const crossTenant = !!sourceTenantId && sourceTenantId !== ctx.tenantId;
  const notes: string[] = [];
  if (crossTenant) {
    notes.push(
      "Bu yedek başka bir hesaptan alınmış. Kayıt kimlikleri korunur (yeniden eşleme yapılmaz); " +
        "aynı kimlik başka bir hesapta hâlâ varsa o kayıt 'başka hesapta mevcut' olarak atlanır.",
    );
  }
  return { decisions, crossTenant, notes };
}

type ProbeCache = Map<string, Map<string, boolean>>;

/** Legacy tablo: anahtarların canlı tabloda var olup olmadığını doğrular (select … limit 0). */
async function probeColumns(db: SupabaseClient, table: string, keys: string[], cache: ProbeCache): Promise<Set<string>> {
  let known = cache.get(table);
  if (!known) {
    known = new Map();
    cache.set(table, known);
  }
  const unknownYet = keys.filter((k) => !known!.has(k));
  if (unknownYet.length > 0) {
    const all = (await db.from(table).select(unknownYet.join(",")).limit(0)) as QueryResult;
    if (!all.error) {
      for (const k of unknownYet) known.set(k, true);
    } else {
      for (const k of unknownYet) {
        const one = (await db.from(table).select(k).limit(0)) as QueryResult;
        known.set(k, !one.error);
      }
    }
  }
  return new Set(keys.filter((k) => known!.get(k) === true));
}

async function existingKeys(
  db: SupabaseClient,
  table: string,
  col: string,
  values: string[],
  tenantFilter: string | null,
  extraSelect?: string,
): Promise<{ rows: Row[]; error: DbError }> {
  const out: Row[] = [];
  for (let i = 0; i < values.length; i += IN_FILTER_CHUNK) {
    const part = values.slice(i, i + IN_FILTER_CHUNK);
    let q = db.from(table).select(extraSelect ? `${col},${extraSelect}` : col);
    if (tenantFilter !== null) q = q.eq("tenant_id", tenantFilter);
    const res = (await q.in(col, part)) as QueryResult;
    if (res.error) return { rows: out, error: res.error };
    out.push(...(((res.data as Row[] | null) ?? []) as Row[]));
  }
  return { rows: out, error: null };
}

function pgCode(err: DbError): string {
  const code = err?.code ?? "";
  if (code === "23503") return "fk_violation";
  if (code === "23505") return "unique_conflict";
  if (code === "23514") return "check_violation";
  if (code === "42703" || code === "PGRST204") return "unknown_column";
  if (code.startsWith("22")) return "invalid_value";
  return "insert_error";
}

const PK_VALUE_OK = (v: unknown) => (typeof v === "string" && v.trim() !== "") || (typeof v === "number" && Number.isFinite(v));

/**
 * Bir parça satırı geri yükler. Yalnız ekleme — mevcut kayıt değiştirilmez/silinmez.
 */
export async function restoreChunk(
  db: SupabaseClient,
  ctx: RestoreContext,
  table: string,
  rawRows: unknown[],
  probeCache: ProbeCache = new Map(),
): Promise<RestoreTableReport> {
  const e = getRegistryEntry(table);
  const report = emptyTableReport(table, e?.module ?? null, rawRows.length);
  const decision = decideTable(table, ctx);
  if (decision.action === "skip") {
    if (decision.reason === "unlicensed" || decision.reason === "membership_inactive") {
      report.skipped_unlicensed = rawRows.length;
    } else {
      report.expected = 0;
    }
    report.warnings.push(`${decision.reason}: ${decision.detail}`);
    report.status = "SKIPPED";
    return report;
  }
  const entry = e!;
  const policy = columnPolicyFor(entry);
  const tenantCol = hasTenantColumn(entry);
  const pkCols = entry.pk.filter((c) => c !== "tenant_id");
  const pkCol = pkCols[0] ?? null;

  // 1) Satır şekli + kolon projeksiyonu
  const candidateKeys = new Set<string>();
  const shaped: Row[] = [];
  for (const raw of rawRows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      addFailure(report, "invalid_row", []);
      continue;
    }
    shaped.push(raw as Row);
    for (const k of Object.keys(raw as Row)) candidateKeys.add(k);
  }
  const dropped = new Set<string>();
  let allowed: Set<string>;
  if (policy.mode === "explicit") {
    allowed = new Set([...candidateKeys].filter((k) => policy.allowed.has(k)));
  } else {
    const safe = [...candidateKeys].filter((k) => SAFE_COLUMN_RE.test(k) && !policy.deny.has(k) && k !== "tenant_id");
    allowed = await probeColumns(db, entry.table, safe, probeCache);
  }
  // Bilinen generated / trigger-yönetimli kolonlar (deny) bilinçli olarak yazılmaz → "tanınmayan alan"
  // olarak RAPORLANMAZ (her normal self-restore'da yanıltıcı uyarı üretiyordu). Yalnız gerçekten
  // tanınmayan / izin dışı anahtarlar raporlanır.
  for (const k of candidateKeys) if (!allowed.has(k) && k !== "tenant_id" && !policy.deny.has(k)) dropped.add(k);
  report.dropped_columns = [...dropped].sort();

  const userCols = new Set(entry.userColumns ?? []);
  let rows: Row[] = shaped.map((raw) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(raw)) if (allowed.has(k)) out[k] = v;
    if (tenantCol) out.tenant_id = ctx.tenantId;
    else delete out.tenant_id;
    for (const c of userCols) {
      if (!(c in out)) continue;
      if (c === "user_id" || out[c] !== null) out[c] = ctx.userId;
    }
    return out;
  });

  // 2) PK varlığı + parça içi tekrar
  const seen = new Set<string>();
  rows = rows.filter((r) => {
    if (pkCol === null) return true; // pk yalnız tenant_id (singleton)
    const v = r[pkCol];
    if (!PK_VALUE_OK(v)) {
      addFailure(report, "missing_pk", []);
      return false;
    }
    const k = String(v);
    if (seen.has(k)) {
      addFailure(report, "duplicate_in_backup", [k]);
      return false;
    }
    seen.add(k);
    return true;
  });
  if (pkCol === null && rows.length > 1) {
    addFailure(report, "duplicate_in_backup", [], rows.length - 1);
    rows = rows.slice(0, 1);
  }
  const idOf = (r: Row) => (pkCol ? String(r[pkCol]) : ctx.tenantId);

  // 4) Var olanlar (PK / doğal anahtar) — zaten mevcut veya başka hesapta
  if (rows.length > 0) {
    if (pkCol === null) {
      const res = (await db.from(entry.table).select("tenant_id").eq("tenant_id", ctx.tenantId).limit(1)) as QueryResult;
      if (res.error) {
        addFailure(report, "insert_error", [], rows.length);
        rows = [];
      } else if (((res.data as Row[] | null) ?? []).length > 0) {
        report.already_present += rows.length;
        rows = [];
      }
    } else if (entry.pk.includes("tenant_id")) {
      const found = await existingKeys(db, entry.table, pkCol, rows.map(idOf), ctx.tenantId);
      if (found.error) {
        addFailure(report, "insert_error", rows.map(idOf));
        rows = [];
      } else {
        const present = new Set(found.rows.map((r) => String(r[pkCol])));
        rows = rows.filter((r) => {
          if (present.has(idOf(r))) {
            report.already_present++;
            return false;
          }
          return true;
        });
      }
    } else {
      const scope = entry.tenantScope;
      const extra = scope === "direct" && tenantCol ? "tenant_id" : typeof scope === "object" ? scope.fk : undefined;
      const found = await existingKeys(db, entry.table, pkCol, rows.map(idOf), null, extra);
      if (found.error) {
        addFailure(report, "insert_error", rows.map(idOf));
        rows = [];
      } else {
        let ownParents = new Set<string>();
        if (typeof scope === "object" && found.rows.length > 0) {
          const parentVals = [...new Set(found.rows.map((r) => String(r[scope.fk])))];
          const pr = await existingKeys(db, scope.parent, "id", parentVals, ctx.tenantId);
          ownParents = new Set(pr.rows.map((r) => String(r.id)));
        }
        const owner = new Map<string, boolean>();
        for (const r of found.rows) {
          const own =
            scope === "direct"
              ? String(r.tenant_id) === ctx.tenantId
              : typeof scope === "object"
                ? ownParents.has(String(r[scope.fk]))
                : false;
          owner.set(String(r[pkCol]), own);
        }
        rows = rows.filter((r) => {
          const o = owner.get(idOf(r));
          if (o === undefined) return true;
          if (o) report.already_present++;
          else addFailure(report, "id_conflict_other_tenant", [idOf(r)]);
          return false;
        });
      }
    }
  }
  if (rows.length > 0 && entry.naturalKey && allowed.has(entry.naturalKey)) {
    const nk = entry.naturalKey;
    const vals = [...new Set(rows.map((r) => r[nk]).filter((v) => v !== null && v !== undefined).map(String))];
    if (vals.length > 0) {
      const found = await existingKeys(db, entry.table, nk, vals, tenantCol ? ctx.tenantId : null);
      if (!found.error) {
        const present = new Set(found.rows.map((r) => String(r[nk])));
        const batchSeen = new Set<string>();
        rows = rows.filter((r) => {
          const v = r[nk];
          if (v === null || v === undefined) return true;
          const s = String(v);
          if (present.has(s) || batchSeen.has(s)) {
            report.already_present++;
            return false;
          }
          batchSeen.add(s);
          return true;
        });
      }
    }
  }

  // 4b) Storage yolu tenant doğrulaması — YALNIZ yazılacak (eksik) satırlarda. Zaten mevcut satır
  // yazılmadığı için yabancı/eski yol yüzünden "başarısız" sayılmaz (self-restore yanlış KISMİ olmaz).
  // Görsel listelerindeki yabancı öğeler ayıklanır (metin içeriği korunur); tekil dosya yolu
  // yabancıysa satır reddedilir. Yabancı yol hiçbir koşulda yazılmaz.
  rows = rows.flatMap((r) => {
    const res = stripForeignStoragePaths(entry, r, ctx.tenantId);
    if (res.blocking) {
      addFailure(report, "foreign_storage_path", [idOf(r)]);
      return [];
    }
    report.storage_refs_removed += res.removed;
    return [res.row];
  });

  // 5) FK ebeveynleri aynı tenant'ta mı?
  for (const parent of entry.fkParents) {
    if (rows.length === 0) break;
    if (!allowed.has(parent.column)) continue;
    const parentCol = parent.parentColumn ?? "id";
    const selfIds = parent.table === entry.table && pkCol ? new Set(rows.map(idOf)) : new Set<string>();
    const vals = [
      ...new Set(
        rows
          .map((r) => r[parent.column])
          .filter((v) => v !== null && v !== undefined && v !== "")
          .map(String)
          .filter((v) => !selfIds.has(v)),
      ),
    ];
    if (vals.length === 0) continue;
    const parentEntry = getRegistryEntry(parent.table);
    const parentTenantScoped = !parentEntry || parentEntry.tenantScope === "direct";
    // Sabit ebeveyn tenant'ı (ör. global SİSTEM katalog) — yoksa restore eden tenant.
    const parentTenant = parent.parentTenantId ?? (parentTenantScoped ? ctx.tenantId : null);
    const found = await existingKeys(db, parent.table, parentCol, vals, parentTenant);
    if (found.error) {
      for (const r of rows) addFailure(report, "fk_violation", [idOf(r)]);
      rows = [];
      break;
    }
    const present = new Set(found.rows.map((r) => String(r[parentCol])));
    rows = rows.filter((r) => {
      const v = r[parent.column];
      if (v === null || v === undefined || v === "") return true;
      const s = String(v);
      if (present.has(s) || selfIds.has(s)) return true;
      if (parent.optional) {
        r[parent.column] = null;
        report.fk_nulled++;
        return true;
      }
      report.parent_missing++;
      return false;
    });
  }
  if (report.storage_refs_removed > 0) {
    report.warnings.push(
      `${report.storage_refs_removed} görsel bağlantısı bu hesaba ait olmadığı (veya eski/geçersiz yol olduğu) için kaldırıldı (kaydın metin içeriği korunur).`,
    );
  }
  if (report.fk_nulled > 0) {
    report.warnings.push(`${report.fk_nulled} kayıtta bağlı (isteğe bağlı) kayıt bulunamadı; bağlantı boş bırakıldı.`);
  }

  // 6) Toplu ekleme (yalnız eksikler) — hata → satır satır izolasyon
  if (rows.length > 0) {
    const onConflict = entry.conflictTarget.join(",");
    const returning = pkCol ?? "tenant_id";
    const bulk = (await db
      .from(entry.table)
      .upsert(rows, { onConflict, ignoreDuplicates: true, defaultToNull: false })
      .select(returning)) as QueryResult;
    if (!bulk.error) {
      const inserted = ((bulk.data as Row[] | null) ?? []).length;
      report.inserted += inserted;
      // Dönmeyen satırlar: bu arada eşzamanlı eklenmiş (ON CONFLICT DO NOTHING) → zaten mevcut.
      report.already_present += rows.length - inserted;
    } else {
      for (const r of rows) {
        const one = (await db
          .from(entry.table)
          .upsert([r], { onConflict, ignoreDuplicates: true, defaultToNull: false })
          .select(returning)) as QueryResult;
        if (one.error) addFailure(report, pgCode(one.error), [idOf(r)]);
        else if (((one.data as Row[] | null) ?? []).length > 0) report.inserted++;
        else report.already_present++;
      }
    }
  }

  report.status = computeTableStatus(report);
  return report;
}
