/**
 * VEDİK NOKTALAR (22.10.2026) — Upagraha (vedic.upagraha) · Graha Asta / Udaya (vedic.heliacal) harness'i + Kalsarpa yöntem kanıtı.
 *
 * ÜCRETLİ ÇAĞRI: 0. Gerçek sağlayıcı yanıtı YOK → test verisi ŞEMA-ÖRNEĞİ fixture'dır (fixtures/schema/*, `_kaynak: openapi-schema-example`;
 * yapı OpenAPI 2.0.0, değerler bağımsız yaklaşık hesap / D1 golden Güneş'i). Bu harness şema-örneğini sağlayıcı doğrulaması olarak
 * SUNMAZ: "gerçek yanıt doğrulaması BLOKE (çağrı izni yok)". Bağımsız doğrulamalar GERÇEK golden'lara (Vedik D1, Ayrıntılı Panchanga)
 * dayanır.
 *
 *   A) şema-örneği ↔ projeksiyon · B) bağımsız doğrulama (Aprakasha formülleri ↔ D1 Güneş'i; Lagna formülü ↔ D1 Lagna; gün / gece
 *   8'li bölüm + haftanın günü tablosu ↔ GERÇEK Panchanga Gulika Kaal; A için beklenen Gulika; heliakal ↔ D1 "yanık" farkı) ·
 *   C) fail-closed · D) motor (plan / önbellek / saat yok / enlem / gün-yer çözümü / yaz saati ofseti) · E) D1 bağlamı (ev + Güneş
 *   tutarlılığı, 0 istek) · F) kaydet → aç 0 istek · G) Word/PDF rapor modeli · H) yetki 404 + yorum kapısı · I) mevcut tekniklerin
 *   girdi özeti SABİT · J) KB konuları / notlar · K) UI yardımcıları · L) Kalsarpa: BLOKE (kod yok) + D1 golden eksen testi.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/vedik-noktalar.harness.ts
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as AE from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, parseNoteContext, TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { heliacalBody, heliacalLocalToUtc, projectRoxyVedicHeliacal, projectRoxyVedicUpagraha, ROXY_VEDIC_HELIACAL, ROXY_VEDIC_UPAGRAHA } from "@/lib/astrology/providers/roxy/vedicNoktalar";
import { vedicBirthBody } from "@/lib/astrology/providers/roxy/requests";
import { attachUpagrahaD1, heliacalOptionsOf } from "@/lib/astrology/engine/vedicNoktaTechniques";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { hasNoProviderInterpretation, NO_PROVIDER_INTERPRETATION_NOTE } from "@/lib/astrology/noProviderInterp";
import { isSectionKeyForTechnique, topicsForTechnique, TECHNIQUE_TOPIC_CONTEXT } from "@/lib/astrology/topics/index";
import { HELIACAL_KALAMSA, UPAGRAHA_SUN_IDS, UPAGRAHA_TIME_IDS, heliacalEventTimeText } from "@/lib/astrology/model/vedicNoktalar";
import { buildSelections, dateInputReason, defaultParams, describeOptions, missingReason, TECHNIQUE_META, UI_TECHNIQUES } from "@/app/admin/astroloji/_lib/techniques";
import { COMING_SOON_AVAILABLE_AS } from "@/app/admin/astroloji/_lib/comingSoon";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { eightfold, elongation, heliacalDay, siderealAscendant, sunBasedUpagrahas, sunRiseSet, timeUpagrahas } from "./vedicNoktaRef";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const ROOT = join(__dirname, "..", "..");
const G = (dir: string, n: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", dir, `${n}.json`), "utf8")) as { endpoint: string; body: Record<string, unknown>; response: J; _kaynak?: string };
const UP = G("schema", "vedic-upagraha");
const HE = G("schema", "vedic-heliacal");
const D1 = G("golden", "vedic-d1");
const PANCH = G("golden", "vedic-panchang-detailed");
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
const NO_INTERP = resolveAstrologyEntitlements({ isOwner: false, role: "expert", flags: { astrology: true, astrology_provider_interp: false } });
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

/** Sahte sağlayıcı: YALNIZ fixture'ı olan BİREBİR gövdeye yanıt döner; başka gövde → 400 (sonuç uydurulmaz). */
const FIXTURES = [UP, HE, D1];
function roxy(mutate?: (endpoint: string, r: J) => void) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-vn", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const hit = FIXTURES.find((f) => f.endpoint === endpoint && canon(f.body) === canon(body));
      if (!hit) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = structuredClone(hit.response);
      mutate?.(endpoint, r);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}
async function profileA(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const UPA = (ayanamsa = "lahiri") => ({ technique: "vedic.upagraha", options: { ayanamsa } });
const HEL = (o: Record<string, unknown> = {}) => ({ technique: "vedic.heliacal", options: { date: null, placeLocationId: null, ...o } });
const D1SEL = { technique: "vedic.d1", options: { ayanamsa: "lahiri" } };
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, hide = false) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: hide });
const HE_OPTS = { date: "1990-07-15", latitude: 41.0082, longitude: 28.9784, utcOffsetHours: 3, label: "İstanbul, Türkiye", timeZone: "Europe/Istanbul" };
const D1SUN = D1.response.meta.Sun.longitude as number;
const D1AY = D1.response.frame.ayanamsaDegrees as number;
const d1Lon = (name: string) => D1.response.meta[name].longitude as number;

async function main() {
  // ═══ A) ŞEMA-ÖRNEĞİ ↔ PROJEKSİYON ════════════════════════════════════════════
  await t("A: fixture'lar şema-örneği olarak işaretli; gövdeler ürün üreticileriyle BİREBİR (upagraha = D1 gövdesi; heliakal = gün + yer + ofset)", () => {
    for (const f of [UP, HE]) assert.equal(f._kaynak, "openapi-schema-example");
    assert.equal(canon(UP.body), canon(vedicBirthBody(SYNTH_A, "lahiri")));
    assert.equal(canon(UP.body), canon(D1.body), "upagraha gövdesi Vedik D1 ile aynı biçim");
    assert.equal(canon(HE.body), canon(heliacalBody("1990-07-15", { latitude: 41.0082, longitude: 28.9784 }, 3)));
    assert.deepEqual(Object.keys(HE.body).sort(), ["date", "latitude", "longitude", "timezone"], "heliakal: saat ve ayanamsa YOK");
    assert.equal([UP.endpoint, HE.endpoint].join(), [ROXY_VEDIC_UPAGRAHA.endpoint, ROXY_VEDIC_HELIACAL.endpoint].join());
  });

  await t("A: Upagraha → 6 zaman tabanlı + 5 Güneş türevli, kanonik sıra; burç/nakshatra/pada boylamla tutarlı; zincirin Güneş'i D1 Güneş'i ±0,01°; bilinmeyen alan 0", () => {
    const r = projectRoxyVedicUpagraha(UP.response, { ayanamsa: "lahiri" });
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (!r.ok) return;
    assert.deepEqual(r.technical.timeBased.map((p) => p.id), [...UPAGRAHA_TIME_IDS]);
    assert.deepEqual(r.technical.sunBased.map((p) => p.id), [...UPAGRAHA_SUN_IDS]);
    assert.ok(Math.abs(r.technical.impliedSun - D1SUN) < 0.01, `${r.technical.impliedSun} ↔ ${D1SUN}`);
    assert.deepEqual(r.unmappedFields, []);
    assert.deepEqual(r.droppedValues, []);
    assert.equal(r.interpretation, null, "sağlayıcı yorum metni yok");
    const ic = r.technical.sunBased.find((p) => p.id === "indra_chapa")!;
    assert.deepEqual([ic.rashi, ic.nakshatra, ic.pada], ["taurus", "rohini", 1]);
  });

  await t("A: Heliakal → 6 görünür graha klasik sırada; Jüpiter ve Merkür astada; olaylar UTC'ye sabit ofsetle çevrilir; yorum yok", () => {
    const r = projectRoxyVedicHeliacal(HE.response, HE_OPTS);
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (!r.ok) return;
    assert.deepEqual(r.technical.grahas.map((g) => g.id), ["moon", "mars", "mercury", "jupiter", "venus", "saturn"]);
    assert.deepEqual(r.technical.grahas.filter((g) => !g.visible).map((g) => g.id), ["mercury", "jupiter"]);
    assert.deepEqual(r.technical.omitted, []);
    const ju = r.technical.grahas.find((g) => g.id === "jupiter")!;
    assert.equal(ju.nextEvent!.type, "udaya");
    assert.equal(ju.nextEvent!.utc, heliacalLocalToUtc(ju.nextEvent!.local, 3));
    assert.equal(heliacalLocalToUtc("1990-07-28T05:08:52", 3), "1990-07-28T02:08:52Z");
    assert.equal(heliacalLocalToUtc("1990-02-30T05:08:52", 3), null, "geçersiz takvim günü");
    assert.deepEqual(heliacalEventTimeText({ local: "1990-07-28T05:08:52", utc: "1990-07-28T02:08:52Z" }, { utcOffsetHours: 3, timeZone: "Europe/Istanbul" }), { local: "28.07.1990 05:08 (GMT+3)", utc: "28.07.1990 02:08 UTC" });
    assert.deepEqual(heliacalEventTimeText({ local: "1990-07-28T05:08:52", utc: "1990-07-28T02:08:52Z" }, { utcOffsetHours: 3, timeZone: null }).local, "28.07.1990 05:08 (UTC+03:00)");
    assert.deepEqual(r.unmappedFields, []);
    assert.equal(r.interpretation, null);
  });

  // ═══ B) BAĞIMSIZ DOĞRULAMA ═══════════════════════════════════════════════════
  await t("B1: Aprakasha formülleri ↔ D1 GERÇEK golden Güneş'i (88,9975°): Dhuma 222,33 · Vyatipata 137,67 · Parivesha 317,67 · Indra Chapa 42,33 · Upaketu 59,00 (= Güneş − 30°)", () => {
    const s = sunBasedUpagrahas(D1SUN);
    assert.ok(Math.abs(s.dhuma - 222.3309) < 1e-3 && Math.abs(s.vyatipata - 137.6691) < 1e-3 && Math.abs(s.parivesha - 317.6691) < 1e-3 && Math.abs(s.indraChapa - 42.3309) < 1e-3);
    assert.ok(Math.abs(s.upaketu - (D1SUN - 30)) < 1e-9, "Upaketu = Güneş − 30° (zincirin kapanış özdeşliği)");
    const r = projectRoxyVedicUpagraha(UP.response, { ayanamsa: "lahiri" });
    assert.ok(r.ok);
    if (!r.ok) return;
    const by = Object.fromEntries(r.technical.sunBased.map((p) => [p.id, p.longitude]));
    for (const [k, v] of Object.entries({ dhuma: s.dhuma, vyatipata: s.vyatipata, parivesha: s.parivesha, indra_chapa: s.indraChapa, upaketu: s.upaketu })) assert.ok(Math.abs(by[k] - v) < 0.006, `${k}: ${by[k]} ↔ ${v}`);
  });

  await t("B2: bağımsız Lagna formülü (astronomy-engine GAST + eğiklik) ↔ D1 GERÇEK golden Lagna 191,3206° (±0,01°)", () => {
    const asc = siderealAscendant(new Date(SYNTH_A.utc), SYNTH_A.latitude, SYNTH_A.longitude, D1AY);
    assert.ok(Math.abs(asc - d1Lon("Lagna")) < 0.01, `${asc}`);
  });

  await t("B3: gün / gece 8'li bölüm + haftanın günü tablosu ↔ GERÇEK Ayrıntılı Panchanga (2026-11-01 Pazar, İstanbul): gün doğumu/batımı, Gulika Kaal (Satürn = 7. parça), Rahu Kaal, Yamaganda ±2 dk", () => {
    const hm = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
    const loc = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString();
    const s = sunRiseSet(Date.parse("2026-11-01T00:00:00Z") - 3 * 3600_000, 41.0082, 28.9784);
    assert.ok(Math.abs(hm(loc(s.rise)) - hm(PANCH.response.sunrise)) <= 2 && Math.abs(hm(loc(s.set)) - hm(PANCH.response.sunset)) <= 2);
    const e = eightfold(new Date("2026-11-01T10:00:00Z"), 3, 41.0082, 28.9784);
    assert.equal(e.isDay, true);
    assert.equal(e.weekday, 0, "Pazar");
    assert.equal(PANCH.response.vara.lord, "Sun");
    const sat = e.parts.find((p) => p.lord === "saturn")!;
    assert.equal(sat.k, 7, "Pazar gündüzü Satürn 7. parça (GULIKA_PART[0] = 7 ile aynı)");
    assert.ok(Math.abs(hm(loc(sat.start)) - hm(PANCH.response.gulika.start)) <= 2 && Math.abs(hm(loc(sat.end)) - hm(PANCH.response.gulika.end)) <= 2, `${loc(sat.start)} ↔ ${PANCH.response.gulika.start}`);
    const p8 = e.parts[7];
    assert.ok(Math.abs(hm(loc(p8.start)) - hm(PANCH.response.rahuKaal.start)) <= 2, "Rahu Kaal = Pazar 8. parça");
    const jup = e.parts.find((p) => p.lord === "jupiter")!;
    assert.ok(Math.abs(hm(loc(jup.start)) - hm(PANCH.response.yamaganda.start)) <= 2, "Yamaganda = Jüpiter parçası (Yamaghantaka ile aynı parça)");
  });

  await t("B4: A için BEKLENEN zaman tabanlı noktalar (gerçek yanıt geldiğinde karşılaştırılacak referans): gündüz doğumu, Pazar, Satürn 7. parça; Gulika ≈ 219,3° Akrep (Lagna'dan 2. ev)", () => {
    const u = timeUpagrahas(new Date(SYNTH_A.utc), 3, SYNTH_A.latitude, SYNTH_A.longitude, D1AY);
    assert.equal(u.eightfold.isDay, true);
    assert.equal(u.eightfold.weekday, 0);
    assert.equal(u.gulika.part, 7);
    assert.ok(Math.abs(u.gulika.longitude - 219.31) < 0.05, `${u.gulika.longitude}`);
    assert.equal(Math.floor(u.gulika.longitude / 30), 7, "Akrep");
    console.log(`     beklenen (A, Lahiri; Satürn parçası başı/ortası): Gulika ${u.gulika.longitude.toFixed(2)}° · Mandi(orta) ${u.mandiMid.longitude.toFixed(2)}° · Kala ${u.kala.longitude.toFixed(2)}° · Mrityu ${u.mrityu.longitude.toFixed(2)}° · Ardhaprahara ${u.ardhaprahara.longitude.toFixed(2)}° · Yamaghantaka ${u.yamaghantaka.longitude.toFixed(2)}°`);
  });

  await t("B5: heliakal ↔ D1 'yanık' FARKLI ölçüler: Jüpiter iki ölçüde de astada; Merkür D1'de yanık DEĞİL (boylam farkı 14,01° > orb) ama heliakal yaklaşık hesapta kalamsa 14'ün altında → mükerrer değil", () => {
    const comb = D1.response.combustion as { planet: string; distanceFromSun: number; orb: number }[];
    assert.deepEqual(comb.map((c) => c.planet), ["Jupiter"]);
    assert.ok(Math.abs(Math.abs(d1Lon("Mercury") - D1SUN) - 14.0077) < 0.001);
    const day = Date.parse("1990-07-15T00:00:00Z") - 3 * 3600_000;
    const ju = heliacalDay("jupiter", day, 41.0082, 28.9784);
    const me = heliacalDay("mercury", day, 41.0082, 28.9784);
    assert.equal(ju.visible, false);
    assert.ok(Math.abs(elongation("jupiter", new Date(SYNTH_A.utc))) < 0.25, "Jüpiter Güneş'e 0,2° yakın (D1: 0,18°)");
    assert.equal(me.visible, false);
    assert.ok(me.timeDegrees < 14 && me.longitudeSeparation < 14.1);
    // Görünür (uzak) grahalar bağımsız hesapta da görünür.
    for (const g of ["mars", "venus", "saturn"] as const) assert.equal(heliacalDay(g, day, 41.0082, 28.9784).visible, true, g);
  });

  // ═══ C) FAIL-CLOSED ══════════════════════════════════════════════════════════
  await t("C: Upagraha bozuk yanıtlar REDDEDİLİR (zincir, grup, eksik/tekrar, burç, derece, nakshatra, pada, ad, çerçeve)", () => {
    const sun = (r: J, n: string) => r.sunBased.find((p: J) => p.name === n);
    const time = (r: J, n: string) => r.timeBased.find((p: J) => p.name === n);
    const cases: [string, (r: J) => void, string][] = [
      ["Vyatipata zinciri", (r) => (sun(r, "Vyatipata").longitude = 140.0), "vyatipata: 360° − Dhuma değil"],
      ["Upaketu zinciri", (r) => (sun(r, "Upaketu").longitude = 60.5), "upaketu: Indra Chapa + 16°40′ değil"],
      ["grup karışması", (r) => r.timeBased.push(r.sunBased.pop()), "upaketu: yanlış grupta (zaman tabanlı)"],
      ["eksik nokta", (r) => r.timeBased.pop(), "timeBased: 6 zaman tabanlı upagraha (Gulika, Mandi, Kala, Mrityu, Ardhaprahara, Yamaghantaka) tam ve tekil değil"],
      ["tekrar", (r) => (r.timeBased[1] = structuredClone(r.timeBased[0])), "timeBased: 6 zaman tabanlı upagraha (Gulika, Mandi, Kala, Mrityu, Ardhaprahara, Yamaghantaka) tam ve tekil değil"],
      ["burç", (r) => (time(r, "Gulika").rashi = "Libra"), "gulika: burç boylamla uyuşmuyor"],
      ["derece", (r) => (time(r, "Gulika").degreeInSign = 12.5), "gulika: burç içi derece boylamla uyuşmuyor"],
      ["nakshatra sırası", (r) => (time(r, "Kala").nakshatraIndex = 9), "kala: nakshatra sırası boylamla uyuşmuyor"],
      ["pada", (r) => (time(r, "Kala").nakshatraPada = 1), "kala: pada boylamla uyuşmuyor"],
      ["nakshatra adı", (r) => (time(r, "Kala").nakshatra = "Ashwini"), "kala: nakshatra adı sırayla uyuşmuyor"],
      ["bilinmeyen ad", (r) => (time(r, "Mrityu").name = "Rahu"), "timeBased[]: alan"],
      ["çerçeve", (r) => (r.frame.ayanamsa = "raman"), "frame: istenen ayanamsa değil"],
      ["boylam aralık dışı", (r) => (time(r, "Gulika").longitude = 400), "timeBased[]: alan"],
    ];
    for (const [n, m, e] of cases) {
      const raw = structuredClone(UP.response);
      m(raw);
      const r = projectRoxyVedicUpagraha(raw, { ayanamsa: "lahiri" });
      assert.equal(r.ok, false, n);
      if (!r.ok) assert.ok(r.errors.includes(e), `${n}: ${r.errors.join("; ")}`);
    }
    for (const bad of [null, [], "x", 1, { frame: UP.response.frame }]) assert.equal(projectRoxyVedicUpagraha(bad, { ayanamsa: "lahiri" }).ok, false);
    const extra = structuredClone(UP.response);
    extra.newField = 1;
    extra.timeBased[0].house = 2;
    const ok = projectRoxyVedicUpagraha(extra, { ayanamsa: "lahiri" });
    assert.ok(ok.ok && ok.unmappedFields.includes("newField") && ok.unmappedFields.includes("timeBased[].house"), "bilinmeyen alanlar raporlanır (ev alanı teknik sayılmaz)");
    const alias = structuredClone(UP.response);
    alias.sunBased.find((p: J) => p.name === "Indra Chapa").name = "Indrachapa";
    assert.ok(projectRoxyVedicUpagraha(alias, { ayanamsa: "lahiri" }).ok, "Indrachapa yazımı aynı nokta");
  });

  await t("C: Heliakal bozuk yanıtlar REDDEDİLİR (gün, kalamsa, görünürlük, Ay geri, olay türü/sırası/günü, biçim, tekrar, sıra)", () => {
    const g = (r: J, n: string) => r.grahas.find((x: J) => x.graha === n);
    const cases: [string, (r: J) => void, string][] = [
      ["gün yankısı", (r) => (r.date = "1990-07-16"), "date: istenen gün değil"],
      ["kalamsa", (r) => (g(r, "Jupiter").kalamsa = 12), "jupiter: kalamsa Surya Siddhanta sınırı değil"],
      ["Venüs geri sınırı", (r) => (g(r, "Venus").retrograde = true), "venus: kalamsa Surya Siddhanta sınırı değil"],
      ["görünürlük", (r) => (g(r, "Mars").visible = false), "mars: görünürlük zaman derecesi / kalamsa ile uyuşmuyor"],
      ["Ay geri", (r) => (g(r, "Moon").retrograde = true), "moon: Ay geri hareket edemez"],
      ["son olay türü", (r) => (g(r, "Jupiter").lastEvent.type = "udaya"), "jupiter: son olay mevcut durumla uyuşmuyor"],
      ["sonraki olay türü", (r) => (g(r, "Saturn").nextEvent.type = "udaya"), "saturn: sonraki olay mevcut durumu bitirmiyor"],
      ["son olay gelecekte", (r) => (g(r, "Jupiter").lastEvent.datetime = "1990-07-20T21:23:21"), "jupiter: son olay değerlendirme gününden sonra"],
      ["sonraki olay geçmişte", (r) => (g(r, "Jupiter").nextEvent.datetime = "1990-07-01T05:08:52"), "jupiter: sonraki olay değerlendirme gününden önce"],
      ["tarih biçimi", (r) => (g(r, "Jupiter").nextEvent.datetime = "28.07.1990 05:08"), "jupiter.nextEvent: alan"],
      ["olay kalamsa", (r) => (g(r, "Jupiter").nextEvent.kalamsa = 15), "jupiter.nextEvent: kalamsa grahanın sınırı değil"],
      ["tekrar", (r) => r.grahas.push(structuredClone(r.grahas[0])), "grahas: tekrar eden graha"],
      ["sıra", (r) => r.grahas.reverse(), "grahas: klasik sıra değil"],
      ["Güneş", (r) => (r.grahas[0].graha = "Sun"), "grahas[]: alan"],
      ["olay alanı yok", (r) => delete g(r, "Mars").nextEvent, "grahas[]: alan"],
    ];
    for (const [n, m, e] of cases) {
      const raw = structuredClone(HE.response);
      m(raw);
      const r = projectRoxyVedicHeliacal(raw, HE_OPTS);
      assert.equal(r.ok, false, n);
      if (!r.ok) assert.ok(r.errors.includes(e), `${n}: ${r.errors.join("; ")}`);
    }
    // Kabul edilen sınır durumları: olay null (arama penceresinde yok), graha eksik (ufuk geçişi yok), sınıra 0,05°'den yakın.
    const okRaw = structuredClone(HE.response);
    g(okRaw, "Mars").lastEvent = null;
    okRaw.grahas = okRaw.grahas.filter((x: J) => x.graha !== "Moon");
    g(okRaw, "Mercury").timeDegrees = 14.03; // sınıra 0,05°'den yakın: yuvarlama payı (visible=false kabul)
    const r = projectRoxyVedicHeliacal(okRaw, HE_OPTS);
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (r.ok) assert.deepEqual(r.technical.omitted, ["moon"]);
    assert.deepEqual(HELIACAL_KALAMSA.venus, [10, 8]);
  });

  // ═══ D) MOTOR ════════════════════════════════════════════════════════════════
  await t("D: kayıt defteri + UI; Upagraha saat ister, Heliakal istemez; ikisi de yorum üretmez; Kalsarpa tekniği YOK", () => {
    for (const id of ["vedic.upagraha", "vedic.heliacal"]) {
      assert.ok((TECHNIQUE_IDS as readonly string[]).includes(id));
      assert.ok((UI_TECHNIQUES as readonly string[]).includes(id));
      assert.equal(hasNoProviderInterpretation(id), true);
    }
    assert.equal(getTechnique("vedic.upagraha")!.requiresKnownTime, true);
    assert.equal(getTechnique("vedic.heliacal")!.requiresKnownTime, false);
    assert.equal(TECHNIQUE_META["vedic.upagraha"].needsTime, true);
    assert.equal(TECHNIQUE_META["vedic.heliacal"].needsTime, false);
    assert.equal(TECHNIQUE_IDS.filter((x) => x === "vedic.upagraha" || x === "vedic.heliacal").length, 2);
    assert.ok(!TECHNIQUE_IDS.some((x) => /kalsarp|kaal_?sarp/.test(x)), "Kalsarpa BLOKE: teknik eklenmedi");
    assert.equal(getTechnique("vedic.upagraha")!.parseOptions({ ayanamsa: "tropical" }, new Date()), null);
    assert.deepEqual(heliacalOptionsOf({}), { date: null, placeLocationId: null });
    assert.equal(heliacalOptionsOf({ date: "1990-02-30" }), null);
    assert.equal(heliacalOptionsOf({ date: "1500-01-01" }), null);
    assert.equal(heliacalOptionsOf({ placeLocationId: "../x" }), null);
  });

  await t("D: Upagraha 1 istek (gövde fixture ile BİREBİR); tekrar 0; plan 0", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy();
    const p = (await planAstrology(ctx, { profileId: pa, selections: [UPA()] })).body as J;
    assert.equal(p.plan.newRequestCount, 1);
    const r = (await run(ctx, pa, [UPA()], rx.deps)).body as J;
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
    assert.equal(rx.calls.length, 1);
    assert.equal(canon(rx.calls[0].body), canon(UP.body));
    const v = r.results[0].view;
    assert.equal(v.technical.schema, "astro.vedic.upagraha.v1");
    assert.equal(v.technical.d1, undefined, "D1 önbellekte yok → bağlam yok, istek de yok");
    assert.equal(v.method.zodiac, "sidereal");
    await run(ctx, pa, [UPA()], rx.deps);
    assert.equal(rx.calls.length, 1, "önbellekten gelmeli");
    assert.equal(((await planAstrology(ctx, { profileId: pa, selections: [UPA()] })).body as J).plan.newRequestCount, 0);
  });

  await t("D: Heliakal varsayılan = doğum günü + doğum yeri, ofset o gün o yerde (+3); 1 istek; tekrar 0; seçenekte yer etiketi + ofset", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy();
    const r = (await run(ctx, pa, [HEL()], rx.deps)).body as J;
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
    assert.equal(rx.calls.length, 1);
    assert.equal(canon(rx.calls[0].body), canon(HE.body));
    const v = r.results[0].view;
    assert.deepEqual([v.options.date, v.options.offsetHours, v.options.place.label], ["1990-07-15", 3, "İstanbul, Türkiye"]);
    assert.equal(v.technical.place.timeZone, "Europe/Istanbul");
    assert.equal(v.technical.grahas.length, 6);
    await run(ctx, pa, [HEL({ date: "1990-07-15" })], rx.deps);
    assert.equal(rx.calls.length, 1, "aynı gün açıkça seçilince de aynı anahtar (önbellek)");
  });

  await t("D: Heliakal başka gün / yer: kış günü ofseti +2 (1990-01-15), Ankara gövdesi; Tromsø (69,6°) → HELIACAL_LATITUDE, istek YOK; bilinmeyen konum → LOCATION_NOT_FOUND", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy();
    await run(ctx, pa, [HEL({ date: "1990-01-15" })], rx.deps);
    assert.equal(rx.calls[0].body.timezone, 2, "1990 kışı Türkiye +2");
    assert.equal(rx.calls[0].body.date, "1990-01-15");
    await run(ctx, pa, [HEL({ date: "2026-10-22", placeLocationId: "tr-06-ankara" })], rx.deps);
    assert.deepEqual(rx.calls[1].body, { date: "2026-10-22", latitude: 39.9334, longitude: 32.8597, timezone: 3 });
    const n = rx.calls.length;
    const tr = (await run(ctx, pa, [HEL({ placeLocationId: "gn-3133895" })], rx.deps)).body as J;
    assert.equal(tr.results[0].code, "HELIACAL_LATITUDE");
    const nf = (await run(ctx, pa, [HEL({ placeLocationId: "yok-boyle-bir-yer" })], rx.deps)).body as J;
    assert.equal(nf.results[0].code, "LOCATION_NOT_FOUND");
    assert.equal(rx.calls.length, n, "engellenen seçimde sağlayıcıya gidilmedi");
  });

  await t("D: saat bilinmiyor → Upagraha TIME_REQUIRED (istek yok); Heliakal hesaplanır ve MASKELENMEZ (doğum anı kullanılmaz)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const p0 = await profileA(ctx, { label: "A saatsiz", birthTime: undefined, timeKnown: false, timeAccuracy: undefined });
    const rx = roxy();
    const r = (await run(ctx, p0, [UPA(), HEL()], rx.deps)).body as J;
    assert.equal(r.results[0].code, "TIME_REQUIRED");
    assert.ok(r.results[0].error.includes("Gulika"), r.results[0].error);
    assert.equal(rx.calls.length, 1, "yalnız heliakal istek");
    assert.equal(rx.calls[0].endpoint, ROXY_VEDIC_HELIACAL.endpoint);
    assert.equal(r.results[1].ok, true, JSON.stringify(r.results[1]).slice(0, 300));
    assert.equal(r.results[1].view.technical.grahas.length, 6);
    assert.equal(maskTechnical("vedic.heliacal", { a: 1 }, { primary: false, partner: null }).masked, false);
    assert.equal(maskTechnical("vedic.upagraha", { a: 1 }, { primary: false, partner: null }).technical, null);
  });

  await t("D: sağlayıcı tutarsız yanıt → PROVIDER_INVALID_RESPONSE (kayıt yok)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy((ep, r) => {
      if (ep === ROXY_VEDIC_UPAGRAHA.endpoint) r.sunBased[1].longitude = 10;
      if (ep === ROXY_VEDIC_HELIACAL.endpoint) r.grahas[3].kalamsa = 9;
    });
    const r = (await run(ctx, pa, [UPA(), HEL()], rx.deps)).body as J;
    assert.deepEqual(r.results.map((x: J) => x.code), ["PROVIDER_INVALID_RESPONSE", "PROVIDER_INVALID_RESPONSE"]);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...UPA(), saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 409, "geçersiz sonuç kaydedilemez");
  });

  // ═══ E) D1 BAĞLAMI ═══════════════════════════════════════════════════════════
  await t("E: Vedik D1 önbellekteyse (0 ek istek) ev = Lagna'dan bütün-burç (Lagna Terazi → Gulika Akrep 2. ev); D1 Güneş'i ile fark ≤ 0,02° (tutarlı)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy();
    await run(ctx, pa, [D1SEL], rx.deps);
    const n = rx.calls.length;
    const r = (await run(ctx, pa, [UPA()], rx.deps)).body as J;
    assert.equal(rx.calls.length, n + 1, "bağlam birimi plana girmedi");
    const tt = r.results[0].view.technical;
    assert.equal(tt.d1.lagnaRashi, "libra");
    assert.equal(tt.d1.sunConsistent, true);
    assert.ok(tt.d1.sunDiff <= 0.02);
    assert.equal(tt.timeBased.find((p: J) => p.id === "gulika").house, 2);
    assert.equal(tt.sunBased.find((p: J) => p.id === "upaketu").house, 8, "Boğa = Terazi'den 8.");
    const up = getTechnique("vedic.upagraha")!;
    const d1 = getTechnique("vedic.d1")!;
    const ctxU = { birth: { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, birthUtc: "1990-07-15T11:30:00Z", partner: null };
    assert.equal(up.contextUnits!(ctxU, { ayanamsa: "lahiri" })[0].inputHash, d1.units(ctxU, { ayanamsa: "lahiri" })[0].inputHash);
    // Farklı ayanamsa D1'i bağlam olarak kullanılmaz; tutarsız Güneş → uyarı bayrağı (değer düzeltilmez).
    assert.equal(attachUpagrahaD1(tt, { schema: "astro.vedic.d1.v1", frame: { ayanamsa: "raman" } }, "lahiri"), tt);
    const bad = attachUpagrahaD1({ ...tt, d1: undefined, impliedSun: 90 }, { schema: "astro.vedic.d1.v1", frame: { ayanamsa: "lahiri" }, lagna: { rashi: "libra" }, grahas: [{ id: "sun", longitude: D1SUN }] }, "lahiri") as J;
    assert.equal(bad.d1.sunConsistent, false);
  });

  // ═══ F) KAYDET → AÇ ══════════════════════════════════════════════════════════
  await t("F: kaydet → aç 0 istek (Upagraha + Heliakal); snapshot teknik veri + seçenekler; hesaplanmamış seçim kaydedilemez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy();
    await run(ctx, pa, [UPA(), HEL()], rx.deps);
    const n = rx.calls.length;
    const s1 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...UPA(), saveRequestId: randomUUID() }, false);
    const s2 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...HEL(), saveRequestId: randomUUID() }, false);
    assert.equal(s1.status, 201, JSON.stringify(s1.body));
    assert.equal(s2.status, 201, JSON.stringify(s2.body));
    const a1 = ((await getAnalysis(ctx, (s1.body as J).analysisId, false)).body as J).analysis;
    const a2 = ((await getAnalysis(ctx, (s2.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n, "kayıtlı analizi açmak sağlayıcı çağırdı");
    assert.equal(a1.technical.timeBased.length, 6);
    assert.equal(a2.technical.grahas.length, 6);
    assert.equal(a2.params?.place?.label ?? a2.options?.place?.label, "İstanbul, Türkiye");
    const un = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...HEL({ date: "2001-01-01" }), saveRequestId: randomUUID() }, false);
    assert.equal(un.status, 409);
  });

  // ═══ G) RAPOR ════════════════════════════════════════════════════════════════
  async function savedReport(sel: { technique: string; options: Record<string, unknown> }, withD1 = false) {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy();
    if (withD1) await run(ctx, pa, [D1SEL], rx.deps);
    await run(ctx, pa, [sel], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    return reportTexts(buildAstroReport(a)).join("\n");
  }
  const BAD = ["undefined", "NaN", "[object Object]", "Roxy", "roxy", "golden", "fixture", "/vedic-astrology", "openapi"];
  await t("G: Word/PDF rapor modeli — Upagraha: iki ayrı sistem tablosu, gök cismi değil notu, ekol notu, Panchanga Gulika farkı, D1 evleri; 'Otomatik yorum yok'", async () => {
    const s = await savedReport(UPA(), true);
    for (const want of ["Upagrahalar — hesaplanan duyarlı noktalar", "Zaman tabanlı (Kala-velā / Gulika türü)", "Güneş türevli (Aprakasha / Dhuma grubu)", "Gulika", "Indra Chapa", "Güneş + 133°20′", "fiziksel gök cismi değildir", "Ekol farkı", "ZAMAN PENCERESİDİR", "Lagna (Vedik D1 kaydından)", "Terazi", "2. ev", "(tutarlı)", "Otomatik yorum yok", NO_PROVIDER_INTERPRETATION_NOTE.slice(0, 40)])
      assert.ok(s.includes(want), `rapor: "${want}" yok`);
    for (const bad of BAD) assert.ok(!s.includes(bad), `rapor: "${bad}" olmamalı`);
  });
  await t("G: Word/PDF rapor modeli — Heliakal: gün, gözlem yeri (koordinat + ofset), tablo, olaylar yerel + UTC, yöntem / D1 farkı / kapsam notları", async () => {
    const s = await savedReport(HEL());
    for (const want of ["Graha Asta / Udaya — 15.07.1990", "İstanbul, Türkiye · 41.0082° K, 28.9784° D · UTC+03:00", "Astada olan grahalar", "Jüpiter (Guru)", "Astada", "Görünür", "Udaya (heliakal doğuş)", "28.07.1990 05:08 (GMT+3)", "28.07.1990 02:08 UTC", "Surya Siddhanta", "yanık (asta)", "±60°", "Otomatik yorum yok"])
      assert.ok(s.includes(want), `rapor: "${want}" yok`);
    for (const bad of BAD) assert.ok(!s.includes(bad), `rapor: "${bad}" olmamalı`);
  });

  // ═══ H) YETKİ + YORUM KAPISI ═══════════════════════════════════════════════════
  await t("H: başka tenant / aynı tenant'ta başka uzman analizi açamaz, çalıştıramaz, not yazamaz (404)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy();
    await run(ctx, pa, [UPA(), HEL()], rx.deps);
    for (const sel of [UPA(), HEL()]) {
      const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
      const id = (sv.body as J).analysisId;
      assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
      assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
      assert.equal((await run(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), pa, [sel], rx.deps)).status, 404);
    }
    assert.equal((await saveExpertNote(ctxOf(store, { userId: USER_A2 }), { profileId: pa, technique: "vedic.upagraha", noteContext: "ayanamsa:lahiri", sectionKey: "overall", body: "x", expectedRevision: null })).status, 404);
    assert.equal((await saveExpertNote(ctxOf(store, { userId: USER_A2 }), { profileId: pa, technique: "vedic.heliacal", sectionKey: "overall", body: "x", expectedRevision: null })).status, 404);
  });
  await t("H: yorum yetkisi kapalı uzman — sonuç aynı teknik veri; sağlayıcı yorum katmanı hiç oluşmaz (sızacak metin yok); rapor 'Otomatik yorum yok'", async () => {
    const store = seed();
    const ctx = ctxOf(store, { entitlements: NO_INTERP });
    const pa = await profileA(ctx);
    const rx = roxy();
    const r = (await run(ctx, pa, [UPA(), HEL()], rx.deps)).body as J;
    for (const x of r.results) {
      assert.equal(x.ok, true);
      assert.notEqual(x.view.interpretation?.visible, true);
    }
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...HEL(), saveRequestId: randomUUID() }, false);
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.ok(reportTexts(buildAstroReport(a)).join("\n").includes("Otomatik yorum yok"));
  });

  // ═══ I) MEVCUT TEKNİKLER DEĞİŞMEDİ ════════════════════════════════════════════
  await t("I: 22 temsili mevcut teknik seçiminin girdi özeti (gövde + anahtar) SABİT — taban 40f31195 ile aynı sha256", () => {
    const b = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 };
    const p = { birthDate: "1988-03-21", birthTime: "06:45:00", utcOffsetSeconds: 7200, latitude: 39.9334, longitude: 32.8597 };
    const ctxU = { birth: b, birthUtc: "1990-07-15T11:30:00Z", partner: p };
    const now = new Date("2026-10-22T10:00:00Z");
    const PID = "00000000-0000-4000-8000-00000000abcd";
    const sels: [string, Record<string, unknown>][] = [
      ["western.natal", { houseSystem: "placidus", nodeType: "true" }],
      ["western.transit", { atUtc: "2026-10-22T09:00", nodeType: "true" }],
      ["western.synastry", { partnerProfileId: PID, houseSystem: "placidus", nodeType: "true" }],
      ["western.composite", { partnerProfileId: PID, houseSystem: "placidus", nodeType: "true" }],
      ["western.progression", { targetDate: "2026-10-22", nodeType: "true" }],
      ["western.profections", { age: 36 }],
      ["vedic.d1", { ayanamsa: "lahiri" }],
      ["vedic.varga", { ayanamsa: "lahiri", division: 9 }],
      ["vedic.dasha", { ayanamsa: "lahiri" }],
      ["vedic.drishti", { ayanamsa: "lahiri" }],
      ["vedic.ashtakavarga", { ayanamsa: "lahiri" }],
      ["vedic.shadbala", { ayanamsa: "lahiri" }],
      ["vedic.panchanga", { ayanamsa: "lahiri" }],
      ["vedic.transit", { ayanamsa: "lahiri", atUtc: "2026-10-22T09:00" }],
      ["vedic.bhav_chalit", { ayanamsa: "lahiri" }],
      ["vedic.chara_karaka", { ayanamsa: "lahiri", scheme: "eight" }],
      ["vedic.arudha", { ayanamsa: "lahiri" }],
      ["vedic.bhava_bala", { ayanamsa: "raman" }],
      ["vedic.gun_milan", { partnerProfileId: PID, ayanamsa: "lahiri" }],
      ["vedic.sade_sati", { ayanamsa: "lahiri" }],
      ["kp.chart", { ayanamsa: "kp-newcomb", nodeType: "mean" }],
      ["kp.dasha", { ayanamsa: "kp-newcomb", nodeType: "mean" }],
    ];
    const got: Record<string, string> = {};
    for (const [id, raw] of sels) {
      const def = getTechnique(id)!;
      const opt = def.parseOptions(raw, now)!;
      assert.ok(opt, id);
      got[id] = def.units(ctxU, opt).map((u) => `${u.endpoint}#${u.inputHash.slice(0, 16)}`).join(",");
    }
    const digest = createHash("sha256").update(canon(got)).digest("hex");
    console.log(`     mevcut teknik özet: ${digest}`);
    assert.equal(digest, EXISTING_DIGEST);
  });

  // ═══ J) KB / NOTLAR ═══════════════════════════════════════════════════════════
  await t("J: KB konuları ayrı bağlamlarda (vedic_upagraha / vedic_heliacal), DB regex'ine uyar, tekil; D1 konusu bu tekniklere yazılamaz; notlar", async () => {
    const r = projectRoxyVedicUpagraha(UP.response, { ayanamsa: "lahiri" });
    assert.ok(r.ok);
    if (!r.ok) return;
    const withHouse = attachUpagrahaD1(r.technical, { schema: "astro.vedic.d1.v1", frame: { ayanamsa: "lahiri" }, lagna: { rashi: "libra" }, grahas: [{ id: "sun", longitude: D1SUN }] }, "lahiri");
    const k1 = topicsForTechnique("vedic.upagraha", withHouse).map((x) => x.key);
    assert.equal(k1.length, 22, "11 rashi + 11 ev");
    assert.ok(k1.includes("upagraha_in_rashi:gulika:scorpio") && k1.includes("upagraha_in_bhava:gulika:2") && k1.includes("upagraha_in_rashi:indra_chapa:taurus"));
    assert.equal(topicsForTechnique("vedic.upagraha", r.technical).length, 11, "D1 bağlamı yoksa ev konusu üretilmez");
    const h = projectRoxyVedicHeliacal(HE.response, HE_OPTS);
    assert.ok(h.ok);
    const k2 = topicsForTechnique("vedic.heliacal", (h as J).technical).map((x) => x.key);
    assert.ok(k2.includes("graha_heliacal:jupiter:asta") && k2.includes("graha_heliacal:venus:visible"));
    for (const k of [...k1, ...k2]) assert.ok(/^[a-z][a-z_]{1,40}(:[a-z0-9_\-]{1,40}){1,4}$/.test(k), `DB topic_key regex: ${k}`);
    assert.equal(TECHNIQUE_TOPIC_CONTEXT["vedic.upagraha"], "vedic_upagraha");
    assert.equal(TECHNIQUE_TOPIC_CONTEXT["vedic.heliacal"], "vedic_heliacal");
    assert.equal(isSectionKeyForTechnique("vedic.upagraha", "upagraha_in_rashi:mandi:aries"), true);
    assert.equal(isSectionKeyForTechnique("vedic.upagraha", "graha_in_rashi:sun:gemini"), false);
    assert.equal(isSectionKeyForTechnique("vedic.d1", "upagraha_in_rashi:mandi:aries"), false);
    assert.equal(isSectionKeyForTechnique("vedic.heliacal", "graha_heliacal:venus:asta"), true);
    assert.equal(isSectionKeyForTechnique("vedic.heliacal", "graha_heliacal:venus:combust"), false);
    assert.deepEqual(parseNoteContext(getTechnique("vedic.upagraha")!, "ayanamsa:raman"), { ayanamsa: "raman" });
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.upagraha", noteContext: "ayanamsa:lahiri", sectionKey: "upagraha_in_rashi:gulika:scorpio", body: "gulika notu", expectedRevision: null })).status, 201);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.heliacal", sectionKey: "graha_heliacal:jupiter:asta", body: "guru asta notu", expectedRevision: null })).status, 201);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.heliacal", contextKey: randomUUID(), sectionKey: "overall", body: "x", expectedRevision: null })).status, 400);
    assert.equal((store.tables.astro_kb_entries ?? []).length, 0, "KB'ye otomatik kayıt yok");
  });

  // ═══ K) UI YARDIMCILARI ═══════════════════════════════════════════════════════
  await t("K: UI — seçimler, özetler, tarih doğrulaması, Yakında eşlemesi; metinlerde sağlayıcı adı / iç jargon yok", () => {
    const p = defaultParams(new Date("2026-10-22T09:00:00Z"));
    const method = { houseSystem: "placidus" as const, nodeType: "true" as const };
    assert.deepEqual(buildSelections({ "vedic.upagraha": true, "vedic.heliacal": true }, p, method), [
      { technique: "vedic.upagraha", options: { ayanamsa: "lahiri" } },
      { technique: "vedic.heliacal", options: { date: null, placeLocationId: null } },
    ]);
    assert.deepEqual(buildSelections({ "vedic.heliacal": true }, { ...p, heliacalDate: "2026-10-22", heliacalPlace: { id: "tr-06-ankara", label: "Ankara" } }, method)[0].options, { date: "2026-10-22", placeLocationId: "tr-06-ankara" });
    assert.equal(dateInputReason("vedic.heliacal", { ...p, heliacalDate: "0002-10-17" }), "heliakal değerlendirme gününü tamamlayın");
    assert.equal(missingReason("vedic.heliacal", p), null);
    assert.equal(describeOptions("vedic.upagraha", { ayanamsa: "raman" }), "ayanamsa: B.V. Raman");
    assert.equal(describeOptions("vedic.heliacal", { date: "1990-07-15", place: { label: "İstanbul, Türkiye" } }), "gün 15.07.1990 · gözlem yeri: İstanbul, Türkiye");
    assert.equal(describeOptions("vedic.heliacal", { date: null, placeLocationId: null }), "gün doğum günü · gözlem yeri: doğum yeri");
    assert.equal(COMING_SOON_AVAILABLE_AS.Upagraha, "vedic.upagraha");
    assert.equal(COMING_SOON_AVAILABLE_AS["Graha Asta (Heliacal Doğuş ve Batış)"], "vedic.heliacal");
    assert.equal(COMING_SOON_AVAILABLE_AS["Kalsarpa Dosha"], undefined, "Kalsarpa Yakında listesinde kalır");
    for (const id of ["vedic.upagraha", "vedic.heliacal"] as const) assert.ok(!/roxy/i.test(TECHNIQUE_META[id].label + TECHNIQUE_META[id].hint));
    const strip = (s: string) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const f of ["app/admin/astroloji/_components/VedicNoktalarPanels.tsx", "lib/astrology/model/vedicNoktalar.ts", "lib/astrology/report/vedicNoktalarReport.ts"]) {
      const src = strip(readFileSync(join(ROOT, f), "utf8"));
      assert.ok(!/Roxy|golden|fixture|\/vedic-astrology/.test(src), `${f}: iç jargon`);
      assert.ok(!/gök cismidir|gezegenidir/.test(src), `${f}: upagraha gök cismi gibi tanıtılmamalı`);
    }
  });

  // ═══ L) KALSARPA — YÖNTEM BLOKE (kod yok) + bağımsız eksen testi ═══════════════════
  await t("L: Kalsarpa eksen testi (D1 GERÇEK golden, A): Rahu→Ketu yayında 6 graha, Satürn dışarıda → tam Kalsarpa YOK; Merkür Ketu'ya 1,38° (sınır duyarlılığı); düğümler tam 180°", () => {
    const rahu = d1Lon("Rahu");
    const ketu = d1Lon("Ketu");
    assert.ok(Math.abs(((rahu - ketu + 360) % 360) - 180) < 1e-9, "Rahu–Ketu ekseni tam 180°");
    const inRahuToKetu = (lon: number) => ((lon - rahu + 360) % 360) < 180;
    const seven = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
    const side = Object.fromEntries(seven.map((g) => [g, inRahuToKetu(d1Lon(g))]));
    assert.deepEqual(seven.filter((g) => !side[g]), ["Saturn"]);
    assert.equal(seven.every((g) => side[g]) || seven.every((g) => !side[g]), false, "tam Kalsarpa (tüm yedi tek yarıda) YOK");
    assert.ok(Math.abs(ketu - d1Lon("Mercury") - 1.3767) < 0.001, "Merkür Ketu'nun 1,38° önünde — derece sınırı / kavuşum kuralı sonucu etkileyebilir");
    const satFromRahu = (rahu - d1Lon("Saturn") + 360) % 360;
    assert.ok(satFromRahu > 10, `Satürn Rahu'dan ${satFromRahu.toFixed(2)}° — '10° içinde kısmi' ekolüne de girmez`);
    // Ortalama düğüm (Meeus) ↔ D1 Rahu (tropikal = sidereal + ayanamsa): fark ölçülür; düğüm türü bilgisi yalnız kanıt amaçlı yazdırılır.
    const T = (AE.MakeTime(new Date(SYNTH_A.utc)).tt) / 36525;
    const meanNode = (((125.04452 - 1934.136261 * T + 0.0020708 * T * T) % 360) + 360) % 360;
    const d1RahuTrop = (rahu + D1AY) % 360;
    console.log(`     ortalama düğüm (Meeus) ${meanNode.toFixed(3)}° ↔ D1 Rahu tropikal ${d1RahuTrop.toFixed(3)}° (fark ${Math.abs(meanNode - d1RahuTrop).toFixed(3)}°)`);
    const src = ["lib/astrology/providers/roxy/vedicNoktalar.ts", "lib/astrology/engine/vedicNoktaTechniques.ts"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
    assert.ok(!/dosha\/kalsarpa/.test(src), "Kalsarpa ucu çağrılmıyor (yöntem BLOKE)");
  });

  console.log(`\nvedik-noktalar harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

/** Taban 40f31195'te aynı 22 mevcut teknik seçiminin birim özetinin sha256'sı (RAPOR.md "önce" kanıtı ile üretildi). */
const EXISTING_DIGEST = "a0169560345750e018a00dce89bc132a0a149b7043496c83786926d9d622e405";

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
