// ============================================================
// Ayarlar → Sistem Yedeği / Dışa Aktarım — Gökyüzü Atlası + HD İlişki Analizleri GERÇEK DB harness'i (PGlite).
//
//   Gerçek migration'lar (astrology 20271101000000…0800 + Horary 20271210000000 + HD İlişki 20271102000000 /
//   20271103000000) PGlite'a uygulanır. Motor (lib/backup/engine) Supabase-js alt kümesini taklit eden adaptörle
//   `SET ROLE service_role` (production'daki GRANT'lar: çoğu astro tablosunda yalnız SELECT/INSERT) altında koşar →
//   bileşik (tenant_id, owner_user_id, …) FK'ler, CHECK'ler, değişmezlik ve kayıt tavanı tetikleyicileri GERÇEKTEN
//   devrededir.
//
//   [A] Uzman bazlı izolasyon: aynı tenant'taki 2. uzmanın ve başka tenant'ın satırları dışa aktarılmaz.
//   [B] Veri kaybı → geri yükleme (topolojik sıra, 200'lük parçalar): satır sayısı + içerik özeti birebir.
//   [C] İkinci geri yükleme: hepsi already_present (çift kayıt yok); 2. uzmanın verisi değişmez.
//   [D] Sağlayıcı önbelleği yedekte yok → kayıtlı analizin result_id bağı boş yazılır, analiz korunur.
//   [E] Saldırgan: başka uzman / başka tenant adına geri yükleme yabancı kayda yazamaz.
//   [F] Bileşik PK (analysis_id, position) gerçek DB'de keyset sayfalama (küçük sayfa) kayıpsız.
//
// Ağ / sır / production YOK. Çalıştırma: npx tsx scripts/settings-export/atlas-hdrel-pg.harness.mjs  (FAIL → exit 1)
// ============================================================
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getRegistryEntry, topologicalOrder } from "../../lib/backup/registry.ts";
import { exportTableAll, restoreChunk } from "../../lib/backup/engine.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = [
  "20271101000000_astrology_foundation.sql",
  "20271101000100_astrology_kb_analyses.sql",
  "20271101000200_astrology_timing_relationship.sql",
  "20271101000300_astrology_owner_isolation.sql",
  "20271101000400_astrology_client_list.sql",
  "20271101000500_astrology_profile_delete.sql",
  "20271101000600_astrology_record_caps.sql",
  "20271101000700_astrology_kb_snapshot_cleanup.sql",
  "20271101000800_astrology_analysis_delete.sql",
  "20271102000000_hd_relation_analyses.sql",
  "20271103000000_hd_relation_comments_reports.sql",
  "20271210000000_astro_horary_questions.sql",
];

let pass = 0;
let fail = 0;
const ok = (n, c, e = "") => {
  if (c) {
    pass++;
    console.log(`  ✓ ${n}`);
  } else {
    fail++;
    console.log(`  ✗ ${n} ${e}`);
  }
};

// ── PGlite üzerinde Supabase-js alt kümesi (motorun kullandığı: select/eq/gt/in/or(keyset)/order/limit/upsert) ──
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
        st.where.push(`${ident(c)} > ${addParam(v)}`);
        return b;
      },
      in(c, arr) {
        st.where.push(`${ident(c)}::text = ANY(${addParam(arr.map(String))}::text[])`);
        return b;
      },
      // Yalnız motorun bileşik keyset biçimi: a.gt.X,and(a.eq.X,b.gt.Y) — PostgREST ile aynı anlam.
      or(expr) {
        const m = /^([a-z_]+)\.gt\.([^,()]+),and\(\1\.eq\.\2,([a-z_]+)\.gt\.([^,()]+)\)$/.exec(expr);
        if (!m) throw new Error(`desteklenmeyen or(): ${expr}`);
        const a = ident(m[1]);
        const c = ident(m[3]);
        st.where.push(`(${a}::text > ${addParam(m[2])} OR (${a}::text = ${addParam(m[2])} AND ${c} > ${addParam(m[4])}::numeric))`);
        return b;
      },
      order(c, o = {}) {
        st.order.push(`${ident(c)}${["analysis_id", "id"].includes(c) ? "::text" : ""} ${o.ascending === false ? "DESC" : "ASC"}`);
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

// ── Kurulum ──
const pg = new PGlite();
for (const r of ["anon", "authenticated"]) await pg.exec(`CREATE ROLE ${r};`);
// Supabase service_role: RLS'yi aşar (BYPASSRLS); tablo yetkileri migration GRANT'larından gelir.
await pg.exec(`CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role;`);
await pg.exec(`
  CREATE TABLE public.clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, ad text, soyad text, dogum text,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.human_design_clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, name text);
  CREATE TABLE public.human_design_charts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid);
  -- Eski (repo dışı şemalı) tablolar: Supabase varsayılanı gibi service_role tam yetkili (HD ilişki tetikleyicisi FOR SHARE kullanır).
  GRANT ALL ON public.clients, public.human_design_clients, public.human_design_charts TO service_role;
`);
for (const f of MIGRATIONS) await pg.exec(readFileSync(join(ROOT, "supabase", "migrations", f), "utf8"));
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
let seq = 0;
const uid = (p) => `${p.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;

async function seedAstro(tenant, owner, n, tag, clientId) {
  const ids = { analyses: [], results: [] };
  for (let i = 0; i < n; i++) {
    const p = uid("a0");
    await pg.query(
      `INSERT INTO astro_birth_profiles (id, tenant_id, owner_user_id, client_id, label, current_revision, created_by_user_id) VALUES ($1,$2,$3,$4,$5,1,$3)`,
      [p, tenant, owner, i === 0 ? clientId : null, `${tag} profil ${i} ğüşİ`],
    );
    await pg.query(
      `INSERT INTO astro_birth_profile_revisions (id, tenant_id, owner_user_id, profile_id, revision, birth_date, birth_time, time_known, time_accuracy, location_label, latitude, longitude, timezone, utc_offset_seconds, birth_utc, created_by_user_id)
       VALUES ($1,$2,$3,$4,1,'1990-02-28','10:15',true,'exact_record','İstanbul',41.01,28.97,'Europe/Istanbul',7200,'1990-02-28T08:15:00Z',$3)`,
      [uid("a1"), tenant, owner, p],
    );
    await pg.query(
      `INSERT INTO astro_kb_entries (id, tenant_id, owner_user_id, tradition, topic_key, title, body) VALUES ($1,$2,$3,'western','natal:gunes',$4,'Güneş Koç burcunda — ğüşiöç')`,
      [uid("a2"), tenant, owner, `${tag} KB ${i}`],
    );
    await pg.query(
      `INSERT INTO astro_expert_notes (id, tenant_id, owner_user_id, profile_id, technique, section_key, body) VALUES ($1,$2,$3,$4,'western.natal','overall',$5)`,
      [uid("a3"), tenant, owner, p, `${tag} çalışma notu ${i}`],
    );
    // Sağlayıcı önbelleği (yedeğe GİRMEZ) — ilk analiz ona bağlanır.
    const res = uid("a4");
    ids.results.push(res);
    await pg.query(
      `INSERT INTO astro_provider_results (id, tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
       VALUES ($1,$2,$3,$4,1,'western.natal','roxyapi','v1','a1','/natal','{}'::jsonb,$5,'{"ham":true}'::jsonb,'{}'::jsonb,'s1','p1',$3)`,
      [res, tenant, owner, p, createHash("sha256").update(res).digest("hex")],
    );
    const a = uid("a5");
    ids.analyses.push(a);
    await pg.query(
      `INSERT INTO astro_analyses (id, tenant_id, owner_user_id, profile_id, profile_revision, client_id, result_id, technique, title, save_request_id, profile_snapshot, method_snapshot, technical_snapshot, versions_snapshot)
       VALUES ($1,$2,$3,$4,1,NULL,$5,'western.natal',$6,$7,'{"ad":"Sentetik"}'::jsonb,'{}'::jsonb,'{"gunes":"Koç"}'::jsonb,'{}'::jsonb)`,
      [a, tenant, owner, p, i === 0 ? res : null, `${tag} analiz ${i}`, uid("a6")],
    );
    await pg.query(`INSERT INTO astro_analysis_notes (id, tenant_id, analysis_id, section_key, body) VALUES ($1,$2,$3,'overall',$4)`, [uid("a7"), tenant, a, `${tag} yorum ${i}`]);
    await pg.query(
      `INSERT INTO astro_horary_questions (id, tenant_id, owner_user_id, title, question_text, question_local_date, question_local_time, timezone, utc_offset_seconds, question_utc, location_id, location_label, latitude, longitude, quesited_house, school, methodology_version, orb_variant, snapshot_schema, result_snapshot, save_request_id)
       VALUES ($1,$2,$3,$4,'İş değişikliği olacak mı?','2026-11-01','14:30','Europe/Istanbul',10800,'2026-11-01T11:30:00Z','ist','İstanbul',41.01,28.97,10,'lilly_1647','m1','o1',1,'{"hukum":"evet"}'::jsonb,$5)`,
      [uid("a8"), tenant, owner, `${tag} soru ${i}`, uid("a9")],
    );
  }
  return ids;
}

async function seedRelations(tenant, n, tag) {
  for (let i = 0; i < n; i++) {
    const a = uid("e0");
    const members = 3 + (i % 3);
    await pg.query(
      `INSERT INTO human_design_relation_analyses (id, tenant_id, user_id, kind, member_count, relation_type, provider, endpoint, adapter_version, node_type, lang, input_hash, result, provider_raw, expert_comment)
       VALUES ($1,$2,$3,'penta',$4,'team','roxyapi','/penta','a1','n','tr',$5,'{"ozet":"Takım enerjisi"}'::jsonb,'{"ham":1}'::jsonb,$6)`,
      [a, tenant, tenant === TA ? UA : UB, members, `h-${a}`, `${tag} uzman yorumu ${i}`],
    );
    for (let pos = 0; pos < members; pos++) {
      const hc = uid("e1");
      await pg.query(`INSERT INTO human_design_clients (id, tenant_id, name) VALUES ($1,$2,$3)`, [hc, tenant, `${tag} kişi ${i}-${pos}`]);
      await pg.query(
        `INSERT INTO human_design_relation_participants (analysis_id, tenant_id, position, client_id, client_name) VALUES ($1,$2,$3,$4,$5)`,
        [a, tenant, pos, hc, `${tag} kişi ${i}-${pos}`],
      );
    }
    await pg.query(`INSERT INTO human_design_relation_reports (id, tenant_id, analysis_id, created_by, snapshot) VALUES ($1,$2,$3,$4,'{"rapor":"anlık görüntü"}'::jsonb)`, [uid("e2"), tenant, a, tenant === TA ? UA : UB]);
  }
}

const ASTRO = topologicalOrder().map((e) => e.table).filter((t) => t.startsWith("astro_"));
const HDREL = topologicalOrder().map((e) => e.table).filter((t) => t.startsWith("human_design_relation_"));
const ownerSql = (t) =>
  t === "astro_analysis_notes"
    ? `SELECT n.* FROM astro_analysis_notes n JOIN astro_analyses a ON a.id = n.analysis_id WHERE a.tenant_id = $1 AND a.owner_user_id = $2`
    : `SELECT * FROM ${t} WHERE tenant_id = $1 AND owner_user_id = $2`;
const digest = (rows, drop = []) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        rows
          .map((r) => Object.fromEntries(Object.keys(r).filter((k) => !drop.includes(k)).sort().map((k) => [k, r[k] instanceof Date ? r[k].toISOString() : r[k]])))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ),
    )
    .digest("hex");
const ctx = (over = {}) => ({ tenantId: TA, userId: UA, role: "expert", modulePermissions: { human_design: true, astrology: true, clients: true }, membershipActive: true, ...over });

console.log("\nKurulum: migration'lar uygulandı:", MIGRATIONS.length);
const clientA = uid("c0");
await pg.query(`INSERT INTO clients (id, tenant_id, ad, soyad) VALUES ($1,$2,'Sentetik','Danışan')`, [clientA, TA]);
await seedAstro(TA, UA, 6, "A", clientA);
await seedAstro(TA, UA2, 4, "A2", null);
await seedAstro(TB, UB, 3, "B", null);
await seedRelations(TA, 30, "A");
await seedRelations(TB, 2, "B");

console.log("\n[A] Uzman bazlı izolasyon (service_role, gerçek GRANT'lar)");
const backup = {};
await asService(async () => {
  for (const t of [...ASTRO, ...HDREL]) {
    const r = await exportTableAll(db, getRegistryEntry(t), TA, { ownerUserId: UA, pageSize: t === "human_design_relation_participants" ? 7 : 4 });
    backup[t] = r;
  }
});
for (const t of ASTRO) {
  const r = backup[t];
  const truth = (await pg.query(ownerSql(t), [TA, UA])).rows;
  ok(`${t}: ${r.rows.length} satır tam (sayım ${r.expected_count})`, r.complete && r.rows.length === truth.length && truth.length > 0, r.error ?? "");
  const ids = new Set(truth.map((x) => x.id));
  ok(`${t}: yalnız UA'nın satırları (UA2 / TB yok)`, r.rows.every((x) => ids.has(x.id) && x.tenant_id === TA));
}
for (const t of HDREL) {
  const r = backup[t];
  const truth = (await pg.query(`SELECT count(*)::int n FROM ${t} WHERE tenant_id = $1`, [TA])).rows[0].n;
  ok(`${t}: ${r.rows.length} satır tam (TA)`, r.complete && r.rows.length === truth && r.rows.every((x) => x.tenant_id === TA), r.error ?? "");
}
ok("astro_provider_results yedek kapsamında değil", !backup.astro_provider_results && !ASTRO.includes("astro_provider_results"));
const partKeys = new Set(backup.human_design_relation_participants.rows.map((x) => `${x.analysis_id}|${x.position}`));
ok("bileşik PK: küçük sayfayla (7) tekrar/atlama yok", partKeys.size === backup.human_design_relation_participants.rows.length && partKeys.size === 120, String(partKeys.size));

console.log("\n[B] Veri kaybı → geri yükleme (yalnız ekleme, topolojik sıra, 200'lük parçalar)");
const before = {};
for (const t of ASTRO) before[t] = digest((await pg.query(ownerSql(t), [TA, UA])).rows);
for (const t of HDREL) before[t] = digest((await pg.query(`SELECT * FROM ${t} WHERE tenant_id = $1`, [TA])).rows);
const ua2Before = {};
for (const t of ASTRO) ua2Before[t] = digest((await pg.query(ownerSql(t), [TA, UA2])).rows);
// Veri kaybı: UA'nın Atlas kayıtları (profil silme önbelleği/analizleri CASCADE ile götürür) + TA'nın ilişki analizleri.
await pg.query(`DELETE FROM astro_birth_profiles WHERE tenant_id = $1 AND owner_user_id = $2`, [TA, UA]);
await pg.query(`DELETE FROM astro_kb_entries WHERE tenant_id = $1 AND owner_user_id = $2`, [TA, UA]);
await pg.query(`DELETE FROM astro_horary_questions WHERE tenant_id = $1 AND owner_user_id = $2`, [TA, UA]);
await pg.query(`DELETE FROM human_design_relation_analyses WHERE tenant_id = $1`, [TA]);
const left = (await pg.query(`SELECT (SELECT count(*) FROM astro_analyses WHERE owner_user_id=$1)::int a, (SELECT count(*) FROM astro_provider_results WHERE owner_user_id=$1)::int r`, [UA])).rows[0];
ok("kayıp simülasyonu: UA analizleri ve önbelleği silindi", left.a === 0 && left.r === 0);

const reports = {};
await asService(async () => {
  for (const t of [...ASTRO, ...HDREL]) {
    const rows = backup[t].rows;
    const agg = { inserted: 0, already: 0, parent_missing: 0, fk_nulled: 0, failed: [] };
    for (let i = 0; i < rows.length; i += 200) {
      const rep = await restoreChunk(db, ctx(), t, rows.slice(i, i + 200));
      agg.inserted += rep.inserted;
      agg.already += rep.already_present;
      agg.parent_missing += rep.parent_missing;
      agg.fk_nulled += rep.fk_nulled;
      agg.failed.push(...rep.failed);
    }
    reports[t] = agg;
  }
});
for (const t of [...ASTRO, ...HDREL]) {
  const r = reports[t];
  ok(`${t}: ${r.inserted} eklendi, hata yok`, r.inserted === backup[t].rows.length && r.failed.length === 0 && r.parent_missing === 0, JSON.stringify(r));
}
ok("[D] önbellek yok → yalnız result_id bağlı analiz bağı boşaltıldı (1), analiz korundu", reports.astro_analyses.fk_nulled === 1, String(reports.astro_analyses.fk_nulled));
for (const t of ASTRO) {
  const after = (await pg.query(ownerSql(t), [TA, UA])).rows;
  const drop = t === "astro_analyses" ? ["result_id"] : [];
  const beforeRows = backup[t].rows;
  ok(`${t}: içerik birebir (özet)`, digest(after, drop) === digest(beforeRows, drop) && (drop.length > 0 || digest(after) === before[t]));
}
for (const t of HDREL) ok(`${t}: içerik birebir (özet)`, digest((await pg.query(`SELECT * FROM ${t} WHERE tenant_id = $1`, [TA])).rows) === before[t]);
const linked = (await pg.query(`SELECT client_id FROM astro_birth_profiles WHERE tenant_id=$1 AND owner_user_id=$2 AND client_id IS NOT NULL`, [TA, UA])).rows;
ok("danışan bağı (mevcut danışan) korundu", linked.length === 1 && linked[0].client_id === clientA);

console.log("\n[C] İkinci geri yükleme: idempotent; 2. uzmanın verisi değişmedi");
let reinserted = 0;
let present = 0;
await asService(async () => {
  for (const t of [...ASTRO, ...HDREL]) {
    const rep = await restoreChunk(db, ctx(), t, backup[t].rows.slice(0, 200));
    reinserted += rep.inserted;
    present += rep.already_present;
  }
});
ok("tekrar: 0 eklendi, hepsi already_present", reinserted === 0 && present > 0, `${reinserted}/${present}`);
for (const t of ASTRO) ok(`${t}: UA2 verisi değişmedi`, digest((await pg.query(ownerSql(t), [TA, UA2])).rows) === ua2Before[t]);

console.log("\n[E] Saldırgan geri yükleme");
// UA2, UA'nın yedeğini kendi adına yüklemeye çalışır: kimlikler UA'da mevcut → yazım yok, UA satırları aynen.
const uaSnap = {};
for (const t of ASTRO) uaSnap[t] = digest((await pg.query(ownerSql(t), [TA, UA])).rows);
let ua2Inserted = 0;
await asService(async () => {
  for (const t of ASTRO) ua2Inserted += (await restoreChunk(db, ctx({ userId: UA2 }), t, backup[t].rows)).inserted;
});
ok("UA2 adına UA yedeği: hiçbir satır yazılmadı", ua2Inserted === 0, String(ua2Inserted));
for (const t of ASTRO) ok(`${t}: UA satırları sahiplik dahil değişmedi`, digest((await pg.query(ownerSql(t), [TA, UA])).rows) === uaSnap[t]);
// UA2 adına, UA'nın analizine yeni yorum: ebeveyn başka uzmanın → parent_missing.
const foreignNote = await asService(() =>
  restoreChunk(db, ctx({ userId: UA2 }), "astro_analysis_notes", [{ id: uid("f0"), analysis_id: backup.astro_analyses.rows[0].id, section_key: "overall", body: "sızma" }]),
);
ok("başka uzmanın analizine yorum eklenemez (parent_missing)", foreignNote.inserted === 0 && foreignNote.parent_missing === 1);
// TB uzmanı, TA yedeğini yükler: kimlikler başka tenant'ta → id_conflict_other_tenant, yazım yok.
const tbRep = await asService(() => restoreChunk(db, ctx({ tenantId: TB, userId: UB }), "astro_kb_entries", backup.astro_kb_entries.rows));
ok("başka tenant: id_conflict_other_tenant, yazım yok", tbRep.inserted === 0 && tbRep.failed.some((f) => f.code === "id_conflict_other_tenant"), JSON.stringify(tbRep.failed));
// Sahte owner_user_id ile YENİ kimlikli satır: sahiplik oturumdaki uzmana zorlanır.
const forged = { ...backup.astro_kb_entries.rows[0], id: uid("f1"), owner_user_id: UA, title: "sahte sahip" };
const fRep = await asService(() => restoreChunk(db, ctx({ userId: UA2 }), "astro_kb_entries", [forged]));
const fRow = (await pg.query(`SELECT owner_user_id FROM astro_kb_entries WHERE id = $1`, [forged.id])).rows[0];
ok("sahte owner_user_id → oturumdaki uzmana (UA2) zorlandı", fRep.inserted === 1 && fRow?.owner_user_id === UA2);

console.log(`\natlas-hdrel-pg harness: ${pass} PASS / ${fail} FAIL`);
await pg.close();
if (fail > 0) process.exit(1);
