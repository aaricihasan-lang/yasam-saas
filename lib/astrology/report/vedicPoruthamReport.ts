// 2026-10-22 gece — Word/PDF rapor bölümleri (SAF): Güney Hint On Porutham (Dashakoot) ve Papasamyam. Yalnız KAYITLI teknik veri
// (yeni hesap YOK). Gun Milan bölümünden AYRI başlıklar; puanlar birleştirilmez. Teknik bölümde hüküm / öneri metni YOKTUR;
// sağlayıcının değerlendirme cümleleri yalnız görünür yorum katmanında ("Otomatik Yorum") basılır. Ekrandaki yöntem / rol /
// kısıt metinleriyle AYNI dizgeler kullanılır.

import { GRAHA_LABELS } from "../topics/vedic";
import { AYANAMSA_SHORT } from "../model/vedicMatch";
import {
  DASHAKOOT_DIRECTION_TEXT,
  DASHAKOOT_METHOD_TEXT,
  DASHAKOOT_VERDICT_LABELS,
  PAPA_REFERENCE_LABELS,
  PAPA_REFERENCES,
  PAPASAMYAM_METHOD_TEXT,
  PAPASAMYAM_VERDICT_LABELS,
  PORUTHAM_BASIS,
  PORUTHAM_COUNT_NOTE,
  PORUTHAM_IDS,
  PORUTHAM_LABELS,
  PORUTHAM_ROLE_LABELS,
  poruthamRoleNames,
  RAJJU_IDS,
  rajjuReasonText,
  vedhaReasonText,
  type DashakootVerdict,
  type PapaReference,
  type PoruthamId,
  type RajjuId,
} from "../model/vedicPorutham";
import type { ReportBuilderLike } from "./vedicMatchReport";
import { DASHAKOOT_RASI_BADGE, DASHAKOOT_RASI_NOTICE_TITLE, dashakootRasiNotice, dashakootRasiNoticeTexts } from "../model/dashakootRasiNotice";

type O = Record<string, unknown>;
const DASH = "—";
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v);
const arr = <T = O>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const trNum = (v: unknown) => {
  const n = num(v);
  return n === null ? DASH : Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ",");
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : DASH);
const ayL = (f: unknown) => (isObj(f) && typeof f.ayanamsa === "string" ? `${AYANAMSA_SHORT[f.ayanamsa as keyof typeof AYANAMSA_SHORT] ?? f.ayanamsa}${num(f.ayanamsaDegrees) !== null ? ` (${(f.ayanamsaDegrees as number).toFixed(4).replace(".", ",")}°)` : ""}` : DASH);
const rajjuOf = (v: unknown): RajjuId | null => (typeof v === "string" && (RAJJU_IDS as readonly string[]).includes(v) ? (v as RajjuId) : null);

export function dashakootReport(b: ReportBuilderLike, t: O, who: { a: string; b: string }) {
  const [r1, r2] = poruthamRoleNames(t, [who.a, who.b]);
  b.h(2, "On Porutham (Dashakoot) — teknik değerlendirme");
  const rj = isObj(t.rajju) ? t.rajju : {};
  const vd = isObj(t.vedha) ? t.vedha : {};
  const rjOk = typeof rj.active === "boolean" && rajjuOf(rj.person1) && rajjuOf(rj.person2);
  b.kv([
    ["Karşılanan kriter", `${trNum(t.total)} / 10`],
    [PORUTHAM_ROLE_LABELS.person1, r1],
    [PORUTHAM_ROLE_LABELS.person2, r2],
    ["Rajju kısıtı", rj.active === true ? "etkin" : rj.active === false ? "etkin değil" : DASH],
    ["Vedha kısıtı", vd.active === true ? "etkin" : vd.active === false ? "etkin değil" : DASH],
    ["Ayanamsa", ayL(t.frame)],
    ["Zodyak", "Sidereal (nirayana)"],
  ]);
  b.p(DASHAKOOT_DIRECTION_TEXT, "muted");
  if (rjOk) b.p(rajjuReasonText({ active: rj.active as boolean, person1: rj.person1 as RajjuId, person2: rj.person2 as RajjuId }));
  if (typeof vd.active === "boolean") b.p(vedhaReasonText({ active: vd.active }));
  const rows = arr(t.rows).filter((r) => (PORUTHAM_IDS as readonly string[]).includes(String(r.id)));
  // Rasi tutarlılık uyarısı (ekranla aynı metin; yalnız kanıtlanmış çelişki koşulunda; puan / toplam değişmez).
  const rasiN = dashakootRasiNotice(t);
  const rasiTx = rasiN ? dashakootRasiNoticeTexts(rasiN) : null;
  b.table(
    ["Kriter", "Neye bakılır", `1. rol — ${r1}`, `2. rol — ${r2}`, "Sayım", "Sonuç"],
    rows.map((r) => [
      PORUTHAM_LABELS[r.id as PoruthamId],
      PORUTHAM_BASIS[r.id as PoruthamId],
      str(isObj(r.person1) ? r.person1.label : null),
      str(isObj(r.person2) ? r.person2.label : null),
      num(r.count) !== null ? String(r.count) : DASH,
      (r.matched === true ? "karşılandı · 1" : r.matched === false ? "karşılanmadı · 0" : DASH) + (r.id === "rasi" && rasiTx ? ` · ${DASHAKOOT_RASI_BADGE} (bkz. not)` : ""),
    ]),
    { widths: [2, 3, 1.8, 1.8, 0.8, 1.6], caption: "On porutham kriteri", empty: "Kriter tablosu bu kayıtta yok." },
  );
  b.p(PORUTHAM_COUNT_NOTE, "muted");
  if (rasiTx) {
    b.h(3, DASHAKOOT_RASI_NOTICE_TITLE);
    b.p(rasiTx.row, "warn");
    b.p(rasiTx.total, "warn");
    if (rasiTx.decision) b.p(rasiTx.decision, "warn");
  }
  b.p(DASHAKOOT_METHOD_TEXT, "muted");
}

export function papasamyamReport(b: ReportBuilderLike, t: O, who: { a: string; b: string }) {
  const [r1, r2] = poruthamRoleNames(t, [who.a, who.b]);
  b.h(2, "Papasamyam — teknik değerlendirme");
  const p1 = isObj(t.person1) ? t.person1 : {};
  const p2 = isObj(t.person2) ? t.person2 : {};
  b.kv([
    [`${PORUTHAM_ROLE_LABELS.person1} — ${r1}: papa toplamı`, trNum(p1.total)],
    [`${PORUTHAM_ROLE_LABELS.person2} — ${r2}: papa toplamı`, trNum(p2.total)],
    ["Karşılaştırma kuralı (2. rol toplamı ≤ 1. rol toplamı)", t.comparison === "within" ? "sağlanıyor" : t.comparison === "exceeds" ? "sağlanmıyor" : DASH],
    ["Fark (1. rol − 2. rol)", trNum(t.difference)],
    ["Ayanamsa", ayL(t.frame)],
    ["Zodyak", "Sidereal (nirayana)"],
  ]);
  for (const [label, p] of [
    [`1. rol — ${r1}`, p1],
    [`2. rol — ${r2}`, p2],
  ] as [string, O][]) {
    const refs = arr(p.byReference).filter((r) => (PAPA_REFERENCES as readonly string[]).includes(String(r.reference)));
    b.table(
      ["Referans", "Ağırlık", "Malefik — ev", "Katkı"],
      refs.map((r) => {
        const a = arr(r.afflictions);
        return [
          PAPA_REFERENCE_LABELS[r.reference as PapaReference],
          trNum(r.weight),
          a.length ? a.map((x) => `${GRAHA_LABELS[String(x.graha)] ?? str(x.graha)} — ${trNum(x.house)}. ev`).join("; ") : "katkı yok",
          `${a.length} × ${trNum(r.weight)} = ${trNum(r.points)}`,
        ];
      }),
      { widths: [2, 1, 4, 1.6], caption: `${label} (toplam ${trNum(p.total)})`, empty: "Referans tablosu bu kayıtta yok." },
    );
  }
  b.p(PAPASAMYAM_METHOD_TEXT, "muted");
}

/** Yorum katmanı (yalnız görünürse çağrılır). */
export function vedicPoruthamInterpBlocks(b: ReportBuilderLike, c: O): boolean {
  const warn = () =>
    b.p("Bu bölüm hesaplama servisinin otomatik değerlendirme cümleleridir ve hüküm dili içerebilir; kriter sonuçları ve kısıtlar teknik bölümdedir. Uzman değerlendirmesi değildir; evlilik kararı için tek başına kullanılmamalıdır.", "warn");
  if (c.schema === "astro.vedic.dashakoot.interp.v1") {
    warn();
    if (typeof c.verdict === "string" && c.verdict in DASHAKOOT_VERDICT_LABELS) {
      b.h(3, "Servisin genel değerlendirmesi");
      b.p(`${DASHAKOOT_VERDICT_LABELS[c.verdict as DashakootVerdict]} (eşik servis geleneğidir).`);
    }
    if (typeof c.recommendation === "string" && c.recommendation.trim()) {
      b.h(3, "Otomatik değerlendirme cümlesi");
      b.p(c.recommendation);
    }
    const reasons = [typeof c.rajjuReason === "string" ? `Rajju: ${c.rajjuReason}` : "", typeof c.vedhaReason === "string" ? `Vedha: ${c.vedhaReason}` : ""].filter(Boolean);
    if (reasons.length) {
      b.h(3, "Kısıt açıklamaları");
      b.bullets(reasons);
    }
    const notes = arr(c.notes).filter((n) => typeof n.note === "string" && (PORUTHAM_IDS as readonly string[]).includes(String(n.id)));
    if (notes.length) {
      b.h(3, "Kriter açıklamaları");
      b.bullets(notes.map((n) => `${PORUTHAM_LABELS[n.id as PoruthamId]}: ${String(n.note)}`));
    }
    return true;
  }
  if (c.schema === "astro.vedic.papasamyam.interp.v1") {
    warn();
    const v = c.verdict;
    if (v === "balanced" || v === "unbalanced") {
      b.h(3, "Servisin genel değerlendirmesi");
      b.p(PAPASAMYAM_VERDICT_LABELS[v]);
    }
    if (typeof c.recommendation === "string" && c.recommendation.trim()) {
      b.h(3, "Otomatik değerlendirme cümlesi");
      b.p(c.recommendation);
    }
    return true;
  }
  return false;
}
