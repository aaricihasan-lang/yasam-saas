// Gökyüzü Atlası — Batı Horary (William Lilly) ÜRÜN çalıştırıcısı: istek doğrulama + yerel saat → UTC + gerçek hesaplama motoru
// (lib/astrology/horary/western) birleştirmesi. SAF (ağ / veritabanı / sağlayıcı YOK); route katmanı yetki ve oran sınırını uygular.
//
// HÜKÜM ÜRETİLMEZ: motorun ADAY / bilgi kayıtları olduğu gibi taşınır. Göstergeler yalnız klasik kural "ev başlangıcının burç
// yöneticisi" ile seçilir (1. ev = soran, seçilen ev = sorulan; Ay soranın ortak göstergesi). Soru METNİ bu katmana hiç gelmez
// (istemcide kalır; sunucuya gönderilmez, kaydedilmez).

import { resolveAstroBirthTime, type DstChoice } from "@/lib/astrology/birth/timeResolution";
import { buildWesternHoraryChart, receiverFor, type WesternHoraryChart } from "./western/chart";
import { PROFILE_LILLY_1647 } from "./western/calc";
import { DOMICILE, ORB_VARIANTS, signOf, type ClassicalPlanet } from "./western/tables";
import { analyzePair, findIngresses, findStations, type PairAnalysis } from "./western/timeline";

/** Sorunun aranacağı olay ufku (gün). Lilly bir sınır yazmaz; ufuk dışı = "ufuk içinde olay yok" (hüküm değil). */
export const HORARY_HORIZON_DAYS = 30;

export type WesternHoraryRequest = {
  date: string;
  time: string;
  /** Konum (çözümlenmiş): ad, IANA saat dilimi, enlem/boylam. Route `resolveAstroLocation` ile üretir. */
  place: { label: string; timezone: string; latitude: number; longitude: number };
  /** Sorulan ev (2–12). */
  quesitedHouse: number;
  dst?: DstChoice;
};

export type SignificatorPair = { role: "lord1_lordN" | "moon_lordN"; a: ClassicalPlanet; b: ClassicalPlanet; analysis: PairAnalysis };

export type TimelineTag = { kind: "perfection" | "interposition" | "translation_join" | "moon_aspect" | "moon_ingress" | "station" | "ingress"; note: string | null };
/** Tek fiziksel olay (an + gövdeler); aynı olayın birden çok anlamı `tags` içinde birleşir (ekranda tek satır). */
export type TimelineEvent = {
  atUtc: string;
  bodies: string[];
  angle: number | null;
  tags: TimelineTag[];
  /** Olay anının tahmini efemeris belirsizliği (sn); bilinmiyorsa null. */
  uncertaintySec: number | null;
};

export type WesternHoraryResult = {
  question: { utc: string; localDate: string; localTime: string; timezone: string; offsetSeconds: number; dstResolved: boolean; place: string; latitude: number; longitude: number };
  chart: WesternHoraryChart;
  significators: { querent: ClassicalPlanet; quesited: ClassicalPlanet; quesitedHouse: number; coSignificator: "moon"; sameRuler: boolean; rule: string };
  pairs: SignificatorPair[];
  timeline: TimelineEvent[];
  horizonDays: number;
  /** Motorun açıkça işaretlediği doğrulanmamış / eğitmen kararı bekleyen noktalar (ekranda gösterilir). */
  openPoints: string[];
};

export type WesternHoraryError =
  | { code: "INVALID_INPUT"; field: "date" | "time" | "quesitedHouse" | "place"; error: string }
  | { code: "TIME_GAP"; error: string }
  | { code: "TIME_AMBIGUOUS"; error: string; options: { choice: "earlier" | "later"; utcIso: string; offsetSeconds: number }[] }
  | { code: "POLAR_LATITUDE"; error: string }
  | { code: "OUT_OF_RANGE"; error: string };

const DAY = 86_400_000;
/** Efemeris karşılaştırması yapılan güvenli aralık (astronomy-engine; DE441 karşılaştırması 2026 civarı). */
const MIN_YEAR = 1800;
const MAX_YEAR = 2200;

export function parseWesternHoraryBody(raw: unknown): { ok: true; value: { date: string; time: string; locationId: string; quesitedHouse: number; dst: DstChoice } } | { ok: false; error: WesternHoraryError } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const date = typeof b.date === "string" ? b.date.trim() : "";
  const time = typeof b.time === "string" ? b.time.trim() : "";
  const locationId = typeof b.locationId === "string" ? b.locationId.trim() : "";
  const house = typeof b.quesitedHouse === "number" ? b.quesitedHouse : Number.NaN;
  const dst = b.dst === "earlier" || b.dst === "later" ? b.dst : "auto";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: { code: "INVALID_INPUT", field: "date", error: "Sorunun tarihi gerekli (YYYY-AA-GG)." } };
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return { ok: false, error: { code: "INVALID_INPUT", field: "time", error: "Sorunun saati gerekli (SS:DD)." } };
  if (!locationId) return { ok: false, error: { code: "INVALID_INPUT", field: "place", error: "Sorunun sorulduğu konumu seçin." } };
  if (!Number.isInteger(house) || house < 2 || house > 12) return { ok: false, error: { code: "INVALID_INPUT", field: "quesitedHouse", error: "Sorulan ev 2 ile 12 arasında olmalı." } };
  return { ok: true, value: { date, time, locationId, quesitedHouse: house, dst } };
}

export function runWesternHorary(req: WesternHoraryRequest): { ok: true; result: WesternHoraryResult } | { ok: false; error: WesternHoraryError } {
  const year = Number(req.date.slice(0, 4));
  if (!Number.isFinite(year) || year < MIN_YEAR || year > MAX_YEAR) return { ok: false, error: { code: "OUT_OF_RANGE", error: `Desteklenen tarih aralığı ${MIN_YEAR}–${MAX_YEAR}. Bu sınır, hesaplamanın doğrulandığı aralıktır.` } };
  const t = resolveAstroBirthTime(req.date, req.time, req.place.timezone, req.dst ?? "auto");
  if (t.kind === "invalid") return { ok: false, error: { code: "INVALID_INPUT", field: t.reason === "timezone" ? "place" : t.reason, error: t.reason === "date" ? "Geçersiz tarih." : t.reason === "time" ? "Geçersiz saat." : "Konumun saat dilimi çözümlenemedi." } };
  if (t.kind === "gap") return { ok: false, error: { code: "TIME_GAP", error: "Bu yerel saat, yaz saati geçişi nedeniyle o gün yaşanmadı. Saati kontrol edin." } };
  if (t.kind === "ambiguous") return { ok: false, error: { code: "TIME_AMBIGUOUS", error: "Bu yerel saat yaz saati geçişinde iki kez yaşandı. Hangisi olduğunu seçin.", options: t.options } };

  const profile = PROFILE_LILLY_1647;
  const chart = buildWesternHoraryChart({ questionUtc: t.utcIso, latitude: req.place.latitude, longitude: req.place.longitude, profile });
  if ("error" in chart) {
    return chart.error === "polar_latitude"
      ? { ok: false, error: { code: "POLAR_LATITUDE", error: "Bu enlemde Regiomontanus ev başlangıçları tanımsız (kutup bölgesi). Harita oluşturulamaz." } }
      : { ok: false, error: { code: "INVALID_INPUT", field: "place", error: "Konum koordinatları geçersiz." } };
  }

  const ms = Date.parse(t.utcIso);
  const querent = DOMICILE[signOf(chart.cusps[0])];
  const quesited = DOMICILE[signOf(chart.cusps[req.quesitedHouse - 1])];
  const receives = receiverFor(chart, profile);
  const orbs = ORB_VARIANTS[profile.orbVariant];
  const pairs: SignificatorPair[] = [];
  if (querent !== quesited) pairs.push({ role: "lord1_lordN", a: querent, b: quesited, analysis: analyzePair(querent, quesited, ms, HORARY_HORIZON_DAYS, receives, orbs) });
  if (quesited !== "moon" && querent !== "moon") pairs.push({ role: "moon_lordN", a: "moon", b: quesited, analysis: analyzePair("moon", quesited, ms, HORARY_HORIZON_DAYS, receives, orbs) });

  const timeline = buildTimeline(chart, pairs, [...new Set<ClassicalPlanet>([querent, quesited])], ms);

  const openPoints = [
    ...profile.unverified.map((u) => (u === "voc:apply-meaning" ? "Ay boşlukta: CA s. 112'deki “apply” sözcüğünün orb içi yaklaşma mı, burç içi kesinleşme mi olduğu kaynakta açık değil (A: burç içi kesinleşme; C: orb içi yaklaşma — ikisi de gösterilir)." : u)),
    "Gezegen saati: gün doğumu tanımı (Güneş'in üst kenarı + standart kırılma) Lilly'de yazılı değil — eğitmen kararı.",
    "Aktarım/toplama: CA s. 111 ile s. 125–126 tanımları farklı; ikisi ayrı bayrak olarak gösterilir.",
  ];

  return {
    ok: true,
    result: {
      question: { utc: t.utcIso.replace(".000Z", "Z"), localDate: req.date, localTime: req.time.slice(0, 5), timezone: req.place.timezone, offsetSeconds: t.offsetSeconds, dstResolved: t.ambiguousResolved, place: req.place.label, latitude: req.place.latitude, longitude: req.place.longitude },
      chart,
      significators: { querent, quesited, quesitedHouse: req.quesitedHouse, coSignificator: "moon", sameRuler: querent === quesited, rule: "Ev başlangıcının burç yöneticisi (klasik yöneticiler): 1. ev = soran, seçilen ev = sorulan; Ay soranın ortak göstergesi." },
      pairs,
      timeline,
      horizonDays: HORARY_HORIZON_DAYS,
      openPoints,
    },
  };
}

function buildTimeline(chart: WesternHoraryChart, pairs: SignificatorPair[], sigs: ClassicalPlanet[], ms: number): TimelineEvent[] {
  const t1 = ms + HORARY_HORIZON_DAYS * DAY;
  const byKey = new Map<string, TimelineEvent>();
  const push = (atUtc: string, bodies: string[], angle: number | null, tag: TimelineTag, uncertaintySec: number | null) => {
    const at = Date.parse(atUtc);
    if (!(at > ms && at <= t1)) return;
    const k = `${atUtc}|${[...bodies].sort().join(",")}`;
    const cur = byKey.get(k);
    if (!cur) byKey.set(k, { atUtc, bodies, angle, tags: [tag], uncertaintySec });
    else if (!cur.tags.some((x) => x.kind === tag.kind && x.note === tag.note)) cur.tags.push(tag);
  };
  for (const p of chart.moon.nextInSign) push(p.atUtc, ["moon", p.b], p.angle, { kind: "moon_aspect", note: null }, p.uncertaintySec);
  push(chart.moon.ingressUtc, ["moon"], null, { kind: "moon_ingress", note: null }, null);
  for (const pr of pairs) {
    const a = pr.analysis;
    if (a.perfection) push(a.perfection.atUtc, [a.a, a.b], a.perfection.angle, { kind: "perfection", note: null }, a.perfection.uncertaintySec);
    for (const x of a.interpositions) push(x.atUtc, [x.significator, x.third], x.angle, { kind: "interposition", note: x.kind }, x.uncertaintySec);
    // Kesintili aktarım aktarım DEĞİLDİR → ana çizelgede yok (ileri ayrıntıda kanıtıyla görünür).
    for (const tr of a.translations) if (tr.status !== "interrupted") push(tr.joinsAt, [tr.by, tr.to], null, { kind: "translation_join", note: tr.status }, null);
  }
  for (const s of sigs) {
    for (const st of findStations(s, ms, t1)) push(st.atUtc, [s], null, { kind: "station", note: st.kind }, st.uncertaintySec);
    if (s !== "moon") for (const ing of findIngresses(s, ms, t1)) push(ing.atUtc, [s], null, { kind: "ingress", note: `${ing.from}→${ing.to}` }, ing.uncertaintySec);
  }
  return [...byKey.values()].sort((x, y) => Date.parse(x.atUtc) - Date.parse(y.atUtc));
}
