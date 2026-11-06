/**
 * V3 ANALİZ SEÇİCİ MODELİ harness'i — 2026-11-05 (feat/natal-premium-visual-audit).
 *
 *   • Liste yalnız etkin profilin KİMLİĞİNE bağlı: aynı adlı iki farklı profil karışmaz; ayrıntı metninde ad geçen başka
 *     profil kaydı girmez; başka profilin masası girmez; kayıtlı liste başka profil için çekildiyse kullanılmaz.
 *   • Kayıtlı + açık aynı analiz tek satır; kaydedilmemiş / eski revizyon / kilitli (izin kapalı) işaretli; kayıp yok.
 *   • Bütün Atlas teknikleri bir gruba düşer; gruplar sabit sırada; aynı teknikte çok analiz tarihle ayrışır.
 *   • Arama Türkçe küçük harfle; başlık metni.
 *   • Statik: seçici modülleri sağlayıcı / kayıt (POST) çağrısı içermez; yalnız salt-okunur liste ucu.
 * Gerçek sağlayıcı / DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/analysis-picker.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TECHNIQUE_META } from "@/app/admin/astroloji/_lib/techniques";
import {
  PICKER_FAMILIES,
  buildPickerEntries,
  filterPickerEntries,
  pickerFamilyOf,
  pickerHeadline,
  type PickerBenchRow,
  type PickerSavedRow,
} from "@/app/admin/astroloji/_lib/analysisPicker";

const ROOT = join(__dirname, "..", "..");
let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message.split("\n").join("\n    ")}`);
  }
}

// Sentetik: iki "Ali Örnek" (farklı kimlik) + Ayşe. Sunucu listesi profil başına ayrı döner (ucun sözleşmesi).
const ALI1 = "00000000-0000-4000-8000-0000000000a1";
const ALI2 = "00000000-0000-4000-8000-0000000000a2";
const AYSE = "00000000-0000-4000-8000-0000000000b1";
const row = (id: string, technique: string, at: string, extra: Partial<PickerSavedRow> = {}): PickerSavedRow => ({
  id,
  title: extra.title ?? "",
  technique,
  params: extra.params ?? {},
  partnerLabel: extra.partnerLabel ?? null,
  analysisAt: at,
  locked: extra.locked,
});
const SERVER: Record<string, PickerSavedRow[]> = {
  [ALI1]: [
    row("s-a1-natal", "western.natal", "2026-11-04T18:02:00Z", { title: "Ali natal" }),
    row("s-a1-natal2", "western.natal", "2026-10-12T10:00:00Z", { title: "Natal" }),
    row("s-a1-tr1", "western.transit", "2026-11-04T12:00:00Z"),
    row("s-a1-tr2", "western.transit", "2026-10-01T09:00:00Z"),
    row("s-a1-sr", "western.solar_return", "2026-07-14T09:00:00Z"),
    row("s-a1-prog", "western.progression", "2026-01-05T09:00:00Z"),
    row("s-a1-syn", "western.synastry", "2026-09-20T09:00:00Z", { partnerLabel: "Ayşe Deneme" }),
    row("s-a1-d1", "vedic.d1", "2026-06-11T09:00:00Z"),
    row("s-a1-kp", "kp.chart", "2026-11-04T09:00:00Z"),
    row("s-a1-lock", "vedic.shadbala", "2026-05-01T09:00:00Z", { locked: true }),
  ],
  [ALI2]: [row("s-a2-natal", "western.natal", "2026-11-03T09:00:00Z", { title: "Ali natal" }), row("s-a2-tr", "western.transit", "2026-11-03T10:00:00Z")],
  [AYSE]: [row("s-ay-syn", "western.synastry", "2026-09-21T09:00:00Z", { title: "Ayşe × Ali Örnek", partnerLabel: "Ali Örnek" })],
};
const BENCH: PickerBenchRow[] = [
  { benchKey: `${ALI1}|2`, itemKey: "western.natal|{}", technique: "western.natal", options: {}, savedId: "s-a1-natal" }, // kayıtlı + açık
  { benchKey: `${ALI1}|2`, itemKey: "western.transit|a", technique: "western.transit", options: {}, savedId: null, dirty: true },
  { benchKey: `${ALI1}|2`, itemKey: "kp.ruling|a", technique: "kp.ruling", options: {}, savedId: null },
  { benchKey: `${ALI1}|1`, itemKey: "western.solar_return|a", technique: "western.solar_return", options: {}, savedId: null }, // eski revizyon
  { benchKey: `${ALI1}|2`, itemKey: "western.composite|a", technique: "western.composite", options: {}, savedId: "s-not-loaded" }, // kaydedildi, liste yenilenmedi
  { benchKey: `${ALI2}|1`, itemKey: "western.solar_arc|a", technique: "western.solar_arc", options: {}, savedId: null },
  { benchKey: `${AYSE}|1`, itemKey: "western.natal|a", technique: "western.natal", options: {}, savedId: null },
];
const labelOf = () => null;
const entriesFor = (pid: string, rev: number, savedFor: string | null = pid) =>
  buildPickerEntries({ profileId: pid, currentRevision: rev, savedFor, saved: savedFor ? (SERVER[savedFor] ?? []) : [], bench: BENCH, labelOf });

function main() {
  console.log("analysis-picker harness");
  const a1 = entriesFor(ALI1, 2);
  const a2 = entriesFor(ALI2, 1);
  const ay = entriesFor(AYSE, 1);

  test("aynı adlı iki Ali: birinin analizleri diğerinde yok (kayıtlı + masa)", () => {
    const r1 = new Set(a1.map((e) => e.savedId ?? e.ref));
    for (const e of a2) assert.ok(!r1.has(e.savedId ?? e.ref), e.ref);
    assert.ok(a2.every((e) => e.savedId?.startsWith("s-a2-") || e.benchKey?.startsWith(ALI2)), JSON.stringify(a2.map((e) => e.ref)));
    assert.ok(a1.every((e) => e.savedId?.startsWith("s-a1-") || e.savedId === "s-not-loaded" || e.benchKey?.startsWith(ALI1)));
    assert.equal(a2.length, 3);
  });

  test("ad / açıklama ile eşleştirme yok: 'Ali Örnek' geçen Ayşe kaydı Ali'de yok, Ayşe'de var", () => {
    assert.ok(!a1.some((e) => e.savedId === "s-ay-syn"));
    assert.ok(ay.some((e) => e.savedId === "s-ay-syn"));
  });

  test("kayıtlı liste başka profil için çekildiyse KULLANILMAZ (profil geçişinde eski liste görünmez)", () => {
    const stale = entriesFor(ALI2, 1, ALI1); // ekranda ALI2, liste henüz ALI1'in
    assert.ok(!stale.some((e) => e.kind === "saved"), "eski profilin kayıtlıları sızdı");
    assert.ok(stale.every((e) => e.benchKey?.startsWith(`${ALI2}|`)));
  });

  test("başka profilin masası girmez; profil kimliği öneki birebir ('a1' önekli başka kimlik yok)", () => {
    const tricky = buildPickerEntries({
      profileId: ALI1,
      currentRevision: 2,
      savedFor: ALI1,
      saved: [],
      bench: [{ benchKey: `${ALI1}x|2`, itemKey: "k", technique: "western.natal", options: {}, savedId: null }],
      labelOf,
    });
    assert.equal(tricky.length, 0);
  });

  test("kayıp yok: Ali'nin kayıtlıları + açık kaydedilmemişleri; kayıtlı+açık tek satır", () => {
    const savedN = SERVER[ALI1].length;
    const benchExtra = BENCH.filter((b) => b.benchKey.startsWith(`${ALI1}|`) && !(b.savedId && SERVER[ALI1].some((s) => s.id === b.savedId))).length;
    assert.equal(a1.length, savedN + benchExtra);
    assert.equal(a1.filter((e) => e.savedId === "s-a1-natal").length, 1);
    assert.ok(!a1.some((e) => e.kind === "bench" && e.itemKey === "western.natal|{}"));
    // tek kayıtlı satır masadaki sekmeyi bilir (masa kipinde sekme geçişi için)
    const n = a1.find((e) => e.savedId === "s-a1-natal")!;
    assert.equal(n.benchKey, `${ALI1}|2`);
    assert.equal(n.itemKey, "western.natal|{}");
  });

  test("durumlar: kaydedilmemiş · eski revizyon · kaydedildi-ama-listede-yok · kilitli", () => {
    const st = (pred: (e: (typeof a1)[number]) => boolean) => a1.find(pred)?.state;
    assert.equal(st((e) => e.itemKey === "western.transit|a"), "unsaved");
    assert.equal(st((e) => e.itemKey === "western.solar_return|a"), "unsaved-old");
    assert.equal(st((e) => e.itemKey === "western.composite|a"), "saved");
    assert.equal(st((e) => e.savedId === "s-a1-lock"), "locked");
    assert.equal(a1.find((e) => e.itemKey === "western.transit|a")?.dirty, true);
  });

  test("aynı teknikten çok analiz: tarihle ayrışır; aynı teknikte önce açık, sonra en yeni kayıt", () => {
    const tr = a1.filter((e) => e.technique === "western.transit");
    assert.equal(tr.length, 3);
    assert.equal(tr[0].kind, "bench");
    assert.deepEqual(tr.slice(1).map((e) => e.date), ["04.11.2026", "01.10.2026"]);
    const nat = a1.filter((e) => e.technique === "western.natal");
    assert.equal(nat[0].title, "Ali natal");
    assert.equal(nat[1].title, null, "teknik adıyla aynı başlık tekrar yazılmaz");
  });

  test("gruplama: bütün Atlas teknikleri bilinen bir gruba düşer; liste grup sırasını korur", () => {
    for (const t of Object.keys(TECHNIQUE_META)) assert.ok((PICKER_FAMILIES as readonly string[]).includes(pickerFamilyOf(t)), t);
    assert.equal(pickerFamilyOf("western.natal"), "natal");
    assert.equal(pickerFamilyOf("western.forecast"), "zaman");
    assert.equal(pickerFamilyOf("western.solar_arc"), "zaman");
    assert.equal(pickerFamilyOf("western.synastry"), "iliski");
    assert.equal(pickerFamilyOf("vedic.gun_milan"), "iliski");
    assert.equal(pickerFamilyOf("western.relocation"), "konum");
    assert.equal(pickerFamilyOf("vedic.dasha"), "vedik");
    assert.equal(pickerFamilyOf("kp.horary"), "kp");
    const seq = a1.map((e) => PICKER_FAMILIES.indexOf(e.family));
    assert.ok(seq.every((v, i) => i === 0 || v >= seq[i - 1]), JSON.stringify(seq));
  });

  test("arama: Türkçe küçük harf, ayrıntı / tarih / başlık içinde", () => {
    assert.deepEqual(
      filterPickerEntries(a1, "TRANSİT").map((e) => e.technique),
      a1.filter((e) => e.label.toLocaleLowerCase("tr").includes("transit")).map((e) => e.technique),
    );
    assert.equal(filterPickerEntries(a1, "04.11.2026").length >= 2, true);
    assert.equal(filterPickerEntries(a1, "ali natal").length, 1);
    assert.equal(filterPickerEntries(a1, "   ").length, a1.length);
  });

  test("varsayılan kayıt adı (profil · teknik · tarih) başlıkta tekrarlanmaz; özel ad korunur", () => {
    const e = buildPickerEntries({
      profileId: ALI1,
      profileLabel: "Ali Örnek — natal",
      currentRevision: 2,
      savedFor: ALI1,
      saved: [
        row("d1", "western.solar_return", "2026-11-05T09:00:00Z", { title: "Ali Örnek — natal · Solar return · 05.11.2026" }),
        row("d2", "western.synastry", "2026-11-05T09:00:00Z", { title: "Ali Örnek — natal & Ayşe · Sinastri · 05.11.2026", partnerLabel: "Ayşe", params: { partnerProfileId: AYSE } }),
        row("d3", "western.natal", "2026-11-05T09:00:00Z", { title: "Ali Örnek — natal ilk görüşme" }),
      ],
      bench: [],
      labelOf,
    });
    assert.equal(e.find((x) => x.savedId === "d1")?.title, null);
    assert.equal(e.find((x) => x.savedId === "d2")?.title, null);
    assert.match(e.find((x) => x.savedId === "d2")?.detail ?? "", /Ayşe/);
    assert.equal(e.find((x) => x.savedId === "d3")?.title, "Ali Örnek — natal ilk görüşme");
  });

  test("aynı teknik + aynı gün + aynı ayrıntı: saat ile ayrışır; tekil kayıtta yalnız tarih", () => {
    const e = buildPickerEntries({
      profileId: ALI1,
      currentRevision: 2,
      savedFor: ALI1,
      saved: [row("t1", "western.progression", "2026-11-04T21:44:00Z"), row("t2", "western.progression", "2026-11-04T22:10:00Z"), row("t3", "western.natal", "2026-11-04T22:10:00Z")],
      bench: [],
      labelOf,
    });
    assert.equal(e.find((x) => x.savedId === "t1")?.date, "05.11.2026 00:44");
    assert.equal(e.find((x) => x.savedId === "t2")?.date, "05.11.2026 01:10");
    assert.equal(e.find((x) => x.savedId === "t3")?.date, "05.11.2026");
  });

  test("başlık metni: 'Natal · 04.11.2026 · Ali natal'", () => {
    const n = a1.find((e) => e.savedId === "s-a1-natal")!;
    assert.equal(pickerHeadline(n), "Natal · 04.11.2026 · Ali natal");
  });

  test("statik: seçici modülleri sağlayıcı / yazma çağrısı içermez; yalnız GET liste ucu", () => {
    for (const f of ["app/admin/astroloji/_lib/analysisPicker.ts", "app/admin/astroloji/_components/atlas/AnalysisPicker.tsx"]) {
      // yorumlar ayıklanır (açıklamalarda "Roxy isteği yok" gibi ifadeler geçer); yalnız kod denetlenir
      const src = readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      assert.ok(!/roxy|providerAttempts|\/run\b|method:\s*"(POST|PUT|PATCH|DELETE)"/i.test(src), f);
    }
    const ui = readFileSync(join(ROOT, "app/admin/astroloji/_components/atlas/AnalysisPicker.tsx"), "utf8");
    assert.deepEqual([...ui.matchAll(/astroFetch<[^>]*>\(`([^`?]+)/g)].map((m) => m[1]), ["/api/admin/astroloji/analyses"]);
  });

  console.log(`\nanalysis-picker harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
main();
