/**
 * BIO-01 regresyon harness'ı — PostgREST max-rows (1000) sınırında sessiz kesilme YOK.
 * Çalıştır: npx tsx scripts/bioenergy-presale-final/pagedRead.harness.ts
 *
 * Kapsam: lib/db/readAllPaged, lib/bioenergy/chakraReportRead (çakra Word raporu okuma yolu),
 * lib/admin/transferPagedRead (admin → uzman çakra blokları aktarımı child okuma yolu).
 * Gerçek repo fixture'ları (scripts/bioenergy-faz3/*V1Blocks.json = 1.192 blok) kullanılır.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createFakeDb, harness } from "./fakePostgrest";
import { readAllPaged, IncompleteReadError } from "@/lib/db/readAllPaged";
import { readChakraReportData } from "@/lib/bioenergy/chakraReportRead";
import { readChildrenGrouped } from "@/lib/admin/transferPagedRead";

const H = harness("bioenergy-presale-final/pagedRead");
const TA = "aaaaaaaa-0000-4000-8000-00000000000a";
const TB = "bbbbbbbb-0000-4000-8000-00000000000b";
const uuid = (n: number, p = "c") => `${p.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const isMissing = (e: unknown) => String((e as { code?: string })?.code) === "42P01";

(async () => {
  // ── 1) readAllPaged temel davranış ────────────────────────────────────────
  const big = Array.from({ length: 1250 }, (_, i) => ({ id: uuid(i), tenant_id: TA, n: i }));
  {
    const { db, log } = createFakeDb({ t: big }, { maxRows: 1000 });
    // Eski desen kanıtı: tek limitsiz sorgu 1000'de kesilir
    const old = await db.from("t").select("*").eq("tenant_id", TA);
    H.ok((old.data ?? []).length === 1000, "baseline: eski limitsiz sorgu max-rows'ta 1000'e kesilir (kanıt)");
    const r = await readAllPaged((f, t) => db.from("t").select("*", { count: "exact" }).eq("tenant_id", TA).order("id").range(f, t));
    H.ok(!r.error && r.rows.length === 1250, `readAllPaged 1250/1250 satır (alınan ${r.rows.length})`);
    H.ok(new Set(r.rows.map((x) => (x as { id: string }).id)).size === 1250, "tekrarsız (deterministik sıralı sayfalar)");
    H.ok(log.filter((l) => l.from !== null).length === 3, "3 sayfa (500'lük) istendi");
  }
  {
    const { db } = createFakeDb({ t: big }, { maxRows: 300 }); // sunucu max-rows < sayfa boyutu
    const r = await readAllPaged((f, t) => db.from("t").select("*", { count: "exact" }).order("id").range(f, t));
    H.ok(r.error instanceof IncompleteReadError && r.rows.length === 0, "sunucu max-rows < sayfa → IncompleteReadError (sessiz eksik YOK)");
  }
  {
    const { db } = createFakeDb({ t: big }, { failOnCall: { table: "t", call: 1 } });
    const r = await readAllPaged((f, t) => db.from("t").select("*", { count: "exact" }).order("id").range(f, t));
    H.ok(!!r.error && r.rows.length === 0, "2. sayfa hatası → hata döner, kısmi sonuç başarı sayılmaz");
  }
  {
    const { db } = createFakeDb({ t: big });
    const r = await readAllPaged((f, t) => db.from("t").select("*", { count: "exact" }).order("id").range(f, t), { maxRows: 1100 });
    H.ok(!r.error && r.rows.length === 1100 && r.truncated && r.total === 1250, "maxRows=1100 → 1100 satır + truncated=true + total=1250 (görünür kırpma)");
  }

  // ── 2) Çakra Word raporu okuma yolu (gerçek fixture blokları) ─────────────
  const dir = "scripts/bioenergy-faz3";
  const fixtures = readdirSync(dir).filter((f) => f.endsWith("V1Blocks.json"));
  const chakrasA = fixtures.map((f, i) => ({ id: uuid(i + 1, "a"), tenant_id: TA, name: f.replace("V1Blocks.json", ""), created_at: `2026-09-0${i + 1}T00:00:00Z`, sanskrit_name: "S", element: "E", location: "L", bija_mantra: "M" }));
  chakrasA.push({ id: uuid(99, "a"), tenant_id: TA, name: "Kök", created_at: "2026-08-01T00:00:00Z", sanskrit_name: "Muladhara", element: "Toprak", location: "Omurga", bija_mantra: "LAM" });
  const blocks: Record<string, unknown>[] = [];
  let fixtureTotal = 0;
  fixtures.forEach((f, i) => {
    const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    const arr: unknown[] = Array.isArray(j) ? j : (j.blocks ?? j.rows ?? Object.values(j).find(Array.isArray) ?? []);
    fixtureTotal += arr.length;
    arr.forEach((_, k) => blocks.push({ id: uuid(i * 10000 + k, "b"), tenant_id: TA, chakra_id: chakrasA[i]!.id, section_key: "genel-bakis", block_type: k === 0 ? null : "overview", sort_order: k, editorial_explanation: `x${k}`, created_at: "2026-09-01T00:00:00Z" }));
  });
  for (let k = 0; k < 120; k++) blocks.push({ id: uuid(900000 + k, "b"), tenant_id: TA, chakra_id: chakrasA[chakrasA.length - 1]!.id, section_key: "genel-bakis", block_type: "overview", sort_order: k, editorial_explanation: "kok", created_at: "2026-09-01T00:00:00Z" });
  const chakraB = { id: uuid(1, "e"), tenant_id: TB, name: "B", created_at: "2026-09-01T00:00:00Z" };
  for (let k = 0; k < 300; k++) blocks.push({ id: uuid(800000 + k, "f"), tenant_id: TB, chakra_id: chakraB.id, section_key: "genel-bakis", block_type: "overview", sort_order: k, editorial_explanation: "B", created_at: "2026-09-01T00:00:00Z" });
  const expectedA = fixtureTotal + 120;
  H.ok(fixtureTotal === 1192, `repo fixture blok toplamı 1.192 (bulunan ${fixtureTotal})`);

  {
    const { db } = createFakeDb({ bioenergy_chakras: [...chakrasA, chakraB], bioenergy_chakra_blocks: blocks }, { maxRows: 1000 });
    // Eski desen kanıtı
    const old = await db.from("bioenergy_chakra_blocks").select("id").eq("tenant_id", TA).in("chakra_id", chakrasA.map((c) => c.id));
    H.ok((old.data ?? []).length === 1000, `baseline: eski rapor blok sorgusu ${expectedA} bloktan yalnız 1000 döndürür`);
    const r = await readChakraReportData(db, TA, { mode: "all" }, 5000);
    H.ok(r.ok, "rapor okuma başarılı");
    if (r.ok) {
      const got = [...r.blocksByChakra.values()].reduce((a, b) => a + b.length, 0);
      H.ok(got === expectedA, `rapor blokları ${got}/${expectedA} (1000 sınırı aşıldı, eksik yok)`);
      H.ok(r.chakras.length === chakrasA.length && r.chakras.every((c) => c.tenant_id === TA), "yalnız tenant A çakraları");
      H.ok(![...r.blocksByChakra.keys()].includes(chakraB.id), "tenant B blokları rapora karışmaz");
      const nullTyped = [...r.blocksByChakra.values()].flat().filter((b) => b.block_type === null).length;
      H.ok(nullTyped === fixtures.length, "NULL block_type legacy bloklar da okunur (BIO-18)");
      H.ok(r.chakras.some((c) => c.bija_mantra === "LAM"), "hızlı bilgi kolonları (bija_mantra vb.) rapora gelir");
    }
    const one = await readChakraReportData(db, TA, { mode: "single", chakraId: chakrasA[0]!.id }, 5000);
    const expOne = blocks.filter((b) => b.chakra_id === chakrasA[0]!.id).length;
    H.ok(one.ok && one.chakras.length === 1 && [...one.blocksByChakra.values()].flat().length === expOne, `tek çakra modu yalnız o çakra + ${expOne} bloğu`);
  }
  {
    const { db } = createFakeDb({ bioenergy_chakras: chakrasA, bioenergy_chakra_blocks: blocks }, { maxRows: 300 });
    const r = await readChakraReportData(db, TA, { mode: "all" }, 5000);
    H.ok(!r.ok && r.stage === "blocks", "sunucu max-rows 300 < sayfa 500 → rapor HATA (eksik rapor üretilmez)");
  }
  {
    const { db } = createFakeDb({ bioenergy_chakras: chakrasA, bioenergy_chakra_blocks: blocks }, { failOnCall: { table: "bioenergy_chakra_blocks", call: 1 } });
    const r = await readChakraReportData(db, TA, { mode: "all" }, 5000);
    H.ok(!r.ok && r.stage === "blocks", "blok okuma hatası YUTULMAZ → rapor hatası (sessiz legacy fallback yok)");
  }
  {
    const { db } = createFakeDb({ bioenergy_chakras: chakrasA }, { tableErrors: { bioenergy_chakra_blocks: { code: "42P01", message: "relation does not exist" } } });
    const r = await readChakraReportData(db, TA, { mode: "all" }, 5000);
    H.ok(r.ok && r.blocksAvailable === false, "blok tablosu dormant (42P01) → bilinçli bloksuz rapor (mevcut kural)");
  }

  // ── 3) Admin → uzman aktarımı child okuma yolu ────────────────────────────
  {
    const { db } = createFakeDb({ bioenergy_chakra_blocks: blocks.filter((b) => b.tenant_id === TA) }, { maxRows: 1000 });
    const r = await readChildrenGrouped(db, "bioenergy_chakra_blocks", "chakra_id", chakrasA.map((c) => c.id), isMissing);
    H.ok(r.ok, "aktarım child okuma başarılı");
    if (r.ok) {
      const got = [...r.childrenByParent.values()].reduce((a, b) => a + b.length, 0);
      H.ok(got === expectedA, `aktarım child'ları ${got}/${expectedA} (1000'de kesilmez)`);
      H.ok(chakrasA.every((c) => (r.childrenByParent.get(c.id) ?? []).length > 0), "her çakranın blokları eksiksiz gruplandı");
    }
  }
  {
    // 250 parent → .in() 100'lük parçalara bölünür (URL güvenli) ve hepsi okunur
    const parents = Array.from({ length: 250 }, (_, i) => uuid(i, "d"));
    const kids = parents.flatMap((p, i) => Array.from({ length: 6 }, (_, k) => ({ id: uuid(i * 10 + k, "9"), point_id: p })));
    const { db, log } = createFakeDb({ kids }, { maxRows: 1000 });
    const r = await readChildrenGrouped(db, "kids", "point_id", parents, isMissing);
    H.ok(r.ok && [...r.childrenByParent.values()].reduce((a, b) => a + b.length, 0) === 1500, "250 parent / 1500 child eksiksiz (parçalı .in)");
    H.ok(log.every((l) => l.returned <= 1000), "hiçbir tek istek max-rows'u aşmaz");
  }
  {
    const { db } = createFakeDb({}, { tableErrors: { x: { code: "42P01" } } });
    const r = await readChildrenGrouped(db, "x", "p", [uuid(1)], isMissing);
    H.ok(r.ok && r.missingTable, "dormant child tablo → missingTable (parent-only tam kopya kuralı korunur)");
  }
  {
    const { db } = createFakeDb({ x: [] }, { tableErrors: { x: { code: "57014", message: "timeout" } } });
    const r = await readChildrenGrouped(db, "x", "p", [uuid(1)], isMissing);
    H.ok(!r.ok, "gerçek child okuma hatası → ok:false (route TransferError fırlatır)");
  }

  H.done();
})();
