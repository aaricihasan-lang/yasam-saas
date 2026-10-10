/**
 * WT9 — KRİTİK BACKFILL testi: prod benzeri veri seti → migration → "Kristal Şifa Kitabı" backfill.
 * GERÇEK Postgres (embedded; prod'a SIFIR temas), GERÇEK migration + GERÇEK backfill SQL dosyası + GERÇEK rollback.
 *
 * Veri seti prod denetimini (2026-10-09, salt-okunur) taklit eder: 3 × 291 taş (sahip + 2 admin_transfer kopyası),
 * demo 20 (SENTETİK), admin 10 (1'i zaten adlandırılmış); alanlar NULL / "" / yalnız boşluk / kısa / Türkçe /
 * 15k uzun metin; jsonb çakra/uyarı/atama/görsel; source_note varyantları (Kristal Şifa kitabı, typo, başka metin).
 *
 * Hedef: 0 kayıp · 0 yanlış taş · 0 cross-tenant · 0 duplicate · idempotent · geri alınabilir.
 * Çalıştır: npx tsx scripts/wt9/backfill.harness.ts
 */
import { randomUUID } from "node:crypto";
import { seedStone, seedStonesUser, startWt9TestEnv, readWt9Sql } from "./wt9TestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";

const H0 = harness("wt9/backfill");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 600)), done: () => H0.done() };

const TEXT_FIELDS = ["short_description", "general_info", "source_note", "physical_effects", "spiritual_effects", "other_effects", "warning_text", "feng_shui", "meditation", "care", "application"] as const;
const JSON_FIELDS = ["chakras", "warning_tags", "assignments", "images"] as const;
const ALL_COMPARE = ["id", "tenant_id", "stone_name", ...TEXT_FIELDS, ...JSON_FIELDS, "created_at", "updated_at", "image_upload_failed", "origin_type", "origin_label", "origin_source_id", "origin_transfer_batch_id", "transferred_at"];

// Deterministik sözde-rastgele (aynı veri her koşuda).
let seed = 20261009;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
const TR = ["Mide bölgesini rahatlatır.", "Kalp çakrasını dengeler; ŞİFA verir.", "Işık, ılık su ile temizlenir.", "Çocuklarda dikkatli kullanın — ÖNEMLİ!", "Göğüs, boğaz ve üçüncü göz.", "Emoji 💎 ve “tırnak” 'işaret' <etiket> & ampersand"];
function textValue(i: number): string | null {
  const k = rnd();
  if (k < 0.25) return null;
  if (k < 0.32) return "";
  if (k < 0.37) return "   \n  ";
  if (k < 0.45) return `${pick(TR)}\n\nİkinci paragraf ${i}.`;
  if (k < 0.5) return (`Uzun metin ${i} ` + pick(TR) + " ").repeat(600) + `SON_${i}`; // ~15k+
  return `${pick(TR)} (${i})`;
}
const SRC_NOTES = ["Kristal Şifa kitabı", "Kristal Şita kitabı", "Kayaçlar arasında olur", null, "Kristal Şifa Kitabı"];

(async () => {
  const env = await startWt9TestEnv({ port: 54498, dirName: "wt9-backfill-pgdata" });
  const su = env.su;
  try {
    const owner = await seedStonesUser(su, "OWNER");
    const t1 = await seedStonesUser(su, "TRANSFER1");
    const t2 = await seedStonesUser(su, "TRANSFER2");
    const demo = await seedStonesUser(su, "DEMO", { demo: true });
    const admin = await seedStonesUser(su, "ADMIN", { role: "admin" });

    const ownerIds: string[] = [];
    for (let i = 0; i < 291; i++) {
      const f: Record<string, unknown> & { stone_name: string } = { stone_name: `ZZ Taş ${i} ${pick(["Akik", "Ametist", "Şeffaf Kuvars", "Işık Taşı"])}` };
      for (const c of TEXT_FIELDS) f[c] = textValue(i);
      f.source_note = pick(SRC_NOTES);
      f.chakras = rnd() < 0.4 ? null : pick([["Kalp Çakrası"], ["Kök Çakra", "Sakral Çakra"], []]);
      f.warning_tags = rnd() < 0.7 ? null : ["Su ile temizlenmez"];
      f.assignments = rnd() < 0.5 ? null : { Mineraller: [["Kuvars", "60"]], Burçlar: [["Koç"], ["Başak"]] };
      f.images = rnd() < 0.5 ? [] : [{ id: randomUUID(), name: "foto.jpg", file_path: `${owner.tenant}/x.jpg` }];
      f.updated_at = new Date(Date.UTC(2026, 5, 1) + i * 3600_000).toISOString();
      ownerIds.push(await seedStone(su, owner.tenant, f));
    }
    // admin_transfer kopyaları (aynı içerik, başka tenant)
    for (const t of [t1, t2]) {
      await su.query(
        `insert into stones (tenant_id, stone_name, ${[...TEXT_FIELDS, ...JSON_FIELDS].join(", ")}, created_at, updated_at, origin_type, origin_source_id, transferred_at)
         select $1, stone_name, ${[...TEXT_FIELDS, ...JSON_FIELDS].join(", ")}, created_at, updated_at, 'admin_transfer', id, now() from stones where tenant_id=$2`,
        [t.tenant, owner.tenant],
      );
    }
    for (let i = 0; i < 20; i++) await seedStone(su, demo.tenant, { stone_name: `ZZ Demo ${i}`, general_info: "Demo içerik", source_note: "Yaşam Sistemi vitrin hesabı için hazırlanmış SENTETİK örnek kayıttır." });
    const preNamed = await seedStone(su, admin.tenant, { stone_name: "ZZ Admin Adlı", general_info: "Admin", primary_source_name: "Kendi Notum" });
    for (let i = 0; i < 9; i++) await seedStone(su, admin.tenant, { stone_name: `ZZ Admin ${i}`, general_info: i % 2 ? null : "Admin içerik", source_note: i === 0 ? "Nadir: Almanya (Lahr/Kara Orman), Şili" : null });
    // Kenar durum: migration canlıyken uzman bu taşa "Kristal Şifa Kitabı" adlı EK kaynak eklemiş (birincil hâlâ NULL).
    const conflict = ownerIds[7]!;
    await su.query(`insert into stone_sources(tenant_id, stone_id, source_name, general_info) values ($1,$2,'kristal şifa KİTABI','Ek kaynakta Kristal')`, [owner.tenant, conflict]);
    // ek kaynak eklenmesi taşı güncelledi (extra_sources_text) → snapshot bundan SONRA alınır.
    await su.query(`delete from yasam_hafizasi_outbox`);

    const total = Number((await su.query(`select count(*)::int n from stones`)).rows[0].n);
    H.ok(total === 291 * 3 + 20 + 10, "veri seti: 903 taş (prod sayısı ile aynı)", total);

    const snap = async () => (await su.query(`select ${ALL_COMPARE.map((c) => `${c}::text as ${c}`).join(", ")}, primary_source_name, extra_sources_text from stones order by id`)).rows as Record<string, string | null>[];
    const fieldFill = async () => (await su.query(`select ${TEXT_FIELDS.map((c) => `count(*) filter (where btrim(coalesce(${c},''))<>'') as ${c}`).join(", ")}, ${TEXT_FIELDS.map((c) => `coalesce(sum(length(${c})),0)::bigint as len_${c}`).join(", ")} from stones`)).rows[0];
    const beforeRows = await snap();
    const beforeFill = await fieldFill();
    const beforeSources = (await su.query(`select id, md5(row_to_json(s)::text) h from stone_sources s order by id`)).rows;
    const expected = beforeRows.filter((r) => r.primary_source_name === null && r.tenant_id !== demo.tenant && r.id !== conflict).map((r) => r.id!);
    H.ok(expected.length === 291 * 3 + 9 - 1, "beklenen aday: 3×291 + admin 9 − 1 çakışan = 881", expected.length);

    // ── BACKFILL (gerçek SQL dosyası) ──
    await su.query(readWt9Sql("backfill_kristal_sifa.sql"));
    const afterRows = await snap();
    const afterFill = await fieldFill();

    H.ok(afterRows.length === beforeRows.length, "0 kayıp satır (taş sayısı aynı)");
    let contentDiff = 0, wrongStone = 0, crossTenant = 0;
    const diffs: string[] = [];
    for (let k = 0; k < beforeRows.length; k++) {
      const b = beforeRows[k]!, a = afterRows[k]!;
      if (a.id !== b.id) { wrongStone++; continue; }
      if (a.tenant_id !== b.tenant_id) crossTenant++;
      for (const c of [...ALL_COMPARE, "extra_sources_text"]) {
        if (a[c] !== b[c]) { contentDiff++; if (diffs.length < 5) diffs.push(`${a.id}.${c}`); }
      }
    }
    H.ok(contentDiff === 0, "ALAN ALAN: tüm içerik + metadata kolonları birebir (fiziksel/ruhsal/diğer/feng shui/çakra/kullanım/not/kaynak/atama/görsel/updated_at)", diffs);
    H.ok(wrongStone === 0 && crossTenant === 0, "0 yanlış taş · 0 cross-tenant");
    H.ok(JSON.stringify(beforeFill) === JSON.stringify(afterFill), "alan doluluk sayıları + toplam karakter uzunlukları aynı (boş dolu sanılmadı, dolu NULL yapılmadı, truncate yok)", { beforeFill, afterFill });
    const setNow = afterRows.filter((r) => r.primary_source_name === "Kristal Şifa Kitabı").map((r) => r.id!).sort();
    H.ok(JSON.stringify(setNow) === JSON.stringify([...expected].sort()), "yalnız beklenen 881 taş 'Kristal Şifa Kitabı' oldu (demo / önceden adlı / çakışan hariç)", setNow.length);
    H.ok(afterRows.filter((r) => r.tenant_id === demo.tenant).every((r) => r.primary_source_name === null), "demo/vitrin (SENTETİK) taşlar gerçek kitaba atfedilmedi");
    H.ok(afterRows.find((r) => r.id === preNamed)!.primary_source_name === "Kendi Notum", "önceden adlandırılmış kaynak DEĞİŞMEDİ");
    H.ok(afterRows.find((r) => r.id === conflict)!.primary_source_name === null, "aynı adlı ek kaynağı olan taş atlandı (duplicate yok, UPDATE geri dönmedi)");
    H.ok(JSON.stringify(beforeSources) === JSON.stringify((await su.query(`select id, md5(row_to_json(s)::text) h from stone_sources s order by id`)).rows), "ek kaynak satırları değişmedi / yeni satır yok");
    const dupCount = Number((await su.query(`select count(*)::int n from stones s join stone_sources ss on ss.stone_id=s.id where dogaltas_source_name_key(s.primary_source_name)=ss.source_name_key`)).rows[0].n);
    H.ok(dupCount === 0, "0 duplicate (birincil adı = ek kaynak adı olan taş yok)");
    const ob = (await su.query(`select source_id::text, operation from yasam_hafizasi_outbox where source_table='stones'`)).rows as { source_id: string; operation: string }[];
    H.ok(ob.length === expected.length && ob.every((o) => o.operation === "upsert") && new Set(ob.map((o) => o.source_id)).size === ob.length && ob.every((o) => expected.includes(o.source_id)),
      "YH: yalnız güncellenen 881 taş için TEK 'upsert' (mevcut outbox deseni; demo/diğerleri yok)", ob.length);

    // ── idempotent ──
    await su.query(`delete from yasam_hafizasi_outbox`);
    await su.query(readWt9Sql("backfill_kristal_sifa.sql"));
    const again = await snap();
    H.ok(JSON.stringify(again) === JSON.stringify(afterRows) && Number((await su.query(`select count(*)::int n from yasam_hafizasi_outbox`)).rows[0].n) === 0, "idempotent: 2. çalıştırma 0 değişiklik, 0 outbox");

    // ── backfill geri alma (paket aracının SQL'i: yalnız aday listesi) ──
    await su.query(`update stones set primary_source_name = null where id = any($1::uuid[]) and primary_source_name = 'Kristal Şifa Kitabı'`, [expected]);
    const rolled = await snap();
    H.ok(JSON.stringify(rolled) === JSON.stringify(beforeRows), "backfill geri alma: tüm satırlar backfill öncesiyle BİREBİR");

    // ── şema ROLLBACK (ek kaynaklar önce yedeklenir) ──
    await su.query(readWt9Sql("backfill_kristal_sifa.sql"));
    const extrasBefore = Number((await su.query(`select count(*)::int n from stone_sources`)).rows[0].n);
    const contentBeforeRb = (await su.query(`select id, md5(concat_ws('|', ${[...TEXT_FIELDS, ...JSON_FIELDS].map((c) => `coalesce(${c}::text,'<N>')`).join(", ")})) h from stones order by id`)).rows;
    await su.query(readWt9Sql("ROLLBACK_20271012000000.sql"));
    const backup = Number((await su.query(`select count(*)::int n from stone_sources_wt9_rollback_backup`)).rows[0].n);
    const cols = (await su.query(`select column_name from information_schema.columns where table_name='stones' and column_name in ('primary_source_name','extra_sources_text')`)).rows.length;
    const contentAfterRb = (await su.query(`select id, md5(concat_ws('|', ${[...TEXT_FIELDS, ...JSON_FIELDS].map((c) => `coalesce(${c}::text,'<N>')`).join(", ")})) h from stones order by id`)).rows;
    H.ok(backup === extrasBefore && extrasBefore > 0 && to_regclass_absent(await su.query(`select to_regclass('public.stone_sources') r`)) && cols === 0,
      "ROLLBACK: ek kaynaklar yedek tabloya alındı, tablo/kolonlar kaldırıldı", { backup, extrasBefore, cols });
    H.ok(JSON.stringify(contentBeforeRb) === JSON.stringify(contentAfterRb), "ROLLBACK: birincil içerik (stones) birebir korundu");
    await su.query(`select 1`);
  } catch (e) {
    H.ok(false, `beklenmeyen hata: ${e instanceof Error ? e.stack : String(e)}`);
  } finally {
    await env.stop();
  }
  H.done();
})();

function to_regclass_absent(r: { rows: { r: unknown }[] }): boolean {
  return r.rows[0]?.r === null;
}
