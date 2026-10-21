// Atlas yeni teknikler (2026-10-22) — sağlayıcı adaptörleri (SAF): Ashtakoot Gun Milan (/vedic-astrology/compatibility),
// Manglik (/vedic-astrology/dosha/manglik) ve Sade Sati (/vedic-astrology/dosha/sadhesati).
//
// Yalnız beyaz liste projeksiyon + İÇ tutarlılık denetimi (fail-closed). İkinci bir hesap motoru YOKTUR:
//   • frame.ayanamsa = istenen ayanamsa
//   • Gun Milan: 8 koota klasik sırada, her biri klasik azami puanla, 0 ≤ puan ≤ azami (0,5 adım); toplam = koota toplamı;
//     maxScore 36; yüzde = toplam / 36; Bhakoot sınıflaması = iki Ay burcu, Graha Maitri = bu burçların klasik yöneticileri;
//     her dosha (etkin ya da iptal) → ilgili koota puanı 0 ve Nadi/Bhakoot puanı 0 → dosha listelerinden birinde.
//   • Manglik: present ⇔ severity; Sade Sati: present ⇒ evre (12./1./2.) çözülür + geleneksel derece evreyle tutarlı.
// Sağlayıcının hüküm / öneri / etki / çare metinleri teknik katmana GİRMEZ; ayrı yorum katmanındadır (yetki kapısı).
// Bilinmeyen alan → yolu raporlanır (*_KNOWN); değer asla loglanmaz.

import { SIGN_LORDS } from "../../model/kp";
import type { VedicAyanamsaId } from "../../model/vedic";
import { SIGN_LABELS } from "../../labels/tr";
import { GRAHA_LABELS } from "../../topics/vedic";
import {
  KOOTA_CLASS_LABELS,
  KOOTA_IDS,
  KOOTA_MAX,
  KOOTA_PROVIDER_NAMES,
  MANGLIK_SEVERITIES,
  SADE_SATI_SEVERITY_OF,
  VEDIC_GUN_MILAN_INTERP_SCHEMA,
  VEDIC_GUN_MILAN_PART_SCHEMA,
  VEDIC_MANGLIK_INTERP_SCHEMA,
  VEDIC_MANGLIK_PART_SCHEMA,
  VEDIC_SADE_SATI_INTERP_SCHEMA,
  VEDIC_SADE_SATI_TECHNICAL_SCHEMA,
  type GunMilanDoshaId,
  type KootaClass,
  type KootaId,
  type KootaRow,
  type ManglikSeverity,
  type SadeSatiPhase,
  type VedicGunMilanInterpretation,
  type VedicGunMilanPart,
  type VedicManglikInterpretation,
  type VedicManglikPart,
  type VedicSadeSatiInterpretation,
  type VedicSadeSatiTechnical,
} from "../../model/vedicMatch";
import { arr, findUnmapped, num, obj, paths, text, texts } from "./shared";
import { mapGraha, mapRashi } from "./vedic";
import type { AdapterResult } from "./timing";

export const ROXY_VEDIC_COMPATIBILITY = { endpoint: "/vedic-astrology/compatibility", adapter: "astro-roxy-vedic-gun-milan-1", projection: "vedic-gun-milan-proj-1" } as const;
export const ROXY_VEDIC_MANGLIK = { endpoint: "/vedic-astrology/dosha/manglik", adapter: "astro-roxy-vedic-manglik-1", projection: "vedic-manglik-proj-1" } as const;
export const ROXY_VEDIC_SADHESATI = { endpoint: "/vedic-astrology/dosha/sadhesati", adapter: "astro-roxy-vedic-sade-sati-1", projection: "vedic-sade-sati-proj-1" } as const;

const done = <T, I>(errors: string[], dropped: string[], technical: () => T, interpretation: () => I | null, raw: unknown, known: Set<string>, opaque: Set<string>): AdapterResult<T, I> => {
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return { ok: true, technical: technical(), interpretation: interpretation(), unmappedFields: findUnmapped(raw, known, opaque), droppedValues: [...new Set(dropped)] };
};
const FRAME_KNOWN = paths("frame", ["ayanamsa", "ayanamsaDegrees"]);
function frameOf(r: Record<string, unknown>, ayanamsa: VedicAyanamsaId, errors: string[]): number | null {
  const f = obj(r.frame);
  const d = num(f?.ayanamsaDegrees, 0, 40);
  if (f?.ayanamsa !== ayanamsa || d === null) errors.push("frame: istenen ayanamsa değil");
  return d;
}
const compactKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
/** Sınıflama metni: yalnız harf/boşluk/tire (≤ 40); boş/uygunsuz → null. */
function classText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.normalize("NFC").trim();
  return t.length > 0 && t.length <= 40 && /^[\p{L} .'-]+$/u.test(t) ? t : null;
}
const half = (n: number) => Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;

// ═══ Gun Milan ════════════════════════════════════════════════════════════════
const GUN_MILAN_KNOWN = new Set<string>([
  ...FRAME_KNOWN,
  "total",
  "maxScore",
  "percentage",
  "isCompatible",
  "recommendation",
  "doshas",
  "doshaCancellations",
  ...paths("doshaCancellations[]", ["dosha", "reason"]),
  "breakdown",
  ...paths("breakdown[]", ["category", "score", "maxScore", "person1", "person2", "description"]),
]);

export function mapDosha(v: unknown): GunMilanDoshaId | null {
  if (typeof v !== "string") return null;
  const k = compactKey(v);
  if (k.startsWith("nadi")) return "nadi";
  if (k.startsWith("bhakoot") || k.startsWith("bhakut")) return "bhakoot";
  return null;
}

export function projectRoxyVedicGunMilan(raw: unknown, opts: { ayanamsa: VedicAyanamsaId }): AdapterResult<VedicGunMilanPart, VedicGunMilanInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const ayDeg = frameOf(r, opts.ayanamsa, errors);
  const total = num(r.total, 0, 36);
  if (total === null || !half(total)) errors.push("total");
  if (r.maxScore !== 36) errors.push("maxScore 36 değil");
  const pct = num(r.percentage, 0, 100);
  if (pct === null) errors.push("percentage");
  else if (total !== null && Math.abs(pct - (total / 36) * 100) > 0.01) errors.push("percentage = total / 36 değil");
  const list = arr(r.breakdown);
  if (!list || list.length !== KOOTA_IDS.length) errors.push("breakdown: 8 koota değil");
  const kootas: KootaRow[] = [];
  for (const [i, id] of KOOTA_IDS.entries()) {
    const o = obj(list?.[i]);
    if (!o) continue;
    if (o.category !== KOOTA_PROVIDER_NAMES[id]) {
      errors.push(`breakdown[${i}]: sıra / kategori (${id})`);
      continue;
    }
    const max = KOOTA_MAX[id];
    if (o.maxScore !== max) errors.push(`${id}: azami puan klasik değil`);
    const score = num(o.score, 0, max);
    if (score === null || !half(score)) {
      errors.push(`${id}: puan`);
      continue;
    }
    const cls = (v: unknown, who: string): KootaClass | null => {
      const t = classText(v);
      if (!t) {
        errors.push(`${id}.${who}: sınıflama`);
        return null;
      }
      if (id === "bhakoot") {
        const s = mapRashi(t);
        if (!s) errors.push(`${id}.${who}: burç değil`);
        return { raw: t, label: s ? SIGN_LABELS[s] : t };
      }
      if (id === "graha_maitri") {
        const g = mapGraha(t);
        if (!g) errors.push(`${id}.${who}: graha değil`);
        return { raw: t, label: g ? (GRAHA_LABELS[g] ?? t) : t };
      }
      const known = KOOTA_CLASS_LABELS[compactKey(t)];
      if (!known) dropped.push(`breakdown.${id}.${who}`);
      return { raw: t, label: known ?? t };
    };
    const p1 = cls(o.person1, "person1");
    const p2 = cls(o.person2, "person2");
    if (!p1 || !p2) continue;
    kootas.push({ id, score, maxScore: max, person1: p1, person2: p2 });
  }
  if (kootas.length === KOOTA_IDS.length && total !== null) {
    const sum = kootas.reduce((a, k) => a + k.score, 0);
    if (Math.abs(sum - total) > 1e-9) errors.push("total koota toplamı değil");
    // İç tutarlılık: Bhakoot sınıflaması iki Ay burcu → Graha Maitri bu burçların klasik yöneticileri olmalı.
    const bh = kootas.find((k) => k.id === "bhakoot")!;
    const gm = kootas.find((k) => k.id === "graha_maitri")!;
    const s1 = mapRashi(bh.person1.raw);
    const s2 = mapRashi(bh.person2.raw);
    if (s1 && s2 && (SIGN_LORDS[s1] !== mapGraha(gm.person1.raw) || SIGN_LORDS[s2] !== mapGraha(gm.person2.raw))) errors.push("graha_maitri: Ay burcu yöneticisi değil");
  }
  const doshas: GunMilanDoshaId[] = [];
  for (const d of arr(r.doshas) ?? (errors.push("doshas"), [])) {
    const id = mapDosha(d);
    if (!id) errors.push("doshas: bilinmeyen dosha");
    else if (!doshas.includes(id)) doshas.push(id);
  }
  const cancellations: { dosha: GunMilanDoshaId; reason: string }[] = [];
  for (const c of arr(r.doshaCancellations) ?? (errors.push("doshaCancellations"), [])) {
    const o = obj(c);
    const id = mapDosha(o?.dosha);
    const reason = text(o?.reason);
    if (!id || !reason || reason.length > 400) {
      errors.push("doshaCancellations[]: alan");
      continue;
    }
    if (doshas.includes(id)) errors.push(`${id}: hem etkin hem iptal`);
    cancellations.push({ dosha: id, reason });
  }
  if (kootas.length === KOOTA_IDS.length) {
    const scoreOf = (k: KootaId) => kootas.find((x) => x.id === k)!.score;
    for (const d of [...doshas, ...cancellations.map((c) => c.dosha)]) if (scoreOf(d) !== 0) errors.push(`${d}: dosha var ama puan 0 değil`);
    for (const d of ["nadi", "bhakoot"] as const) if (scoreOf(d) === 0 && !doshas.includes(d) && !cancellations.some((c) => c.dosha === d)) errors.push(`${d}: puan 0 ama dosha bildirilmedi`);
  }
  if (typeof r.isCompatible !== "boolean") errors.push("isCompatible");
  return done(
    errors,
    dropped,
    () => ({ schema: VEDIC_GUN_MILAN_PART_SCHEMA, zodiac: "sidereal", frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! }, total: total!, maxScore: 36, percentage: Math.round(pct! * 100) / 100, kootas, doshas, cancellations }),
    () => ({ schema: VEDIC_GUN_MILAN_INTERP_SCHEMA, recommendation: text(r.recommendation), thresholdMet: typeof r.isCompatible === "boolean" ? r.isCompatible : null }),
    raw,
    GUN_MILAN_KNOWN,
    new Set(),
  );
}

// ═══ Manglik ══════════════════════════════════════════════════════════════════
const MANGLIK_KNOWN = new Set<string>([...FRAME_KNOWN, "present", "severity", "description", "exceptions", "remedies", ...paths("effects", ["marriage", "personality", "timing", "relationships"])]);

const severityOf = (v: unknown): ManglikSeverity | null => (typeof v === "string" && (MANGLIK_SEVERITIES as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as ManglikSeverity) : null);

export function projectRoxyVedicManglik(raw: unknown, opts: { ayanamsa: VedicAyanamsaId }): AdapterResult<VedicManglikPart, VedicManglikInterpretation> {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const ayDeg = frameOf(r, opts.ayanamsa, errors);
  if (typeof r.present !== "boolean") errors.push("present");
  const severity = r.severity === undefined || r.severity === null ? null : severityOf(r.severity);
  if (r.severity !== undefined && r.severity !== null && !severity) errors.push("severity");
  if (r.present === true && !severity) errors.push("present ama severity yok");
  if (r.present === false && severity) errors.push("present değil ama severity var");
  if (r.exceptions !== undefined && !arr(r.exceptions)) errors.push("exceptions");
  const exceptions = texts(r.exceptions).map((x) => x.slice(0, 300));
  if (typeof r.description !== "string") errors.push("description");
  const eff = obj(r.effects);
  return done(
    errors,
    [],
    () => ({ schema: VEDIC_MANGLIK_PART_SCHEMA, zodiac: "sidereal", frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! }, present: r.present as boolean, severity, exceptions }),
    () => ({
      schema: VEDIC_MANGLIK_INTERP_SCHEMA,
      description: text(r.description),
      remedies: texts(r.remedies),
      effects: eff ? { marriage: text(eff.marriage), personality: text(eff.personality), timing: text(eff.timing), relationships: text(eff.relationships) } : null,
    }),
    raw,
    MANGLIK_KNOWN,
    new Set(),
  );
}

// ═══ Sade Sati ════════════════════════════════════════════════════════════════
// effects.phases anahtarı evre adıdır (dile göre değişir) → içi "opak" (yalnız evre metni okunur).
const SADE_SATI_KNOWN = new Set<string>([...FRAME_KNOWN, "present", "type", "severity", "description", "remedies", ...paths("effects", ["general", "phases"])]);
const SADE_SATI_OPAQUE = new Set<string>(["effects.phases"]);

/** Sağlayıcı evre metni → evre. Türkçe ("Doruk evresi (1. ev)") ve İngilizce ("Peak") biçimler; ev numarası önceliklidir. */
export function sadeSatiPhaseOf(v: unknown): SadeSatiPhase | null {
  if (typeof v !== "string") return null;
  const m = /\((\d{1,2})\.\s*ev\)/i.exec(v) ?? /\b(12|1|2)(?:st|nd|th)?\s*house\b/i.exec(v);
  if (m) return m[1] === "12" ? "rising" : m[1] === "1" ? "peak" : m[1] === "2" ? "setting" : null;
  const k = compactKey(v);
  if (k.startsWith("rising")) return "rising";
  if (k.startsWith("peak")) return "peak";
  if (k.startsWith("setting")) return "setting";
  return null;
}

export function projectRoxyVedicSadeSati(raw: unknown, opts: { ayanamsa: VedicAyanamsaId; asOf: string }): AdapterResult<VedicSadeSatiTechnical, VedicSadeSatiInterpretation> {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const ayDeg = frameOf(r, opts.ayanamsa, errors);
  if (typeof r.present !== "boolean") errors.push("present");
  if (r.type !== undefined && r.type !== null && typeof r.type !== "string") errors.push("type");
  const phase = r.present === true ? sadeSatiPhaseOf(r.type) : null;
  if (r.present === true && !phase) errors.push("present ama evre çözülemedi");
  const severity = r.severity === undefined || r.severity === null ? null : severityOf(r.severity);
  if (r.severity !== undefined && r.severity !== null && !severity) errors.push("severity");
  if (phase && severity !== SADE_SATI_SEVERITY_OF[phase]) errors.push("severity evreyle tutarsız");
  if (r.present === false && severity) errors.push("present değil ama severity var");
  if (typeof r.description !== "string") errors.push("description");
  const eff = obj(r.effects);
  const phases = obj(eff?.phases);
  const phaseEffect = phases && typeof r.type === "string" ? text(phases[r.type]) : null;
  return done(
    errors,
    [],
    () => ({ schema: VEDIC_SADE_SATI_TECHNICAL_SCHEMA, zodiac: "sidereal", frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! }, asOf: opts.asOf, present: r.present as boolean, phase, severity }),
    () => ({ schema: VEDIC_SADE_SATI_INTERP_SCHEMA, description: text(r.description), general: text(eff?.general), phaseEffect, remedies: texts(r.remedies) }),
    raw,
    SADE_SATI_KNOWN,
    SADE_SATI_OPAQUE,
  );
}
