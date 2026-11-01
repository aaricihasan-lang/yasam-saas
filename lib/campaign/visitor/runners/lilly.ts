/**
 * KM-3 — Gökyüzü Atlası: William Lilly horary (YEREL motor, sağlayıcı kredisi 0). Soru METNİ istemcide kalır (localOnly);
 * sunucuya yalnız an + yer + sorulan ev gelir. Otomatik hüküm ÜRETİLMEZ — motorun göstergeleri olduğu gibi gösterilir.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { runWesternHorary } from "@/lib/astrology/horary/westernRun";
import type { ResultBlock } from "../types";
import { F, deg, done, onlyKeys, parseDate, parsePlace, parseTime, trPlanet, trSign, type FieldErrors, type Place, type VisitorRunner } from "./shared";

assertServerOnly("lib/campaign/visitor/runners/lilly");

const HOUSES = [
  { value: "7", label: "7. ev — ilişki, ortaklık" },
  { value: "2", label: "2. ev — para, kaynak" },
  { value: "10", label: "10. ev — kariyer, statü" },
  { value: "6", label: "6. ev — iş rutini, sağlık rutini" },
  { value: "4", label: "4. ev — ev, aile" },
  { value: "5", label: "5. ev — çocuk, yaratıcılık" },
  { value: "9", label: "9. ev — yolculuk, eğitim" },
  { value: "11", label: "11. ev — dostlar, umutlar" },
  { value: "3", label: "3. ev — kardeş, kısa yol" },
  { value: "8", label: "8. ev — ortak kaynak" },
  { value: "12", label: "12. ev — gizli konular" },
] as const;

type LillyIn = { date: string; time: string; place: Place; house: number };

export const atlasLilly: VisitorRunner<LillyIn> = {
  key: "atlas:horary.lilly",
  kind: "local",
  formLabel: "Sorunuz, sorulduğu an ve yer — doğum bilgisi gerekmez",
  fields: [
    { k: "question", label: "Sorunuz (cihazınızda kalır, gönderilmez)", type: "textarea", localOnly: true, maxLength: 300, placeholder: "Ör. Yeni iş teklifini kabul etmeli miyim?" },
    { k: "qDate", label: "Soru tarihi", type: "date", required: true },
    { k: "qTime", label: "Soru saati", type: "time", required: true },
    { ...F.birthPlace, k: "place", label: "Bulunduğunuz yer" },
    { k: "house", label: "Sorunun konusu", type: "select", required: true, options: HOUSES },
  ],
  parse(input) {
    const bad = onlyKeys(input, ["qDate", "qTime", "place", "house"]);
    if (bad) return { ok: false, errors: bad };
    const errors: FieldErrors = {};
    const d = parseDate(input, "qDate", errors, { min: 1800, max: 2200 });
    const t = parseTime(input, "qTime", errors);
    const place = parsePlace(input, "place", errors);
    const house = Number(input.house);
    if (!Number.isInteger(house) || house < 2 || house > 12) errors.house = "Listeden bir konu seçin.";
    return done(errors, { date: d?.iso ?? "", time: t ?? "", place: place!, house });
  },
  async run(_ctx, v) {
    const r = runWesternHorary({ date: v.date, time: v.time, place: { label: v.place.label, timezone: v.place.timezone, latitude: v.place.latitude, longitude: v.place.longitude }, quesitedHouse: v.house });
    if (!r.ok) {
      const e = r.error as { code: string; error: string };
      const field = e.code === "TIME_GAP" || e.code === "TIME_AMBIGUOUS" ? "qTime" : e.code === "POLAR_LATITUDE" ? "place" : "qDate";
      return { ok: false, code: "girdi", message: e.error, errors: { [field]: e.error } };
    }
    const res = r.result;
    const ch = res.chart as unknown as {
      planets: { planet: string; sign: string; lon: number; house: number; retrograde: boolean }[];
      moon: { sign: string; ingressUtc: string | null };
      radicality: { ascRuler: string; hourRuler: string; same: boolean; note: string };
      planetaryHour: { dayRuler: string; hourRuler: string; hourNumber: number; isDayHour: boolean };
      partOfFortune: { sign: string; house: number };
    };
    const fmtUtc = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: v.place.timezone, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "—");
    const blocks: ResultBlock[] = [
      {
        type: "kv",
        title: "Soru anı",
        rows: [
          ["Yer", res.question.place],
          ["Yerel tarih / saat", `${res.question.localDate} ${res.question.localTime}`],
          ["Saat dilimi", res.question.timezone],
        ],
      },
      {
        type: "kv",
        title: "Göstergeler (klasik kural)",
        rows: [
          ["Soran (1. ev yöneticisi)", trPlanet(res.significators.querent)],
          [`Sorulan (${res.significators.quesitedHouse}. ev yöneticisi)`, trPlanet(res.significators.quesited)],
          ["Ortak gösterge", "Ay"],
          ["Kural", res.significators.rule],
        ],
      },
      {
        type: "table",
        title: "Gezegen konumları",
        head: ["Gezegen", "Burç", "Derece", "Ev", "Hareket"],
        rows: ch.planets.map((p) => [trPlanet(p.planet), trSign(p.sign), deg(p.lon), String(p.house), p.retrograde ? "Geri" : "İleri"]),
      },
      {
        type: "kv",
        title: "Ay, radikallik ve gezegen saati",
        rows: [
          ["Ay'ın burcu", trSign(ch.moon.sign)],
          ["Ay'ın burç değiştirmesi", fmtUtc(ch.moon.ingressUtc)],
          ["ASC yöneticisi / saat yöneticisi", `${trPlanet(ch.radicality.ascRuler)} / ${trPlanet(ch.radicality.hourRuler)}`],
          ["Gezegen saati", `${ch.planetaryHour.hourNumber}. ${ch.planetaryHour.isDayHour ? "gündüz" : "gece"} saati — ${trPlanet(ch.planetaryHour.hourRuler)}`],
          ["Şans Noktası", `${trSign(ch.partOfFortune.sign)}, ${ch.partOfFortune.house}. ev`],
        ],
      },
      {
        type: "table",
        title: `Önümüzdeki ${res.horizonDays} gündeki olaylar`,
        head: ["An", "Gövdeler", "Açı"],
        rows: res.timeline.slice(0, 15).map((e) => [fmtUtc(e.atUtc), e.bodies.map(trPlanet).join(" – "), e.angle === null ? "—" : `${e.angle}°`]),
      },
    ];
    if (res.openPoints.length) blocks.push({ type: "list", title: "Yöntem notları (kaynakta açık noktalar)", items: res.openPoints, kind: "veri" });
    return {
      ok: true,
      result: {
        title: "Horary — William Lilly yöntemi",
        subtitle: `${trSign(ch.moon.sign)} burcunda Ay · ${res.question.place}`,
        blocks,
        notes: ["Otomatik hüküm üretilmez; tablo ve göstergeler klasik kaynağa göre gösterilir. Sorunuzun metni sunucuya gönderilmedi."],
        commentsShown: false,
      },
    };
  },
};
