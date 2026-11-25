/**
 * G4 — NATAL ÖZET: Güneş / Ay / Yükselen kartları (2026-11-23). Ağ / DB / sağlayıcı YOK.
 *   • Değerler kayıtlı teknik veriyle birebir: Güneş ve Ay = bodies[] (burç + formatDegree), Yükselen = angles.ascendant
 *     (200 gerçek sağlayıcı fixture'ı + golden + Çumra Swiss Ephemeris referansı; 0°00′ / 29°59′ sınırları dahil).
 *   • Saat bilinmiyor (maskeli kayıt, G2 kuralı): Güneş "≈" + 12:00 varsayımı notu; Ay belirsiz (burç / derece YOK, Owner metni);
 *     Yükselen bilinmiyor. Ham teknik veri değişmez (dondurulmuş nesne).
 *   • Kartlar Özet sekmesinin EN ÜSTÜNDE (kayıtlı analiz + canlı sonuç; G2 grup alanı ve teknik bölümlerden önce), yalnız Özet'te;
 *     NatalTechnicalPanel (Açısal noktalar, Dağılım özeti, tam görünüm, diğer sekmeler) DEĞİŞMEDİ.
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/natal-g4-key-placements.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
// I18N-F1-R5: Natal paneli metinlerini katalogdan alır → next-intl sağlayıcılı çizim (varsayılan TR; beklentiler değişmedi).
import { renderToStaticMarkup } from "./intlRender";
import NatalTechnicalPanel, { NatalKeyPlacementCards } from "@/app/admin/astroloji/_components/NatalTechnicalPanel";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { maskTimeDependent } from "@/lib/astrology/view/natalView";
import type { NatalTechnical } from "@/lib/astrology/model/western";
import { formatDegree, SIGN_GLYPHS, SIGN_LABELS } from "@/lib/astrology/labels/tr";
import { MOON_UNKNOWN_TEXT } from "@/lib/astrology/view/natalLabelLayout";
import { KEY_ASC_UNKNOWN_NOTE, KEY_MOON_UNKNOWN_NOTE, natalKeyPlacements } from "@/lib/astrology/view/natalKeyPlacements";

const FIX = join(__dirname, "fixtures");
let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message.split("\n").slice(0, 5).join("\n    ")}`);
  }
}
const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
};

const golden = (() => {
  const raw = JSON.parse(readFileSync(join(FIX, "roxy-natal-golden-2026-10-07.json"), "utf8"));
  const p = projectRoxyNatal(raw.response ?? raw, { houseSystem: "placidus", nodeType: "true" });
  if (!p.ok) throw new Error("golden");
  return p.value.technical as NatalTechnical;
})();
const cumra = JSON.parse(readFileSync(join(FIX, "natal-display", "cumra-1987-swisseph-ref.json"), "utf8")).technical as NatalTechnical;
const cases = (JSON.parse(readFileSync(join(FIX, "pro-natal-houses", "roxy-natal-technical-2026-10-31.json"), "utf8")).cases as { id: string; technical: NatalTechnical }[]).map((c) => ({ id: c.id, t: c.technical }));
const ALL = [{ id: "golden", t: golden }, { id: "cumra", t: cumra }, ...cases].map(({ id, t }) => ({ id, t: deepFreeze(t) }));
const unesc = (h: string) => h.replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
const html = (t: NatalTechnical, tu: boolean, part: "all" | "overview" | "planets" | "houses" | "aspects") => unesc(renderToStaticMarkup(createElement(NatalTechnicalPanel, { technical: t, timeUnknown: tu, part })));
const cardsHtml = (t: NatalTechnical, tu: boolean) => unesc(renderToStaticMarkup(createElement(NatalKeyPlacementCards, { technical: t, timeUnknown: tu })));
const cardsOf = (h: string) => [...h.matchAll(/<div [^>]*?data-key="(sun|moon|asc)" data-status="(\w+)" data-sign="(\w*)" data-degree="([^"]*)"/g)].map((m) => ({ key: m[1], status: m[2], sign: m[3], degree: m[4] }));

function main() {
  console.log("natal-g4-key-placements harness");

  test(`saat biliniyor (${ALL.length} harita): Güneş / Ay = bodies[] burç + derece°dakika′, Yükselen = angles.ascendant; kesin (≈ yok)`, () => {
    for (const { id, t } of ALL) {
      const k = natalKeyPlacements(t, false);
      assert.deepEqual(k.map((x) => x.key), ["sun", "moon", "asc"], id);
      for (const [i, bid] of [[0, "sun"], [1, "moon"]] as const) {
        const b = t.bodies.find((x) => x.id === bid)!;
        assert.equal(k[i].status, "exact", `${id} ${bid}`);
        assert.equal(k[i].sign, b.sign, `${id} ${bid} burç`);
        assert.equal(k[i].signName, SIGN_LABELS[b.sign]);
        assert.equal(k[i].signGlyph, SIGN_GLYPHS[b.sign]);
        assert.equal(k[i].degree, formatDegree(b.degreeInSign), `${id} ${bid} derece`);
        assert.equal(k[i].note, null);
      }
      assert.equal(k[2].status, "exact", `${id} asc`);
      assert.equal(k[2].sign, t.angles!.ascendant.sign, `${id} asc burç`);
      assert.equal(k[2].degree, formatDegree(t.angles!.ascendant.degreeInSign), `${id} asc derece`);
    }
  });

  test("sınır değerleri: 29°59′ ve 0°00′ yuvarlanmaz, burç değişmez (gerçek fixture taraması)", () => {
    let edges = 0;
    for (const { id, t } of ALL) {
      const vals = [t.bodies.find((b) => b.id === "sun")!, t.bodies.find((b) => b.id === "moon")!, t.angles!.ascendant];
      const k = natalKeyPlacements(t, false);
      vals.forEach((v, i) => {
        if (v.degreeInSign >= 29.983 || v.degreeInSign < 1 / 60) {
          edges++;
          assert.equal(k[i].sign, v.sign, id);
          assert.ok(!k[i].degree!.startsWith("30°"), id);
        }
      });
    }
    assert.ok(edges > 0, "sınır vakası yok");
    console.log(`    · sınır vakası ${edges}`);
  });

  test("saat bilinmiyor (maskeli kayıt): Güneş ≈ + 12:00 notu; Ay belirsiz (burç / derece yok, Owner metni); Yükselen bilinmiyor; ham veri değişmez", () => {
    for (const { id, t } of ALL.slice(0, 60)) {
      const m = deepFreeze(maskTimeDependent(t));
      const k = natalKeyPlacements(m, true);
      const sun = m.bodies.find((b) => b.id === "sun")!;
      assert.equal(k[0].status, "assumed", id);
      assert.equal(k[0].sign, sun.sign);
      assert.equal(k[0].degree, formatDegree(sun.degreeInSign));
      assert.ok(k[0].note && k[0].note.includes("12:00 varsayımı"), id);
      assert.equal(k[1].status, "unknown", id);
      assert.equal(k[1].sign, null);
      assert.equal(k[1].degree, null);
      assert.equal(k[1].note, KEY_MOON_UNKNOWN_NOTE);
      assert.equal(k[1].detail, MOON_UNKNOWN_TEXT, "Owner metni ipucunda");
      assert.equal(k[2].status, "unknown", id);
      assert.equal(k[2].sign, null);
      assert.equal(k[2].note, KEY_ASC_UNKNOWN_NOTE);
    }
  });

  test("kart bileşeni (SSR): üç kart sırayla, değerler kartta doğru (≈ yok)", () => {
    for (const { id, t } of ALL.slice(0, 30)) {
      const h = cardsHtml(t, false);
      const cards = cardsOf(h);
      assert.deepEqual(cards.map((c) => c.key), ["sun", "moon", "asc"], id);
      const k = natalKeyPlacements(t, false);
      cards.forEach((c, i) => {
        assert.equal(c.status, "exact");
        assert.equal(c.sign, k[i].sign);
        assert.equal(c.degree, k[i].degree);
      });
      assert.ok(!h.includes("≈"), id);
    }
  });

  test("yerleşim (kaynak): kayıtlı analiz ve canlı sonuç Özet sekmesinde kartlar G2 grup alanından ve teknik panelden ÖNCE; yalnız Özet (harita) sekmesinde", () => {
    for (const [f, v] of [["app/admin/astroloji/_components/SavedAnalyses.tsx", "natal"], ["app/admin/astroloji/page.tsx", "natalTech"]] as const) {
      const src = readFileSync(join(__dirname, "..", "..", f), "utf8");
      const uses = [...src.matchAll(/<NatalKeyPlacementCards /g)];
      assert.equal(uses.length, 1, f);
      const at = uses[0].index!;
      assert.ok(src.slice(at - 60, at).includes(`{tab === "harita" && ${v} && `), `${f}: yalnız Özet sekmesi`);
      assert.ok(at < src.indexOf("<NatalGroupDetails", at - 400) && at < src.indexOf('part="overview"', at), `${f}: grup alanı ve panelden önce`);
    }
  });

  test("kart bileşeni (SSR, saat bilinmiyor): Ay kartında burç / derece YOK (Ay'ın 12:00 değeri sızmaz); Yükselen \"Bilinmiyor\"", () => {
    for (const { id, t } of ALL.slice(0, 30)) {
      const m = maskTimeDependent(t);
      const h = cardsHtml(m, true);
      const cards = cardsOf(h);
      assert.deepEqual(cards.map((c) => `${c.key}:${c.status}`), ["sun:assumed", "moon:unknown", "asc:unknown"], id);
      assert.equal(cards[1].sign, "");
      assert.equal(cards[1].degree, "");
      const moonCard = h.slice(h.indexOf('data-key="moon"'), h.indexOf('data-key="asc"'));
      const moon = m.bodies.find((b) => b.id === "moon")!;
      assert.ok(!moonCard.includes(formatDegree(moon.degreeInSign)) && !moonCard.includes(SIGN_LABELS[moon.sign]), `${id}: Ay değeri sızıyor`);
      assert.ok(moonCard.includes("Belirsiz") && moonCard.includes(KEY_MOON_UNKNOWN_NOTE) && moonCard.includes(`title="${MOON_UNKNOWN_TEXT}"`));
      // Owner'ın tam metni Özet'teki saat uyarısında da (G2 kuralı; panel değişmedi).
      assert.ok(html(m, true, "overview").includes(MOON_UNKNOWN_TEXT), `${id}: uyarıda Owner metni`);
      const ascCard = h.slice(h.indexOf('data-key="asc"'));
      assert.ok(ascCard.includes("Bilinmiyor"), id);
      const sunCard = h.slice(h.indexOf('data-key="sun"'), h.indexOf('data-key="moon"'));
      assert.ok(sunCard.includes("≈ ") && sunCard.includes("12:00 varsayımı"), id);
    }
  });

  test("kapsam: NatalTechnicalPanel kartsız ve bölümleri yerinde — Özet (Açısal noktalar + Dağılım özeti), tam görünüm (Transit / Solar Arc natal paneli), diğer sekmeler", () => {
    const ov = html(golden, false, "overview");
    assert.ok(ov.includes("Açısal noktalar") && ov.includes("Dağılım özeti"));
    for (const part of ["overview", "all", "planets", "houses", "aspects"] as const) {
      assert.ok(!html(golden, false, part).includes("natal-key-placements"), part);
      assert.ok(!html(maskTimeDependent(golden), true, part).includes("natal-key-placements"), `${part} saatsiz`);
    }
  });

  console.log(`\nnatal-g4-key-placements harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
main();
