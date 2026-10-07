/**
 * HD SATIŞ ÖNCESİ NİHAİ KAPANIŞ — regresyon harness'ı (4 P1 + 14 P2).
 *
 * Gerçek kalıcılık fonksiyonları, PostgreSQL davranışını taklit eden bir sahte Supabase
 * (PRIMARY KEY 23505, çoklu satırda maybeSingle PGRST116, order/limit, JSON yol filtresi,
 * koşullu UPDATE) + sahte Storage üzerinde çalıştırılır. UI düzeltmeleri statik kaynak
 * sözleşmeleriyle kilitlenir (davranış ayrıca tarayıcı E2E'de doğrulanır).
 *
 *   npx tsx scripts/hd-presale-final/harness.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { saveManualChart, getManualChartByClient } from "../../lib/human-design/api/chartPersistence";
import { deleteHdClient, updateHdClient } from "../../lib/human-design/api/clientPersistence";
import {
  deleteReport,
  findReportBrief,
  saveCanonicalReport,
  updateReport,
} from "../../lib/human-design/api/reportPersistence";
import { updateKnowledge } from "../../lib/human-design/api/knowledgePersistence";
import { updateSource } from "../../lib/human-design/api/knowledgeSourcePersistence";
import {
  deterministicUuid,
  manualChartIdFor,
  professionalReportIdFor,
  isUuid,
  sameInstant,
} from "../../lib/human-design/api/deterministicId";
import {
  isOwnedReportSnapshotPath,
  isSafeStoragePath,
  reportSnapshotImagePath,
} from "../../lib/human-design/api/chartImagePath";
import { copyChartImageToReportSnapshot, reportReferencedImagePaths } from "../../lib/human-design/api/hdStorage";
import {
  commitHdRestoreFile,
  HD_FILE_PART_BYTES,
  HD_FILE_PART_CHARS,
  isTenantHdFilePath,
  listHdBackupFiles,
  planHdFileRestore,
  readHdBackupFilePart,
  storeHdRestorePart,
} from "../../lib/backup/hdFiles";
import { HD_CHART_IMAGE_MAX_BYTES } from "../../lib/human-design/chartImageLimits";
import { buildProfessionalReportSummary } from "../../lib/human-design/reporting/reportSummary";
import type { SupabaseClient } from "@supabase/supabase-js";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
const fails: string[] = [];
async function t(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    fails.push(name);
    console.log(`  ✗ ${name}: ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// ─── Sahte Supabase ──────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

function jsonPath(r: Row, path: string): unknown {
  // "snapshot->chartImage->>storagePath"
  const segs = path.split(/->>?/);
  let cur: unknown = r[segs[0]];
  for (const s of segs.slice(1)) cur = cur && typeof cur === "object" ? (cur as Row)[s] : undefined;
  return cur;
}

class FakeStorage {
  objects = new Map<string, Buffer>(); // `${bucket}/${path}`
  failRemove = false;
  failCopy = false;
  from(bucket: string) {
    const key = (p: string) => `${bucket}/${p}`;
    return {
      copy: async (from: string, to: string) => {
        if (this.failCopy) return { data: null, error: { message: "copy failed" } };
        const b = this.objects.get(key(from));
        if (!b) return { data: null, error: { message: "Object not found" } };
        if (this.objects.has(key(to))) return { data: null, error: { message: "The resource already exists" } };
        this.objects.set(key(to), Buffer.from(b));
        return { data: { path: to }, error: null };
      },
      remove: async (paths: string[]) => {
        if (this.failRemove) return { data: null, error: { message: "remove failed" } };
        for (const p of paths) this.objects.delete(key(p));
        return { data: paths.map((name) => ({ name })), error: null };
      },
      list: async (prefix: string, opts?: { search?: string }) => {
        const out: { name: string; id: string }[] = [];
        for (const k of this.objects.keys()) {
          if (!k.startsWith(`${bucket}/${prefix}/`)) continue;
          const rest = k.slice(`${bucket}/${prefix}/`.length);
          if (rest.includes("/")) continue;
          if (opts?.search && !rest.includes(opts.search)) continue;
          out.push({ name: rest, id: randomUUID() });
        }
        return { data: out, error: null };
      },
      download: async (p: string) => {
        const b = this.objects.get(key(p));
        if (!b) return { data: null, error: { message: "Object not found" } };
        return { data: new Blob([new Uint8Array(b)]), error: null };
      },
      upload: async (p: string, body: Buffer, opts?: { upsert?: boolean }) => {
        if (!opts?.upsert && this.objects.has(key(p))) return { data: null, error: { message: "The resource already exists" } };
        this.objects.set(key(p), Buffer.from(body));
        return { data: { path: p }, error: null };
      },
    };
  }
}

class FakeDb {
  tables: Record<string, Row[]> = {};
  storage = new FakeStorage();
  failNext: Record<string, string> = {}; // `${table}:${op}` → hata mesajı (bir kez)
  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private preds: Array<(r: Row) => boolean> = [];
  private payload: Row | Row[] | null = null;
  private cols: string | null = null;
  private mode: "many" | "maybe" | "single" = "many";
  private head = false;
  private orders: Array<{ col: string; asc: boolean }> = [];
  private lim: number | null = null;
  private returning = false;
  constructor(private db: FakeDb, private table: string) {}
  select(cols?: string, opts?: { head?: boolean; count?: string }) {
    if (this.op !== "select") this.returning = true;
    this.cols = cols ?? "*";
    if (opts?.head) this.head = true;
    return this;
  }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.preds.push((r) => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.preds.push((r) => vs.includes(r[c])); return this; }
  not(c: string, op: string, v: unknown) { if (op === "is" && v === null) this.preds.push((r) => r[c] != null); return this; }
  like(c: string, pattern: string) {
    const re = new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$");
    this.preds.push((r) => { const v = c.includes("->") ? jsonPath(r, c) : r[c]; return typeof v === "string" && re.test(v); });
    return this;
  }
  or(expr: string) {
    const conds = expr.split(",").map((part) => {
      const [col, op, ...rest] = part.split(".");
      const val = rest.join(".");
      return (r: Row) => (op === "is" && val === "null" ? r[col] == null : op === "eq" ? String(r[col]) === val : false);
    });
    this.preds.push((r) => conds.some((f) => f(r)));
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  private project(r: Row): Row {
    if (!this.cols || this.cols.trim() === "*") return { ...r };
    const out: Row = {};
    for (const c of this.cols.split(",").map((x) => x.trim()).filter(Boolean)) {
      if (c.includes("->")) out[c.split(/->>?/).pop() as string] = jsonPath(r, c);
      else out[c] = r[c];
    }
    return out;
  }
  private exec(): Res {
    const fk = `${this.table}:${this.op}`;
    if (this.db.failNext[fk]) {
      const m = this.db.failNext[fk];
      delete this.db.failNext[fk];
      return { data: null, error: { message: m } };
    }
    const rows = (this.db.tables[this.table] ??= []);
    let affected: Row[];
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const now = new Date().toISOString();
      const made = list.map((p) => ({ id: randomUUID(), created_at: now, updated_at: now, ...p }));
      for (const m of made) if (rows.some((r) => r.id === m.id)) return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
      rows.push(...made);
      affected = made;
    } else {
      affected = rows.filter((r) => this.preds.every((f) => f(r)));
      if (this.op === "update") for (const r of affected) Object.assign(r, this.payload);
      if (this.op === "delete") this.db.tables[this.table] = rows.filter((r) => !affected.includes(r));
    }
    if (this.op === "select" || this.returning) {
      for (const o of [...this.orders].reverse()) {
        affected = [...affected].sort((a, b) => {
          const x = String(a[o.col] ?? ""), y = String(b[o.col] ?? "");
          return o.asc ? x.localeCompare(y) : y.localeCompare(x);
        });
      }
      if (this.lim !== null) affected = affected.slice(0, this.lim);
    }
    if (this.head) return { data: null, error: null, count: affected.length };
    if (this.op !== "select" && !this.returning) return { data: null, error: null };
    const data = affected.map((r) => this.project(r));
    if (this.mode === "maybe") {
      if (data.length > 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
      return { data: data[0] ?? null, error: null };
    }
    if (this.mode === "single") return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: "no rows", code: "PGRST116" } };
    return { data, error: null };
  }
  then<T>(res: (v: Res) => T, rej?: (e: unknown) => T) {
    // Gerçek ağ gibi: her sorgu ayrı bir makro-görevde çözülür → Promise.all ile gerçek iç içe geçme.
    return new Promise<Res>((r) => setTimeout(() => r(this.exec()), 0)).then(res, rej);
  }
}

const asDb = (d: FakeDb) => d as unknown as SupabaseClient;
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const later = (iso: string, ms = 5) => new Date(Date.parse(iso) + ms).toISOString();

(async () => {
  console.log("\n== Deterministik kimlik ==");
  await t("uuid v5 biçimi + determinizm + tenant ayrımı", () => {
    const a = manualChartIdFor(T1, C1), b = manualChartIdFor(T1, C1), c = manualChartIdFor(T2, C1);
    assert(isUuid(a) && a[14] === "5", "v5 uuid değil");
    assert(a === b, "deterministik değil");
    assert(a !== c, "tenant ayrımı yok");
    assert(professionalReportIdFor(T1, "x") !== manualChartIdFor(T1, "x"), "ad alanı ayrımı yok");
    assert(deterministicUuid("a", "b") !== deterministicUuid("ab"), "ayırıcı yok");
  });
  await t("sameInstant biçim farkına dayanıklı", () => {
    assert(sameInstant("2026-10-03T10:00:00.123+00:00", "2026-10-03T10:00:00.123Z"), "aynı an eşleşmedi");
    assert(!sameInstant("2026-10-03T10:00:00.123Z", "2026-10-03T10:00:00.124Z"), "farklı an eşleşti");
    assert(!sameInstant(null, "2026-10-03T10:00:00Z"), "null eşleşti");
  });

  console.log("\n== P1-2: danışan başına tek manuel harita ==");
  await t("12 eşzamanlı ilk kayıt → TEK satır, hepsi başarılı, aynı id", async () => {
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "A" }];
    const res = await Promise.all(Array.from({ length: 12 }, (_, i) => saveManualChart(asDb(db), T1, C1, { gates: [i + 1] })));
    const rows = db.tables.human_design_charts.filter((r) => r.client_id === C1);
    assert(rows.length === 1, `satır sayısı ${rows.length}`);
    assert(res.every((r) => r.ok), "başarısız istek var: " + JSON.stringify(res.filter((r) => !r.ok)));
    assert(new Set(res.map((r) => r.id)).size === 1, "farklı id döndü");
    assert(rows[0].id === manualChartIdFor(T1, C1), "deterministik id kullanılmadı");
  });
  await t("eski yinelenen satırlar varken okuma 500 vermez, en güncel satır döner; kayıt yeni satır eklemez", async () => {
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "A" }];
    db.tables.human_design_charts = [
      { id: randomUUID(), tenant_id: T1, client_id: C1, source: "manual", type_code: "old", updated_at: "2026-01-01T00:00:00.000Z" },
      { id: randomUUID(), tenant_id: T1, client_id: C1, source: "manual", type_code: "new", updated_at: "2026-02-01T00:00:00.000Z" },
    ];
    const g = await getManualChartByClient(asDb(db), T1, C1);
    assert(!g.error && g.row?.type_code === "new", "en güncel satır dönmedi: " + JSON.stringify(g));
    const s = await saveManualChart(asDb(db), T1, C1, { type_code: "generator" });
    assert(s.ok, "kayıt başarısız");
    assert(db.tables.human_design_charts.length === 2, "yeni satır eklendi");
  });
  await t("okuma hatası YUTULMAZ (INSERT'e düşüp kopya üretmez)", async () => {
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "A" }];
    // clientInTenant okuması geçsin, harita okuması hata versin
    const orig = db.from.bind(db);
    let n = 0;
    db.from = (table: string) => {
      if (table === "human_design_charts" && n++ === 0) db.failNext["human_design_charts:select"] = "boom";
      return orig(table);
    };
    const s = await saveManualChart(asDb(db), T1, C1, { gates: [1] });
    assert(!s.ok && s.status === 500, "hata yutuldu");
    assert((db.tables.human_design_charts ?? []).length === 0, "satır eklendi");
  });
  await t("başka tenant'ın danışanına kayıt reddedilir (IDOR korundu)", async () => {
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T2, name: "B" }];
    const s = await saveManualChart(asDb(db), T1, C1, { gates: [1] });
    assert(!s.ok, "yabancı danışana yazıldı");
  });

  console.log("\n== P2-9: iyimser eşzamanlılık (409) ==");
  await t("harita: yüklenirken yoktu (null) ama başka oturum oluşturdu → 409, ezilmez", async () => {
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "A" }];
    await saveManualChart(asDb(db), T1, C1, { type_code: "projector" });
    const s = await saveManualChart(asDb(db), T1, C1, { type_code: "generator" }, { expectedUpdatedAt: null });
    assert(!s.ok && s.status === 409, "409 değil: " + JSON.stringify(s));
    assert(db.tables.human_design_charts[0].type_code === "projector", "ezildi");
  });
  await t("harita: eski sürümle kayıt → 409; doğru sürümle kayıt → ok + yeni sürüm", async () => {
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "A" }];
    const first = await saveManualChart(asDb(db), T1, C1, { type_code: "projector" }, { expectedUpdatedAt: null });
    assert(first.ok && first.updatedAt, "ilk kayıt");
    db.tables.human_design_charts[0].updated_at = later(first.updatedAt as string, 50); // başka sekme yazdı
    const stale = await saveManualChart(asDb(db), T1, C1, { type_code: "x" }, { expectedUpdatedAt: first.updatedAt });
    assert(stale.status === 409, "eski sürüm kabul edildi");
    const cur = db.tables.human_design_charts[0].updated_at as string;
    const okk = await saveManualChart(asDb(db), T1, C1, { type_code: "generator" }, { expectedUpdatedAt: cur });
    assert(okk.ok && okk.updatedAt, "doğru sürüm reddedildi");
  });
  await t("harita: başka oturumda silinmiş (sürüm var, satır yok) → 409", async () => {
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "A" }];
    const s = await saveManualChart(asDb(db), T1, C1, { gates: [1] }, { expectedUpdatedAt: "2026-01-01T00:00:00.000Z" });
    assert(s.status === 409, "silinmiş satır sessizce yeniden oluşturuldu");
  });
  await t("danışan / rapor / bilgi kaydı / kaynak: eski sürüm → 409, kayıt değişmez", async () => {
    const db = new FakeDb();
    const v = "2026-05-05T05:05:05.000Z";
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "A", updated_at: v }];
    db.tables.human_design_reports = [{ id: "r1", tenant_id: T1, report_kind: "legacy", title: "t", updated_at: v }];
    db.tables.human_design_knowledge_records = [{ id: "k1", tenant_id: T1, is_active: false, content: "", title: "a", updated_at: v }];
    db.tables.human_design_knowledge_sources = [{ id: "s1", tenant_id: T1, rights_status: "unknown", source_name: "x", updated_at: v }];
    const stale = "2026-01-01T00:00:00.000Z";
    const c = await updateHdClient(asDb(db), T1, C1, { name: "B" }, { expectedUpdatedAt: stale });
    const r = await updateReport(asDb(db), T1, "r1", { title: "B" }, { expectedUpdatedAt: stale });
    const k = await updateKnowledge(asDb(db), T1, "k1", { title: "B" }, { expectedUpdatedAt: stale });
    const s = await updateSource(asDb(db), T1, "s1", { source_name: "B" }, { expectedUpdatedAt: stale });
    for (const [n, x] of [["client", c], ["report", r], ["knowledge", k], ["source", s]] as const) assert(x.status === 409, `${n} 409 değil: ${JSON.stringify(x)}`);
    assert(db.tables.human_design_clients[0].name === "A" && db.tables.human_design_reports[0].title === "t", "ezildi");
    const c2 = await updateHdClient(asDb(db), T1, C1, { name: "B" }, { expectedUpdatedAt: v });
    assert(c2.ok && c2.updatedAt, "doğru sürüm reddedildi");
    const c3 = await updateHdClient(asDb(db), T1, C1, { name: "C" });
    assert(c3.ok, "sürümsüz (eski istemci) geriye uyum bozuldu");
  });

  console.log("\n== P1-3 + P2-10: danışan silme ==");
  function seedDelete() {
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "A", chart_image_url: `${T1}/${C1}/live.png` }];
    db.tables.human_design_charts = [{ id: "ch1", tenant_id: T1, client_id: C1, source: "manual" }];
    db.tables.human_design_reports = [
      { id: "rp1", tenant_id: T1, client_id: C1, report_kind: "canonical", snapshot: { chartImage: { storagePath: `${T1}/report-snapshots/rp1.png` } } },
      { id: "rp2", tenant_id: T1, client_id: C1, report_kind: "canonical", snapshot: { chartImage: { storagePath: `${T1}/${C1}/legacy-ref.png` } } },
      { id: "rp3", tenant_id: T1, client_id: C1, report_kind: "legacy", edited_content: "metin" },
      { id: "other", tenant_id: T2, client_id: C1, report_kind: "legacy" },
    ];
    for (const p of [`${T1}/${C1}/live.png`, `${T1}/${C1}/legacy-ref.png`, `${T1}/${C1}/old-orphan.png`, `${T1}/report-snapshots/rp1.png`]) {
      db.storage.objects.set(`hd-chart-images/${p}`, Buffer.from("img"));
    }
    return db;
  }
  await t("raporlar (profesyonel+legacy) KORUNUR, danışan+harita silinir, rapor-referanslı görsel kalır", async () => {
    const db = seedDelete();
    const r = await deleteHdClient(asDb(db), T1, C1);
    assert(r.ok && r.preservedReports === 3, "sonuç: " + JSON.stringify(r));
    assert(db.tables.human_design_clients.length === 0, "danışan duruyor");
    assert(db.tables.human_design_charts.length === 0, "harita duruyor");
    const reps = db.tables.human_design_reports.filter((x) => x.tenant_id === T1);
    assert(reps.length === 3 && reps.every((x) => x.client_id === null), "raporlar korunmadı/koparılmadı");
    assert(db.tables.human_design_reports.find((x) => x.id === "other")?.client_id === C1, "başka tenant'ın raporuna dokunuldu");
    const objs = [...db.storage.objects.keys()];
    assert(!objs.some((k) => k.endsWith("live.png") || k.endsWith("old-orphan.png")), "görsel temizlenmedi: " + objs.join(","));
    assert(objs.some((k) => k.endsWith("legacy-ref.png")), "rapor snapshot'ının kullandığı görsel silindi");
    assert(objs.some((k) => k.endsWith("report-snapshots/rp1.png")), "rapor snapshot kopyası silindi");
  });
  await t("danışan silme adımı hata verirse raporlar GERİ bağlanır, hiçbir şey silinmez", async () => {
    const db = seedDelete();
    db.failNext["human_design_clients:delete"] = "db down";
    const r = await deleteHdClient(asDb(db), T1, C1);
    assert(!r.ok, "başarı döndü");
    assert(db.tables.human_design_clients.length === 1 && db.tables.human_design_charts.length === 1, "veri silindi");
    assert(db.tables.human_design_reports.filter((x) => x.tenant_id === T1).every((x) => x.client_id === C1), "raporlar geri bağlanmadı");
  });
  await t("storage temizliği başarısızsa DB işlemi geri alınmaz; uyarı döner (yanlış başarı yok)", async () => {
    const db = seedDelete();
    db.storage.failRemove = true;
    const r = await deleteHdClient(asDb(db), T1, C1);
    assert(r.ok && (r.warnings ?? []).includes("storage_cleanup_failed"), "uyarı yok: " + JSON.stringify(r));
  });
  await t("yabancı tenant danışanı silinemez (404)", async () => {
    const db = seedDelete();
    const r = await deleteHdClient(asDb(db), T2, C1);
    assert(!r.ok && r.status === 404, "yabancı silme");
    assert(db.tables.human_design_clients.length === 1, "silindi");
  });

  console.log("\n== P2-1: profesyonel rapor görsel snapshot'ı ==");
  await t("snapshot yolu: tenant önekli, traversal/başka tenant reddedilir", () => {
    const p = reportSnapshotImagePath(T1, "rid", "PNG");
    assert(p === `${T1}/report-snapshots/rid.png`, p);
    assert(isOwnedReportSnapshotPath(p, T1), "kendi yolu reddedildi");
    assert(!isOwnedReportSnapshotPath(p, T2), "başka tenant kabul edildi");
    assert(!isOwnedReportSnapshotPath(`${T1}/report-snapshots/../${T2}/x.png`, T1), "traversal kabul edildi");
    assert(!isSafeStoragePath("a//b") && !isSafeStoragePath("a/../b") && !isSafeStoragePath("/a") && !isSafeStoragePath("a\\b"), "güvensiz yol kabul edildi");
  });
  await t("görsel rapora KOPYALANIR; kaynak değişince/silinince kopya kalır", async () => {
    const db = new FakeDb();
    db.storage.objects.set(`hd-chart-images/${T1}/${C1}/live.png`, Buffer.from("v1"));
    const c = await copyChartImageToReportSnapshot(asDb(db), T1, C1, `${T1}/${C1}/live.png`, "rid");
    assert(c.path === `${T1}/report-snapshots/rid.png`, JSON.stringify(c));
    db.storage.objects.set(`hd-chart-images/${T1}/${C1}/live.png`, Buffer.from("v2"));
    db.storage.objects.delete(`hd-chart-images/${T1}/${C1}/live.png`);
    assert(db.storage.objects.get(`hd-chart-images/${c.path}`)?.toString() === "v1", "snapshot korunmadı");
  });
  await t("başka danışanın/tenant'ın görseli kopyalanamaz", async () => {
    const db = new FakeDb();
    db.storage.objects.set(`hd-chart-images/${T2}/${C1}/x.png`, Buffer.from("b"));
    const c = await copyChartImageToReportSnapshot(asDb(db), T1, C1, `${T2}/${C1}/x.png`, "rid");
    assert(c.error && !c.path, "yabancı görsel kopyalandı");
    const c2 = await copyChartImageToReportSnapshot(asDb(db), T1, C1, `${T1}/${C1}/../../${T2}/${C1}/x.png`, "rid");
    assert(c2.error && !c2.path, "traversal ile kopyalandı");
  });
  await t("kopyalama hatası → hata döner (sessiz görselsiz rapor yok)", async () => {
    const db = new FakeDb();
    db.storage.objects.set(`hd-chart-images/${T1}/${C1}/live.png`, Buffer.from("v1"));
    db.storage.failCopy = true;
    const c = await copyChartImageToReportSnapshot(asDb(db), T1, C1, `${T1}/${C1}/live.png`, "rid");
    assert(c.error && !c.path, "hata yutuldu");
  });
  await t("rapor silinince kendi snapshot görseli silinir; danışanın canlı görseline dokunulmaz", async () => {
    const db = new FakeDb();
    db.tables.human_design_reports = [{ id: "r1", tenant_id: T1, report_kind: "canonical", snapshot: { chartImage: { storagePath: `${T1}/report-snapshots/r1.png` } } }, { id: "r2", tenant_id: T1, report_kind: "canonical", snapshot: { chartImage: { storagePath: `${T1}/${C1}/live.png` } } }];
    db.storage.objects.set(`hd-chart-images/${T1}/report-snapshots/r1.png`, Buffer.from("s"));
    db.storage.objects.set(`hd-chart-images/${T1}/${C1}/live.png`, Buffer.from("l"));
    await deleteReport(asDb(db), T1, "r1");
    await deleteReport(asDb(db), T1, "r2");
    assert(!db.storage.objects.has(`hd-chart-images/${T1}/report-snapshots/r1.png`), "snapshot görseli kaldı");
    assert(db.storage.objects.has(`hd-chart-images/${T1}/${C1}/live.png`), "canlı görsel silindi");
  });
  await t("rapor referans taraması: yalnız bu tenant + önek", async () => {
    const db = new FakeDb();
    db.tables.human_design_reports = [
      { id: "a", tenant_id: T1, snapshot: { chartImage: { storagePath: `${T1}/${C1}/x.png` } } },
      { id: "b", tenant_id: T2, snapshot: { chartImage: { storagePath: `${T1}/${C1}/y.png` } } },
    ];
    const r = await reportReferencedImagePaths(asDb(db), T1, `${T1}/${C1}/`);
    assert(r.paths.has(`${T1}/${C1}/x.png`) && !r.paths.has(`${T1}/${C1}/y.png`), JSON.stringify([...r.paths]));
  });

  console.log("\n== P2-2: profesyonel rapor idempotency ==");
  await t("aynı istek kimliği → aynı rapor id; ikinci kayıt yeni satır oluşturmaz", async () => {
    const db = new FakeDb();
    db.tables.human_design_charts = [{ id: "ch", tenant_id: T1 }];
    const id = professionalReportIdFor(T1, "req-1");
    const snap = { schemaVersion: "hd-report-1", generatedAt: "2026-10-03T00:00:00Z", client: { name: "A" }, chart: { chartId: "ch" }, identity: {}, channels: [], gates: [], hangingContexts: [], provenance: {} } as never;
    const mk = () => saveCanonicalReport(asDb(db), T1, "u", { id, chartId: "ch", clientId: null, title: "t", snapshot: snap, provenance: {} });
    // isHdReportSnapshot sahte snapshot'ı reddedebilir → doğrudan tekillik davranışını PK ile sına
    const results = await Promise.all([mk(), mk(), mk()]);
    const rows = (db.tables.human_design_reports ?? []).filter((r) => r.id === id);
    assert(rows.length === 1, `satır ${rows.length}: ` + JSON.stringify(results));
    assert(results.every((r) => r.id === id && !r.error), "hata/farklı id: " + JSON.stringify(results));
    assert(results.filter((r) => r.duplicate).length === 2, "kopya bildirimi yok: " + JSON.stringify(results));
    const brief = await findReportBrief(asDb(db), T1, id);
    assert(!brief.error, "brief hata");
    assert(professionalReportIdFor(T1, "req-1") === id && professionalReportIdFor(T1, "req-2") !== id, "id türetimi");
    assert(professionalReportIdFor(T2, "req-1") !== id, "tenant ayrımı yok");
  });

  console.log("\n== P2-6: görsel yükleme sınırı ==");
  await t("sınır Vercel gövde sınırının (4.5 MB) altında; AŞAMA 3C: yeni manuel görsel yükleme KAPALI (410)", () => {
    assert(HD_CHART_IMAGE_MAX_BYTES <= 4 * 1024 * 1024, "sınır yüksek");
    const route = src("app/api/hd/upload-chart-image/route.ts");
    // AŞAMA 3C ürün kararı: yeni manuel harita görseli yükleme kapatıldı (kimlik kapısından sonra 410).
    assert(/requireModuleAccess\(req, "human_design"\)/.test(route) && /status: 410/.test(route) && /MANUAL_IMAGE_CLOSED/.test(route), "yükleme ucu kapatılmamış");
    const comp = src("app/human-design/danisanlar/components/HdChartImageUpload.tsx");
    assert(/shrinkImage/.test(comp) && /res\.status === 413/.test(comp) && !/"Yükleme başarısız\."/.test(comp), "istemci 413/küçültme yok");
  });

  console.log("\n== P2-11: yedekte HD dosyaları ==");
  await t("parça boyutu base64 birleştirmeye uygun (3'ün katı) + karakter karşılığı", () => {
    assert(HD_FILE_PART_BYTES % 3 === 0 && HD_FILE_PART_CHARS === (HD_FILE_PART_BYTES / 3) * 4, "parça boyutu");
  });
  await t("yol doğrulaması: tenant öneki, uzantı, geçici klasör, traversal", () => {
    assert(isTenantHdFilePath(`${T1}/${C1}/a.png`, T1), "geçerli yol reddedildi");
    assert(!isTenantHdFilePath(`${T2}/${C1}/a.png`, T1), "başka tenant");
    assert(!isTenantHdFilePath(`${T1}/${C1}/a.exe`, T1), "uzantı");
    assert(!isTenantHdFilePath(`${T1}/.restore-tmp/u/0.part`, T1), "geçici klasör");
    assert(!isTenantHdFilePath(`${T1}/../${T2}/a.png`, T1), "traversal");
  });
  const ctxOk = { tenantId: T1, userId: "u", role: "expert", modulePermissions: { human_design: true }, membershipActive: true };
  await t("dışa aktarım: referanslı dosyalar listelenir, parçalar birleşince SHA-256 tutar", async () => {
    const db = new FakeDb();
    const big = Buffer.alloc(HD_FILE_PART_BYTES * 2 + 1234, 7);
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, chart_image_url: `${T1}/${C1}/big.png` }, { id: "x", tenant_id: T2, chart_image_url: `${T2}/x/b.png` }];
    db.tables.human_design_reports = [{ id: "r", tenant_id: T1, snapshot: { chartImage: { storagePath: `${T1}/report-snapshots/r.png` } } }];
    db.storage.objects.set(`hd-chart-images/${T1}/${C1}/big.png`, big);
    db.storage.objects.set(`hd-chart-images/${T1}/report-snapshots/r.png`, Buffer.from("snap"));
    const l = await listHdBackupFiles(asDb(db), T1);
    assert(l.files.length === 2 && !l.files.some((f) => f.path.startsWith(T2)), JSON.stringify(l));
    let data = "";
    let meta: { parts: number; sha256: string; size: number } | null = null;
    for (let i = 0; i < 5; i++) {
      const p = await readHdBackupFilePart(asDb(db), T1, `${T1}/${C1}/big.png`, i);
      assert(p.ok, "parça okunamadı");
      data += p.data_base64;
      meta = p;
      if (i + 1 >= p.parts) break;
    }
    const back = Buffer.from(data, "base64");
    assert(meta && back.length === big.length && createHash("sha256").update(back).digest("hex") === meta.sha256, "birleştirme bozuk");
    const foreign = await readHdBackupFilePart(asDb(db), T1, `${T2}/x/b.png`, 0);
    assert(!foreign.ok, "başka tenant dosyası okundu");
  });
  await t("geri yükleme: plan + parça + birleştirme; mevcut dosya üzerine yazılmaz; bozuk SHA reddedilir", async () => {
    const db = new FakeDb();
    const file = Buffer.alloc(HD_FILE_PART_BYTES + 99, 3);
    const sha = createHash("sha256").update(file).digest("hex");
    const path = `${T1}/${C1}/rest.png`;
    const plan = await planHdFileRestore(asDb(db), ctxOk, [
      { bucket: "hd-chart-images", path, size: file.length, sha256: sha },
      { bucket: "hd-chart-images", path: `${T2}/${C1}/x.png`, size: 1, sha256: sha },
    ]);
    assert(plan[0].action === "upload" && plan[1].action === "skip" && plan[1].reason === "foreign_tenant", JSON.stringify(plan));
    const b64 = file.toString("base64");
    const up = randomUUID();
    const chunks = [b64.slice(0, HD_FILE_PART_CHARS), b64.slice(HD_FILE_PART_CHARS)];
    for (let i = 0; i < chunks.length; i++) {
      const r = await storeHdRestorePart(asDb(db), ctxOk, { path, upload_id: up, index: i, data_base64: chunks[i] });
      assert(r.ok, "parça yazılamadı");
    }
    const c = await commitHdRestoreFile(asDb(db), ctxOk, { path, upload_id: up, parts: 2, size: file.length, sha256: sha });
    assert(c.ok && c.result === "restored", JSON.stringify(c));
    assert(db.storage.objects.get(`hd-chart-images/${path}`)?.equals(file), "dosya farklı");
    assert(![...db.storage.objects.keys()].some((k) => k.includes(".restore-tmp")), "geçici parçalar kaldı");
    const plan2 = await planHdFileRestore(asDb(db), ctxOk, [{ bucket: "hd-chart-images", path, size: file.length, sha256: sha }]);
    assert(plan2[0].action === "exists", "mevcut dosya üzerine yazılacaktı");
    const up2 = randomUUID();
    await storeHdRestorePart(asDb(db), ctxOk, { path: `${T1}/${C1}/bad.png`, upload_id: up2, index: 0, data_base64: Buffer.from("x").toString("base64") });
    const bad = await commitHdRestoreFile(asDb(db), ctxOk, { path: `${T1}/${C1}/bad.png`, upload_id: up2, parts: 1, size: 1, sha256: "0".repeat(64) });
    assert(!bad.ok && bad.status === 422 && !db.storage.objects.has(`hd-chart-images/${T1}/${C1}/bad.png`), "bozuk dosya kabul edildi");
  });
  await t("lisanssız tenant → dosyalar atlanır, yazılamaz", async () => {
    const db = new FakeDb();
    const ctxNo = { ...ctxOk, modulePermissions: { human_design: false } };
    const plan = await planHdFileRestore(asDb(db), ctxNo, [{ bucket: "hd-chart-images", path: `${T1}/${C1}/a.png`, size: 1, sha256: "a".repeat(64) }]);
    assert(plan[0].action === "skip" && plan[0].reason === "unlicensed", JSON.stringify(plan));
    const r = await storeHdRestorePart(asDb(db), ctxNo, { path: `${T1}/${C1}/a.png`, upload_id: randomUUID(), index: 0, data_base64: "eA==" });
    assert(!r.ok && r.status === 403, "lisanssız yazdı");
  });

  console.log("\n== P2-3: Android özet görünümü (canonical metin sızmaz) ==");
  await t("özet yalnız başlık/özet taşır; canonical yorum metni yok", () => {
    const snap = {
      schemaVersion: "hd-report-1", generatedAt: "2026-10-03T00:00:00Z",
      client: { name: "Ayşe", birthDate: "1990-01-01" },
      chart: { chartId: "c", source: "manual", profileLabel: "1/3", definitionLabel: "Tekli", definedCenterLabels: ["Sakral"] },
      identity: { type: { key: "k", displayName: "Generator", kind: "tip", content: { bodyText: "GİZLİ CANONICAL METİN" } }, authority: null, authorityInChart: false },
      channels: [{ key: "k2", code: "1-8", displayName: "1-8 İlham", gates: [1, 8], content: { bodyText: "GİZLİ" } }],
      gates: [{ key: "k3", gate: 1, displayName: "Kapı 1", content: { bodyText: "GİZLİ" } }],
      hangingContexts: [], unresolved: [], provenance: { readAt: "x", canonical: {} }, chartImage: { storagePath: "p", includedAtGeneration: true },
    } as never;
    const s = buildProfessionalReportSummary("Rapor", snap);
    const json = JSON.stringify(s);
    assert(!json.includes("GİZLİ"), "canonical metin sızdı");
    assert(s.type === "Generator" && s.channels[0] === "1-8 İlham" && s.hasChartImage, "özet eksik");
    const route = src("app/api/hd/reports/professional/summary/route.ts");
    assert(/requireModuleAccess\(req, "human_design"\)/.test(route) && /getCanonicalReportForDownload\(guard\.db, guard\.tenantId/.test(route), "özet ucu korumasız");
  });

  console.log("\n== UI sözleşmeleri (statik) ==");
  const harita = src("app/human-design/harita-kaydi/components/HdHaritaKaydiContent.tsx");
  await t("P1-1: yükleme başında form temizlenir, bayat yanıt yok sayılır, hata → kilit + Tekrar Dene, Kaydet yalnız formReady", () => {
    assert(/const seq = \+\+loadSeqRef\.current/.test(harita) && /if \(seq !== loadSeqRef\.current\) return;/.test(harita), "sıra koruması yok");
    assert(/setForm\(emptyForm\);\s*setBaseline\(emptyForm\);\s*setLoadedClientId\(""\)/.test(harita), "form temizlenmiyor");
    assert(/loadedClientId === clientId && !loadingChart && !loadError/.test(harita), "formReady yok");
    assert(/disabled=\{saving \|\| !formReady\}/.test(harita) && /if \(!formReady\)/.test(harita), "Kaydet kilidi yok");
    assert(/Tekrar Dene/.test(harita) && /<fieldset disabled=\{!formReady\}/.test(harita), "hata paneli/kilit yok");
    assert(/saveClientChart\(targetClientId/.test(harita), "kayıt hedefi yüklenen danışan değil");
  });
  await t("P2-5: Harita Kaydı mobilde body'ye portal edilmiş sabit Kaydet çubuğu (safe-area) + içerik boşluğu", () => {
    assert(/createPortal\(/.test(harita) && /fixed inset-x-0 bottom-0/.test(harita) && /safe-area-inset-bottom/.test(harita), "sabit çubuk yok");
    assert(/document\.body/.test(harita) && /h-16 sm:hidden/.test(harita) && /hidden items-center justify-end gap-3 border-t border-indigo-100\/80 pt-4 sm:flex/.test(harita), "masaüstü/boşluk düzeni yok");
  });
  await t("P2-7: gezinme koruması (link+geri+yenile) HD editörlerinde", () => {
    for (const f of [
      "app/human-design/harita-kaydi/components/HdHaritaKaydiContent.tsx",
      "app/human-design/rapor-olustur/components/HdRaporContent.tsx",
      "app/human-design/bilgi-bankasi/[recordId]/HdKayitEditor.tsx",
      "app/human-design/danisanlar/[id]/HdDanisanDetayContent.tsx",
      "app/human-design/danisanlar/components/HdClientForm.tsx",
    ]) assert(/useHdLeaveGuard\(/.test(src(f)), `${f} korumasız`);
    const hook = src("app/human-design/hooks/useHdLeaveGuard.ts");
    assert(/document\.addEventListener\("click", onClick, true\)/.test(hook) && /popstate/.test(hook) && /beforeunload/.test(hook), "hook eksik");
  });
  await t("P2-8: rapor metin alanı her zaman görünür (eşleşme yok / metin silindi)", () => {
    const r = src("app/human-design/rapor-olustur/components/HdRaporContent.tsx");
    assert(!/\{editedText \? \(\s*<textarea/.test(r) && /aria-label="Rapor metni"/.test(r), "koşullu metin alanı");
    assert(/editedText\.trim\(\) !== generatedText\.trim\(\)/.test(r), "elle yazılan taslak dirty sayılmıyor");
  });
  await t("P1-4: uzman Bilgi Bankası = kişisel çalışma alanı; boş durum yalnız 0 kayıtta", () => {
    const p = src("app/human-design/bilgi-bankasi/page.tsx");
    assert(/!isAdmin \? \(\s*<HdKnowledgeWorkspace/.test(p) && !/KnowledgeEmpty/.test(p), "uzmana boş ekran");
    assert(!/Eski Bilgi Bankası \(yedek\)/.test(p) && !/Eski Bilgi Bankası/.test(src("app/human-design/bilgi-bankasi/legacy/page.tsx")), "yedek dili duruyor");
    const l = src("app/human-design/bilgi-bankasi/components/HdBilgiKayitListesi.tsx");
    assert(/rows\.length === 0 \? "Henüz Bilgi Bankası kaydınız yok\."/.test(l), "boş durum koşulu");
  });
  await t("P2-12: toplu silme yalnız görünen seçimler; filtre değişince seçim temizlenir", () => {
    const l = src("app/human-design/bilgi-bankasi/components/HdBilgiKayitListesi.tsx");
    assert(/const ids = \[\.\.\.visibleSelectedIds\]/.test(l) && /\}, \[search, categoryFilter, activeFilter\]\);/.test(l), "gizli satır silinebilir");
  });
  await t("P2-13: kaynak editörü kirli durumu bildirir; kaynak/sekme değişimi sorulur", () => {
    const e = src("app/human-design/bilgi-bankasi/[recordId]/HdKayitEditor.tsx");
    assert(/onDirtyChange=\{setSourceDirty\}/.test(e) && /switchSource\(/.test(e) && /switchSection\(/.test(e), "kaynak kaybı koruması yok");
    const ke = src("app/human-design/bilgi-bankasi/components/HdKaynakEditor.tsx");
    assert(/onDirtyChange\?\.?\(?/.test(ke), "kaynak editörü bildirmiyor");
    // Taslak kaynak da kapsanır (prod smoke bulgusu): isDraft dirty hesabından dışlanmaz.
    assert(/const dirty = JSON\.stringify\(form\) !== baseline;/.test(ke) && !/const dirty = !isDraft/.test(ke), "taslak kaynak metni korumasız");
  });
  await t("P2-3: hub Word vaadi Android'de gizli (.no-android) + Kayıtlı Raporlar'da Özet", () => {
    const h = src("app/human-design/components/HdHubModules.tsx");
    // AŞAMA 3C: hub iki çalışma alanına indi; Word vaadi içeren üst şerit kaldırıldı. Android metin
    // mekanizması (androidDesc → .no-android / isAndroid) korunur.
    assert(!/Kayıtlı Haritalar → Profesyonel Word/.test(h) && /<span className="no-android">\{mod\.desc\}<\/span>/.test(h) && /isAndroid && mod\.androidDesc/.test(h), "hub metni");
    const rl = src("app/human-design/kayitli-raporlar/components/HdRaporListesi.tsx");
    assert(/setSummaryId\(row\.id\)/.test(rl) && /HdProfessionalSummaryModal/.test(rl), "Android'de yalnız Sil");
  });
  await t("P2-4: mobilde satır aksiyonları ad altında (Kayıtlı Haritalar + Bilgi Bankası)", () => {
    assert(/mt-2 flex flex-wrap gap-2 sm:hidden">\{renderActions\(row, clientId, true\)\}/.test(src("app/human-design/kayitli-haritalar/page.tsx")), "kayıtlı haritalar");
    assert(/mt-2 flex flex-wrap gap-2 sm:hidden/.test(src("app/human-design/bilgi-bankasi/components/HdBilgiKayitListesi.tsx")), "bilgi bankası");
    assert(/\[overflow-wrap:anywhere\]/.test(src("app/human-design/danisanlar/components/HdClientListesi.tsx")), "uzun isim kırılmıyor");
  });
  await t("P2-5: Bilgi Bankası editör çubuğu mobilde kompakt (açıklama gizli, tek satır)", () => {
    const e = src("app/human-design/bilgi-bankasi/[recordId]/HdKayitEditor.tsx");
    assert(/mt-1\.5 hidden text-xs text-slate-500 sm:block/.test(e) && /px-3 py-2 sm:px-4 sm:py-3/.test(e), "kompakt değil");
  });
  await t("P2-14: danışan formunda ölü 'Harita Görseli URL' alanı yok", () => {
    const f = src("app/human-design/danisanlar/components/HdClientForm.tsx");
    assert(!/<label className=\{labelCls\}>Harita Görseli URL<\/label>/.test(f) && !/set\("chart_image_url"\)/.test(f), "alan duruyor");
  });
  await t("P1-3: silme onayı gerçek etkiyi söyler (raporlar korunur)", () => {
    const l = src("app/human-design/danisanlar/components/HdClientListesi.tsx");
    assert(/SİLİNMEZ; Kayıtlı Raporlar'da kalır/.test(l), "onay metni");
  });
  await t("P2-2: buton bir eylem = bir istek kimliği; başarıdan sonra aynı rapor yeniden indirilir", () => {
    const b = src("app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx");
    assert(/requestIdRef/.test(b) && /mode === "default" && createdReportId/.test(b) && /newVersion/.test(b), "idempotent akış yok");
    const r = src("app/api/hd/reports/professional/route.ts");
    assert(/professionalReportIdFor\(guard\.tenantId, requestId\)/.test(r) && /findReportBrief/.test(r) && /saved\.duplicate/.test(r), "sunucu idempotency yok");
  });

  console.log(`\nHD-PRESALE-FINAL harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    for (const f of fails) console.log("  - " + f);
    process.exit(1);
  }
})();
