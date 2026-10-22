// Atlas Roxy kalan teknikler (2026-10-22 gece) — sağlayıcı adaptörleri (SAF): Güney Hint On Porutham
// (/vedic-astrology/compatibility/dashakoot) ve Papasamyam (/vedic-astrology/compatibility/papasamyam).
//
// Yalnız beyaz liste projeksiyon + İÇ tutarlılık denetimi (fail-closed). İkinci bir hesap motoru YOKTUR:
//   Dashakoot: 10 kriter Tamil sırasında, her biri 0/1 puan ve azami 1, verdict ⇔ puan; toplam = puan toplamı; maxTotal 10;
//     Rasi ve Vasya sınıflaması = iki Ay burcu (aynı), Rasyadhipati = bu burçların klasik yöneticileri; Dina / Mahendra /
//     Stree Deergha / Vedha sınıflaması = aynı iki Ay nakshatrası; Rajju satırı ⇔ uzuvlar farklı ⇔ üst düzey rajju.active
//     değil; Vedha satırı ⇔ vedha.active değil; sağlayıcı hükmü "rejected" ⇔ (Rajju ya da Vedha etkin) — hüküm yalnız
//     tutarlılık için okunur, teknik katmana yazılmaz.
//   Papasamyam: kişi başına üç referans (Lagna, Ay, Venüs) bu sırada, belgelenmiş ağırlıklar (1 / 0,5 / 0,25), malefik ∈
//     {Mars, Satürn, Güneş, Rahu}, ev ∈ {1,2,4,7,8,12}, referans içinde tekrar yok; toplam = Σ katkı × ağırlık;
//     "balanced" ⇔ 2. rol toplamı ≤ 1. rol toplamı.
// Sağlayıcının hüküm / öneri / açıklama cümleleri teknik katmana GİRMEZ; ayrı yorum katmanındadır (yetki kapısı).
// Bilinmeyen alan → yolu raporlanır (*_KNOWN); değer asla loglanmaz.

import { SIGN_LORDS } from "../../model/kp";
import { NAKSHATRAS, type VedicAyanamsaId } from "../../model/vedic";
import { SIGN_IDS } from "../../model/western";
import { SIGN_LABELS } from "../../labels/tr";
import { GRAHA_LABELS, NAKSHATRA_LABELS } from "../../topics/vedic";
import { KOOTA_CLASS_LABELS } from "../../model/vedicMatch";
import {
  countFrom,
  DASHAKOOT_VERDICTS,
  nakshatraIdOf,
  PAPA_GRAHAS,
  PAPA_HOUSES,
  PAPA_REFERENCE_PROVIDER,
  PAPA_REFERENCES,
  PAPA_WEIGHTS,
  PORUTHAM_CLASS_KIND,
  PORUTHAM_IDS,
  PORUTHAM_PROVIDER_NAMES,
  RAJJU_IDS,
  RAJJU_LABELS,
  VEDIC_DASHAKOOT_INTERP_SCHEMA,
  VEDIC_DASHAKOOT_TECHNICAL_SCHEMA,
  VEDIC_PAPASAMYAM_INTERP_SCHEMA,
  VEDIC_PAPASAMYAM_TECHNICAL_SCHEMA,
  type DashakootVerdict,
  type PapaGraha,
  type PapaPerson,
  type PapaReferenceRow,
  type PoruthamClass,
  type PoruthamId,
  type PoruthamRow,
  type RajjuId,
  type VedicDashakootInterpretation,
  type VedicDashakootTechnical,
  type VedicPapasamyamInterpretation,
  type VedicPapasamyamTechnical,
} from "../../model/vedicPorutham";
import { arr, findUnmapped, int, num, obj, paths, text } from "./shared";
import { mapGraha, mapRashi } from "./vedic";
import type { AdapterResult } from "./timing";

export const ROXY_VEDIC_DASHAKOOT = { endpoint: "/vedic-astrology/compatibility/dashakoot", adapter: "astro-roxy-vedic-dashakoot-1", projection: "vedic-dashakoot-proj-1" } as const;
export const ROXY_VEDIC_PAPASAMYAM = { endpoint: "/vedic-astrology/compatibility/papasamyam", adapter: "astro-roxy-vedic-papasamyam-1", projection: "vedic-papasamyam-proj-1" } as const;

const done = <T, I>(errors: string[], dropped: string[], technical: () => T, interpretation: () => I | null, raw: unknown, known: Set<string>): AdapterResult<T, I> => {
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return { ok: true, technical: technical(), interpretation: interpretation(), unmappedFields: findUnmapped(raw, known, new Set()), droppedValues: [...new Set(dropped)] };
};
const FRAME_KNOWN = paths("frame", ["ayanamsa", "ayanamsaDegrees"]);
function frameOf(r: Record<string, unknown>, ayanamsa: VedicAyanamsaId, errors: string[]): number | null {
  const f = obj(r.frame);
  const d = num(f?.ayanamsaDegrees, 0, 40);
  if (f?.ayanamsa !== ayanamsa || d === null) errors.push("frame: istenen ayanamsa değil");
  return d;
}
/** Sınıflama metni: yalnız harf/boşluk/tire (≤ 40); boş/uygunsuz → null. */
function classText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.normalize("NFC").trim();
  return t.length > 0 && t.length <= 40 && /^[\p{L} .'-]+$/u.test(t) ? t : null;
}
const compactKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const GANAS = ["deva", "manushya", "rakshasa"];

// ═══ Dashakoot ════════════════════════════════════════════════════════════════
const DASHAKOOT_KNOWN = new Set<string>([
  ...FRAME_KNOWN,
  "total",
  "maxTotal",
  "verdict",
  "recommendation",
  ...paths("rajju", ["active", "reason"]),
  ...paths("vedha", ["active", "reason"]),
  "breakdown",
  ...paths("breakdown[]", ["name", "points", "maxPoints", "verdict", "person1", "person2", "note"]),
]);

export function projectRoxyVedicDashakoot(raw: unknown, opts: { ayanamsa: VedicAyanamsaId }): AdapterResult<VedicDashakootTechnical, VedicDashakootInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const ayDeg = frameOf(r, opts.ayanamsa, errors);
  const total = int(r.total, 0, 10);
  if (total === null) errors.push("total");
  if (r.maxTotal !== 10) errors.push("maxTotal 10 değil");
  const verdict = typeof r.verdict === "string" && (DASHAKOOT_VERDICTS as readonly string[]).includes(r.verdict) ? (r.verdict as DashakootVerdict) : null;
  if (!verdict) errors.push("verdict");
  if (typeof r.recommendation !== "string") errors.push("recommendation");
  const rj = obj(r.rajju);
  const vd = obj(r.vedha);
  const rjActive = rj && typeof rj.active === "boolean" ? rj.active : null;
  const vdActive = vd && typeof vd.active === "boolean" ? vd.active : null;
  if (rjActive === null || typeof rj?.reason !== "string") errors.push("rajju");
  if (vdActive === null || typeof vd?.reason !== "string") errors.push("vedha");
  const list = arr(r.breakdown);
  if (!list || list.length !== PORUTHAM_IDS.length) errors.push("breakdown: 10 porutham değil");
  const rows: PoruthamRow[] = [];
  const notes: { id: PoruthamId; note: string }[] = [];
  for (const [i, id] of PORUTHAM_IDS.entries()) {
    const o = obj(list?.[i]);
    if (!o) continue;
    if (o.name !== PORUTHAM_PROVIDER_NAMES[id]) {
      errors.push(`breakdown[${i}]: sıra / ad (${id})`);
      continue;
    }
    if (o.maxPoints !== 1) errors.push(`${id}: azami puan 1 değil`);
    const pts = (o.points === 0 || o.points === 1 ? o.points : null) as 0 | 1 | null;
    if (pts === null) {
      errors.push(`${id}: puan`);
      continue;
    }
    if (o.verdict !== "matched" && o.verdict !== "unmatched") errors.push(`${id}: sonuç`);
    else if ((o.verdict === "matched") !== (pts === 1)) errors.push(`${id}: sonuç puanla tutarsız`);
    const kind = PORUTHAM_CLASS_KIND[id];
    const cls = (v: unknown, who: string): PoruthamClass | null => {
      const t = classText(v);
      if (!t) {
        errors.push(`${id}.${who}: sınıflama`);
        return null;
      }
      switch (kind) {
        case "rashi": {
          const s = mapRashi(t);
          if (!s) errors.push(`${id}.${who}: burç değil`);
          return { raw: t, label: s ? SIGN_LABELS[s] : t };
        }
        case "graha": {
          const g = mapGraha(t);
          if (!g) errors.push(`${id}.${who}: graha değil`);
          return { raw: t, label: g ? (GRAHA_LABELS[g] ?? t) : t };
        }
        case "rajju": {
          const k = compactKey(t);
          if (!(RAJJU_IDS as readonly string[]).includes(k)) errors.push(`${id}.${who}: Rajju uzvu değil`);
          return { raw: t, label: RAJJU_LABELS[k as RajjuId] ?? t };
        }
        case "gana": {
          if (!GANAS.includes(compactKey(t))) errors.push(`${id}.${who}: gana değil`);
          return { raw: t, label: KOOTA_CLASS_LABELS[compactKey(t)] ?? t };
        }
        case "nakshatra": {
          const n = nakshatraIdOf(t, NAKSHATRAS);
          if (!n) dropped.push(`breakdown.${id}.${who}`);
          return { raw: t, label: n ? NAKSHATRA_LABELS[n] : t };
        }
        case "yoni": {
          const known = KOOTA_CLASS_LABELS[compactKey(t)];
          if (!known) dropped.push(`breakdown.${id}.${who}`);
          return { raw: t, label: known ?? t };
        }
      }
    };
    const p1 = cls(o.person1, "person1");
    const p2 = cls(o.person2, "person2");
    const note = text(o.note);
    if (!note || note.length > 600) errors.push(`${id}: açıklama`);
    else notes.push({ id, note });
    if (!p1 || !p2) continue;
    rows.push({ id, matched: pts === 1, points: pts, person1: p1, person2: p2 });
  }
  let rajjuT: VedicDashakootTechnical["rajju"] | null = null;
  let vedhaT: VedicDashakootTechnical["vedha"] | null = null;
  if (rows.length === PORUTHAM_IDS.length) {
    const row = (k: PoruthamId) => rows.find((x) => x.id === k)!;
    if (total !== null && rows.reduce((a, x) => a + x.points, 0) !== total) errors.push("total porutham toplamı değil");
    // Aynı Ay nakshatrası / burcu tüm ilgili satırlarda.
    const same = (ids: PoruthamId[], what: string) => {
      const a = ids.map((k) => row(k));
      if (a.some((x) => x.person1.raw !== a[0].person1.raw || x.person2.raw !== a[0].person2.raw)) errors.push(`${what}: satırlar arası sınıflama tutarsız`);
    };
    same(["dina", "mahendra", "stree_deergha", "vedha"], "nakshatra");
    same(["rasi", "vasya"], "burç");
    const s1 = mapRashi(row("rasi").person1.raw);
    const s2 = mapRashi(row("rasi").person2.raw);
    if (s1 && s2 && (SIGN_LORDS[s1] !== mapGraha(row("rasyadhipati").person1.raw) || SIGN_LORDS[s2] !== mapGraha(row("rasyadhipati").person2.raw))) errors.push("rasyadhipati: Ay burcu yöneticisi değil");
    // Rajju: satır sonucu ⇔ uzuvlar farklı ⇔ üst düzey kısıt etkin değil.
    const rr = row("rajju");
    const l1 = compactKey(rr.person1.raw) as RajjuId;
    const l2 = compactKey(rr.person2.raw) as RajjuId;
    if (rr.matched !== (l1 !== l2)) errors.push("rajju: sonuç uzuvlarla tutarsız");
    if (rjActive !== null && rjActive === rr.matched) errors.push("rajju: üst düzey kısıt satırla tutarsız");
    const vr = row("vedha");
    if (vdActive !== null && vdActive === vr.matched) errors.push("vedha: üst düzey kısıt satırla tutarsız");
    if (verdict && rjActive !== null && vdActive !== null && (verdict === "rejected") !== (rjActive || vdActive)) errors.push("verdict: kısıtlarla tutarsız");
    rajjuT = { active: !rr.matched, person1: l1, person2: l2 };
    vedhaT = { active: !vr.matched, person1: vr.person1.raw, person2: vr.person2.raw };
    // Türetilmiş sayım (gelin = 2. rol → damat = 1. rol); iki sınıflama da tanınırsa.
    const n1 = nakshatraIdOf(row("dina").person1.raw, NAKSHATRAS);
    const n2 = nakshatraIdOf(row("dina").person2.raw, NAKSHATRAS);
    for (const x of rows) {
      if (n1 && n2 && (x.id === "dina" || x.id === "mahendra" || x.id === "stree_deergha")) x.count = countFrom(NAKSHATRAS.indexOf(n2), NAKSHATRAS.indexOf(n1), 27);
      if (s1 && s2 && x.id === "rasi") x.count = countFrom(SIGN_IDS.indexOf(s2), SIGN_IDS.indexOf(s1), 12);
    }
  }
  return done(
    errors,
    dropped,
    () => ({ schema: VEDIC_DASHAKOOT_TECHNICAL_SCHEMA, zodiac: "sidereal", frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! }, total: total!, maxTotal: 10, rows, rajju: rajjuT!, vedha: vedhaT! }),
    () => ({ schema: VEDIC_DASHAKOOT_INTERP_SCHEMA, verdict, recommendation: text(r.recommendation), rajjuReason: text(rj?.reason), vedhaReason: text(vd?.reason), notes }),
    raw,
    DASHAKOOT_KNOWN,
  );
}

// ═══ Papasamyam ═══════════════════════════════════════════════════════════════
const PAPA_PERSON_KNOWN = (p: string) => [p, `${p}.total`, `${p}.byReference`, ...paths(`${p}.byReference[]`, ["reference", "weight", "afflictions"]), ...paths(`${p}.byReference[].afflictions[]`, ["graha", "house"])];
const PAPASAMYAM_KNOWN = new Set<string>([...FRAME_KNOWN, ...PAPA_PERSON_KNOWN("person1"), ...PAPA_PERSON_KNOWN("person2"), "verdict", "recommendation"]);
const q = (n: number) => Math.round(n * 10000) / 10000;

function papaPerson(v: unknown, who: string, errors: string[]): PapaPerson | null {
  const p = obj(v);
  if (!p) {
    errors.push(`${who}: nesne`);
    return null;
  }
  const total = num(p.total, 0, 7);
  if (total === null) errors.push(`${who}.total`);
  const refs = arr(p.byReference);
  if (!refs || refs.length !== PAPA_REFERENCES.length) {
    errors.push(`${who}.byReference: 3 referans değil`);
    return null;
  }
  const out: PapaReferenceRow[] = [];
  for (const [i, ref] of PAPA_REFERENCES.entries()) {
    const o = obj(refs[i]);
    if (!o || o.reference !== PAPA_REFERENCE_PROVIDER[ref]) {
      errors.push(`${who}.byReference[${i}]: sıra / referans (${ref})`);
      continue;
    }
    if (o.weight !== PAPA_WEIGHTS[ref]) errors.push(`${who}.${ref}: ağırlık belgelenen değer değil`);
    const aff = arr(o.afflictions);
    if (!aff) {
      errors.push(`${who}.${ref}: afflictions`);
      continue;
    }
    const rows: { graha: PapaGraha; house: number }[] = [];
    for (const a of aff) {
      const x = obj(a);
      const gr = x ? x.graha : undefined;
      const g = typeof gr === "string" ? (gr.toLowerCase() as PapaGraha) : null;
      const h = int(x ? x.house : undefined, 1, 12);
      if (!g || !(PAPA_GRAHAS as readonly string[]).includes(g)) {
        errors.push(`${who}.${ref}: malefik değil`);
        continue;
      }
      if (h === null || !(PAPA_HOUSES as readonly number[]).includes(h)) {
        errors.push(`${who}.${ref}: etki evi değil`);
        continue;
      }
      if (rows.some((y) => y.graha === g)) errors.push(`${who}.${ref}: tekrarlanan malefik`);
      rows.push({ graha: g, house: h });
    }
    out.push({ reference: ref, weight: PAPA_WEIGHTS[ref], afflictions: rows, points: q(rows.length * PAPA_WEIGHTS[ref]) });
  }
  if (out.length === PAPA_REFERENCES.length && total !== null && Math.abs(out.reduce((s, x) => s + x.points, 0) - total) > 1e-9) errors.push(`${who}.total katkı toplamı değil`);
  return total === null ? null : { total, byReference: out };
}

export function projectRoxyVedicPapasamyam(raw: unknown, opts: { ayanamsa: VedicAyanamsaId }): AdapterResult<VedicPapasamyamTechnical, VedicPapasamyamInterpretation> {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const ayDeg = frameOf(r, opts.ayanamsa, errors);
  const p1 = papaPerson(r.person1, "person1", errors);
  const p2 = papaPerson(r.person2, "person2", errors);
  const verdict = r.verdict === "balanced" || r.verdict === "unbalanced" ? r.verdict : null;
  if (!verdict) errors.push("verdict");
  if (typeof r.recommendation !== "string") errors.push("recommendation");
  const within = p1 && p2 ? p2.total <= p1.total : null;
  if (verdict && within !== null && (verdict === "balanced") !== within) errors.push("verdict: karşılaştırma kuralıyla tutarsız");
  return done(
    errors,
    [],
    () => ({ schema: VEDIC_PAPASAMYAM_TECHNICAL_SCHEMA, zodiac: "sidereal", frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! }, person1: p1!, person2: p2!, comparison: within ? "within" : "exceeds", difference: q(p1!.total - p2!.total) }),
    () => ({ schema: VEDIC_PAPASAMYAM_INTERP_SCHEMA, verdict, recommendation: text(r.recommendation) }),
    raw,
    PAPASAMYAM_KNOWN,
  );
}
