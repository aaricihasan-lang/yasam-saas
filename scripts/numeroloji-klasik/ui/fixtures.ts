/**
 * Klasik Numeroloji UI harness fikstürleri — API sözleşmeleriyle BİREBİR aynı şekil.
 *
 * Analiz sonuçları: QA ham yanıtları (repo DIŞI, C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/raw) gerçek
 * normalize + bağımsız oracle doğrulamasından geçirilir (lib/numeroloji-klasik/normalize). Ham yanıt UI'ya GİTMEZ.
 * Taş eşleştirmesi gerçek matcher (sentetik küçük taş dizini), hizalama gerçek alignRecords (sentetik eski kayıt)
 * ile üretilir. Kişi verileri QA vakalarıdır; gerçek danışan değildir. Sağlayıcı çağrısı YOK.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { normalizeEndpointResponse, verifyWithOracle } from "../../../lib/numeroloji-klasik/normalize/index";
import type { ClassicEndpointId } from "../../../lib/numeroloji-klasik/endpoints";
import type { ChaldeanResult, ChartResult, CompoundNumberResult, DualResult, MeaningsResult } from "../../../lib/numeroloji-klasik/model";
import { matchStonesForNumbers } from "../../../lib/numeroloji-klasik/stones/matcher";
import type { StoneCandidate, StoneMatchResult } from "../../../lib/numeroloji-klasik/stones/types";
import { alignRecords, type Alignment } from "../../../lib/numeroloji-klasik/compare/align";

export const RAW_DIR = process.env.NUMK_QA_RAW ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/raw";

export const IDS = {
  person: "11111111-1111-4111-8111-111111111111",
  partial: "22222222-2222-4222-8222-222222222222",
  relationship: "33333333-3333-4333-8333-333333333333",
  business: "44444444-4444-4444-8444-444444444444",
  names: "55555555-5555-4555-8555-555555555555",
  created: "66666666-6666-4666-8666-666666666666",
  legacy: "77777777-7777-4777-8777-777777777777",
  note: "88888888-8888-4888-8888-888888888888",
} as const;

function raw(file: string): { body: unknown; input: unknown } {
  const p = path.join(RAW_DIR, `${file}.json`);
  if (!existsSync(p)) throw new Error(`QA ham dosyası yok: ${p} (NUMK_QA_RAW ile klasör verilebilir)`);
  const j = JSON.parse(readFileSync(p, "utf8")) as { body: unknown; case: { body?: unknown } };
  return { body: j.body, input: j.case?.body ?? null };
}

function norm<T>(id: ClassicEndpointId, file: string): T {
  const r = raw(file);
  const n = normalizeEndpointResponse(id, r.body);
  if (!n.ok) throw new Error(`normalize reddi ${file}: ${n.reason}`);
  return verifyWithOracle(id, r.input, n.data) as T;
}

const T0 = "2026-10-29T09:30:00.000Z";
const meta = (failed: string[] = [], referenceDate: string | null = "2026-10-29") => ({ referenceDate, failed, fetchedAt: T0, methodologyVersion: "numk-method-1" });

export function buildFixtures() {
  const chart = norm<ChartResult>("chart", "m02-c1-chart");
  const bridge = norm<unknown>("bridge", "m02-c1-bridge");
  const personalDay = norm<unknown>("personal_day", "m02-pd-default");
  // Günün Sayısı: ürün kaydında sağlayıcı tohum metni tutulmaz (seed: null) + seedMode (service.ts ile aynı)
  const daily = { ...norm<Record<string, unknown>>("daily", "m02-daily-a-1"), seed: null, seedMode: "person" };
  const chaldean = norm<ChaldeanResult>("chaldean", "m02-ch-tr1");
  const dual = norm<DualResult>("dual", "m02-du-tr1");
  const compatibility = norm<unknown>("compatibility", "m02-cp-names");
  const business = norm<unknown>("business_name", "m02-biz-tr1");
  const names = ["m02-du-tr1", "m02-du-tr2", "m02-du-zeynep"].map((f) => norm<DualResult>("dual", f));

  const personInput = { fullName: "Ayşe Can Öztürk", birth: { year: 1988, month: 2, day: 29 }, targetDate: "2026-10-29" };
  const base = { clientId: null, verification: {}, rowVersion: 3, createdAt: T0, updatedAt: T0 };

  const analyses = {
    [IDS.person]: { ...base, id: IDS.person, kind: "person", title: "Ayşe Can Öztürk", input: personInput, techniques: ["core", "bridge", "personal_day", "daily", "chaldean", "dual"], status: "complete", result: { chart, bridge, personal_day: personalDay, daily, chaldean, dual }, meta: meta() },
    [IDS.partial]: { ...base, id: IDS.partial, kind: "person", title: "Ayşe Can Öztürk (kısmi)", input: personInput, techniques: ["core", "bridge", "chaldean"], status: "partial", result: { chart }, meta: meta(["bridge", "chaldean"]) },
    [IDS.relationship]: { ...base, id: IDS.relationship, kind: "relationship", title: "Ayşe Can Kaya & Mert Ozan Demir", input: { person1: { fullName: "Ayşe Can Kaya", birth: { year: 1990, month: 7, day: 15 } }, person2: { fullName: "Mert Ozan Demir", birth: { year: 1988, month: 3, day: 22 } } }, techniques: ["compatibility"], status: "complete", result: { compatibility }, meta: meta() },
    [IDS.business]: { ...base, id: IDS.business, kind: "business", title: "Güneş Çiçekçilik", input: { name: "Güneş Çiçekçilik" }, techniques: ["business_name"], status: "complete", result: { business_name: business }, meta: meta() },
    [IDS.names]: { ...base, id: IDS.names, kind: "names", title: "İsim seçenekleri", input: { candidates: ["Ayşe Can Öztürk", "Işık Çağan Özdemir", "Zeynep", "Hatalı Aday"] }, techniques: ["dual"], status: "partial", result: { "dual#1": names[0], "dual#2": names[1], "dual#3": names[2] }, meta: meta(["dual#4"]) },
  } as Record<string, Record<string, unknown>>;

  const rows = Object.values(analyses).map((a) => ({ id: a.id, kind: a.kind, title: a.title, clientId: null, techniques: a.techniques, status: a.status, rowVersion: a.rowVersion, createdAt: a.createdAt, updatedAt: a.updatedAt }));
  // "Tümünü göster" için ikinci sayfa
  const page2 = Array.from({ length: 3 }, (_, i) => ({ ...rows[0], id: `9999999${i}-9999-4999-8999-99999999999${i}`, title: `Eski analiz ${i + 1}`, createdAt: "2026-09-0" + (i + 1) + "T10:00:00.000Z" }));

  // ── taşlar: gerçek eşleştirici + sentetik dizin (harita uğurlu taşları + belirsiz ad + kök/titreşim/gezegen) ─────
  const la = chart.luckyAssociations;
  const gems = la?.gemstones ?? [];
  const planet = la?.rulingPlanet ?? "Venus";
  const lp = chart.core.lifePath.value;
  const core = chart.core;
  const idx: StoneCandidate[] = [];
  gems.slice(0, 2).forEach((g, i) => idx.push({ stoneKey: `tas-direkt-${i}`, nameTr: g, nameEn: null, aliases: [], numericalVibration: lp, planets: [planet], chakras: [], elements: [] }));
  if (gems[2]) {
    idx.push({ stoneKey: "tas-belirsiz-a", nameTr: `Mavi ${gems[2]}`, nameEn: null, aliases: [], numericalVibration: 0, planets: [], chakras: [], elements: [] });
    idx.push({ stoneKey: "tas-belirsiz-b", nameTr: `Yeşil ${gems[2]}`, nameEn: null, aliases: [], numericalVibration: 0, planets: [], chakras: [], elements: [] });
  }
  const masterVal = Object.values(chart.core).map((n) => n.value).find((v) => v === 11 || v === 22 || v === 33);
  const root = masterVal ? (masterVal % 9 || 9) : lp > 9 ? (lp % 9 || 9) : lp;
  idx.push({ stoneKey: "turkuaz", nameTr: "Turkuaz", nameEn: "Turquoise", aliases: [], numericalVibration: chart.core.expression.value, planets: [], chakras: [], elements: [] });
  idx.push({ stoneKey: "hematit", nameTr: "Hematit", nameEn: "Hematite", aliases: [], numericalVibration: root, planets: [], chakras: [], elements: [] });
  idx.push({ stoneKey: "akik", nameTr: "Akik", nameEn: "Agate", aliases: [], numericalVibration: 0, planets: [planet], chakras: [], elements: [] });
  idx.push({ stoneKey: "sitrin", nameTr: "Sitrin", nameEn: "Citrine", aliases: [], numericalVibration: 0, planets: [planet], chakras: [], elements: [] });
  const stones: StoneMatchResult = matchStonesForNumbers(
    { lifePath: { value: core.lifePath.value, type: core.lifePath.type === "master" ? "master" : "single" }, expression: { value: core.expression.value }, soulUrge: { value: core.soulUrge.value }, personality: { value: core.personality.value }, birthDay: { value: core.birthDay.value }, karmicDebt: chart.karmicDebt.debtNumbers, karmicLessons: chart.karmicLessons.missingNumbers },
    { gemstones: [...gems, "Bilinmeyen Taş"], rulingPlanet: la?.rulingPlanet ?? null, element: la?.element ?? null },
    idx,
  );
  const stock: Record<string, number> = { Turkuaz: 6, Akik: 3, Hematit: 0 };
  if (gems[0]) stock[gems[0]] = 4;
  const stonesView = { mode: "library" as const, result: stones, stock };

  // ── karşılaştırma: gerçek hizalama (sentetik Mevcut Numeroloji anlık görüntüsü) ─────────────────────────────
  const legacySnapshot = {
    version: 1,
    motor: {
      hayatYolu: { display: "38/11", key: "38/11", steps: [] },
      ifadeSayisi: { display: "33/6" },
      anaKulvar: { display: "19/2", componentValues: [19] },
      yanKulvar: { display: "8" },
      zirveYillari: { peaks: [{ value: 3, startAge: 0, endAge: 34 }, { value: 5 }, { value: 8 }, { value: 4 }] },
      pinKodu: { a: 1 },
      cakraOmurgasi: { b: 2 },
    },
    summary: "özet",
    tas: { bileklik: ["Ametist"], kolye: ["Kuvars"] },
    calc: { methodology: "num-v1.1-ozel-sayi-2026-10", stampedAt: T0 },
  };
  const alignment: Alignment = alignRecords(legacySnapshot, { chart, personalDay, bridge, chaldean, stones });
  const alignmentClassicOnly: Alignment = alignRecords(null, { chart, personalDay, bridge, chaldean, stones });
  const compareSources = {
    legacy: [{ id: IDS.legacy, fullName: "Ayşe Can Öztürk", birthDate: "1988-02-29", createdAt: "2026-09-12T08:00:00.000Z", methodologyVersion: "num-v1.1-ozel-sayi-2026-10", clientId: null }],
    classic: [{ id: IDS.person, title: "Ayşe Can Öztürk", kind: "person", createdAt: T0, clientId: null }],
  };
  const alignSources = {
    legacy: { ...compareSources.legacy[0] },
    classic: { id: IDS.person, title: "Ayşe Can Öztürk", kind: "person", createdAt: T0, clientId: null, methodologyVersion: "numk-method-1" },
  };
  const legacyAssignments = [{ analysisType: "hayat-yolu", labelTr: "Hayat Yolu", value: "38/11", stones: ["Ametist", "Kuvars"] }];
  const note = { id: IDS.note, clientId: null, legacyId: IDS.legacy, classicId: IDS.person, body: "İlk not <b>kalın değil</b>\nikinci satır", snapshot: { schema: "num-compare-note-v1" }, rowVersion: 1, createdAt: T0, updatedAt: T0 };

  // ── katalog (catalogImport.ts ile aynı payload şekli) ─────────────────────────────────────────────────────
  const py = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33].map((n) => {
    const m = norm<MeaningsResult>("meanings", `m02-mean-${n}-tr`);
    return { kind: "pythagorean_meaning", number: n, lang: "tr", payload: { number: m.number.value, type: m.number.type, meaning: m.number.meaning } };
  });
  const ch = Array.from({ length: 43 }, (_, i) => i + 10).map((n) => {
    const c = norm<CompoundNumberResult>("compound_number", `m02-cmp-${n}-tr`);
    return { kind: "chaldean_compound", number: n, lang: "tr", payload: { number: c.number, name: c.name, nature: c.nature, meaning: c.meaning, sameAs: c.sameAs, root: c.root } };
  });

  const entitlements = { ok: true, enabled: true, isDemo: false, canCompute: true, canWrite: true, canLinkClients: true };
  // Danışan seçici (mevcut /api/clients sözleşmesi; sentetik)
  const clients = [
    { id: "c1c1c1c1-0000-4000-8000-000000000001", ad: "ZZ Ayşe Can", soyad: "Öztürk", dogum: "1988-02-29" },
    { id: "c1c1c1c1-0000-4000-8000-000000000002", ad: "ZZ Bora", soyad: "Demir", dogum: null },
  ];
  return { clients, analyses, rows, page2, stonesView, alignment, alignmentClassicOnly, compareSources, alignSources, legacyAssignments, note, catalog: { pythagorean_meaning: py, chaldean_compound: ch }, entitlements, chart, chaldean, dual };
}

export type Fixtures = ReturnType<typeof buildFixtures>;
