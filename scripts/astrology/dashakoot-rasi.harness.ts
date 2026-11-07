/**
 * ATL-B02 (07.11.2026) — On Porutham Rasi: Kalaprakasika kuralıyla yerel hesap (adaptör -2). Ağ / sağlayıcı çağrısı YOK.
 * Kaynak: Kalaprakasika (N. P. Subramania Iyer çevirisi), Bölüm XIII, s. 73–74 (Rasi + 2. / 6. istisna), s. 74–75 (Rasyadhipathi
 * dostlukları), s. 76 (genel istisna). Fixture'lar (scripts/astrology/fixtures/dashakoot-rasi/, sentetik kişiler, doğum verisi yok):
 *   • kp-144-ref.json — 144 rol sıralı hücre; 31.10.2026'da ÜRÜN KODU KULLANILMADAN üretilen bağımsız matris (QA ATL-B02 rasi-144-matris.csv,
 *     KP_ISTISNALI sütunu); yalnız 1. sayım kaynakta hükümsüz olduğu için null (belirsiz).
 *   • denetim-148.json — 30.10.2026 büyük denetimin 148 gerçek yanıtının -1 projeksiyonu + DE440/Skyfield ile bağımsız Ay burçları.
 *   • onceki-surum-ciktisi.json — düzeltme ÖNCESİ ürün çıktısı (ekran HTML'i, Word/PDF yapı çağrıları, KB konuları, golden projeksiyonu);
 *     -1 kayıtlarının DEĞİŞMEDİĞİNİN kanıtı (regresyon; referans değildir).
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyClassicalRasi, classicalRasi, kpRelation, rasiParihara, RASI_SIXTH_EXCEPTIONS } from "@/lib/astrology/engine/dashakootRasi";
import { vedicDashakoot, vedicPapasamyam } from "@/lib/astrology/engine/vedicPoruthamTechniques";
import { projectRoxyVedicDashakoot, projectRoxyVedicPapasamyam, ROXY_VEDIC_DASHAKOOT, ROXY_VEDIC_PAPASAMYAM } from "@/lib/astrology/providers/roxy/vedicPorutham";
import { ROXY_VEDIC_COMPATIBILITY, ROXY_VEDIC_MANGLIK } from "@/lib/astrology/providers/roxy/vedicMatch";
import { legacyMethodNotes } from "@/lib/astrology/legacyMethod";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import {
  DASHAKOOT_METHOD_TEXT,
  DASHAKOOT_METHOD_TEXT_KP,
  DASHAKOOT_VERDICT_WITHHELD_TEXT,
  PORUTHAM_IDS,
  RASI_RULE_TEXT,
  RASI_TOTAL_UNCERTAIN_NOTE,
  rasiPariharaText,
  rasiProviderText,
  type VedicDashakootInterpretation,
  type VedicDashakootTechnical,
} from "@/lib/astrology/model/vedicPorutham";
import { DashakootInterpContent, DashakootPanel } from "@/app/admin/astroloji/_components/VedicPoruthamPanels";
import { dashakootReport, vedicPoruthamInterpBlocks } from "@/lib/astrology/report/vedicPoruthamReport";
import { topicsFromVedicDashakoot } from "@/lib/astrology/topics/vedicPorutham";

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
const FX = path.join(__dirname, "fixtures");
const J = (p: string) => JSON.parse(fs.readFileSync(path.join(FX, p), "utf8"));
type Cell = { bride: SignId; groom: SignId; count: number; kp: boolean | null; kp_31_10: boolean; provider_rule: boolean };
const CELLS = J("dashakoot-rasi/kp-144-ref.json").cells as Cell[];
type Case = { id: string; order: string | null; de440: { person1: SignId; person2: SignId }; technical: VedicDashakootTechnical };
const CASES = J("dashakoot-rasi/denetim-148.json").cases as Case[];
const BEFORE = J("dashakoot-rasi/onceki-surum-ciktisi.json").out as Record<string, { html: string; report: unknown[]; topics?: unknown; projection?: { technical: VedicDashakootTechnical; interpretation: VedicDashakootInterpretation }; interpHtml?: string; interpReport?: unknown[] }>;
const NAMES: [string, string] = ["Danışan A", "Karşı taraf B"];
const doc = (fn: (b: never) => void) => {
  const out: unknown[] = [];
  const bb = new Proxy({}, { get: (_o, k) => (...args: unknown[]) => void out.push([k, ...args.slice(0, 2)]) });
  fn(bb as never);
  return JSON.parse(JSON.stringify(out)) as unknown[];
};
const html = (tech: unknown) => renderToStaticMarkup(createElement(DashakootPanel, { t: tech as VedicDashakootTechnical, names: NAMES }));
const report = (tech: unknown) => doc((b) => dashakootReport(b, tech as never, { a: NAMES[0], b: NAMES[1] }));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const INTERP: VedicDashakootInterpretation = { schema: "astro.vedic.dashakoot.interp.v1", verdict: "recommended", recommendation: "servis cümlesi", rajjuReason: "r", vedhaReason: "v", notes: PORUTHAM_IDS.map((id) => ({ id, note: `${id} notu` })) };
const apply = (tech: VedicDashakootTechnical, interp: VedicDashakootInterpretation | null = INTERP) => {
  const r = applyClassicalRasi({ ok: true, technical: structuredClone(tech), interpretation: interp ? structuredClone(interp) : null, unmappedFields: [], droppedValues: [] });
  assert.ok(r.ok, "uygulanabilir");
  return r as Extract<typeof r, { ok: true }>;
};
const signOf = (label: string) => SIGN_IDS.find((s) => s === label.toLowerCase()) as SignId;

// ─── 1. Kaynak kuralı: 144 rol sıralı kombinasyon ─────────────────────────────
t("144 rol sıralı hücre: bağımsız 31.10 matrisiyle birebir (1. sayım hariç); 1. sayım 12 hücrede BELİRSİZ (0/1 atanmaz)", () => {
  assert.equal(CELLS.length, 144);
  assert.equal(new Set(CELLS.map((c) => `${c.bride}>${c.groom}`)).size, 144);
  let uncertain = 0;
  for (const c of CELLS) {
    const r = classicalRasi(c.groom, c.bride);
    assert.equal(r.count, c.count, `${c.bride}>${c.groom} sayım`);
    if (c.count === 1) {
      uncertain++;
      assert.deepEqual([r.status, r.rule], ["uncertain", "same_sign"], `${c.bride}>${c.groom}`);
      assert.equal(c.kp, null);
    } else {
      assert.equal(r.status === "matched", c.kp, `${c.bride}>${c.groom} (sayım ${c.count})`);
      assert.equal(r.status === "matched", c.kp_31_10, `${c.bride}>${c.groom} 31.10 matrisi`);
      assert.notEqual(r.status, "uncertain");
    }
  }
  assert.equal(uncertain, 12);
});

t("Sayım dağılımı: 2.–6. olumsuz (istisnalar hariç), 7. ve 8.–12. olumlu; 3/4/5 → 36 hücre karşılanmaz; 7 → 12; 8–12 → 60 karşılanır", () => {
  const by = (n: number) => CELLS.filter((c) => c.count === n).map((c) => classicalRasi(c.groom, c.bride));
  for (const n of [3, 4, 5]) assert.ok(by(n).every((r) => r.status === "unmatched"), `sayım ${n}`);
  assert.ok(by(7).every((r) => r.status === "matched" && r.rule === "seventh"));
  for (const n of [8, 9, 10, 11, 12]) assert.ok(by(n).every((r) => r.status === "matched" && r.rule === "converse"), `sayım ${n}`);
  assert.equal([3, 4, 5].flatMap(by).length, 36);
  assert.equal([8, 9, 10, 11, 12].flatMap(by).length, 60);
});

t("2. sayım istisnası: 12 hücreden YALNIZ damadın burcu çift olan 6'sı karşılanır (Boğa, Yengeç, Başak, Akrep, Oğlak, Balık)", () => {
  const c2 = CELLS.filter((c) => c.count === 2);
  assert.equal(c2.length, 12);
  const ok = c2.filter((c) => classicalRasi(c.groom, c.bride).status === "matched").map((c) => c.groom).sort();
  assert.deepEqual(ok, ["cancer", "capricorn", "pisces", "scorpio", "taurus", "virgo"]);
  for (const c of c2) assert.equal(classicalRasi(c.groom, c.bride).rule, ok.includes(c.groom) ? "second_even" : "second_odd");
});

t("6. sayım istisnası: 12 hücreden YALNIZ kaynağın 6 çifti karşılanır (Aslan→Oğlak dahil); liste gelin→damat yönünde 6. konumdadır", () => {
  const c6 = CELLS.filter((c) => c.count === 6);
  assert.equal(c6.length, 12);
  for (const [b, g] of RASI_SIXTH_EXCEPTIONS) assert.equal(classicalRasi(g, b).count, 6, `${b}>${g} 6. konum`);
  const ok = c6.filter((c) => classicalRasi(c.groom, c.bride).status === "matched").map((c) => `${c.bride}>${c.groom}`).sort();
  assert.deepEqual(ok, RASI_SIXTH_EXCEPTIONS.map(([b, g]) => `${b}>${g}`).sort());
  assert.ok(ok.includes("leo>capricorn"));
  // Ters yön (8. sayım) her zaman karşılanır — istisna listesi yalnız 6. konum içindir.
  for (const [b, g] of RASI_SIXTH_EXCEPTIONS) assert.deepEqual([classicalRasi(b, g).count, classicalRasi(b, g).status], [8, "matched"]);
});

t("Rol sırası: simetri VARSAYILMAZ — 132 farklı-burç hücresinin 96'sında rol takası sonucu değiştirir (48 olumsuz hücre + 8.–12. sayımdaki tersleri)", () => {
  let asym = 0;
  for (const c of CELLS) {
    if (c.count === 1) continue;
    const a = classicalRasi(c.groom, c.bride);
    const b = classicalRasi(c.bride, c.groom);
    assert.equal(a.count + b.count, 14, "takas sayımı 14 − n");
    if (a.status !== b.status) asym++;
  }
  // Olumsuz hücreler: 2. sayım tek burç (6) + 3./4./5. (36) + 6. listesiz (6) = 48; her birinin tersi 8.–12. sayımdır (hep olumlu).
  const neg = CELLS.filter((c) => classicalRasi(c.groom, c.bride).status === "unmatched").length;
  assert.equal(neg, 48);
  assert.equal(asym, 2 * neg);
  assert.equal(asym, 96);
});

// ─── 2. Genel istisna (parihara) — puanı DEĞİŞTİRMEZ ─────────────────────────
t("Kalaprakasika dostluk listesi (s. 74–75) metindeki gibi; Ay ve Satürn'ün belirtilmeyen ilişkileri 'unstated' (uydurulmaz)", () => {
  const F = (a: string, b: string) => kpRelation(a as never, b as never);
  assert.deepEqual(["mercury", "venus", "sun", "moon", "jupiter", "saturn"].map((x) => F("mars", x)), ["friend", "friend", "enemy", "enemy", "enemy", "enemy"]);
  assert.deepEqual(["sun", "moon", "mars", "mercury", "jupiter", "saturn"].map((x) => F("venus", x)), ["enemy", "enemy", "friend", "friend", "friend", "friend"]);
  assert.deepEqual(["sun", "moon", "mars", "venus", "jupiter", "saturn"].map((x) => F("mercury", x)), ["enemy", "friend", "friend", "friend", "friend", "friend"]);
  assert.deepEqual(["mercury", "jupiter", "sun", "mars", "venus", "saturn"].map((x) => F("moon", x)), ["friend", "friend", "unstated", "unstated", "unstated", "unstated"]);
  assert.deepEqual(["jupiter", "moon", "mars", "mercury", "venus", "saturn"].map((x) => F("sun", x)), ["friend", "enemy", "enemy", "enemy", "enemy", "enemy"]);
  assert.deepEqual(["mars", "sun", "moon", "mercury", "venus", "saturn"].map((x) => F("jupiter", x)), ["enemy", "friend", "friend", "friend", "friend", "friend"]);
  assert.deepEqual(["jupiter", "sun", "moon", "mars", "mercury", "venus"].map((x) => F("saturn", x)), ["enemy", "unstated", "unstated", "unstated", "unstated", "unstated"]);
});

t("Parihara: aynı yönetici / karşılıklı dost → uygulanır; karşılıklı düşman → uygulanmaz; tek yönlü / belirtilmemiş → BELİRSİZ; Rasi karşılandıysa gereksiz", () => {
  // Gelin Boğa → damat Terazi: 6. sayım, listesiz (karşılanmaz), ikisi de Venüs.
  assert.deepEqual([classicalRasi("libra", "taurus").status, rasiParihara("libra", "taurus", "unmatched")], ["unmatched", "applies_same_lord"]);
  // Gelin Koç → damat İkizler: 3. sayım; Mars ↔ Merkür karşılıklı dost.
  assert.equal(rasiParihara("gemini", "aries", classicalRasi("gemini", "aries").status), "applies_friends");
  // Gelin Aslan → damat Terazi: 3. sayım; Güneş ↔ Venüs karşılıklı düşman.
  assert.equal(rasiParihara("libra", "leo", classicalRasi("libra", "leo").status), "none");
  // Gelin Oğlak → damat Balık: 3. sayım; Jüpiter → Satürn dost, Satürn → Jüpiter düşman (tek yönlü).
  assert.equal(rasiParihara("pisces", "capricorn", classicalRasi("pisces", "capricorn").status), "uncertain_friendship");
  // Aynı burç: puan belirsiz; aynı yönetici olduğundan istisna koşulu (1) sağlanır — yine de puan atanmaz.
  assert.deepEqual([classicalRasi("leo", "leo").status, rasiParihara("leo", "leo", "uncertain")], ["uncertain", "applies_same_lord"]);
  assert.equal(rasiParihara("pisces", "aries", "matched"), "not_needed");
  // 144 hücrenin hepsinde: karşılananlar not_needed; diğerlerinde istisna yalnız bilgidir (statü değişmez).
  for (const c of CELLS) {
    const r = classicalRasi(c.groom, c.bride);
    const p = rasiParihara(c.groom, c.bride, r.status);
    assert.equal(p === "not_needed", r.status === "matched", `${c.bride}>${c.groom}`);
  }
});

// ─── 3. 148 gerçek çift ─────────────────────────────────────────────────────
t("148 gerçek çift: Ay burçları bağımsız DE440 ile aynı; diğer 9 kriter + Rajju / Vedha + çerçeve BİREBİR; toplam satırlardan", () => {
  assert.equal(CASES.length, 148);
  for (const c of CASES) {
    const src = c.technical;
    const rasi = src.rows.find((r) => r.id === "rasi")!;
    assert.deepEqual([signOf(rasi.person1.raw), signOf(rasi.person2.raw)], [c.de440.person1, c.de440.person2], `${c.id} Ay burçları DE440`);
    const { technical: x } = apply(src);
    for (const id of PORUTHAM_IDS.filter((k) => k !== "rasi")) assert.deepEqual(x.rows.find((r) => r.id === id), src.rows.find((r) => r.id === id), `${c.id} ${id}`);
    assert.deepEqual([x.rajju, x.vedha, x.frame, x.maxTotal, x.zodiac, x.schema], [src.rajju, src.vedha, src.frame, src.maxTotal, src.zodiac, src.schema], c.id);
    const xr = x.rows.find((r) => r.id === "rasi")!;
    assert.deepEqual([xr.person1, xr.person2], [rasi.person1, rasi.person2]);
    assert.equal(x.rasiClassic!.provider.matched, rasi.matched, `${c.id} servis değeri korunur`);
    const others = src.total! - rasi.points!;
    if (xr.matched === null) assert.deepEqual([x.total, x.totalRange], [null, [others, others + 1]], c.id);
    else assert.deepEqual([x.total, x.totalRange], [others + xr.points!, undefined], c.id);
  }
});

t("148 çift sınıflaması: 58 aynı, 70 kesin farklı, 20 belirsiz (1. sayım); servisin belgelediği 6/8/12 kuralı 141/148", () => {
  const k = { same: 0, diff: 0, unc: 0 };
  let providerRule = 0;
  for (const c of CASES) {
    const src = c.technical.rows.find((r) => r.id === "rasi")!;
    const xr = apply(c.technical).technical.rows.find((r) => r.id === "rasi")!;
    if (xr.matched === null) k.unc++;
    else if (xr.matched === src.matched) k.same++;
    else k.diff++;
    if (src.matched === ![6, 8, 12].includes(src.count!)) providerRule++;
  }
  assert.deepEqual(k, { same: 58, diff: 70, unc: 20 });
  assert.equal(providerRule, 141);
});

t("31.10 denetimindeki 54 fark (2.–5. sayımda 47 + servisin kendi kuralına aykırı 6. sayımda 7) yeniden sınıflandı", () => {
  const res = CASES.map((c) => {
    const src = c.technical.rows.find((r) => r.id === "rasi")!;
    const x = apply(c.technical).technical;
    return { id: c.id, count: src.count!, provider: src.matched, local: x.rows.find((r) => r.id === "rasi")!.matched, rule: x.rasiClassic!.rule };
  });
  const old54 = res.filter((r) => (r.count >= 2 && r.count <= 5 && r.provider) || (r.count === 6 && r.provider));
  assert.equal(old54.length, 54);
  const c25 = old54.filter((r) => r.count <= 5);
  assert.equal(c25.length, 47);
  // 47'nin 45'i Kalaprakasika'ya göre de karşılanmaz (servis hatalı); 2'si 2. sayım çift burç istisnası (servisle aynı sonuç).
  assert.deepEqual([c25.filter((r) => r.local === false).length, c25.filter((r) => r.local === true).map((r) => r.rule)], [45, ["second_even", "second_even"]]);
  // 7 tutarsızlık: hepsi kaynağın 6. konum listesinde → Kalaprakasika ile AYNI sonuç (servisin yalnız notu / belgelediği kural yanlış).
  const seven = old54.filter((r) => r.count === 6);
  assert.equal(seven.length, 7);
  assert.ok(seven.every((r) => r.local === true && r.rule === "sixth_listed"));
  // 54 dışında yeni farklar: 8. (10) ve 12. sayım (14) servis karşılanmadı / kaynak karşılandı + Aslan→Oğlak (servis reddediyor, kaynak listesinde).
  const extra = res.filter((r) => r.local !== null && r.local !== r.provider && !old54.includes(r));
  assert.deepEqual(
    [extra.filter((r) => r.count === 8).length, extra.filter((r) => r.count === 12).length, extra.filter((r) => r.count === 6).map((r) => r.id)],
    [10, 14, ["TR-0079"]],
  );
  assert.equal(extra.length + old54.filter((r) => r.local !== r.provider).length, 70);
});

// ─── 4. Yorum katmanı: servis değerlendirmesi yalnız tutarlıysa ─────────────
t("Yorum: yerel Rasi = servis → değerlendirme + öneri korunur; farklı / belirsiz → gizlenir (verdictWithheld); servisin Rasi notu her zaman çıkarılır", () => {
  for (const c of CASES) {
    const src = c.technical.rows.find((r) => r.id === "rasi")!;
    const r = apply(c.technical);
    const xr = r.technical.rows.find((x) => x.id === "rasi")!;
    const i = r.interpretation!;
    assert.deepEqual(i.notes.map((n) => n.id), PORUTHAM_IDS.filter((k) => k !== "rasi"));
    assert.deepEqual([i.rajjuReason, i.vedhaReason], ["r", "v"]);
    if (xr.matched === src.matched) assert.deepEqual([i.verdict, i.recommendation, i.verdictWithheld], ["recommended", "servis cümlesi", undefined], c.id);
    else assert.deepEqual([i.verdict, i.recommendation, i.verdictWithheld], [null, null, "rasi_local"], c.id);
  }
  // Yorum katmanı yoksa (yetkisiz) yalnız teknik değişir.
  assert.equal(apply(CASES[0].technical, null).interpretation, null);
});

t("Golden (gerçek yanıt, motor): A damat Balık / B gelin Koç → 12. sayım, servis 0 · yerel 1 → 8/10, değerlendirme gizli; takas → 2. sayım tek burç, 1 → 0 → 5/10", () => {
  const run = (g: string) => {
    const raw = J(`golden/${g}.json`).response;
    const p = vedicDashakoot.project!({} as never, raw, { ayanamsa: "lahiri" } as never);
    assert.ok(p.ok);
    return p as Extract<typeof p, { ok: true }>;
  };
  const a = run("vedic-dashakoot");
  const at = a.technical as VedicDashakootTechnical;
  assert.equal(a.projectionVersion, "vedic-dashakoot-proj-2");
  assert.deepEqual([at.total, at.rasiClassic!.count, at.rasiClassic!.rule, at.rasiClassic!.provider.matched], [8, 12, "converse", false]);
  assert.deepEqual([(a.interpretation as VedicDashakootInterpretation).verdict, (a.interpretation as VedicDashakootInterpretation).verdictWithheld], [null, "rasi_local"]);
  const s = run("vedic-dashakoot-swap");
  const st = s.technical as VedicDashakootTechnical;
  assert.deepEqual([st.total, st.rasiClassic!.count, st.rasiClassic!.rule, st.rasiClassic!.provider.matched], [5, 2, "second_odd", true]);
  // Önceki sürümde (main) golden projeksiyonu: Rasi dışındaki her şey aynı.
  for (const [g, x] of [["vedic-dashakoot", at], ["vedic-dashakoot-swap", st]] as const) {
    const before = BEFORE[g].projection!.technical;
    assert.deepEqual(x.rows.filter((r) => r.id !== "rasi"), before.rows.filter((r) => r.id !== "rasi"), g);
    assert.deepEqual([x.rajju, x.vedha, x.frame], [before.rajju, before.vedha, before.frame], g);
    // Ham projeksiyon (adaptör) değişmedi.
    const raw = J(`golden/${g}.json`).response;
    const pr = projectRoxyVedicDashakoot(raw, { ayanamsa: "lahiri" });
    assert.ok(pr.ok);
    if (pr.ok) assert.deepEqual(pr.technical, before, `${g}: adaptör projeksiyonu birebir`);
  }
});

// ─── 5. Sürüm / önbellek / eski kayıt ───────────────────────────────────────
t("Sürüm: Dashakoot adaptörü -2 (yeni önbellek anahtarı); Papasamyam, Gun Milan, Manglik sürümleri DEĞİŞMEDİ; Papasamyam projeksiyonu birebir", () => {
  assert.deepEqual([ROXY_VEDIC_DASHAKOOT.adapter, ROXY_VEDIC_DASHAKOOT.projection], ["astro-roxy-vedic-dashakoot-2", "vedic-dashakoot-proj-2"]);
  assert.deepEqual([ROXY_VEDIC_PAPASAMYAM.adapter, ROXY_VEDIC_PAPASAMYAM.projection], ["astro-roxy-vedic-papasamyam-1", "vedic-papasamyam-proj-1"]);
  assert.deepEqual([ROXY_VEDIC_COMPATIBILITY.adapter, ROXY_VEDIC_COMPATIBILITY.projection], ["astro-roxy-vedic-gun-milan-1", "vedic-gun-milan-proj-1"]);
  assert.equal(ROXY_VEDIC_MANGLIK.adapter, "astro-roxy-vedic-manglik-1");
  for (const g of ["vedic-papasamyam", "vedic-papasamyam-swap"]) {
    const raw = J(`golden/${g}.json`).response;
    const p = vedicPapasamyam.project!({} as never, raw, { ayanamsa: "lahiri" } as never);
    const a = projectRoxyVedicPapasamyam(raw, { ayanamsa: "lahiri" });
    assert.ok(p.ok && a.ok);
    if (p.ok && a.ok) assert.deepEqual([p.technical, p.interpretation], [a.technical, a.interpretation], g);
  }
});

t("Eski kayıt notu: yalnız vedic.dashakoot -1'de 'dashakoot_rasi'; -2'de ve diğer tekniklerde yok", () => {
  const n = (technique: string, adapterVersion: string) => legacyMethodNotes({ technique, adapterVersion, houseSystem: null, revisions: [] }).map((x) => x.code);
  assert.deepEqual(n("vedic.dashakoot", "astro-roxy-vedic-dashakoot-1"), ["dashakoot_rasi"]);
  assert.deepEqual(n("vedic.dashakoot", "astro-roxy-vedic-dashakoot-2"), []);
  assert.deepEqual(n("vedic.papasamyam", "astro-roxy-vedic-papasamyam-1"), []);
  assert.deepEqual(n("vedic.gun_milan", "astro-roxy-vedic-gun-milan-1"), []);
  const txt = legacyMethodNotes({ technique: "vedic.dashakoot", adapterVersion: "astro-roxy-vedic-dashakoot-1", houseSystem: null, revisions: [] })[0].text;
  for (const w of ["Kalaprakasika", "değiştirilmedi", "yeni kayıt", "aynı burç belirsizdir"]) assert.ok(txt.includes(w), w);
  assert.ok(!/\broxy\b/i.test(txt));
});

t("Eski (-1) kayıtlar: 148 + 2 golden ekran HTML'i, Word/PDF yapısı ve KB konuları düzeltme ÖNCESİYLE BİREBİR", () => {
  for (const c of CASES) {
    assert.equal(html(c.technical), BEFORE[c.id].html, `${c.id} ekran`);
    assert.deepEqual(report(c.technical), BEFORE[c.id].report, `${c.id} Word/PDF`);
    assert.deepEqual(JSON.parse(JSON.stringify(topicsFromVedicDashakoot(c.technical))), BEFORE[c.id].topics, `${c.id} KB`);
  }
  for (const g of ["vedic-dashakoot", "vedic-dashakoot-swap"]) {
    const b = BEFORE[g];
    assert.equal(html(b.projection!.technical), b.html, `${g} ekran`);
    assert.deepEqual(report(b.projection!.technical), b.report, `${g} Word/PDF`);
    assert.equal(renderToStaticMarkup(createElement(DashakootInterpContent, { c: b.projection!.interpretation })), b.interpHtml, `${g} yorum ekranı`);
    assert.deepEqual(doc((bb) => vedicPoruthamInterpBlocks(bb, b.projection!.interpretation as never)), b.interpReport, `${g} yorum Word/PDF`);
  }
});

// ─── 6. Ekran = rapor (yeni sürüm) ──────────────────────────────────────────
t("Yeni (-2) kayıtlar: ekran ve Word/PDF aynı Rasi sonucu, kural metni, servis karşılaştırması, istisna ve yöntem metni; belirsizde toplam aralığı", () => {
  const seen = new Set<string>();
  for (const c of CASES) {
    const x = apply(c.technical).technical;
    const rc = x.rasiClassic!;
    seen.add(rc.status);
    const h = html(x);
    const d = report(x);
    const ps = d.filter((e) => (e as unknown[])[0] === "p").map((e) => (e as unknown[])[1] as string);
    const rows = d.filter((e) => (e as unknown[])[0] === "table").flatMap((e) => (e as unknown[])[2] as string[][]);
    const label = rc.status === "matched" ? "karşılandı · 1" : rc.status === "unmatched" ? "karşılanmadı · 0" : "belirsiz · —";
    const rrow = rows.find((r) => r[0] === "Rasi")!;
    assert.equal(rrow[5], label, `${c.id} Word/PDF Rasi`);
    assert.equal(rrow[4], String(rc.count));
    assert.ok(h.includes(`data-testid="astro-porutham-rasi" data-matched="${String(x.rows.find((r) => r.id === "rasi")!.matched)}"`) && h.includes(label), `${c.id} ekran Rasi`);
    for (const s of [RASI_RULE_TEXT[rc.rule], rasiProviderText(rc), DASHAKOOT_METHOD_TEXT_KP]) {
      assert.ok(ps.includes(s), `${c.id} Word/PDF: ${s.slice(0, 40)}`);
      assert.ok(h.includes(esc(s)), `${c.id} ekran: ${s.slice(0, 40)}`);
    }
    assert.ok(!ps.includes(DASHAKOOT_METHOD_TEXT) && !h.includes(esc(DASHAKOOT_METHOD_TEXT)), `${c.id}: eski yöntem metni yok`);
    const lr = x.rows.find((r) => r.id === "rasyadhipati")!;
    const par = rasiPariharaText(rc, [lr.person1.label, lr.person2.label]);
    if (par) assert.ok(ps.includes(par) && h.includes(esc(par)), `${c.id} istisna`);
    const kv = d.find((e) => (e as unknown[])[0] === "kv") as unknown[];
    const totalKv = (kv[1] as string[][]).find((r) => r[0] === "Karşılanan kriter")![1];
    if (x.total === null) {
      assert.equal(totalKv, `${x.totalRange![0]}–${x.totalRange![1]} / 10 (Rasi belirsiz)`);
      assert.ok(h.includes(`${x.totalRange![0]}–${x.totalRange![1]}`) && h.includes(esc(RASI_TOTAL_UNCERTAIN_NOTE)) && ps.includes(RASI_TOTAL_UNCERTAIN_NOTE), c.id);
    } else {
      assert.equal(totalKv, `${x.total} / 10`);
      assert.ok(!h.includes(esc(RASI_TOTAL_UNCERTAIN_NOTE)) && !ps.includes(RASI_TOTAL_UNCERTAIN_NOTE));
    }
    for (const s of [...ps, h]) assert.ok(!/\broxy\b/i.test(s), `${c.id}: marka-nötr`);
  }
  assert.deepEqual([...seen].sort(), ["matched", "uncertain", "unmatched"]);
});

t("Yorum ekranı = Word/PDF: değerlendirme gizliyse aynı açıklama; servis cümlesi ve Rasi notu basılmaz", () => {
  const c = CASES.find((k) => k.technical.rows.find((r) => r.id === "rasi")!.count === 12)!;
  const i = apply(c.technical).interpretation!;
  assert.equal(i.verdictWithheld, "rasi_local");
  const h = renderToStaticMarkup(createElement(DashakootInterpContent, { c: i }));
  const d = doc((bb) => vedicPoruthamInterpBlocks(bb, i as never));
  const flat = JSON.stringify(d);
  assert.ok(h.includes(esc(DASHAKOOT_VERDICT_WITHHELD_TEXT)) && flat.includes(JSON.stringify(DASHAKOOT_VERDICT_WITHHELD_TEXT).slice(1, -1)));
  for (const s of ["servis cümlesi", "rasi notu"]) assert.ok(!h.includes(s) && !flat.includes(s), s);
  assert.ok(!h.includes('<div class="font-medium">Servisin genel değerlendirmesi</div>') && !flat.includes('["h",3,"Servisin genel değerlendirmesi"]'), "değerlendirme başlığı yok");
  const same = CASES.find((k) => k.technical.rows.find((r) => r.id === "rasi")!.count === 7)!;
  const j = apply(same.technical).interpretation!;
  const hj = renderToStaticMarkup(createElement(DashakootInterpContent, { c: j }));
  assert.ok(hj.includes("Servisin genel değerlendirmesi") && hj.includes("servis cümlesi") && !hj.includes(esc(DASHAKOOT_VERDICT_WITHHELD_TEXT)) && !hj.includes("rasi notu"));
});

t("KB konuları: belirsiz Rasi için konu üretilmez; diğer kriterler aynen", () => {
  const c = CASES.find((k) => k.technical.rows.find((r) => r.id === "rasi")!.count === 1)!;
  const x = apply(c.technical).technical;
  const keys = JSON.stringify(topicsFromVedicDashakoot(x));
  assert.ok(!keys.includes("porutham_result:rasi"), keys);
  const before = JSON.stringify(topicsFromVedicDashakoot(c.technical));
  for (const id of PORUTHAM_IDS.filter((k) => k !== "rasi")) {
    const m = c.technical.rows.find((r) => r.id === id)!.matched ? "matched" : "unmatched";
    assert.equal(keys.includes(`porutham_result:${id}:${m}`), before.includes(`porutham_result:${id}:${m}`), id);
  }
});

t("Fail-closed: Rasi satırı okunamazsa sonuç ÜRETİLMEZ; başarısız projeksiyon aynen geçer", () => {
  const tech = structuredClone(CASES[0].technical);
  tech.rows.find((r) => r.id === "rasi")!.person1.raw = "Ophiuchus";
  const r = applyClassicalRasi({ ok: true, technical: tech, interpretation: null, unmappedFields: [], droppedValues: [] });
  assert.equal(r.ok, false);
  const f = applyClassicalRasi({ ok: false, errors: ["x"] });
  assert.deepEqual(f, { ok: false, errors: ["x"] });
});

console.log(`\ndashakoot-rasi harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
