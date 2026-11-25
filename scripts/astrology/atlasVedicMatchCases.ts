/**
 * I18N ATLAS-V — Vedik eşleşme (Gun Milan + Manglik, Sade Sati, Dashakoot, Papasamyam) ve Vedik noktalar (Upagraha, Heliakal)
 * panel çevirisi için ortak vaka üreticisi (yalnız test; ağ / DB / sağlayıcı YOK). Gerçek sağlayıcı golden yanıtları üretim
 * normalizer'larıyla projekte edilir (hesap yok); görüntü dalları için küçük, kanonik alanlı varyantlar eklenir.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoxyVedicGunMilan, projectRoxyVedicManglik, projectRoxyVedicSadeSati } from "@/lib/astrology/providers/roxy/vedicMatch";
import { combineGunMilan } from "@/lib/astrology/engine/vedicMatchTechniques";
import { projectRoxyVedicDashakoot, projectRoxyVedicPapasamyam } from "@/lib/astrology/providers/roxy/vedicPorutham";
import { applyClassicalRasi } from "@/lib/astrology/engine/dashakootRasi";
import { attachUpagrahaD1 } from "@/lib/astrology/engine/vedicNoktaTechniques";
import { projectRoxyVedicHeliacal, projectRoxyVedicUpagraha } from "@/lib/astrology/providers/roxy/vedicNoktalar";
import { projectRoxyVedicD1 } from "@/lib/astrology/providers/roxy/vedic";
import type { VedicGunMilanInterpretation, VedicGunMilanTechnical, VedicSadeSatiInterpretation, VedicSadeSatiTechnical } from "@/lib/astrology/model/vedicMatch";
import type { VedicDashakootInterpretation, VedicDashakootTechnical, VedicPapasamyamInterpretation, VedicPapasamyamTechnical } from "@/lib/astrology/model/vedicPorutham";
import type { VedicHeliacalTechnical, VedicUpagrahaTechnical } from "@/lib/astrology/model/vedicNoktalar";

export type KbEntry = { topicKey: string; topicLabel: string; title: string; body: string };
const KB_FULL = (keys: string[]): KbEntry[] => keys.slice(0, 2).map((k, i) => ({ topicKey: k, topicLabel: `Konu ${i + 1}`, title: `Başlık ${k}`, body: `Gövde ${i + 1}\nikinci satır` }));
const KB_EMPTY = (): KbEntry[] => [];

/** Danışan adları (kullanıcı verisi; Türkçe harfli — EN denetiminde çıkarılır). */
export const NAMES: [string, string] = ["Ayşe Çınar", "Mehmet Öz"];

export type MatchCase =
  | { name: string; kind: "gun"; t: VedicGunMilanTechnical }
  | { name: string; kind: "sade"; t: VedicSadeSatiTechnical; kb: ((keys: string[]) => KbEntry[]) | null }
  | { name: string; kind: "dasha"; t: VedicDashakootTechnical }
  | { name: string; kind: "papa"; t: VedicPapasamyamTechnical }
  | { name: string; kind: "upa"; t: VedicUpagrahaTechnical; kb: ((keys: string[]) => KbEntry[]) | null }
  | { name: string; kind: "heli"; t: VedicHeliacalTechnical; kb: ((keys: string[]) => KbEntry[]) | null }
  | { name: string; kind: "gunInterp"; c: VedicGunMilanInterpretation }
  | { name: string; kind: "sadeInterp"; c: VedicSadeSatiInterpretation }
  | { name: string; kind: "dashaInterp"; c: VedicDashakootInterpretation }
  | { name: string; kind: "papaInterp"; c: VedicPapasamyamInterpretation };

function ok<T>(r: { ok: boolean; technical?: T; errors?: string[] }, name: string): T {
  if (!r.ok || !r.technical) throw new Error(`${name}: projeksiyon başarısız ${JSON.stringify(r.errors)}`);
  return r.technical;
}

export function matchCases(fixDir: string): MatchCase[] {
  const gp = (n: string) => join(fixDir, "golden", `${n}.json`);
  const g = (n: string) => JSON.parse(readFileSync(gp(n), "utf8")) as { body: Record<string, unknown>; response: unknown };
  const out: MatchCase[] = [];
  const moons = { person1: { rashi: "pisces", nakshatra: "revati", pada: 4 }, person2: { rashi: "leo", nakshatra: "magha", pada: 2 } };

  // ── Gun Milan ──
  const gmA = g("vedic-gun-milan").response;
  const gm = combineGunMilan([ok(projectRoxyVedicGunMilan(structuredClone(gmA), { ayanamsa: "lahiri" }), "gm"), ok(projectRoxyVedicManglik(structuredClone(g("vedic-manglik-a").response), { ayanamsa: "lahiri" }), "ma"), ok(projectRoxyVedicManglik(structuredClone(g("vedic-manglik-b").response), { ayanamsa: "lahiri" }), "mb")] as never) as VedicGunMilanTechnical;
  out.push({ name: "gun-milan", kind: "gun", t: gm });
  out.push({ name: "gun-milan-moons", kind: "gun", t: { ...gm, moons } as never });
  const gmSw = combineGunMilan([ok(projectRoxyVedicGunMilan(structuredClone(g("vedic-gun-milan-swap").response), { ayanamsa: "lahiri" }), "gms"), ok(projectRoxyVedicManglik(structuredClone(g("vedic-manglik-b").response), { ayanamsa: "lahiri" }), "mb"), ok(projectRoxyVedicManglik(structuredClone(g("vedic-manglik-a").response), { ayanamsa: "lahiri" }), "ma")] as never) as VedicGunMilanTechnical;
  out.push({ name: "gun-milan-swap", kind: "gun", t: { ...gmSw, order: "partner_first" } as never });
  // Görüntü dalları: dosha yok / yalnız iptal / Manglik yok + ondalıklı puan.
  out.push({ name: "gun-milan-variants", kind: "gun", t: { ...gm, total: 21.5, percentage: 59.72, doshas: [], cancellations: gm.cancellations.length ? gm.cancellations : [{ dosha: "nadi", reason: "aynı nakshatra farklı pada" }], manglik: null } as never });
  out.push({ name: "gun-milan-nodosha", kind: "gun", t: { ...gm, doshas: [], cancellations: [] } as never });
  out.push({ name: "gun-milan-dosha", kind: "gun", t: { ...gm, doshas: ["nadi", "bhakoot"] } as never });

  // ── Sade Sati ──
  const ss = ok(projectRoxyVedicSadeSati(structuredClone(g("vedic-sadhesati").response), { ayanamsa: "lahiri", asOf: "2026-10-22" }), "ss") as VedicSadeSatiTechnical;
  out.push({ name: "sade-sati", kind: "sade", t: ss, kb: null });
  const janma = { rashi: "pisces", nakshatra: "revati", pada: 4 };
  out.push({ name: "sade-sati-janma-kb", kind: "sade", t: { ...ss, janma, present: true, phase: ss.phase ?? "peak", severity: ss.severity ?? "severe" } as never, kb: KB_FULL });
  out.push({ name: "sade-sati-janma-kbempty", kind: "sade", t: { ...ss, janma, present: true, phase: "rising" } as never, kb: KB_EMPTY });
  out.push({ name: "sade-sati-janma-kbnull", kind: "sade", t: { ...ss, janma, present: true, phase: "setting" } as never, kb: null });
  out.push({ name: "sade-sati-inactive", kind: "sade", t: { ...ss, janma, present: false, phase: null, severity: null } as never, kb: KB_FULL });

  // ── Dashakoot ──
  const dk = ok(projectRoxyVedicDashakoot(structuredClone(g("vedic-dashakoot").response), { ayanamsa: "lahiri" }), "dk") as VedicDashakootTechnical;
  out.push({ name: "dashakoot", kind: "dasha", t: dk });
  out.push({ name: "dashakoot-moons", kind: "dasha", t: { ...dk, moons } as never });
  const dkSw = ok(projectRoxyVedicDashakoot(structuredClone(g("vedic-dashakoot-swap").response), { ayanamsa: "lahiri" }), "dks") as VedicDashakootTechnical;
  out.push({ name: "dashakoot-swap", kind: "dasha", t: { ...dkSw, order: "partner_first" } as never });
  const applied = applyClassicalRasi({ ok: true, technical: structuredClone(dk), interpretation: null, unmappedFields: [], droppedValues: [] } as never) as { technical?: VedicDashakootTechnical };
  if (applied?.technical) out.push({ name: "dashakoot-rasi-classic", kind: "dasha", t: applied.technical });
  out.push({ name: "dashakoot-uncertain", kind: "dasha", t: { ...dk, total: null, totalRange: [4, 5], rajju: { ...dk.rajju, active: !dk.rajju.active }, vedha: { ...dk.vedha, active: !dk.vedha.active } } as never });
  out.push({ name: "dashakoot-noconstraint", kind: "dasha", t: { ...dk, rajju: { ...dk.rajju, active: false }, vedha: { ...dk.vedha, active: false } } as never });

  // ── Papasamyam ──
  const ps = ok(projectRoxyVedicPapasamyam(structuredClone(g("vedic-papasamyam").response), { ayanamsa: "lahiri" }), "ps") as VedicPapasamyamTechnical;
  out.push({ name: "papasamyam", kind: "papa", t: ps });
  const psSw = ok(projectRoxyVedicPapasamyam(structuredClone(g("vedic-papasamyam-swap").response), { ayanamsa: "lahiri" }), "pss") as VedicPapasamyamTechnical;
  out.push({ name: "papasamyam-swap", kind: "papa", t: { ...psSw, order: "partner_first" } as never });
  out.push({ name: "papasamyam-flip", kind: "papa", t: { ...ps, comparison: ps.comparison === "within" ? "exceeds" : "within", difference: -1.75 } as never });

  // ── Upagraha ──
  const upRaw = g("vedic-upagraha");
  const up = ok(projectRoxyVedicUpagraha(structuredClone(upRaw.response), { ayanamsa: "lahiri" }), "up") as VedicUpagrahaTechnical;
  out.push({ name: "upagraha", kind: "upa", t: up, kb: null });
  const d1 = ok(projectRoxyVedicD1(structuredClone(g("vedic-d1").response), { ayanamsa: "lahiri" }), "d1");
  const upD1 = attachUpagrahaD1(up, d1, "lahiri") as VedicUpagrahaTechnical;
  out.push({ name: "upagraha-d1-kb", kind: "upa", t: upD1, kb: KB_FULL });
  if (upD1.d1) out.push({ name: "upagraha-d1-sunwarn", kind: "upa", t: { ...upD1, d1: { ...upD1.d1, sunConsistent: false } } as never, kb: KB_EMPTY });
  const dayOf = (b: Record<string, unknown>) => ({ date: String(b.date), offsetHours: Number(b.timezone), latitude: Number(b.latitude) });
  for (const n of ["vedic-upagraha-a-monday", "vedic-upagraha-a-night", "vedic-upagraha-kutup-tromso"]) {
    if (!existsSync(gp(n))) continue;
    const f = g(n);
    const r = projectRoxyVedicUpagraha(structuredClone(f.response), { ayanamsa: "lahiri", day: dayOf(f.body) });
    if (r.ok && r.technical) out.push({ name: n.replace("vedic-", ""), kind: "upa", t: r.technical, kb: KB_EMPTY });
  }

  // ── Heliakal ──
  const HE_OPTS = { date: "1990-07-15", latitude: 41.0082, longitude: 28.9784, utcOffsetHours: 3, label: "İstanbul, Türkiye", timeZone: "Europe/Istanbul" };
  const he = ok(projectRoxyVedicHeliacal(structuredClone(g("vedic-heliacal").response), HE_OPTS as never), "he") as VedicHeliacalTechnical;
  out.push({ name: "heliacal", kind: "heli", t: he, kb: null });
  out.push({ name: "heliacal-kb", kind: "heli", t: { ...he, omitted: ["saturn"], grahas: he.grahas.map((x, i) => (i === 0 ? { ...x, retrograde: true, lastEvent: null } : x)) } as never, kb: KB_FULL });
  out.push({ name: "heliacal-kbempty", kind: "heli", t: { ...he, grahas: he.grahas.map((x) => ({ ...x, visible: true })) } as never, kb: KB_EMPTY });

  // ── Yorum çerçeveleri (sağlayıcı metni sentetik ASCII) ──
  out.push({ name: "gun-interp", kind: "gunInterp", c: { schema: "x", recommendation: "provider sentence", thresholdMet: true } as never });
  out.push({ name: "gun-interp-below", kind: "gunInterp", c: { schema: "x", recommendation: null, thresholdMet: false } as never });
  out.push({ name: "sade-interp", kind: "sadeInterp", c: { schema: "x", description: "d", general: "g", phaseEffect: "p", remedies: ["r1", "r2"] } as never });
  out.push({ name: "dasha-interp", kind: "dashaInterp", c: { schema: "x", verdict: "recommended", verdictWithheld: "rasi_local", recommendation: "rec", rajjuReason: "r", vedhaReason: "v", notes: [{ id: "dina", note: "n" }] } as never });
  out.push({ name: "papa-interp", kind: "papaInterp", c: { schema: "x", verdict: "balanced", recommendation: "rec" } as never });
  return out;
}
