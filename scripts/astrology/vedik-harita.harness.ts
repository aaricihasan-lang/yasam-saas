/**
 * ASTROLOJİ — VEDİK HARİTA harness'i (22.10.2026): Bhav Chalit · Chara Karaka · Arudha Pada · Bhava Bala.
 *
 * Kaynak: 5 GERÇEK sağlayıcı yanıtı (fixtures/golden/vedic-bhav-chalit, vedic-chara-karakas-eight, vedic-chara-karakas-seven,
 * vedic-arudha, vedic-bhava-bala; sentetik kişi A 1990-07-15 14:30 İstanbul +3, Lahiri). Bu harness sağlayıcıya çağrı YAPMAZ.
 *
 *   A) golden ↔ ürün gövdesi BİREBİR; projeksiyon kabul, bilinmeyen alan 0, sağlayıcı metni yalnız yorum katmanında
 *   B) BAĞIMSIZ doğrulama (D1 + Shadbala golden'larından aritmetik): chalit rashi evi = D1 bütün-burç evi; karaka sırası = D1
 *      dereceleri; Arudha formülü = D1 lord konumları; Bhava Bala toplam = bileşenler, Bhavadhipati = lordun Shadbala toplamı
 *   C) fail-closed (bozuk yanıt → PROVIDER_INVALID_RESPONSE, kayıt yok) · D) saat yok → TIME_REQUIRED (0 istek)
 *   E) plan / önbellek / ayanamsa + şema anahtarları · F) kaydet → aç (0 istek) · G) Word/PDF · H) yetki + yorum kapısı
 *   I) konular / not bağlamı / KB · J) mevcut 27 tekniğin hesap birimi özeti DEĞİŞMEDİ (taban 93b16b06 ile aynı sabit özet)
 *   K) UI yardımcıları + sahte arka uç birebir gövde eşleşmesi
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/vedik-harita.harness.ts
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, parseNoteContext, TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { getAnalysis, getWorkspace, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { createKb } from "@/lib/astrology/kb/service";
import { vedicBirthBody } from "@/lib/astrology/providers/roxy/requests";
import { projectRoxyVedicD1, projectRoxyVedicShadbala } from "@/lib/astrology/providers/roxy/vedic";
import {
  arudhaOf,
  charaKarakaBody,
  projectRoxyVedicArudha,
  projectRoxyVedicBhavaBala,
  projectRoxyVedicBhavChalit,
  projectRoxyVedicCharaKaraka,
  ROXY_VEDIC_ARUDHA,
  ROXY_VEDIC_BHAVA_BALA,
  ROXY_VEDIC_BHAV_CHALIT,
  ROXY_VEDIC_CHARA_KARAKA,
} from "@/lib/astrology/providers/roxy/vedicHarita";
import { SIGN_LORDS } from "@/lib/astrology/model/kp";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import type { VedicD1Technical, VedicShadbalaTechnical } from "@/lib/astrology/model/vedic";
import type { VedicBhavChalitTechnical } from "@/lib/astrology/model/vedicHarita";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { buildAnalysisReport } from "@/lib/astrology/report/service";
import { renderFigureSvg } from "@/lib/astrology/report/figurePng";
import { interpretationKindOfSchema } from "@/lib/astrology/interpretationKind";
import { hasNoProviderInterpretation } from "@/lib/astrology/noProviderInterp";
import { isSectionKeyForTechnique, parseAnyTopicKey, topicsForTechnique } from "@/lib/astrology/topics/index";
import { buildSelections, defaultParams, describeOptions, missingReason, TECHNIQUE_META, UI_TECHNIQUES } from "@/app/admin/astroloji/_lib/techniques";
import { chalitCellRashi, chalitKundliTitles, toChalitKundliData } from "@/app/admin/astroloji/_lib/chalitKundli";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { SYNTH_A, SYNTH_B } from "./golden/phase3-golden-calls";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8")) as { endpoint: string; query: null; body: Record<string, unknown>; response: J };
const GC = load("vedic-bhav-chalit");
const GK8 = load("vedic-chara-karakas-eight");
const GK7 = load("vedic-chara-karakas-seven");
const GA = load("vedic-arudha");
const GB = load("vedic-bhava-bala");
const D1 = load("vedic-d1");
const SB = load("vedic-shadbala");
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const USER_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const USER_A2 = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

const GOLDENS = [GC, GK8, GK7, GA, GB];
/** Sahte sağlayıcı: YALNIZ gerçek golden'ı olan BİREBİR gövde döner (Lahiri dışı ayanamsa için SENTETİK frame yankısı — yalnız anahtar testi). */
function roxy(mutate?: (endpoint: string, r: J) => void) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-vh", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const lahiri = { ...body, ayanamsa: "lahiri" };
      const hit = GOLDENS.find((g) => g.endpoint === endpoint && canon(g.body) === canon(lahiri));
      if (!hit) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = structuredClone(hit.response);
      if (body.ayanamsa !== "lahiri") r.frame = { ...r.frame, ayanamsa: body.ayanamsa };
      mutate?.(endpoint, r);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}
async function profile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, preview = false) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: preview });
const SEL = {
  chalit: { technique: "vedic.bhav_chalit", options: {} },
  k8: { technique: "vedic.chara_karaka", options: {} },
  k7: { technique: "vedic.chara_karaka", options: { scheme: "seven" } },
  arudha: { technique: "vedic.arudha", options: {} },
  bala: { technique: "vedic.bhava_bala", options: {} },
};
const ALL4 = [SEL.chalit, SEL.k8, SEL.arudha, SEL.bala];
const NEW_IDS = ["vedic.bhav_chalit", "vedic.chara_karaka", "vedic.arudha", "vedic.bhava_bala"] as const;
const ok = (r: J) => {
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual(r.unmappedFields, []);
  assert.deepEqual(r.droppedValues, []);
  return r;
};
const d1 = ok(projectRoxyVedicD1(D1.response, { ayanamsa: "lahiri" })).technical as VedicD1Technical;
const sb = ok(projectRoxyVedicShadbala(SB.response, { ayanamsa: "lahiri" })).technical as VedicShadbalaTechnical;
/** Sağlayıcı metinleri (yalnız yorum katmanında olmalı). */
const PROVIDER_TEXTS = [
  ...GK8.response.karakas.map((k: J) => k.significations as string),
  ...GA.response.padas.map((p: J) => p.significations as string),
];
const THEME = GC.response.houseThemes["11"][4] as string; // "dileklerin gerçekleşmesi"

async function docxText(buf: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
async function pdfText(buf: Uint8Array): Promise<string> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
  return (text as string).replace(/\s+/g, " ");
}

async function main() {
  // ═══ A) GOLDEN ↔ ÜRÜN ═══════════════════════════════════════════════════════
  await t("A: 5 golden gövdesi = ürünün kendi üreticisi (kişi A, Lahiri, doğum ofseti açık; Chara şeması açık)", () => {
    const lahiri = vedicBirthBody(SYNTH_A, "lahiri");
    assert.equal(canon(GC.body), canon(lahiri));
    assert.equal(canon(GA.body), canon(lahiri));
    assert.equal(canon(GB.body), canon(lahiri));
    assert.equal(canon(GK8.body), canon(charaKarakaBody(SYNTH_A, "lahiri", "eight")));
    assert.equal(canon(GK7.body), canon(charaKarakaBody(SYNTH_A, "lahiri", "seven")));
    assert.equal(GC.endpoint, ROXY_VEDIC_BHAV_CHALIT.endpoint);
    assert.equal(GK8.endpoint, ROXY_VEDIC_CHARA_KARAKA.endpoint);
    assert.equal(GA.endpoint, ROXY_VEDIC_ARUDHA.endpoint);
    assert.equal(GB.endpoint, ROXY_VEDIC_BHAVA_BALA.endpoint);
    assert.equal(lahiri.timezone, 3);
  });

  await t("A: projeksiyonlar kabul; bilinmeyen/düşen alan 0; sağlayıcı metni teknik katmanda YOK, yorum katmanında VAR", () => {
    const all = [
      projectRoxyVedicBhavChalit(GC.response, { ayanamsa: "lahiri" }),
      projectRoxyVedicCharaKaraka(GK8.response, { ayanamsa: "lahiri", scheme: "eight" }),
      projectRoxyVedicCharaKaraka(GK7.response, { ayanamsa: "lahiri", scheme: "seven" }),
      projectRoxyVedicArudha(GA.response, { ayanamsa: "lahiri" }),
      projectRoxyVedicBhavaBala(GB.response, { ayanamsa: "lahiri" }),
    ].map(ok);
    for (const r of all) {
      const tech = JSON.stringify(r.technical);
      for (const x of [...PROVIDER_TEXTS, THEME]) assert.ok(!tech.includes(x), `teknik katmanda sağlayıcı metni: ${x.slice(0, 30)}`);
      assert.ok(r.interpretation, "yorum katmanı");
    }
    const c = all[0].technical as VedicBhavChalitTechnical;
    assert.equal(c.houseSystem, "sripati");
    assert.equal(c.lagnaRashi, "libra");
    assert.equal(c.bhavas.length, 12);
    assert.equal(c.movedCount, 1);
    assert.deepEqual(c.grahas.filter((g) => g.moved).map((g) => [g.id, g.rashiHouse, g.bhava]), [["moon", 6, 7]]);
    assert.equal(all[1].technical.karakas.length, 8);
    assert.equal(all[2].technical.karakas.length, 7);
    assert.ok(!all[2].technical.karakas.some((k: J) => k.graha === "rahu" || k.id === "pitrikaraka"));
    assert.deepEqual([all[3].technical.arudhaLagna, all[3].technical.upapada], ["aquarius", "taurus"]);
    assert.equal(all[4].technical.bhavas.find((b: J) => b.rank === 1).house, 11);
    assert.ok(JSON.stringify(all[1].interpretation).includes(GK8.response.karakas[0].significations));
    assert.ok(JSON.stringify(all[0].interpretation).includes(THEME));
  });

  // ═══ B) BAĞIMSIZ DOĞRULAMA ══════════════════════════════════════════════════
  await t("B: Bhav Chalit — graha boylamları D1 golden'ıyla aynı (±0,001°) ve rashi evi = D1 bütün-burç evi (9/9); D1 Lagna = chalit Lagna rashisi", () => {
    const c = ok(projectRoxyVedicBhavChalit(GC.response, { ayanamsa: "lahiri" })).technical as VedicBhavChalitTechnical;
    assert.equal(c.lagnaRashi, d1.lagna.rashi);
    for (const g of c.grahas) {
      const x = d1.grahas.find((y) => y.id === g.id)!;
      assert.ok(Math.abs(x.longitude - g.longitude) < 0.001, `${g.id} boylam ${x.longitude} ≠ ${g.longitude}`);
      assert.equal(g.rashi, x.rashi, g.id);
      assert.equal(g.rashiHouse, x.house, `${g.id}: chalit yanıtındaki rashi evi D1 evinden farklı`);
    }
    assert.ok(Math.abs(c.ascendant - d1.lagna.longitude) < 0.001, "Yükselen");
  });

  await t("B: Chara Karaka — sıra D1 burç içi derecelerinden bağımsız sıralamayla aynı (8'li: Rahu 30° − derece; 7'li: Rahu yok)", () => {
    const deg = (id: string) => d1.grahas.find((g) => g.id === id)!.degreeInRashi;
    const classical = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];
    const order8 = [...classical, "rahu"].map((id) => ({ id, r: id === "rahu" ? 30 - deg(id) : deg(id) })).sort((a, b) => b.r - a.r).map((x) => x.id);
    const order7 = classical.map((id) => ({ id, r: deg(id) })).sort((a, b) => b.r - a.r).map((x) => x.id);
    const k8 = ok(projectRoxyVedicCharaKaraka(GK8.response, { ayanamsa: "lahiri", scheme: "eight" })).technical;
    const k7 = ok(projectRoxyVedicCharaKaraka(GK7.response, { ayanamsa: "lahiri", scheme: "seven" })).technical;
    assert.deepEqual(k8.karakas.map((k: J) => k.graha), order8);
    assert.deepEqual(k7.karakas.map((k: J) => k.graha), order7);
    for (const k of k8.karakas) assert.ok(Math.abs(k.degreeInRashi - deg(k.graha)) < 1e-3, k.graha);
    assert.equal(k8.karakas.find((k: J) => k.graha === "rahu").id, "pitrikaraka");
    assert.deepEqual([k8.atmakaraka, k8.darakaraka, k7.atmakaraka, k7.darakaraka], ["moon", "venus", "moon", "venus"]);
  });

  await t("B: Arudha — D1 golden lord konumlarından aritmetik (sayım + 1./7. → 10.) 12/12 sağlayıcıyla aynı; ekol farkları belgelenir", () => {
    const at = (g: string) => d1.grahas.find((x) => x.id === g)!.rashi;
    const lagna = d1.lagna.rashi;
    const a = ok(projectRoxyVedicArudha(GA.response, { ayanamsa: "lahiri" })).technical;
    const noException: string[] = [];
    const nodeLord: string[] = [];
    for (let h = 1; h <= 12; h++) {
      const br = SIGN_IDS[(SIGN_IDS.indexOf(lagna) + h - 1) % 12] as SignId;
      const lord = SIGN_LORDS[br];
      const f = arudhaOf(br, at(lord));
      const p = a.padas[h - 1];
      assert.equal(p.lordRashi, at(lord), `A${h}: sağlayıcı lord rashisi D1'den farklı`);
      assert.equal(p.rashi, f.rashi, `A${h}`);
      if (f.exception) noException.push(`${p.id}: istisnasız ${f.rawRashi} / istisnalı ${f.rashi}`);
      // Ekol farkı (belge): Akrep için Ketu, Kova için Rahu eş-lord olarak alınırsa (bazı Jaimini ekolleri, güçlü lord seçimi).
      const co: Record<string, string> = { scorpio: "ketu", aquarius: "rahu" };
      if (co[br]) {
        const alt = arudhaOf(br, at(co[br]));
        if (alt.rashi !== p.rashi) nodeLord.push(`${p.id} (${br}): klasik lord ${p.rashi} / ${co[br]} ile ${alt.rashi}`);
      }
    }
    // Belgelenen ekol farkı: istisnanın uygulandığı padalar (istisnasız ekolde sonuç değişir) ve eş-lord seçimi.
    assert.deepEqual(noException, ["a3: istisnasız sagittarius / istisnalı virgo", "a6: istisnasız virgo / istisnalı gemini", "a7: istisnasız aries / istisnalı capricorn"]);
    assert.deepEqual(a.padas.filter((p: J) => p.exceptionApplied).map((p: J) => p.id), ["a3", "a6", "a7"]);
    console.log(`     ekol notu (istisna): ${noException.join(" · ")}`);
    console.log(`     ekol notu (eş-lord): ${nodeLord.join(" · ") || "fark yok"}`);
  });

  await t("B: Bhava Bala — toplam = 3 bileşen (12/12, ±0,05); rupa = virupa/60; Bhavadhipati Bala = ev lordunun Shadbala toplamı (Shadbala golden'ı, 12/12)", () => {
    const b = ok(projectRoxyVedicBhavaBala(GB.response, { ayanamsa: "lahiri" })).technical;
    for (const x of b.bhavas) {
      assert.ok(Math.abs(x.bhavadhipatiBala + x.digBala + x.drishtiBala - x.totalVirupas) < 0.05, `${x.house}`);
      assert.ok(Math.abs(x.totalVirupas / 60 - x.totalRupas) < 0.006, `${x.house} rupa`);
      const lordSb = sb.planets.find((p) => p.id === x.lord)!;
      assert.ok(Math.abs(lordSb.totalVirupas - x.bhavadhipatiBala) < 0.011, `${x.house}. ev: Bhavadhipati ${x.bhavadhipatiBala} ≠ ${x.lord} Shadbala ${lordSb.totalVirupas}`);
    }
    // Bhava madhyaları Bhav Chalit (Sripati) madhyalarıyla aynı.
    const c = ok(projectRoxyVedicBhavChalit(GC.response, { ayanamsa: "lahiri" })).technical as VedicBhavChalitTechnical;
    for (const x of b.bhavas) assert.ok(Math.abs(c.bhavas[x.house - 1].madhya - x.madhya) < 0.001, `${x.house} madhya`);
  });

  // ═══ C) FAIL-CLOSED ═════════════════════════════════════════════════════════
  await t("C: bozuk yanıtlar REDDEDİLİR (4 teknik × birden çok bozulma); kök/dizi yok → red; yeni alan → yalnız yolu raporlanır", () => {
    const m = (g: J, f: (r: J) => void) => {
      const r = structuredClone(g.response);
      f(r);
      return r;
    };
    const C1: [string, (r: J) => void][] = [
      ["ayanamsa", (r) => (r.frame.ayanamsa = "raman")],
      ["bhava eksik", (r) => r.bhavas.pop()],
      ["span", (r) => (r.bhavas[2].span = 31)],
      ["madhya ≠ Yükselen", (r) => (r.ascendant = 192)],
      ["rashi evi", (r) => (r.grahas[0].rashiHouse = 10)],
      ["moved", (r) => (r.grahas[1].moved = false)],
      ["bhava sınırı", (r) => (r.grahas[0].bhava = 10)],
      ["movedCount", (r) => (r.movedCount = 2)],
      ["graha adı", (r) => (r.grahas[0].graha = "Pluto")],
    ];
    for (const [n, f] of C1) assert.equal(projectRoxyVedicBhavChalit(m(GC, f), { ayanamsa: "lahiri" }).ok, false, `chalit ${n}`);
    const C2: [string, (r: J) => void][] = [
      ["şema", (r) => (r.scheme = "seven")],
      ["sıra", (r) => ([r.karakas[0], r.karakas[1]] = [r.karakas[1], r.karakas[0]])],
      ["rahu ters", (r) => (r.karakas[4].isReversed = false)],
      ["derece", (r) => (r.karakas[0].rankingDegree = 1)],
      ["AK", (r) => (r.atmakaraka = "Sun")],
      ["eksik", (r) => r.karakas.pop()],
    ];
    for (const [n, f] of C2) assert.equal(projectRoxyVedicCharaKaraka(m(GK8, f), { ayanamsa: "lahiri", scheme: "eight" }).ok, false, `karaka ${n}`);
    assert.equal(projectRoxyVedicCharaKaraka(GK8.response, { ayanamsa: "lahiri", scheme: "seven" }).ok, false, "8'li yanıt 7'li istekle");
    const C3: [string, (r: J) => void][] = [
      ["pada rashi", (r) => (r.padas[0].rashi = "Leo")],
      ["istisna bayrağı", (r) => (r.padas[2].exceptionApplied = false)],
      ["lord", (r) => (r.padas[1].lord = "Ketu")],
      ["AL", (r) => (r.arudhaLagna = "Leo")],
      ["UL", (r) => (r.upapada = "Leo")],
      ["Lagna'dan ev", (r) => (r.padas[4].houseFromLagna = 2)],
      ["bhava rashisi", (r) => (r.padas[0].bhavaRashi = "Aries")],
    ];
    for (const [n, f] of C3) assert.equal(projectRoxyVedicArudha(m(GA, f), { ayanamsa: "lahiri" }).ok, false, `arudha ${n}`);
    const C4: [string, (r: J) => void][] = [
      ["toplam", (r) => (r.bhavas[0].totalVirupas = 500)],
      ["rupa", (r) => (r.bhavas[0].totalRupas = 9)],
      ["sıra", (r) => (r.bhavas[0].rank = 1)],
      ["lord", (r) => (r.bhavas[0].lord = "Sun")],
      ["bhavadhipati tutarlılığı", (r) => ((r.bhavas[7].bhavadhipatiBala = 400), (r.bhavas[7].totalVirupas = 433.87), (r.bhavas[7].totalRupas = 7.23))],
    ];
    for (const [n, f] of C4) assert.equal(projectRoxyVedicBhavaBala(m(GB, f), { ayanamsa: "lahiri" }).ok, false, `bala ${n}`);
    for (const fn of [projectRoxyVedicBhavChalit, projectRoxyVedicArudha, projectRoxyVedicBhavaBala]) {
      assert.equal(fn(null, { ayanamsa: "lahiri" }).ok, false);
      assert.equal(fn([], { ayanamsa: "lahiri" }).ok, false);
    }
    const extra = projectRoxyVedicArudha(m(GA, (r) => (r.newField = 1)), { ayanamsa: "lahiri" });
    assert.ok(extra.ok && extra.unmappedFields.includes("newField"));
  });

  await t("C: motor — bozuk yanıt → PROVIDER_INVALID_RESPONSE, sonuç kaydedilemez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const r = (await run(ctx, pa, [SEL.arudha], roxy((_e, x) => (x.padas[0].rashi = "Leo")).deps)).body as J;
    assert.ok(JSON.stringify(r).includes("PROVIDER_INVALID_RESPONSE"), JSON.stringify(r).slice(0, 300));
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SEL.arudha, saveRequestId: randomUUID() }, false);
    assert.notEqual(sv.status, 201);
  });

  // ═══ D) SAAT YOK ════════════════════════════════════════════════════════════
  await t("D: doğum saati bilinmiyor → 4 teknik TIME_REQUIRED (gerekçeli), 0 istek; kayıtlı sonuç saat bilinmeyen bağlamda maskelenir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pu = await profile(ctx, { timeKnown: false, birthTime: null, timeAccuracy: "unknown", label: "Saatsiz" });
    const rx = roxy();
    const u = (await run(ctx, pu, ALL4, rx.deps)).body as J;
    assert.equal(rx.calls.length, 0);
    assert.ok((u.results as J[]).every((x) => x.code === "TIME_REQUIRED"), JSON.stringify(u).slice(0, 300));
    assert.ok(JSON.stringify(u).includes("Yükselen"));
    for (const id of NEW_IDS) {
      assert.equal(getTechnique(id)!.requiresKnownTime, true);
      assert.equal(maskTechnical(id, { a: 1 }, { primary: false, partner: null }).masked, true, id);
    }
  });

  // ═══ E) PLAN / ÖNBELLEK ═════════════════════════════════════════════════════
  await t("E: plan 4 seçim → 4 yeni istek; çalıştır 4 istek; tekrar 0 istek (plan 0); 7'li şema ve Raman ayanamsa AYRI anahtar", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const p0 = (await planAstrology(ctx, { profileId: pa, selections: ALL4 })).body as J;
    assert.equal(p0.plan.newRequestCount, 4, JSON.stringify(p0.plan));
    const rx = roxy();
    const r1 = (await run(ctx, pa, ALL4, rx.deps)).body as J;
    assert.ok((r1.results as J[]).every((x) => x.ok), JSON.stringify(r1).slice(0, 400));
    assert.deepEqual(rx.calls.map((c) => c.endpoint).sort(), ["/vedic-astrology/arudha", "/vedic-astrology/bhav-chalit", "/vedic-astrology/bhava-bala", "/vedic-astrology/chara-karakas"]);
    assert.equal(rx.calls.find((c) => c.endpoint === "/vedic-astrology/chara-karakas")!.body.scheme, "eight");
    await run(ctx, pa, ALL4, rx.deps);
    assert.equal(rx.calls.length, 4, "önbellek");
    assert.equal(((await planAstrology(ctx, { profileId: pa, selections: ALL4 })).body as J).plan.newRequestCount, 0);
    assert.equal(((await planAstrology(ctx, { profileId: pa, selections: [SEL.k7] })).body as J).plan.newRequestCount, 1, "7'li şema ayrı anahtar");
    await run(ctx, pa, [SEL.k7], rx.deps);
    assert.equal(rx.calls.length, 5);
    assert.equal(rx.calls[4].body.scheme, "seven");
    const raman = ALL4.map((s) => ({ ...s, options: { ...s.options, ayanamsa: "raman" } }));
    assert.equal(((await planAstrology(ctx, { profileId: pa, selections: raman })).body as J).plan.newRequestCount, 4, "ayanamsa ayrı anahtar");
    for (const id of NEW_IDS) {
      const def = getTechnique(id)!;
      assert.equal(def.parseOptions({ ayanamsa: "custom" }, new Date()), null, `${id}: custom kapalı`);
      assert.equal(def.parseOptions({ ayanamsa: "fagan" }, new Date()), null);
    }
    assert.equal(getTechnique("vedic.chara_karaka")!.parseOptions({ scheme: "nine" }, new Date()), null);
  });

  // ═══ F) KAYDET → AÇ ═════════════════════════════════════════════════════════
  const saved = new Map<string, { ctx: EngineCtx; store: FakeStore; id: string; pa: string }>();
  await t("F: 4 teknik kaydedilir; arşivden açma 0 istek; snapshot teknik + seçenek + yorum (yetkiliyle)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, ALL4, rx.deps);
    const n = rx.calls.length;
    for (const s of ALL4) {
      const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...s, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
      assert.equal(sv.status, 201, JSON.stringify(sv.body));
      const id = (sv.body as J).analysisId;
      const a = ((await getAnalysis(ctx, id, false)).body as J).analysis;
      assert.equal(a.technique, s.technique);
      assert.ok(a.technical && a.technical.schema.startsWith("astro.vedic."), s.technique);
      assert.equal(a.interpretation.visible, true, `${s.technique} yorum`);
      saved.set(s.technique, { ctx, store, id, pa });
    }
    assert.equal(rx.calls.length, n, "arşivden açma sağlayıcı çağırdı");
    const k = ((await getAnalysis(ctx, saved.get("vedic.chara_karaka")!.id, false)).body as J).analysis;
    assert.equal(k.params.scheme, "eight");
  });

  // ═══ G) RAPOR ═══════════════════════════════════════════════════════════════
  const MARK: Record<string, string[]> = {
    "vedic.bhav_chalit": ["Bhav Chalit", "Bhava sınırları", "D1 (rashi) ile Bhav Chalit karşılaştırması", "Rashi evi (D1, bütün-burç)", "Chalit bhavası", "Sripati", "Bhav Chalit haritası"],
    "vedic.chara_karaka": ["Chara Karakalar", "Atmakaraka", "Darakaraka", "Pitrikaraka", "8 karaka (Rahu dahil", "Sıralama derecesi"],
    "vedic.arudha": ["Arudha Padalar", "Arudha Lagna (AL)", "Upapada (UL / A12)", "Lordun rashisi", "İstisna", "Evet (10.)"],
    "vedic.bhava_bala": ["Bhava Bala", "Bhavadhipati", "Shadbala ise GEZEGENİN", "Ev gücü grafiği", "Toplam (virupa)"],
  };
  const FORBIDDEN = /undefined|NaN|\[object Object\]|Roxy|golden|fixture|vedic-astrology\//;
  await t("G: rapor modeli — tekniğe özgü Türkçe başlıklar, D1/Chalit ayrımı, Shadbala/Bhava Bala ayrımı, Teknik Açıklama türü; yasak değer yok", async () => {
    for (const id of NEW_IDS) {
      const { ctx, id: aid } = saved.get(id)!;
      const a = ((await getAnalysis(ctx, aid, false)).body as J).analysis;
      const rep = buildAstroReport(a);
      const s = reportTexts(rep).join("\n");
      for (const m of MARK[id]) assert.ok(s.includes(m), `${id}: "${m}" yok`);
      assert.ok(!FORBIDDEN.test(s), `${id}: yasak değer ${s.match(FORBIDDEN)?.[0]}`);
      assert.ok(s.includes("Teknik Açıklama"), `${id}: yorum türü`);
      assert.equal(rep.hasInterpretation, true);
      assert.equal(rep.hasChart, id === "vedic.bhav_chalit" || id === "vedic.bhava_bala", id);
    }
    const chalit = reportTexts(buildAstroReport(((await getAnalysis(saved.get("vedic.bhav_chalit")!.ctx, saved.get("vedic.bhav_chalit")!.id, false)).body as J).analysis)).join("\n");
    assert.ok(!chalit.includes("D1 Rashi"), "chalit raporunda D1 harita adı");
  });

  await t("G: rapor görselleri — chalit kundli 9 graha + merkez 'Bhav Chalit' (D1 Rashi DEĞİL); Bhava Bala 12 çubuk", async () => {
    const fig = async (id: string) => {
      const { ctx, id: aid } = saved.get(id)!;
      const rep = buildAstroReport(((await getAnalysis(ctx, aid, false)).body as J).analysis);
      const ch = rep.blocks.find((b) => b.kind === "chart") as J;
      return renderFigureSvg(ch.figure);
    };
    const sv = await fig("vedic.bhav_chalit");
    assert.ok(sv.includes("Bhav Chalit") && !sv.includes("D1 Rashi"), "merkez etiketi");
    assert.equal((sv.match(/<text[^>]*>(?:Gü|Ay|Ma|Me|Jü|Ve|Sa|Ra|Ke)[^<]*<\/text>/g) ?? []).length >= 9, true, "9 graha etiketi");
    const bb = await fig("vedic.bhava_bala");
    assert.equal((bb.match(/data-bhava-bala="/g) ?? []).length, 12);
  });

  await t("G: Word + PDF dosyaları üretilir; tekniğe özgü işaretler ikisinde de; harita görseli gömülü (chalit / Bhava Bala); yasak değer yok", async () => {
    for (const id of NEW_IDS) {
      const { ctx, id: aid } = saved.get(id)!;
      const dx = await buildAnalysisReport(ctx, aid, "docx", false);
      const px = await buildAnalysisReport(ctx, aid, "pdf", false);
      assert.ok(dx.ok && px.ok, id);
      if (!dx.ok || !px.ok) continue;
      assert.equal(dx.hasChart, id === "vedic.bhav_chalit" || id === "vedic.bhava_bala", `${id}: Word görseli`);
      const d = await docxText(dx.bytes);
      const p = await pdfText(px.bytes);
      for (const m of MARK[id]) {
        assert.ok(d.includes(m), `${id} docx: ${m}`);
        assert.ok(p.includes(m.replace(/\s+/g, " ")), `${id} pdf: ${m}`);
      }
      assert.ok(!FORBIDDEN.test(d) && !FORBIDDEN.test(p), `${id}: yasak değer`);
    }
  });

  // ═══ H) YETKİ + YORUM KAPISI ════════════════════════════════════════════════
  await t("H: başka tenant / aynı tenant başka uzman → 404 (aç, çalıştır, not); yorum yetkisi yok / önizleme gizli → sağlayıcı metni SIZMAZ", async () => {
    const { store, id, pa } = saved.get("vedic.arudha")!;
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
    assert.equal((await run(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), pa, ALL4, roxy().deps)).status, 404);
    assert.equal((await saveExpertNote(ctxOf(store, { userId: USER_A2 }), { profileId: pa, technique: "vedic.arudha", noteContext: "ayanamsa:lahiri", sectionKey: "overall", body: "x", expectedRevision: null })).status, 404);
    const ctx = ctxOf(store);
    const rx = roxy();
    const vis = JSON.stringify((await run(ctx, pa, ALL4, rx.deps)).body);
    const hid = JSON.stringify((await run(ctxOf(store, { entitlements: NO_INTERP }), pa, ALL4, rx.deps)).body);
    const pre = JSON.stringify((await run(ctx, pa, ALL4, rx.deps, true)).body);
    assert.ok(PROVIDER_TEXTS.some((x) => vis.includes(x)) && vis.includes(THEME), "yetkili görmeli");
    for (const b of [hid, pre]) assert.ok(![...PROVIDER_TEXTS, THEME].some((x) => b.includes(x)), "yorum sızdı");
    const archHid = JSON.stringify(((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), id, false)).body as J).analysis);
    assert.ok(!PROVIDER_TEXTS.some((x) => archHid.includes(x)), "arşivde yorum sızdı");
    const repHid = reportTexts(buildAstroReport(((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), id, false)).body as J).analysis)).join("\n");
    assert.ok(!PROVIDER_TEXTS.some((x) => repHid.includes(x)), "raporda yorum sızdı");
    for (const s of ["astro.vedic.bhav_chalit.interp.v1", "astro.vedic.chara_karaka.interp.v1", "astro.vedic.arudha.interp.v1", "astro.vedic.bhava_bala.interp.v1"]) assert.equal(interpretationKindOfSchema(s), "Teknik Açıklama");
    for (const id2 of NEW_IDS) assert.equal(hasNoProviderInterpretation(id2), false);
  });

  // ═══ I) KONULAR / NOTLAR / KB ═══════════════════════════════════════════════
  await t("I: konu anahtarları DB biçiminde, Vedik gelenekte; chalit konusu D1 bağlamına GİRMEZ; Bhava Bala Shadbala bağlamına GİRMEZ; not bağlamı (şema dahil)", async () => {
    const tech = (g: J, f: (r: J) => J) => ok(f(g.response)).technical;
    const keys: Record<string, string[]> = {
      "vedic.bhav_chalit": topicsForTechnique("vedic.bhav_chalit", tech(GC, (r) => projectRoxyVedicBhavChalit(r, { ayanamsa: "lahiri" }))).map((x) => x.key),
      "vedic.chara_karaka": topicsForTechnique("vedic.chara_karaka", tech(GK8, (r) => projectRoxyVedicCharaKaraka(r, { ayanamsa: "lahiri", scheme: "eight" }))).map((x) => x.key),
      "vedic.arudha": topicsForTechnique("vedic.arudha", tech(GA, (r) => projectRoxyVedicArudha(r, { ayanamsa: "lahiri" }))).map((x) => x.key),
      "vedic.bhava_bala": topicsForTechnique("vedic.bhava_bala", tech(GB, (r) => projectRoxyVedicBhavaBala(r, { ayanamsa: "lahiri" }))).map((x) => x.key),
    };
    assert.ok(keys["vedic.bhav_chalit"].includes("chalit_graha_in_bhava:moon:7"));
    assert.ok(keys["vedic.chara_karaka"].includes("chara_karaka:atmakaraka:moon") && keys["vedic.chara_karaka"].includes("chara_karaka:pitrikaraka:rahu"));
    assert.ok(keys["vedic.arudha"].includes("arudha_pada_in_rashi:a1:aquarius") && keys["vedic.arudha"].includes("arudha_pada_in_bhava:a12:8"));
    assert.deepEqual(keys["vedic.bhava_bala"].sort(), ["bhava_bala_strongest:11", "bhava_bala_weakest:5"]);
    for (const [id, ks] of Object.entries(keys)) {
      assert.ok(ks.length > 0, id);
      for (const k of ks) {
        assert.match(k, /^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/);
        assert.ok(isSectionKeyForTechnique(id, k), `${id} ${k}`);
        assert.ok(!isSectionKeyForTechnique("vedic.d1", k) && !isSectionKeyForTechnique("vedic.shadbala", k), `${k} başka bağlama girdi`);
        assert.equal(parseAnyTopicKey("western", k), null);
        assert.equal(parseAnyTopicKey("kp", k), null);
      }
    }
    assert.ok(!isSectionKeyForTechnique("vedic.bhav_chalit", "graha_in_bhava:moon:6"), "D1 konusu chalit'e girdi");
    const def = getTechnique("vedic.chara_karaka")!;
    assert.deepEqual(parseNoteContext(def, "ayanamsa:lahiri|scheme:seven"), { ayanamsa: "lahiri", scheme: "seven" });
    assert.equal(parseNoteContext(def, "ayanamsa:lahiri"), null, "şemasız bağlam kanonik değil");
    assert.deepEqual(parseNoteContext(getTechnique("vedic.arudha")!, "ayanamsa:raman"), { ayanamsa: "raman" });
    // KB eşleşmesi + not kaydı + kayıtlı analizde not.
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    await run(ctx, pa, [SEL.chalit, SEL.k7], roxy().deps);
    await createKb(ctx, { tradition: "vedic", topicKey: "chalit_graha_in_bhava:moon:7", title: "Chalit Ay 7. bhava notum", body: "kb" });
    await createKb(ctx, { tradition: "vedic", topicKey: "graha_in_bhava:moon:6", title: "D1 Ay 6. ev notum", body: "kb" });
    const ws = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...SEL.chalit })).body as J;
    assert.deepEqual(ws.kbMatches.map((e: J) => e.title), ["Chalit Ay 7. bhava notum"], "D1 KB kaydı chalit'e karıştı");
    const wk = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...SEL.k7 })).body as J;
    assert.equal(wk.noteContext, "ayanamsa:lahiri|scheme:seven");
    const nr = await saveExpertNote(ctx, { profileId: pa, technique: "vedic.chara_karaka", noteContext: "ayanamsa:lahiri|scheme:seven", sectionKey: "chara_karaka:atmakaraka:moon", body: "7'li AK notu", expectedRevision: null });
    assert.equal(nr.status, 201, JSON.stringify(nr.body));
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.chara_karaka", noteContext: "ayanamsa:lahiri|scheme:seven", sectionKey: "graha_in_bhava:moon:6", body: "x", expectedRevision: null })).status, 400, "D1 konusu karaka notuna");
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SEL.k7, saveRequestId: randomUUID() }, false);
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.deepEqual((a.notes as J[]).map((n) => n.body), ["7'li AK notu"]);
  });

  // ═══ J) MEVCUT TEKNİKLER DEĞİŞMEDİ ══════════════════════════════════════════
  await t("J: mevcut 27 tekniğin hesap birimi özeti (uç · adaptör · inputHash, 148 birim) taban 93b16b06 ile AYNI; kimlikler yalnız eklendi", () => {
    const NOW = new Date("2026-10-22T10:00:00Z");
    const CANDIDATES: Record<string, unknown>[] = [
      {}, { atUtc: "2026-10-07T09:00" }, { targetDate: "2026-10-07" }, { year: 2026 }, { month: "2026-10", sequence: 1 }, { age: 36 },
      { startDate: "2026-10-01", endDate: "2026-12-29" }, { horaryNumber: 100, atUtc: "2026-10-07T09:00" }, { partnerProfileId: "11111111-1111-4111-8111-111111111111" },
      { targetLocationId: "tr-06-ankara" },
    ];
    const ctx = { birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: SYNTH_B, places: { target: { latitude: 51.5, longitude: -0.12, timezone: "Europe/London" }, reference: { latitude: 51.5, longitude: -0.12 } } } as never;
    const old = (TECHNIQUE_IDS as readonly string[]).filter((x) => !(NEW_IDS as readonly string[]).includes(x));
    assert.equal(old.length, 27);
    const rows = old.map((id) => {
      const def = getTechnique(id)!;
      const out: string[] = [];
      for (const raw of CANDIDATES) {
        const o = def.parseOptions(raw, NOW);
        if (!o) continue;
        for (const u of def.units(ctx, o)) out.push(`${JSON.stringify(raw)} → ${u.endpoint} · ${u.adapterVersion} · ${u.inputHash}`);
      }
      return [id, out];
    });
    assert.equal(rows.reduce((n, r) => n + (r[1] as string[]).length, 0), 148);
    assert.equal(createHash("sha256").update(JSON.stringify(rows)).digest("hex"), "9c3799775de9245e7b5dad9452e3b352a46e467c617834945dc14d297f964567");
    assert.deepEqual((TECHNIQUE_IDS as readonly string[]).filter((x) => x.startsWith("vedic.")).slice(-4), [...NEW_IDS]);
  });

  // ═══ K) UI + SAHTE ARKA UÇ ══════════════════════════════════════════════════
  await t("K: UI — 4 teknik listede (Vedik), saat gerekir, seçimler doğru (Chara şeması varsayılan 8), özetler Türkçe; chalit kundli verisi chalit bhavasında", () => {
    for (const id of NEW_IDS) {
      assert.ok((UI_TECHNIQUES as readonly string[]).includes(id));
      assert.equal(TECHNIQUE_META[id].needsTime, true);
      assert.equal(TECHNIQUE_META[id].needsPartner, false);
    }
    const p = defaultParams(new Date("2026-10-22T09:00:00Z"));
    const method = { houseSystem: "placidus" as const, nodeType: "true" as const };
    const checked = Object.fromEntries(NEW_IDS.map((x) => [x, true]));
    assert.deepEqual(buildSelections(checked, p, method), [
      { technique: "vedic.bhav_chalit", options: { ayanamsa: "lahiri" } },
      { technique: "vedic.chara_karaka", options: { ayanamsa: "lahiri", scheme: "eight" } },
      { technique: "vedic.arudha", options: { ayanamsa: "lahiri" } },
      { technique: "vedic.bhava_bala", options: { ayanamsa: "lahiri" } },
    ]);
    assert.deepEqual(buildSelections({ "vedic.chara_karaka": true }, { ...p, charaKarakaScheme: "seven", vedicAyanamsa: "raman" }, method), [{ technique: "vedic.chara_karaka", options: { ayanamsa: "raman", scheme: "seven" } }]);
    for (const id of NEW_IDS) assert.equal(missingReason(id, p), null);
    assert.equal(describeOptions("vedic.chara_karaka", { ayanamsa: "lahiri", scheme: "seven" }), "7 karaka (Rahu hariç) · ayanamsa: Lahiri (Chitrapaksha)");
    assert.ok(describeOptions("vedic.bhav_chalit", { ayanamsa: "kp-newcomb" }).startsWith("ayanamsa: "));
    const c = ok(projectRoxyVedicBhavChalit(GC.response, { ayanamsa: "lahiri" })).technical as VedicBhavChalitTechnical;
    const kd = toChalitKundliData(c) as J;
    assert.equal(kd.meta.Moon.rashi, "Aries", "Ay chalit 7. bhavada (Lagna Terazi'den 7. hücre)");
    assert.equal(kd.meta.Moon.house, 7);
    assert.equal(kd.meta.Lagna.rashi, "Libra");
    assert.equal(chalitCellRashi("libra", 7), "aries");
    assert.ok(chalitKundliTitles(c).Moon.includes("chalit 7. bhava") && chalitKundliTitles(c).Moon.includes("D1 rashi evi 6"));
    assert.ok(!JSON.stringify(kd).includes("significations"));
  });

  await t("K: sahte arka uç (dev-fake-backend) golden'ları BİREBİR gövdeyle tanır: 5 dosya, farklı uç/gövde, kişisel veri alanı yok", () => {
    const files = ["vedic-bhav-chalit", "vedic-chara-karakas-eight", "vedic-chara-karakas-seven", "vedic-arudha", "vedic-bhava-bala"].map(load);
    assert.equal(new Set(files.map((f) => `${f.endpoint}|${canon(f.body)}`)).size, 5);
    for (const f of files) {
      assert.deepEqual(Object.keys(f).sort(), ["body", "endpoint", "query", "response"]);
      assert.deepEqual(Object.keys(f.body).filter((k) => !["date", "time", "latitude", "longitude", "timezone", "ayanamsa", "scheme"].includes(k)), []);
      assert.ok(!/name|label|email|ad"|soyad/i.test(JSON.stringify(f.body)));
    }
    const src = readFileSync(join(__dirname, "dev-fake-backend.ts"), "utf8");
    assert.ok(src.includes("g.endpoint === path && g.body === canon(body)"), "strictMatch birebir gövde kuralı");
  });

  console.log(`\nvedik-harita: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
