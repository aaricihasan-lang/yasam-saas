// Astroloji — Roxy YILLIK PROFEKSİYONLAR adaptörü (SAF). POST /astrology/profections?lang=tr
//
// İstek: doğum verisi (ortak birthBody — LMT dengelemesi dahil) + targetDate (seçilen yaşın ilk günü) + houseSystem
// HER ZAMAN "whole-sign" (owner kararı; yöneticinin natal evi de bütün-burç) + nodeType "true" (profeksiyonu etkilemez;
// gövde sabit kalsın diye). Yanıt beyaz liste projeksiyonla alınır:
//   • TEKNİK: age, profectedHouse, profectedSign, lordOfYear, lordNatalPosition{sign,house} (+ tarih aralığı).
//   • YOK SAYILAN (bilinen, kullanılmayan): interpretation, summary — owner kararıyla sağlayıcının otomatik Türkçe metni
//     ürüne ALINMAZ (yerine sahte yorum da üretilmez); birthDetails / targetDate yalnız yankı denetimi.
// Doğrulama (fail-closed; bozuk yanıt ekrana/arşive GİTMEZ): yankı = istek; yaş = istenen yaş (doğum günü/29 Şubat kuralı
// sağlayıcıyla aynı mı); ev = yaş mod 12 + 1; burçlar geçerli; yönetici klasik yedi gezegenden ve etkin burcun klasik
// yöneticisi (mevcut SIGN_LORDS tablosu); natal ev 1–12 ve bütün-burç tutarlı (sağlayıcı ev sistemi isteğini yok sayarsa
// yakalanır). Bu denetimler YENİ hesap üretmez; yalnız sağlayıcı sonucunu kabul/ret eder.
// Hata yanıtları: client.ts sağlayıcı hata gövdesini OKUMAZ (yalnız HTTP durumu) → belgeden farklı 400 biçimi
// (gerçekte code "bad_request", issues[] yok — FAZ 0 T15) güvenle "bad_request" olur.

import { SIGN_IDS, type SignId } from "../../model/western";
import { SIGN_LORDS } from "../../model/kp";
import {
  PROFECTIONS_HOUSE_SYSTEM,
  PROFECTIONS_TECHNICAL_SCHEMA,
  PROFECTION_LORDS,
  isLeapDayBirth,
  profectionYearRange,
  type ProfectionLord,
  type ProfectionsTechnical,
} from "../../model/westernProfections";
import { birthBody, type BirthPoint } from "./requests";
import { findUnmapped, int, mapBody, mapSign, num, obj, paths } from "./shared";
import type { AdapterResult } from "./timing";

export const ROXY_PROFECTIONS = { endpoint: "/astrology/profections", adapter: "astro-roxy-profections-1", projection: "profections-proj-1" } as const;

const KNOWN = new Set<string>([
  ...paths("birthDetails", ["date", "time", "latitude", "longitude", "timezone", "nodeType"]),
  "targetDate",
  "age",
  "profectedHouse",
  "profectedSign",
  "lordOfYear",
  ...paths("lordNatalPosition", ["sign", "house"]),
  "interpretation",
  "summary",
]);

/** İstek gövdesi; yaş/tarih geçersizse null (sağlayıcıya GİTMEZ). Hedef tarih = seçilen yaşın ilk günü (deterministik). */
export function profectionsBody(b: BirthPoint, age: number): Record<string, unknown> | null {
  const base = birthBody(b);
  const range = profectionYearRange(String(base.date), age);
  if (!range) return null;
  return { ...base, targetDate: range.start, houseSystem: PROFECTIONS_HOUSE_SYSTEM, nodeType: "true" };
}

export type ProfectionsExpect = {
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  timezone: number;
  targetDate: string;
  age: number;
};

export function projectRoxyProfections(raw: unknown, expect: ProfectionsExpect): AdapterResult<ProfectionsTechnical, never> {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };

  // Yankı denetimi: sağlayıcı İSTENEN doğum verisi ve hedef tarihle hesaplamalı.
  const bd = obj(r.birthDetails);
  if (!bd) errors.push("birthDetails yok");
  else {
    if (bd.date !== expect.date) errors.push("birthDetails.date uyuşmuyor");
    if (typeof bd.time !== "string" || bd.time.slice(0, 5) !== expect.time.slice(0, 5)) errors.push("birthDetails.time uyuşmuyor");
    const la = num(bd.latitude, -90, 90);
    const lo = num(bd.longitude, -180, 180);
    if (la === null || lo === null || Math.abs(la - expect.latitude) > 1e-4 || Math.abs(lo - expect.longitude) > 1e-4) errors.push("birthDetails konum uyuşmuyor");
    const tz = num(bd.timezone, -14, 14);
    if (tz === null || Math.abs(tz - expect.timezone) > 1e-4) errors.push("birthDetails.timezone uyuşmuyor");
  }
  if (r.targetDate !== expect.targetDate) errors.push("targetDate yankısı uyuşmuyor");

  const age = int(r.age, 0, 1000);
  if (age === null) errors.push("age");
  else if (age !== expect.age) errors.push(`age ${age} ≠ istenen ${expect.age}`);
  const house = int(r.profectedHouse, 1, 12);
  if (house === null) errors.push("profectedHouse");
  else if (age !== null && house !== (age % 12) + 1) errors.push("profectedHouse yaş mod 12 + 1 değil");
  const sign = mapSign(r.profectedSign);
  if (!sign) errors.push("profectedSign");
  const lordBody = mapBody(r.lordOfYear);
  const lord = lordBody && (PROFECTION_LORDS as readonly string[]).includes(lordBody) ? (lordBody as ProfectionLord) : null;
  if (!lord) errors.push("lordOfYear klasik yedi gezegenden değil");
  else if (sign && SIGN_LORDS[sign] !== lord) errors.push("lordOfYear etkin burcun klasik yöneticisi değil");
  const lp = obj(r.lordNatalPosition);
  const lordSign = mapSign(lp?.sign);
  const lordHouse = int(lp?.house, 1, 12);
  if (!lordSign || lordHouse === null) errors.push("lordNatalPosition");
  else if (sign && age !== null) {
    // Bütün-burç tutarlılığı: natal Yükselen burcu = etkin burç − (yaş mod 12); yöneticinin evi bu burçtan sayılır.
    const asc = (SIGN_IDS.indexOf(sign) - (age % 12) + 12) % 12;
    if ((SIGN_IDS.indexOf(lordSign) - asc + 12) % 12 + 1 !== lordHouse) errors.push("lordNatalPosition.house bütün-burç ile tutarsız");
  }
  const range = profectionYearRange(expect.date, expect.age);
  if (!range || range.start !== expect.targetDate) errors.push("hedef tarih profeksiyon yılının ilk günü değil");

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return {
    ok: true,
    technical: {
      schema: PROFECTIONS_TECHNICAL_SCHEMA,
      zodiac: "tropical",
      method: "annual_asc_whole_sign",
      houseSystem: PROFECTIONS_HOUSE_SYSTEM,
      rulership: "traditional_seven",
      age: age!,
      targetDate: expect.targetDate,
      yearStart: range!.start,
      yearEnd: range!.end,
      leapDayBirth: isLeapDayBirth(expect.date),
      profectedHouse: house!,
      profectedSign: sign as SignId,
      lordOfYear: lord!,
      lordNatal: { sign: lordSign as SignId, house: lordHouse! },
    },
    interpretation: null,
    unmappedFields: findUnmapped(raw, KNOWN, new Set()),
    droppedValues: [],
  };
}
