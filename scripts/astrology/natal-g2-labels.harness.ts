/**
 * G2 — NATAL BURÇ / DERECE / DAKİKA ETİKET KATMANI harness'i (2026-11-22; onaylı tasarım G1-R4-S2). Ağ / DB / sağlayıcı YOK.
 *
 *   • Veri bütünlüğü: dondurulmuş teknik veri çizimden sonra AYNI; etiket değerleri formatDegree ile tablolarla aynı; her gövde
 *     KENDİ burç sembolünü taşır; ℞ yalnız geri hareketli gövdede; gerçek konum çentiği gerçek boylamda (geri hesap).
 *   • Geometri: açı dairesi 122, ev numarası 136, ev çizgileri / gerçek eksenler; açı çizgisi sayısı mevcut filtreyle aynı.
 *   • Yerleşim: etiket kendi burç diliminde (≥ 0,6° pay); ayrıntılı görünümde tekil etiketler arası ≥ minSep; grup etiketi kendi
 *     burcunda, sayı = üye sayısı; her gövde çarkta tam bir kez (tekil ya da grupta).
 *   • Anlamsal yakınlaştırma: K küçüldükçe grup sayısı artmaz; ölçek 1'de K = 1.
 *   • Saat bilinmiyor (maskeli): Ay hiçbir biçimde çizilmez, gruplara sayılmaz; açı çizgisi / ev / eksen / özel nokta yok; diğer
 *     değerler "≈"; tablolar: Ay satırı Owner metni, Ay açıları listede yok, dağılım Ay hariç 9 gezegen.
 *   • 8 ev sistemi: ev başlangıcı etiketleri houses[] ile aynı; Tam Burç / Eşit Ev'de gerçek ASC/MC ekseni ev başlangıcından ayrı.
 *   • `labels` verilmeyen NatalWheel çizimi bu harness'ın kapsamı dışında DEĞİŞMEZ (natal-wheel-display harness BASELINE sha).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/natal-g2-labels.harness.ts
 *   (CSS modülü yükleyicisi aşağıda ilk içe aktarma olarak kaydedilir → `npm run test:astrology` ve astrology-run-all ile aynı)
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
// I18N-F1-R5: Natal paneli metinlerini katalogdan alır → next-intl sağlayıcılı çizim (varsayılan TR; beklentiler değişmedi).
import { renderToStaticMarkup } from "./intlRender";
import NatalWheel, { type NatalWheelDisplay } from "@/app/admin/astroloji/_components/NatalWheel";
import NatalTechnicalPanel from "@/app/admin/astroloji/_components/NatalTechnicalPanel";
import { NatalGroupDetails, NatalLabelSheet, natalWheelGroups } from "@/app/admin/astroloji/_components/NatalLabelDetails";
import { natalWheelDisplay } from "@/app/admin/astroloji/_components/NatalChartControls";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { maskTimeDependent } from "@/lib/astrology/view/natalView";
import { deriveLocalNatalHouses } from "@/lib/astrology/houses/natalLocal";
import { SIGN_IDS, type NatalTechnical } from "@/lib/astrology/model/western";
import { BODY_LABELS, formatDegree, SIGN_GLYPHS, SIGN_LABELS } from "@/lib/astrology/labels/tr";
import { DEFAULT_PREFS, hiddenBodiesFor, isAspectDrawn, parsePrefs, type NatalLabelPref, type NatalWheelPrefs } from "@/lib/astrology/view/natalWheelDisplay";
import { LABEL_GEO, labelsDetailed, layoutLabels, MOON_UNKNOWN_ROW, MOON_UNKNOWN_TEXT, semanticZoom } from "@/lib/astrology/view/natalLabelLayout";
import { positionRow } from "@/lib/astrology/view/natalPositionView";
import { listedNatalAspects, timeUnknownDistribution } from "@/lib/astrology/view/natalTimeUnknown";

const ROOT = join(__dirname, "..", "..");
const FIX = join(__dirname, "fixtures");
let pass = 0;
let fail = 0;
const info: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message.split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

const golden = (() => {
  const raw = JSON.parse(readFileSync(join(FIX, "roxy-natal-golden-2026-10-07.json"), "utf8"));
  const p = projectRoxyNatal(raw.response ?? raw, { houseSystem: "placidus", nodeType: "true" });
  if (!p.ok) throw new Error("golden projeksiyon başarısız");
  return deepFreeze(p.value.technical as NatalTechnical);
})();
const cumra = deepFreeze(JSON.parse(readFileSync(join(FIX, "natal-display", "cumra-1987-swisseph-ref.json"), "utf8")).technical as NatalTechnical);
const cases = (JSON.parse(readFileSync(join(FIX, "pro-natal-houses", "roxy-natal-technical-2026-10-31.json"), "utf8")).cases as { id: string; technical: NatalTechnical }[]).map((c) => ({
  id: c.id,
  t: deepFreeze(c.technical),
}));
const ALL_T: { id: string; t: NatalTechnical }[] = [{ id: "golden", t: golden }, { id: "cumra", t: cumra }, ...cases];

const ALL_POINTS = { nodes: true, chiron: true, lilith: true, vertex: true, fortune: true };
function prefs(mode: "basic" | "pro", labels: NatalLabelPref, points = ALL_POINTS): NatalWheelPrefs {
  return { ...DEFAULT_PREFS, mode, labels, points: { basic: { ...points }, pro: { ...points } } };
}
function render(t: NatalTechnical, d: NatalWheelDisplay) {
  return renderToStaticMarkup(createElement(NatalWheel, { technical: t, tinted: true, display: d }));
}

// Çark geometrisi geri hesap: x = C + r cos((180 + lon − asc)°), y = C − r sin(...)
const C = 302;
const lonOf = (x: number, y: number, asc: number) => ((((Math.atan2(-(y - C), x - C) * 180) / Math.PI - 180 + asc) % 360) + 360) % 360;
const radOf = (x: number, y: number) => Math.hypot(x - C, y - C);
const angDist = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
};
const sIdx = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30) % 12;
const unesc = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const textOf = (html: string) => unesc(html.replace(/<title>[\s\S]*?<\/title>/g, "").replace(/<[^>]+>/g, ""));

type Single = { id: string; kind: "body" | "point"; disp: number; x1: number; y1: number; block: string };
function singles(svg: string): Single[] {
  const out: Single[] = [];
  const re = /<g data-(body|point)="([a-z_]+)"(?: data-focus="1")? data-disp="([\d.]+)"[^>]*><line x1="([\d.-]+)" y1="([\d.-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const end = svg.indexOf("</g></g>", m.index);
    out.push({ kind: m[1] as "body" | "point", id: m[2], disp: Number(m[3]), x1: Number(m[4]), y1: Number(m[5]), block: svg.slice(m.index, end + 8) });
  }
  return out;
}
function groupsOf(svg: string) {
  return [...svg.matchAll(/<g data-group="([a-z]+)" data-ids="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)].map((m) => ({ sign: m[1], ids: m[2].split(" "), count: Number(m[3].match(/data-group-count="(\d+)"/)?.[1]) }));
}
const rowText = (block: string, row: string) => textOf(block.match(new RegExp(`data-row="${row}"[^>]*>([\\s\\S]*?)</text>`))?.[1] ?? "");

function main() {
  console.log("natal-g2-labels harness");

  test("ölçek 1'de K = 1 (onaylı R4 düzeni); dar görünüm eşiği eff < 0,7; yakınlaştırınca K küçülür (en az 0,25)", () => {
    assert.deepEqual(semanticZoom(700, 1).K, 1);
    assert.equal(semanticZoom(700, 1).compact, false);
    assert.equal(semanticZoom(350, 1).compact, true);
    assert.equal(semanticZoom(0, 1).compact, false);
    assert.ok(semanticZoom(700, 2).K < 1 && semanticZoom(700, 8).K === 0.25);
    assert.equal(semanticZoom(350, 2).compact, false);
  });

  // ── Veri bütünlüğü + geometri + yerleşim: 202 harita × (Profesyonel/Temel) × (Ayrıntılı/Sade) ──
  const stats = { maps: 0, singles: 0, grouped: 0, groups: 0, sepViolDetailed: 0, sepViolSimple: 0, cusps: 0 };
  test("202 harita: her gövde çarkta tam bir kez; gerçek çentik gerçek boylamda; etiket kendi burç diliminde; değerler formatDegree ile aynı; kendi burç sembolü; ℞ doğru", () => {
    for (const { id, t } of ALL_T) {
      const asc = t.angles!.ascendant.longitude;
      for (const mode of ["pro", "basic"] as const)
        for (const lab of ["detailed", "simple"] as const) {
          const d = natalWheelDisplay(t, prefs(mode, lab), { timeUnknown: false });
          const svg = render(t, d);
          stats.maps++;
          const expectBodies = t.bodies.filter((b) => !d.hiddenBodies.has(b.id));
          const expectPts = d.extraPoints.map((p) => p.id);
          for (const b of expectBodies) assert.equal((svg.match(new RegExp(`data-body="${b.id}"`, "g")) ?? []).length, 1, `${id} ${mode}/${lab} ${b.id} tam bir kez`);
          for (const p of expectPts) assert.equal((svg.match(new RegExp(`data-point="${p}"`, "g")) ?? []).length, 1, `${id} ${p}`);
          const ss = singles(svg);
          const gs = groupsOf(svg);
          stats.singles += ss.length;
          stats.grouped += gs.reduce((n, g) => n + g.ids.length, 0);
          stats.groups += gs.length;
          assert.equal(ss.length + gs.reduce((n, g) => n + g.ids.length, 0), expectBodies.length + expectPts.length, `${id} toplam`);
          for (const s of ss) {
            const rec = s.kind === "body" ? t.bodies.find((b) => b.id === s.id)! : s.id === "fortune" ? t.points.partOfFortune! : t.points.vertex!;
            assert.ok(angDist(lonOf(s.x1, s.y1, asc), rec.longitude) < 0.005, `${id} ${s.id} çentik`);
            assert.ok(Math.abs(radOf(s.x1, s.y1) - 238) < 0.02, `${id} ${s.id} çentik yarıçapı`);
            const start = sIdx(rec.longitude) * 30;
            const off = ((((s.disp - start) % 360) + 360) % 360);
            assert.ok(off >= 0.6 - 1e-6 && off <= 29.4 + 1e-6, `${id} ${s.id} etiket burç diliminde (${off.toFixed(3)})`);
            const [dg, mn] = formatDegree(rec.degreeInSign).split("°");
            assert.equal(rowText(s.block, "deg").replace("℞", ""), `${dg}°`, `${id} ${s.id} derece`);
            assert.equal(rowText(s.block, "min"), mn, `${id} ${s.id} dakika`);
            if (lab === "detailed") assert.equal(rowText(s.block, "sign"), SIGN_GLYPHS[rec.sign], `${id} ${s.id} kendi burcu`);
            const retro = s.kind === "body" && (rec as NatalTechnical["bodies"][number]).retrograde;
            assert.equal(s.block.includes('data-retro="1"'), !!retro, `${id} ${s.id} ℞`);
          }
          for (const g of gs) {
            assert.equal(g.count, g.ids.length, `${id} grup sayısı`);
            for (const k of g.ids) {
              const lon = k.startsWith("x:") ? (k === "x:fortune" ? t.points.partOfFortune! : t.points.vertex!).longitude : t.bodies.find((b) => b.id === k)!.longitude;
              assert.equal(SIGN_IDS[sIdx(lon)], g.sign, `${id} ${k} kendi burcunun grubunda`);
            }
          }
          // ayrıntılı: tekil etiketler arası açısal ayrım ≥ minSep (ekran profili, K=1)
          const ds = ss.map((s) => s.disp).sort((a, b) => a - b);
          const sep = LABEL_GEO.screen.minSep; // layoutLabels ile aynı (iki düzen, ekran profili, K = 1)
          for (let i = 0; i < ds.length; i++) {
            const gap = i + 1 < ds.length ? ds[i + 1] - ds[i] : ds[0] + 360 - ds[i];
            if (ds.length > 1 && gap < sep - 0.06) {
              if (lab === "detailed") stats.sepViolDetailed++;
              else stats.sepViolSimple++;
            }
          }
        }
    }
    assert.equal(stats.sepViolDetailed, 0, `ayrıntılı görünümde ayrım ihlali ${stats.sepViolDetailed}`);
    assert.equal(stats.sepViolSimple, 0, `sade görünümde ayrım ihlali ${stats.sepViolSimple}`);
    info.push(`yerleşim: ${stats.maps} çark · ${stats.singles} tekil etiket · ${stats.groups} grup (${stats.grouped} gövde) · ayrım ihlali ayrıntılı ${stats.sepViolDetailed} / sade ${stats.sepViolSimple}`);
  });

  test("geometri korunur: açı dairesi 122, ev numaraları 136, ev başlangıcı etiketleri houses[] (burç + derece + dakika), ASC/DSC/MC/IC levhası angles", () => {
    for (const { id, t } of ALL_T.slice(0, 60)) {
      const svg = render(t, natalWheelDisplay(t, prefs("pro", "detailed"), { timeUnknown: false }));
      assert.match(svg, /<circle cx="302" cy="302" r="122"/);
      const nums = [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*data-house-num="(\d+)"/g)];
      assert.equal(nums.length, 12, `${id} ev numarası`);
      for (const m of nums) assert.ok(Math.abs(radOf(Number(m[1]), Number(m[2])) - 136) < 0.02, `${id} ev ${m[3]} yarıçapı`);
      for (const h of t.houses) {
        const m = svg.match(new RegExp(`<g data-cusp-degree="${h.number}"[\\s\\S]*?</g>`));
        const axis = [1, 4, 7, 10].includes(h.number) && (() => {
          const A = t.angles!;
          const a = h.number === 1 ? A.ascendant.longitude : h.number === 7 ? A.ascendant.longitude + 180 : h.number === 10 ? A.midheaven.longitude : A.midheaven.longitude + 180;
          return angDist(a, h.longitude) < 0.02;
        })();
        if (axis) {
          assert.ok(!m, `${id} eksen ev ${h.number} levhada`);
          continue;
        }
        assert.ok(m, `${id} ev ${h.number} etiketi`);
        stats.cusps++;
        const [dg, mn] = formatDegree(h.degreeInSign).split("°");
        assert.equal(textOf(m![0]), `${dg}°${SIGN_GLYPHS[h.sign]}${mn}`, `${id} ev ${h.number}`);
        assert.ok(m![0].includes(`${h.number}. ev başlangıcı — ${SIGN_LABELS[h.sign]} ${formatDegree(h.degreeInSign)}`));
      }
      const A = t.angles!;
      for (const [k, lon] of [["ASC", A.ascendant.longitude], ["DSC", A.ascendant.longitude + 180], ["MC", A.midheaven.longitude], ["IC", A.midheaven.longitude + 180]] as const) {
        const l = ((lon % 360) + 360) % 360;
        const m = svg.match(new RegExp(`<g data-angle="${k}"[\\s\\S]*?</g>`));
        assert.ok(m && textOf(m[0]).endsWith(`${SIGN_GLYPHS[SIGN_IDS[sIdx(l)]]} ${formatDegree(l % 30)}`), `${id} ${k}`);
      }
    }
  });

  test("açı çizgileri: sayı ve kimlikler mevcut filtreyle (isAspectDrawn) aynı; toplam = liste", () => {
    for (const { id, t } of ALL_T.filter((x) => x.t.aspects.length > 0)) {
      for (const mode of ["pro", "basic"] as const) {
        const d = natalWheelDisplay(t, prefs(mode, "auto"), { timeUnknown: false });
        const svg = render(t, d);
        const exp = t.aspects.filter((a) => isAspectDrawn(a, mode, d.hiddenBodies, d.aspectFilter)).map((a) => `${a.a}-${a.b}-${a.type}`);
        const got = [...svg.matchAll(/data-aspect="([a-z_-]+)"/g)].map((m) => m[1]);
        assert.deepEqual(got, exp, `${id} ${mode}`);
        assert.match(svg, new RegExp(`data-aspects-total="${t.aspects.length}" data-aspects-drawn="${exp.length}"`));
      }
    }
  });

  test("teknik veri değişmez (dondurulmuş; tüm modlar art arda) ve etiket tercihi: Moda göre → Temel sade, Profesyonel ayrıntılı", () => {
    const before = JSON.stringify(cumra);
    for (const m of ["pro", "basic"] as const) for (const l of ["auto", "simple", "detailed"] as const) render(cumra, natalWheelDisplay(cumra, prefs(m, l), { timeUnknown: false }));
    assert.equal(JSON.stringify(cumra), before);
    assert.equal(labelsDetailed("auto", "pro"), true);
    assert.equal(labelsDetailed("auto", "basic"), false);
    assert.equal(labelsDetailed("detailed", "basic"), true);
    assert.equal(labelsDetailed("simple", "pro"), false);
    assert.match(render(cumra, natalWheelDisplay(cumra, prefs("basic", "auto"), { timeUnknown: false })), /data-label-layout="simple"/);
    assert.match(render(cumra, natalWheelDisplay(cumra, prefs("pro", "auto"), { timeUnknown: false })), /data-label-layout="detailed"/);
    assert.equal(parsePrefs(null).labels, "auto");
    assert.equal(parsePrefs(JSON.stringify({ mode: "basic", labels: "detailed" })).labels, "detailed");
    assert.equal(parsePrefs(JSON.stringify({ labels: "x" })).labels, "auto");
    // labels verilmezse önceki display katmanı (natal-wheel-display BASELINE kapsamı)
    assert.ok(!renderToStaticMarkup(createElement(NatalWheel, { technical: cumra, tinted: true, display: natalWheelDisplay(cumra, prefs("pro", "auto")) })).includes("data-label-layout"));
  });

  test("Vertex / Şans Noktası açık/kapalı: kapalıyken çizilmez; açıkken kendi burcu ve değeriyle", () => {
    const off = { ...ALL_POINTS, vertex: false, fortune: false };
    const s0 = render(cumra, natalWheelDisplay(cumra, prefs("pro", "detailed", off), { timeUnknown: false }));
    assert.ok(!s0.includes("data-point="));
    for (const lab of ["detailed", "simple"] as const) {
      const s1 = render(cumra, natalWheelDisplay(cumra, prefs("pro", lab), { timeUnknown: false }));
      assert.ok(s1.includes('data-point="vertex"') && s1.includes('data-point="fortune"'));
      // tekilse ipucu kendi değeriyle; gruptaysa grup kendi burcunda (Vertex Koç, Şans Noktası Balık)
      const single = new Map(singles(s1).map((s) => [s.id, s.block]));
      const grp = groupsOf(s1);
      for (const [id, key, sign, txt] of [["vertex", "x:vertex", "aries", "Vertex — Koç 28°44′"], ["fortune", "x:fortune", "pisces", "Şans Noktası — Balık 29°24′"]] as const) {
        if (single.has(id)) assert.ok(unesc(single.get(id)!).includes(txt), `${lab} ${id}`);
        else assert.ok(grp.some((g) => g.sign === sign && g.ids.includes(key)), `${lab} ${id} grupta`);
        assert.equal(positionRow(cumra, key, false)!.full, txt.split(" ").pop());
      }
    }
  });

  test("anlamsal yakınlaştırma: K küçüldükçe grup sayısı artmaz; en büyük yakınlaştırmada (K=0,25) grup kalan harita sayısı raporlanır", () => {
    let withGroups = 0;
    let remaining = 0;
    let dissolved = 0;
    for (const { t } of ALL_T) {
      const items = [...t.bodies.map((b) => ({ id: b.id as string, lon: b.longitude }))];
      let prev = Infinity;
      for (const K of [1, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25]) {
        const n = layoutLabels(items, { detailed: true, profile: "screen", K }).groups.length;
        assert.ok(n <= prev, `K=${K}: ${n} > ${prev}`);
        prev = n;
      }
      const g1 = layoutLabels(items, { detailed: true, profile: "screen", K: 1 }).groups.length;
      if (g1) {
        withGroups++;
        if (prev > 0) remaining++;
        else dissolved++;
      }
    }
    info.push(`yakınlaştırma: 100%'de grup olan ${withGroups} haritanın ${dissolved}'ünde en büyük ölçekte bütün gruplar tekil etikete ayrılıyor; ${remaining} haritada grup kalıyor`);
  });

  test("açı filtresi odağı: tekil gövdede glif halkası, grupta kalan gövdede gerçek konum çentiğinde işaret (data-focus); yalnız odak açıları", () => {
    let grouped = 0;
    for (const { id, t } of ALL_T.filter((x) => x.t.aspects.length > 0)) {
      for (const b of t.bodies) {
        if (!t.aspects.some((a) => a.a === b.id || a.b === b.id)) continue;
        const p = prefs("pro", "detailed");
        const d = natalWheelDisplay(t, { ...p, filter: { ...p.filter, focus: b.id } }, { timeUnknown: false });
        const svg = render(t, d);
        assert.equal((svg.match(/data-focus="1"/g) ?? []).length, 1, `${id} ${b.id}`);
        assert.match(svg, new RegExp(`data-focus="1" data-body="${b.id}"|data-body="${b.id}" data-focus="1"`), `${id} ${b.id}`);
        if (/data-grouped="1" data-focus="1"/.test(svg)) grouped++;
        for (const m of svg.matchAll(/data-aspect="([a-z_]+)-([a-z_]+)-[a-z_]+"/g)) assert.ok(m[1] === b.id || m[2] === b.id);
      }
    }
    assert.ok(grouped > 0, "grupta odak örneği yok");
    info.push(`odak: grupta kalan odak gövdesi ${grouped} durumda işaretli`);
  });

  // ── Saat bilinmiyor ──
  const masked = ALL_T.slice(0, 40).map(({ id, t }) => ({ id, t: deepFreeze(maskTimeDependent(t as NatalTechnical)), orig: t }));
  test("saat bilinmiyor: Ay çarkta HİÇBİR biçimde yok (simge, etiket, çentik, grup üyeliği, ipucu); grup sayıları Ay'sız", () => {
    for (const { id, t } of masked)
      for (const mode of ["pro", "basic"] as const)
        for (const lab of ["detailed", "simple"] as const) {
          const d = natalWheelDisplay(t, prefs(mode, lab), { timeUnknown: true });
          const svg = render(t, d);
          assert.ok(!svg.includes('data-body="moon"'), `${id} Ay gövdesi`);
          assert.ok(!textOf(svg).includes("☽"), `${id} Ay simgesi`);
          assert.ok(!/<title>Ay —/.test(svg) && !/aria-label="Ay /.test(svg), `${id} Ay ipucu`);
          for (const g of groupsOf(svg)) {
            assert.ok(!g.ids.includes("moon"), `${id} grupta Ay`);
            assert.equal(g.count, g.ids.length);
            assert.ok(!/(^|, )Ay(,|$| \()/.test(g.ids.map((k) => BODY_LABELS[k as keyof typeof BODY_LABELS] ?? k).join(", ")));
          }
          assert.match(svg, /data-aspects-drawn="0"/);
          assert.ok(!/data-aspect=|data-cusp-degree|data-angle=|data-axis=|data-cusp-line|data-house-num|data-point=/.test(svg), `${id} saat bağımlı öğe`);
          assert.match(svg, /Ay çizilmedi \(konumu doğrulanamıyor\)/);
          for (const s of singles(svg)) assert.ok(rowText(s.block, "deg").startsWith("≈") || rowText(s.block, "sign").includes("≈"), `${id} ${s.id} ≈`);
          assert.equal(singles(svg).length + groupsOf(svg).reduce((n, g) => n + g.ids.length, 0), t.bodies.filter((b) => !d.hiddenBodies.has(b.id) && b.id !== "moon").length);
        }
  });

  test("saat bilinmiyor: tablolar — Ay satırı Owner metni (burç/derece yok), Ay açıları listede yok, dağılım Ay hariç 9 gezegen, kalanlar ≈ 12:00", () => {
    for (const { id, t, orig } of masked.slice(0, 20)) {
      const moon = orig.bodies.find((b) => b.id === "moon")!;
      const moonTxt = `${SIGN_LABELS[moon.sign]} ${formatDegree(moon.degreeInSign)}`;
      const planets = renderToStaticMarkup(createElement(NatalTechnicalPanel, { technical: t, timeUnknown: true, part: "planets" }));
      const moonRow = planets.match(/<tr data-moon-unknown="1">[\s\S]*?<\/tr>/)?.[0] ?? "";
      assert.ok(moonRow.includes(MOON_UNKNOWN_ROW), `${id} Ay satırı`);
      assert.ok(!moonRow.includes(moonTxt) && !moonRow.includes(formatDegree(moon.degreeInSign)), `${id} Ay değeri sızıyor`);
      assert.ok(unesc(planets).includes(MOON_UNKNOWN_TEXT));
      assert.equal((planets.match(/data-assumed="1"/g) ?? []).length, t.bodies.length - 1, `${id} ≈ 12:00 etiketi`);
      const aspects = renderToStaticMarkup(createElement(NatalTechnicalPanel, { technical: t, timeUnknown: true, part: "aspects" }));
      const listed = listedNatalAspects(t.aspects, true);
      assert.ok(aspects.includes(`Açılar (${listed.length}) · ≈ 12:00 varsayımı`), `${id} açı başlığı`);
      assert.ok(!/>Ay – |– Ay</.test(aspects), `${id} Ay açısı listede`);
      const nMoon = t.aspects.length - listed.length;
      if (nMoon > 0) assert.ok(unesc(aspects).includes(`Ay'a bağlı ${nMoon} açı bu nedenle listelenmez.`));
      const ov = renderToStaticMarkup(createElement(NatalTechnicalPanel, { technical: t, timeUnknown: true, part: "overview" }));
      assert.match(ov, /data-method="time-unknown"/);
      const dd = timeUnknownDistribution(t);
      assert.ok(dd.available && Object.values(dd.elements).reduce((a, b) => a + b, 0) === 9 && Object.values(dd.modalities).reduce((a, b) => a + b, 0) === 9);
      assert.match(ov, /Açı dengesi \(Ay hariç, ≈ 12:00 varsayımı\)/);
    }
    // saat biliniyorken tablolar önceki gibi (Ay satırı normal, tüm açılar)
    const known = renderToStaticMarkup(createElement(NatalTechnicalPanel, { technical: cumra, timeUnknown: false, part: "planets" }));
    assert.ok(!known.includes("data-moon-unknown") && !known.includes("data-assumed") && !known.includes("natal-time-unknown-banner"));
    const ka = renderToStaticMarkup(createElement(NatalTechnicalPanel, { technical: cumra, timeUnknown: false, part: "aspects" }));
    assert.ok(ka.includes(`Açılar (${cumra.aspects.length})<`));
  });

  test("saat bilinmiyor: grup alanı + ayrıntı paneli — Ay kutusu Owner metniyle, Ay satırı / cetvel çentiği yok; konum satırı kuralı", () => {
    const { t } = masked[0];
    const d = natalWheelDisplay(t, prefs("pro", "detailed"), { timeUnknown: true });
    const gd = renderToStaticMarkup(createElement(NatalGroupDetails, { technical: t, display: d }));
    assert.ok(unesc(gd).includes(MOON_UNKNOWN_TEXT) && gd.includes('data-testid="natal-moon-unknown"'));
    assert.ok(!gd.includes('data-pos-row="moon"') && !gd.includes('data-strip="moon"'));
    const r = positionRow(t, "moon", true)!;
    assert.equal(r.status, "unknown");
    assert.equal(r.sign, null);
    assert.equal(r.full, null);
    assert.equal(positionRow(t, "sun", true)!.status, "assumed");
    assert.equal(positionRow(golden, "moon", false)!.status, "exact");
    for (const { t: mt } of masked) for (const g of natalWheelGroups(mt, natalWheelDisplay(mt, prefs("pro", "detailed"), { timeUnknown: true }))) assert.ok(!g.ids.includes("moon"));
    const sheet = renderToStaticMarkup(createElement(NatalLabelSheet, { technical: t, pick: { kind: "body", id: "sun" }, timeUnknown: true, onClose: () => {} }));
    assert.ok(sheet.includes('data-sheet-status="assumed"') && sheet.includes("≈ ") && sheet.includes("hesaplanamaz (saat bilinmiyor)"));
  });

  test("grup alanı (saat biliniyor): çarktaki gruplarla aynı; her satır burç / derece / dakika / ℞ / ev", () => {
    let checked = 0;
    for (const { t } of ALL_T) {
      const d = natalWheelDisplay(t, prefs("pro", "detailed"), { timeUnknown: false });
      const groups = natalWheelGroups(t, d);
      if (!groups.length) continue;
      const svgGroups = groupsOf(render(t, d)).map((g) => `${g.sign}:${g.ids.join(" ")}`);
      assert.deepEqual(groups.map((g) => `${g.sign}:${g.ids.join(" ")}`), svgGroups);
      const html = renderToStaticMarkup(createElement(NatalGroupDetails, { technical: t, display: d }));
      for (const g of groups)
        for (const k of g.ids) {
          const r = positionRow(t, k, false)!;
          assert.ok(html.includes(`data-pos-row="${k}" data-status="exact" data-sign="${r.sign}" data-full="${r.full}"`), k);
        }
      if (++checked >= 40) break;
    }
    assert.ok(checked > 0, "grup içeren harita yok");
    info.push(`grup alanı: ${checked} haritada çark grupları = panel grupları`);
  });

  // ── 8 ev sistemi ──
  test("8 ev sistemi: ev başlangıcı etiketleri houses[] ile aynı; Tam Burç / Eşit Ev'de gerçek ASC/MC ekseni ev başlangıcından ayrı; ayrıntı paneli farkı yazar", () => {
    const base = cases.find((c) => c.t.houseSystem === "placidus" && Math.abs(c.t.echo.latitude) < 55)!.t;
    const ws = cases.find((c) => c.t.houseSystem === "whole-sign")!.t;
    const ascLon = base.angles!.ascendant.longitude;
    const mk = (hs: string, cusps: number[]) =>
      deepFreeze({
        ...base,
        houseSystem: hs,
        houses: cusps.map((lon, i) => {
          const l = ((lon % 360) + 360) % 360;
          return { number: i + 1, longitude: l, sign: SIGN_IDS[sIdx(l)], degreeInSign: l % 30 };
        }),
      } as unknown as NatalTechnical);
    const systems: { name: string; t: NatalTechnical; note: string }[] = [
      { name: "placidus", t: base, note: "sağlayıcı fixture" },
      { name: "whole-sign", t: ws, note: "sağlayıcı fixture" },
      { name: "equal", t: mk("equal", Array.from({ length: 12 }, (_, i) => ascLon + i * 30)), note: "tanım gereği ASC + 30°·k (yalnız görünüm testi)" },
      { name: "koch", t: mk("koch", base.houses.map((h) => h.longitude)), note: "Koch sağlayıcı fixture'ı YOK — ev dizisi yerine Placidus dizisi (yalnız görünüm testi; Koch değer doğruluğu DOĞRULANAMADI)" },
    ];
    for (const sys of ["regiomontanus", "campanus", "porphyry", "alcabitius"] as const) {
      const r = deriveLocalNatalHouses(base, sys);
      assert.ok(r.ok, `${sys} yerel motor`);
      systems.push({ name: sys, t: deepFreeze(r.technical as unknown as NatalTechnical), note: "mevcut yerel ev motoru (natalLocal; değiştirilmedi)" });
    }
    for (const s of systems) {
      const svg = render(s.t, natalWheelDisplay(s.t, prefs("pro", "detailed"), { timeUnknown: false }));
      const A = s.t.angles!;
      let labels = 0;
      for (const h of s.t.houses) {
        const m = svg.match(new RegExp(`<g data-cusp-degree="${h.number}"[\\s\\S]*?</g>`));
        if (!m) continue;
        labels++;
        const [dg, mn] = formatDegree(h.degreeInSign).split("°");
        assert.equal(textOf(m[0]), `${dg}°${SIGN_GLYPHS[h.sign]}${mn}`, `${s.name} ev ${h.number}`);
      }
      const axes = [...svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)"[^>]*data-axis="(\d+)"/g)].map((m) => ({ n: Number(m[3]), lon: lonOf(Number(m[1]), Number(m[2]), A.ascendant.longitude) }));
      for (const ax of axes) {
        const exp = ax.n === 1 ? A.ascendant.longitude : ax.n === 7 ? A.ascendant.longitude + 180 : ax.n === 10 ? A.midheaven.longitude : A.midheaven.longitude + 180;
        assert.ok(angDist(ax.lon, exp) < 0.005, `${s.name} eksen ${ax.n} gerçek açıda`);
      }
      if (s.name === "whole-sign") assert.ok(axes.some((a) => a.n === 1) && axes.some((a) => a.n === 10), "Tam Burç: ASC ve MC ayrı eksen");
      if (s.name === "equal") assert.ok(!axes.some((a) => a.n === 1) && axes.some((a) => a.n === 10), "Eşit Ev: ASC = 1. ev, MC ayrı");
      if (s.name === "placidus") assert.equal(axes.length, 0);
      const mcSheet = renderToStaticMarkup(createElement(NatalLabelSheet, { technical: s.t, pick: { kind: "angle", id: "MC" }, timeUnknown: false, onClose: () => {} }));
      const mcSeparate = angDist(A.midheaven.longitude, s.t.houses.find((h) => h.number === 10)!.longitude) >= 0.02;
      assert.equal(mcSheet.includes("natal-sheet-axis-note"), mcSeparate, `${s.name} MC notu`);
      info.push(`ev sistemi ${s.name}: ${labels} ev başlangıcı etiketi + ${12 - labels} eksen levhasında · ayrı eksen ${axes.map((a) => a.n).join("/") || "yok"} · ${s.note}`);
    }
  });

  test("statik: yeni görünüm modülleri ağ / sağlayıcı / kayıt çağrısı içermez; rapor (wheelSvg / report) dosyaları bu modülleri içe aktarmaz", () => {
    for (const f of [
      "lib/astrology/view/natalLabelLayout.ts",
      "lib/astrology/view/natalPositionView.ts",
      "lib/astrology/view/natalTimeUnknown.ts",
      "app/admin/astroloji/_components/NatalWheelLabeled.tsx",
      "app/admin/astroloji/_components/NatalLabelDetails.tsx",
    ]) {
      const s = readFileSync(join(ROOT, f), "utf8");
      assert.ok(!/fetch\(|\/api\/|roxy|supabase|saveAnalysis|localStorage/i.test(s), f);
    }
    // Ortak rapor çizicisi (diğer tekniklerin çarkı) G2 görünüm katmanını HİÇ kullanmaz.
    const ws = readFileSync(join(ROOT, "lib/astrology/report/wheelSvg.ts"), "utf8");
    assert.ok(!/natalLabelLayout|natalPositionView|natalTimeUnknown|NatalWheelLabeled|natalWheelReport/.test(ws), "wheelSvg.ts");
    // G3 (2026-11-22, Owner onayı: "G2'nin ortak gösterim kurallarını yeniden kullan"): rapor modeli YALNIZ saf kural modüllerini
    // (React bileşeni değil) içe aktarır ve bunları yalnız Natal bölümünde kullanır (natal-g3-report harness'ı davranışı doğrular).
    const model = readFileSync(join(ROOT, "lib/astrology/report/model.ts"), "utf8");
    assert.ok(!/NatalWheelLabeled|_components\//.test(model), "model.ts React bileşeni içe aktarmamalı");
    // G3 (2026-11-23): yoğun burç derece cetveli (natalDegreeRulerFigures) da aynı sınırda — yalnız Natal bölümü / Natal çark kurulumu.
    const uses = [...model.matchAll(/\b(positionRow|listedNatalAspects|patternInvolvesMoon|aspectBalanceOf|timeUnknownDistribution|natalReportLayout|natalDegreeRulerFigures)\(/g)].map((m) => m.index!);
    const natalStart = model.indexOf("// ─── G3 (2026-11-22): Natal raporu");
    const natalEnd = model.indexOf("/** Natal dağılım satırları (Word/PDF)");
    const assembly = model.indexOf('if (chart && technique === "western.natal" && tech)');
    assert.ok(uses.length > 0 && uses.every((i) => (i > natalStart && i < natalEnd) || (i > assembly && i < assembly + 900)), "G2 kuralları rapor modelinde yalnız Natal bölümünde");
    for (const f of ["TimingPanels.tsx", "PlanetaryReturnPanel.tsx", "LocationPanels.tsx", "horary/WesternHoraryDesk.tsx"])
      assert.ok(!/natalWheelDisplay\(|NatalWheelLabeled|natalLabelLayout/.test(readFileSync(join(ROOT, "app/admin/astroloji/_components", f), "utf8")), f);
  });

  for (const l of info) console.log(`  · ${l}`);
  console.log(`\nnatal-g2-labels harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void hiddenBodiesFor;
main();
