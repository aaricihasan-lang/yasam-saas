// ============================================================
// Şifa Rehberi V2 — UYGULAMA YEDEĞİ (lib/backup) GERÇEK DB harness'i (PGlite; ağ / sır / production YOK).
//
//   GERÇEK V2 migration'ı (supabase/migrations/20280110000000_sifa_rehberi_v2_core.sql) PGlite'a uygulanır; uygulamanın KENDİ yedek motoru
//   (exportTableAll / restoreChunk) Supabase-js alt kümesi adaptörüyle `SET ROLE service_role` altında koşar →
//   9. aşama GRANT'ları (service_role: SELECT + yalnız geri yükleme INSERT'i), bileşik (id, tenant_id, owner_key) FK'ler,
//   scope/owner CHECK'i ve ağaç tetikleyicileri GERÇEKTEN devrededir. (Adaptör: settings-export/atlas-hdrel-pg ile aynı.)
//
//   [A] Uzman izolasyonu: yalnız oturumdaki uzmanın KİŞİSEL satırları; kurum / 2. uzman / başka tenant YOK.
//   [B] Veri kaybı → geri yükleme (topolojik sıra, küçük parçalar, ebeveyn-önce): 6 tablo özeti + sifa_v2_load birebir.
//   [C] İkinci geri yükleme: hepsi already_present (çoğalma yok); diğer kapsamlar değişmez.
//   [D] Saldırgan dosya: sahte KURUM satırı, başka uzman / başka tenant adına, yabancı görsel yolu → yazılamaz.
//   [E] V2 kurulmamış ortam: dışa aktarım boş + tamam, geri yükleme "atlandı" (hata değil); tolerans YALNIZ V2'de.
//   [F] Registry ↔ V2 migration tutarlılığı (tablo sınıflandırma, FK kapsamı, topolojik sıra) + V1 kayıtları değişmedi.
//
// Çalıştırma: npx tsx scripts/sifa-rehberi-v2/backup-v2.pg.harness.mjs   (FAIL → exit 1)
// ============================================================
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getRegistryEntry, isExportable, topologicalOrder, BACKUP_REGISTRY } from "../../lib/backup/registry.ts";
import { exportTableAll, restoreChunk } from "../../lib/backup/engine.ts";
import { sortSelfReferencing } from "../../lib/backup/format.ts";
import { parseMigrations } from "../final-hardening/backup-schema-parse.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG_DIR = join(ROOT, "supabase", "migrations");
const V2_SQL = readFileSync(join(MIG_DIR, "20280110000000_sifa_rehberi_v2_core.sql"), "utf8");
const V2 = ["sifa_topics", "sifa_topic_blocks", "sifa_block_sources", "sifa_topic_links", "sifa_block_assets"];
const ALL6 = [...V2, "sifa_legacy_import_map"];

let pass = 0;
let fail = 0;
const ok = (n, c, e = "") => {
  if (c) {
    pass++;
    console.log(`  ✓ ${n}`);
  } else {
    fail++;
    console.log(`  ✗ ${n} ${typeof e === "string" ? e : JSON.stringify(e).slice(0, 400)}`);
  }
};

// ── Supabase-js alt kümesi (settings-export/atlas-hdrel-pg.harness.mjs ile aynı sözleşme) ──
function makeDb(pg) {
  const ident = (s) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad ident ${s}`);
    return `"${s}"`;
  };
  function builder(table) {
    const st = { op: "select", cols: "*", count: false, head: false, where: [], params: [], order: [], limit: null, rows: null, onConflict: null, returning: null };
    const addParam = (v) => {
      st.params.push(v);
      return `$${st.params.length}`;
    };
    const b = {
      select(cols = "*", opts = {}) {
        if (st.op === "upsert") {
          st.returning = cols;
          return b;
        }
        st.cols = cols;
        st.count = opts.count === "exact";
        st.head = !!opts.head;
        return b;
      },
      eq(c, v) {
        st.where.push(`${ident(c)} = ${addParam(v)}`);
        return b;
      },
      gt(c, v) {
        st.where.push(`${ident(c)}::text > ${addParam(String(v))}`);
        return b;
      },
      in(c, arr) {
        st.where.push(`${ident(c)}::text = ANY(${addParam(arr.map(String))}::text[])`);
        return b;
      },
      or(expr) {
        throw new Error(`desteklenmeyen or(): ${expr}`);
      },
      order(c, o = {}) {
        st.order.push(`${ident(c)}::text ${o.ascending === false ? "DESC" : "ASC"}`);
        return b;
      },
      limit(n) {
        st.limit = n;
        return b;
      },
      upsert(rows, opts = {}) {
        st.op = "upsert";
        st.rows = rows;
        st.onConflict = opts.onConflict;
        return b;
      },
      update() {
        throw new Error("UPDATE yasak");
      },
      delete() {
        throw new Error("DELETE yasak");
      },
      then(res, rej) {
        return run().then(res, rej);
      },
    };
    async function run() {
      try {
        if (st.op === "upsert") {
          if (!st.rows.length) return { data: [], error: null };
          const cols = [...new Set(st.rows.flatMap((r) => Object.keys(r)))].map(ident);
          const conflict = st.onConflict.split(",").map((x) => ident(x.trim())).join(", ");
          const ret = st.returning ? st.returning.split(",").map((x) => ident(x.trim())).join(", ") : "1";
          const r = await pg.query(
            `INSERT INTO ${ident(table)} (${cols.join(", ")}) SELECT ${cols.join(", ")} FROM jsonb_populate_recordset(NULL::${ident(table)}, $1::jsonb) ON CONFLICT (${conflict}) DO NOTHING RETURNING ${ret}`,
            [JSON.stringify(st.rows)],
          );
          return { data: r.rows, error: null };
        }
        const where = st.where.length ? ` WHERE ${st.where.join(" AND ")}` : "";
        if (st.head && st.count) {
          const r = await pg.query(`SELECT count(*)::int n FROM ${ident(table)}${where}`, st.params);
          return { data: null, count: r.rows[0].n, error: null };
        }
        const cols = st.cols === "*" ? "*" : st.cols.split(",").map((x) => ident(x.trim())).join(", ");
        const sql = `SELECT ${cols} FROM ${ident(table)}${where}${st.order.length ? ` ORDER BY ${st.order.join(", ")}` : ""}${st.limit !== null ? ` LIMIT ${Number(st.limit)}` : ""}`;
        const r = await pg.query(sql, st.params);
        const data = r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])));
        return { data, count: st.count ? data.length : null, error: null };
      } catch (e) {
        if (process.env.PGH_DEBUG) console.error("[pgh]", table, e.code, e.message);
        return { data: null, count: null, error: { code: e.code ?? "XX000", message: e.message } };
      }
    }
    return b;
  }
  return { from: (t) => builder(t) };
}

async function setupRoles(pg) {
  for (const r of ["anon", "authenticated"]) await pg.exec(`CREATE ROLE ${r};`);
  await pg.exec(`CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role;`);
}
const pg = new PGlite();
await setupRoles(pg);
await pg.exec(V2_SQL);
const db = makeDb(pg);
const asService = async (fn) => {
  await pg.exec("SET ROLE service_role");
  try {
    return await fn();
  } finally {
    await pg.exec("RESET ROLE");
  }
};

const TA = "aaaaaaaa-0000-4000-8000-00000000000a";
const TB = "bbbbbbbb-0000-4000-8000-00000000000b";
const UA = "aaaaaaaa-1111-4000-8000-00000000000a";
const UA2 = "aaaaaaaa-2222-4000-8000-00000000000a";
const UB = "bbbbbbbb-1111-4000-8000-00000000000b";
const ctx = (over = {}) => ({ tenantId: TA, userId: UA, role: "expert", modulePermissions: { sifa_rehberi: true }, membershipActive: true, ...over });
const doc = (t) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const topic = (id, parent, title, sort = "a1", extra = {}) => ({ id, parent_id: parent, title, sort_key: sort, template_key: null, deleted_at: null, delete_batch_id: null, base_version: null, ...extra });
const block = (id, topicId, text, sources = [], extra = {}) => ({ id, topic_id: topicId, title: "Not", content_json: doc(text), content_text: text, classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: null, sources, ...extra });
const apply = async (t, u, ch) => (await pg.query("select public.sifa_v2_apply_changeset($1::uuid, $2::uuid, $3::jsonb) r", [t, u, JSON.stringify(ch)])).rows[0].r;

// ── Sentetik tohum (V2'nin KENDİ fonksiyonlarıyla) ──
const R = randomUUID(), C1 = randomUUID(), C2 = randomUUID(), D = randomUUID();
const B1 = randomUUID(), B2 = randomUUID();
await apply(TA, UA, {
  topics: [topic(R, null, "Bronşit (kişisel)"), topic(C1, R, "Nedenler"), topic(C2, C1, "Alt neden ÇĞİÖŞÜ"), topic(D, R, "Çöpteki", "b1", { deleted_at: new Date().toISOString(), delete_batch_id: randomUUID() })],
  blocks: [
    block(B1, C1, "Kutu bir ÇĞİÖŞÜ", [{ id: randomUUID(), kind: "makale", title: "Kaynak 1", authors: "A", year: "2020", doi: "10.1234/abc", url: null }, { id: randomUUID(), kind: "web", title: "Kaynak 2", authors: null, year: null, doi: null, url: "https://example.org/x" }]),
    block(B2, R, "Kök notu"),
  ],
  links_add: [{ id: randomUUID(), from_topic_id: R, to_topic_id: C2 }],
});
const ASSET = randomUUID(), DRAFT = randomUUID();
for (const [id, blk] of [[ASSET, B1], [DRAFT, null]]) {
  await pg.query("select public.sifa_v2_register_upload($1::uuid, $2::uuid, $3::jsonb)", [TA, UA, JSON.stringify({ id, storage_path: `${TA}/${UA}/${id}.png`, mime_type: "image/png", byte_size: 70, caption: "görsel" })]);
  if (blk) await apply(TA, UA, { asset_links: [{ asset_id: id, block_id: blk }] });
}
const R2 = randomUUID();
await apply(TA, UA2, { topics: [topic(R2, null, "UA2 kişisel")], blocks: [block(randomUUID(), R2, "UA2 GİZLİ")] });
const RB = randomUUID();
await apply(TB, UB, { topics: [topic(RB, null, "TB kişisel")], blocks: [block(randomUUID(), RB, "TB GİZLİ")] });
const K = randomUUID();
await pg.query("select public.sifa_v2_import_legacy($1::uuid, $2::jsonb, '[]'::jsonb)", [TA, JSON.stringify({ topics: [topic(K, null, "Kurum kaydı (V1)")], blocks: [block(randomUUID(), K, "Kurum notu")], assets: [] })]);

const digest = async (where, params) => {
  await pg.exec("SET TimeZone = 'UTC'");
  const out = {};
  for (const t of V2) {
    const r = await pg.query(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from public.${t} x where ${where}`, params);
    out[t] = `${r.rows[0].n}:${r.rows[0].h}`;
  }
  const m = await pg.query(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from public.sifa_legacy_import_map x`);
  out.sifa_legacy_import_map_TUMU = `${m.rows[0].n}:${m.rows[0].h}`;
  return out;
};
const ownerUA = "tenant_id = $1 and owner_key = $2";
const othersWhere = "not (tenant_id = $1 and owner_key = $2)";
const uaBefore = await digest(ownerUA, [TA, UA]);
const othersBefore = await digest(othersWhere, [TA, UA]);
const loadBefore = (await pg.query("select md5(public.sifa_v2_load($1, $2)::text) h", [TA, UA])).rows[0].h;
const order = topologicalOrder().map((e) => e.table).filter((t) => V2.includes(t));

console.log("\n[A] Uzman izolasyonu (service_role, 9. aşama GRANT'ları)");
const backup = {};
await asService(async () => {
  for (const t of V2) {
    const r = await exportTableAll(db, getRegistryEntry(t), TA, { ownerUserId: UA, pageSize: 2 });
    backup[t] = r;
  }
});
const expected = { sifa_topics: 4, sifa_topic_blocks: 2, sifa_block_sources: 2, sifa_topic_links: 1, sifa_block_assets: 2 };
for (const t of V2) ok(`${t}: ${expected[t]} satır, complete, hatasız (sayfa=2)`, backup[t].complete && !backup[t].error && backup[t].rows.length === expected[t], { n: backup[t].rows.length, e: backup[t].error });
const allRows = V2.flatMap((t) => backup[t].rows);
ok("yalnız UA'nın KİŞİSEL satırları (owner_key=UA, scope kisisel)", allRows.every((r) => r.owner_key === UA && r.tenant_id === TA && (r.scope === undefined || r.scope === "kisisel")));
ok("KURUM kaydı, UA2 ve TB satırı dışa aktarılmadı", !JSON.stringify(backup).includes("Kurum notu") && !JSON.stringify(backup).includes("UA2 GİZLİ") && !JSON.stringify(backup).includes("TB GİZLİ"));
ok("çöpteki kişisel konu da yedekte (Çöp Kutusu geri gelir)", backup.sifa_topics.rows.some((r) => r.id === D && r.deleted_at));
ok("görsel kaydı yalnız storage_path taşır (dosya yedek dışı)", backup.sifa_block_assets.rows.every((r) => typeof r.storage_path === "string" && !("bytes" in r)));

console.log("\n[B] Veri kaybı → geri yükleme");
await pg.query("delete from public.sifa_block_sources where owner_key = $1", [UA]);
await pg.query("delete from public.sifa_topic_links where owner_key = $1", [UA]);
await pg.query("delete from public.sifa_block_assets where owner_key = $1", [UA]);
await pg.query("delete from public.sifa_topic_blocks where owner_key = $1", [UA]);
await pg.query("with recursive d as (select id, 0 lvl from public.sifa_topics where owner_key = $1 and parent_id is null union all select t.id, d.lvl + 1 from public.sifa_topics t join d on t.parent_id = d.id) select 1", [UA]);
for (let i = 0; i < 5; i++) await pg.query("delete from public.sifa_topics t where owner_key = $1 and not exists (select 1 from public.sifa_topics c where c.parent_id = t.id)", [UA]);
ok("kayıp simülasyonu: UA'nın V2 satırı 0", Object.entries(await digest(ownerUA, [TA, UA])).filter(([k]) => V2.includes(k)).every(([, v]) => v.startsWith("0:")));
const reports = [];
await asService(async () => {
  for (const t of order) {
    let rows = backup[t].rows;
    if (t === "sifa_topics") rows = sortSelfReferencing(rows, "id", "parent_id");
    for (let i = 0; i < rows.length; i += 2) reports.push(await restoreChunk(db, ctx(), t, rows.slice(i, i + 2)));
  }
});
const ins = reports.reduce((s, r) => s + r.inserted, 0);
ok(`topolojik sıra ${order.join(" → ")}`, order.indexOf("sifa_topics") < order.indexOf("sifa_topic_blocks") && order.indexOf("sifa_topic_blocks") < order.indexOf("sifa_block_sources") && order.indexOf("sifa_topic_blocks") < order.indexOf("sifa_block_assets"));
ok(`geri yükleme: ${ins} satır eklendi, hata yok`, ins === 11 && reports.every((r) => !Object.keys(r.failures ?? {}).length || Object.values(r.failures).every((x) => !x || x.count === 0)), reports.map((r) => [r.table, r.inserted, r.failures]));
const uaAfter = await digest(ownerUA, [TA, UA]);
for (const t of Object.keys(uaBefore)) ok(`${t}: UA satır + md5 kayıptan önceyle BİREBİR`, uaAfter[t] === uaBefore[t], { before: uaBefore[t], after: uaAfter[t] });
ok("sifa_v2_load(UA) çıktısı BİREBİR (ağaç, kutular, kaynaklar, bağlantılar, çöp)", (await pg.query("select md5(public.sifa_v2_load($1, $2)::text) h", [TA, UA])).rows[0].h === loadBefore);

console.log("\n[C] İkinci geri yükleme (çoğalma yok)");
const again = [];
await asService(async () => {
  for (const t of order) again.push(await restoreChunk(db, ctx(), t, t === "sifa_topics" ? sortSelfReferencing(backup[t].rows, "id", "parent_id") : backup[t].rows));
});
ok("hepsi already_present, eklenen 0", again.every((r) => r.inserted === 0) && again.reduce((s, r) => s + r.already_present, 0) === 11, again.map((r) => [r.table, r.inserted, r.already_present]));
ok("UA verisi değişmedi; kurum / UA2 / TB BİREBİR", JSON.stringify(await digest(ownerUA, [TA, UA])) === JSON.stringify(uaBefore) && JSON.stringify(await digest(othersWhere, [TA, UA])) === JSON.stringify(othersBefore));

console.log("\n[D] Saldırgan yedek dosyası");
const kurumBefore = (await pg.query("select count(*)::int n from public.sifa_topics where scope = 'kurum'")).rows[0].n;
const forgedK = { ...backup.sifa_topics.rows[0], id: randomUUID(), parent_id: null, scope: "kurum", owner_key: TA, title: "SAHTE KURUM" };
const rK = await asService(() => restoreChunk(db, ctx(), "sifa_topics", [forgedK]));
ok("sahte KURUM satırı yazılamaz (owner UA'ya zorlanır → scope/owner CHECK reddi)", rK.inserted === 0 && (await pg.query("select count(*)::int n from public.sifa_topics where title = 'SAHTE KURUM'")).rows[0].n === 0 && (await pg.query("select count(*)::int n from public.sifa_topics where scope = 'kurum'")).rows[0].n === kurumBefore, rK);
const rAs2 = [];
await asService(async () => {
  for (const t of order) rAs2.push(await restoreChunk(db, ctx({ userId: UA2 }), t, t === "sifa_topics" ? sortSelfReferencing(backup[t].rows, "id", "parent_id") : backup[t].rows));
});
ok("UA'nın dosyası UA2 olarak: hiçbir satır eklenmez, UA verisi değişmez", rAs2.every((r) => r.inserted === 0) && JSON.stringify(await digest(ownerUA, [TA, UA])) === JSON.stringify(uaBefore), rAs2.map((r) => [r.table, r.inserted]));
ok("→ UA2'ye UA kimlikli satır yazılmadı", (await pg.query("select count(*)::int n from public.sifa_topics where owner_key = $1", [UA2])).rows[0].n === 1);
const rTB = [];
await asService(async () => {
  for (const t of order) rTB.push(await restoreChunk(db, ctx({ tenantId: TB, userId: UB }), t, t === "sifa_topics" ? sortSelfReferencing(backup[t].rows, "id", "parent_id") : backup[t].rows));
});
ok("TA dosyası TB'ye: hiçbir satır eklenmez (id başka tenant'ta)", rTB.every((r) => r.inserted === 0), rTB.map((r) => [r.table, r.inserted]));
const newBlk = (await pg.query("select id from public.sifa_topic_blocks where owner_key = $1 limit 1", [UA])).rows[0].id;
const fa1 = { ...backup.sifa_block_assets.rows[0], id: randomUUID(), block_id: newBlk, storage_path: `${TB}/${UB}/x.png` };
const fa2 = { ...backup.sifa_block_assets.rows[0], id: randomUUID(), block_id: newBlk, storage_path: `${TA}/${UA2}/${randomUUID()}.png` };
const rF = await asService(() => restoreChunk(db, ctx(), "sifa_block_assets", [fa1, fa2]));
ok("yabancı görsel yolu (başka tenant / aynı tenant'ta başka uzman) yazılamaz", rF.inserted === 0 && (await pg.query("select count(*)::int n from public.sifa_block_assets where id = any($1::uuid[])", [[fa1.id, fa2.id]])).rows[0].n === 0, rF);
const rTrial = await asService(() => restoreChunk(db, ctx({ membershipActive: false }), "sifa_topics", [{ ...backup.sifa_topics.rows[0], id: randomUUID() }]));
ok("süresi dolmuş deneme / pasif üyelik: geri yükleme (yazma) YOK → skipped_unlicensed", rTrial.inserted === 0 && rTrial.skipped_unlicensed === 1 && rTrial.status === "SKIPPED", rTrial);
const rNoMod = await asService(() => restoreChunk(db, ctx({ modulePermissions: { sifa_rehberi: false } }), "sifa_topics", [{ ...backup.sifa_topics.rows[0], id: randomUUID() }]));
ok("Şifa modülü kapalı uzman: geri yükleme YOK", rNoMod.inserted === 0 && rNoMod.status === "SKIPPED", rNoMod.status);
ok("sifa_legacy_import_map geri yüklenemez (yedek dışı, türetilmiş)", !isExportable(getRegistryEntry("sifa_legacy_import_map")));
const directUpd = await asService(async () => {
  try {
    await pg.query("update public.sifa_topics set title = 'x' where owner_key = $1", [UA]);
    return "izin verildi";
  } catch (e) {
    return e.code;
  }
});
ok("service_role doğrudan UPDATE → 42501 (yalnız SELECT + INSERT)", directUpd === "42501", directUpd);

console.log("\n[E] V2 kurulmamış ortam (mevcut yedek bozulmaz)");
const bare = new PGlite();
await setupRoles(bare);
const bdb = makeDb(bare);
const ex = await exportTableAll(bdb, getRegistryEntry("sifa_topics"), TA, { ownerUserId: UA });
ok("dışa aktarım: tablo yok → boş + complete + hatasız", ex.rows.length === 0 && ex.complete === true && !ex.error, ex);
const rs = await restoreChunk(bdb, ctx(), "sifa_topics", backup.sifa_topics.rows);
ok("geri yükleme: tablo yok → SKIPPED + table_absent uyarısı (istisna yok)", rs.status === "SKIPPED" && rs.inserted === 0 && rs.warnings.some((w) => w.startsWith("table_absent")), rs);
const v1 = await exportTableAll(bdb, getRegistryEntry("healing_guides"), TA, {});
ok("tolerans DAR: absentTolerant olmayan eksik tablo (healing_guides) hâlâ HATA", !!v1.error && v1.complete === false, v1.error);

console.log("\n[F] Registry ↔ V2 migration tutarlılığı");
// Tüm migration geçmişi okunur; V2 tabloları (sifa_*) TAM 6 olmalı (başka migration sifa_* tablosu tanımlamamalı).
const mig = new Map([...parseMigrations(MIG_DIR)].filter(([t]) => t.startsWith("sifa_")));
ok("V2 migration'daki 6 tablonun hepsi registry'de sınıflandırılmış", ALL6.every((t) => mig.has(t) && getRegistryEntry(t)) && mig.size === 6, [...mig.keys()]);
const missing = [];
for (const [name, tbl] of mig) {
  const e = getRegistryEntry(name);
  if (!e || !isExportable(e)) continue;
  for (const f of tbl.foreignKeys) {
    const pe = getRegistryEntry(f.refTable);
    if (!pe || !isExportable(pe)) continue;
    const idIdx = f.refColumns.indexOf("id");
    const col = idIdx >= 0 ? f.columns[idIdx] : f.columns[f.columns.length - 1];
    if (f.refTable === name && e.selfRef === col && e.fkParents.some((p) => p.column === col)) continue;
    if (!e.fkParents.some((p) => p.column === col && p.table === f.refTable)) missing.push(`${name}.${col}→${f.refTable}`);
  }
}
ok("V2 migration'daki her bileşik FK registry fkParents/selfRef'te (backup.harness kuralı)", missing.length === 0, missing);
ok("sifa_block_assets.block_id ON DELETE SET NULL ⇔ registry optional", getRegistryEntry("sifa_block_assets").fkParents.find((p) => p.column === "block_id")?.optional === true && /^set null$/i.test(mig.get("sifa_block_assets").foreignKeys.find((f) => f.columns[0] === "block_id")?.onDelete ?? ""));
ok("V2 registry kayıtları: modül sifa_rehberi, ownerScope owner_key, userColumns boş, absentTolerant", V2.every((t) => {
  const e = getRegistryEntry(t);
  return e.module === "sifa_rehberi" && e.ownerScope?.column === "owner_key" && e.userColumns.length === 0 && e.absentTolerant === true;
}));
ok("absentTolerant YALNIZ V2 tablolarında", BACKUP_REGISTRY.filter((e) => e.absentTolerant).map((e) => e.table).sort().join(",") === [...V2].sort().join(","));
// F3 (26.11.2026): Şifa'nın KENDİ kaydı güncellenebilir (içerik kutusu = parent_block_id); diğer modüllerin satırları aynen kalmalı.
// Karşılaştırma dal tabanına (merge-base) göre — origin/main ilerledikçe başka dalların eklemeleri sahte fark üretmesin.
const BASE = execSync("git merge-base HEAD origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
const diff = execSync(`git diff --unified=0 ${BASE} -- lib/backup/registry.ts`, { cwd: ROOT, encoding: "utf8" });
const removed = diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---") && !/sifa_/.test(l));
ok("registry.ts: dal tabanına göre Şifa DIŞI SİLİNEN/DEĞİŞEN satır yok (V1 ve diğer modüller aynı)", removed.length === 0, removed);

console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
