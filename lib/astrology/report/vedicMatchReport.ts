// 2026-10-22 — Word/PDF rapor bölümleri (SAF): Vedik eşleştirme (Gun Milan + Manglik) ve Sade Sati. Yalnız KAYITLI teknik veri
// (yeni hesap YOK). Teknik bölümde hüküm / öneri metni YOKTUR; sağlayıcının değerlendirme cümlesi ve etki / çare metinleri yalnız
// görünür yorum katmanında ("Otomatik Yorum" bölümü) basılır. Ekrandaki yöntem / kapsam metinleriyle AYNI dizgeler kullanılır.

import { SIGN_IDS, type SignId } from "../model/western";
import { SIGN_LABELS } from "../labels/tr";
import { NAKSHATRA_LABELS } from "../topics/vedic";
import {
  AYANAMSA_SHORT,
  DOSHA_LABELS,
  KOOTA_BASIS,
  KOOTA_IDS,
  KOOTA_LABELS,
  MANGLIK_HOUSE_GROUP,
  MANGLIK_SEVERITY_LABELS,
  SADE_SATI_HOUSE_FROM_MOON,
  SADE_SATI_PHASES,
  SADE_SATI_PHASE_LABELS,
  saturnSignOf,
  GUN_MILAN_DIRECTION_TEXT,
  GUN_MILAN_METHOD_TEXT,
  MANGLIK_METHOD_TEXT,
  SADE_SATI_METHOD_TEXT,
  SADE_SATI_SCOPE_TEXT,
  type GunMilanDoshaId,
  type KootaId,
  type ManglikSeverity,
  type SadeSatiPhase,
} from "../model/vedicMatch";

type O = Record<string, unknown>;
export type ReportBuilderLike = {
  h(level: 1 | 2 | 3, text: string): void;
  p(text: string, tone?: "muted" | "warn"): void;
  kv(rows: [string, string][]): void;
  table(columns: string[], rows: string[][], opts?: { widths?: number[]; caption?: string; compact?: boolean; empty?: string }): void;
  bullets(items: string[]): void;
};
const DASH = "—";
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v);
const arr = <T = O>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const trNum = (v: unknown) => {
  const n = num(v);
  return n === null ? DASH : Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : DASH);
const signL = (v: unknown) => (typeof v === "string" && v in SIGN_LABELS ? SIGN_LABELS[v as SignId] : DASH);
const dayTr = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}` : DASH);
const ayL = (f: unknown) => (isObj(f) && typeof f.ayanamsa === "string" ? `${AYANAMSA_SHORT[f.ayanamsa as keyof typeof AYANAMSA_SHORT] ?? f.ayanamsa}${num(f.ayanamsaDegrees) !== null ? ` (${(f.ayanamsaDegrees as number).toFixed(4).replace(".", ",")}°)` : ""}` : DASH);
const moonL = (m: unknown) => (isObj(m) && typeof m.rashi === "string" ? `${signL(m.rashi)} · ${NAKSHATRA_LABELS[String(m.nakshatra)] ?? str(m.nakshatra)} ${trNum(m.pada)}. pada` : DASH);
const sevL = (v: unknown) => (typeof v === "string" && v in MANGLIK_SEVERITY_LABELS ? MANGLIK_SEVERITY_LABELS[v as ManglikSeverity] : DASH);

export function gunMilanReport(b: ReportBuilderLike, t: O, people: { a: string; b: string }) {
  b.h(2, "Ashtakoot Gun Milan — teknik değerlendirme");
  b.kv([
    ["Toplam puan", `${trNum(t.total)} / 36 (%${trNum(t.percentage)})`],
    ["1. kişi", people.a],
    ["2. kişi", people.b],
    ["Ayanamsa", ayL(t.frame)],
    ["Zodyak", "Sidereal (nirayana)"],
  ]);
  b.p(GUN_MILAN_DIRECTION_TEXT, "muted");
  const moons = isObj(t.moons) ? t.moons : null;
  if (moons) b.kv([["1. kişinin Ay'ı (Vedik D1 kaydından)", moonL(moons.person1)], ["2. kişinin Ay'ı (Vedik D1 kaydından)", moonL(moons.person2)]]);
  const rows = arr(t.kootas).filter((k) => (KOOTA_IDS as readonly string[]).includes(String(k.id)));
  b.table(
    ["Koota", "Neye bakılır", "1. kişi", "2. kişi", "Puan"],
    rows.map((k) => [KOOTA_LABELS[k.id as KootaId], KOOTA_BASIS[k.id as KootaId], str(isObj(k.person1) ? k.person1.label : null), str(isObj(k.person2) ? k.person2.label : null), `${trNum(k.score)} / ${trNum(k.maxScore)}`]),
    { widths: [2, 3, 2, 2, 1.2], caption: "Sekiz koota puanı", empty: "Koota tablosu bu kayıtta yok." },
  );
  b.h(3, "Dosha analizi (Nadi / Bhakoot)");
  const doshas = arr<string>(t.doshas);
  const canc = arr(t.cancellations);
  if (!doshas.length && !canc.length) b.p("Nadi veya Bhakoot doshası tespit edilmedi.");
  if (doshas.length) b.p(`Etkin (iptal edilmemiş): ${doshas.map((d) => DOSHA_LABELS[d as GunMilanDoshaId] ?? d).join(", ")}`);
  if (!doshas.length && canc.length) b.p("Etkin dosha yok; tespit edilen dosha klasik kuralla iptal edilmiş.");
  for (const c of canc) b.p(`${DOSHA_LABELS[c.dosha as GunMilanDoshaId] ?? str(c.dosha)} — iptal. Klasik iptal gerekçesi: ${str(c.reason)}`);
  b.h(3, "Manglik (Kuja dosha) — iki kişi");
  const m = isObj(t.manglik) ? t.manglik : null;
  if (!m) b.p("Manglik bu kayıtta yok (kişilerden birinin Manglik hesabı tamamlanamadı).", "muted");
  else {
    b.table(
      ["Kişi", "Manglik durumu", "Mars ev grubu", "Geleneksel derece", "Azaltıcı / iptal etkenleri"],
      ([["1. kişi · " + people.a, m.person1], ["2. kişi · " + people.b, m.person2]] as [string, unknown][]).map(([who, x]) => {
        const p = isObj(x) ? x : {};
        const sev = typeof p.severity === "string" && p.severity in MANGLIK_HOUSE_GROUP ? (p.severity as ManglikSeverity) : null;
        return [who, p.present === true ? "var" : p.present === false ? "yok" : DASH, p.present === true && sev ? MANGLIK_HOUSE_GROUP[sev] : DASH, p.present === true ? sevL(p.severity) : DASH, arr<string>(p.exceptions).join("; ") || DASH];
      }),
      { widths: [2, 1.3, 1.6, 1.3, 3] },
    );
  }
  b.p(MANGLIK_METHOD_TEXT, "muted");
  b.p(GUN_MILAN_METHOD_TEXT, "muted");
}

export function sadeSatiReport(b: ReportBuilderLike, t: O) {
  b.h(2, `Sade Sati — değerlendirme günü ${dayTr(t.asOf)}`);
  const phase = typeof t.phase === "string" && (SADE_SATI_PHASES as readonly string[]).includes(t.phase) ? (t.phase as SadeSatiPhase) : null;
  const janma = isObj(t.janma) ? t.janma : null;
  b.kv([
    ["Durum", t.present === true ? "Sade Sati etkin" : t.present === false ? "Sade Sati etkin değil" : DASH],
    ["Evre", t.present === true && phase ? SADE_SATI_PHASE_LABELS[phase] : DASH],
    ["Geleneksel derece (evre sınıflaması)", t.present === true ? sevL(t.severity) : DASH],
    ["Janma Rashi (Vedik D1 kaydından)", janma ? moonL(janma) : DASH],
    ["Satürn'ün geçtiği burç (Janma Rashi'den sayılarak)", t.present === true && phase && janma && typeof janma.rashi === "string" ? signL(saturnSignOf(janma.rashi as SignId, phase, SIGN_IDS)) : DASH],
    ["Ayanamsa", ayL(t.frame)],
    ["Zodyak", "Sidereal (nirayana)"],
  ]);
  b.table(
    ["Evre", "Janma Rashi'den", "Burç", "Değerlendirme günü"],
    SADE_SATI_PHASES.map((ph) => [
      SADE_SATI_PHASE_LABELS[ph].split(" (")[0],
      `${SADE_SATI_HOUSE_FROM_MOON[ph]}. ev`,
      janma && typeof janma.rashi === "string" ? signL(saturnSignOf(janma.rashi as SignId, ph, SIGN_IDS)) : DASH,
      t.present === true && phase === ph ? "Satürn bu evrede" : "—",
    ]),
    { widths: [2, 1.5, 1.5, 2], caption: "Evre şeridi" },
  );
  b.p(SADE_SATI_METHOD_TEXT, "muted");
  b.p(SADE_SATI_SCOPE_TEXT, "muted");
}

/** Yorum katmanı (yalnız görünürse çağrılır). */
export function vedicMatchInterpBlocks(b: ReportBuilderLike, c: O): boolean {
  if (c.schema === "astro.vedic.gun_milan.interp.v1") {
    b.p("Bu bölüm hesaplama servisinin otomatik değerlendirme cümlesidir ve hüküm dili içerebilir; teknik puanlar ve dosha analizi teknik bölümdedir. Uzman değerlendirmesi değildir.", "warn");
    if (typeof c.recommendation === "string" && c.recommendation.trim()) {
      b.h(3, "Otomatik değerlendirme cümlesi");
      b.p(c.recommendation);
    }
    if (typeof c.thresholdMet === "boolean") {
      b.h(3, "Geleneksel 18 / 36 eşiği");
      b.p(c.thresholdMet ? "Toplam puan geleneksel eşiğin üzerinde." : "Toplam puan geleneksel eşiğin altında.");
    }
    return true;
  }
  if (c.schema === "astro.vedic.sade_sati.interp.v1") {
    const para = (label: string, v: unknown) => {
      if (typeof v === "string" && v.trim()) {
        b.h(3, label);
        b.p(v);
      }
    };
    para("Açıklama", c.description);
    para("Dönemin genel teması", c.general);
    para("Bu evrenin teması", c.phaseEffect);
    const r = arr<string>(c.remedies).filter((x) => typeof x === "string" && x.trim());
    if (r.length) {
      b.h(3, "Geleneksel uygulamalar (servis metni; öneri değildir)");
      b.bullets(r);
    }
    return true;
  }
  return false;
}
