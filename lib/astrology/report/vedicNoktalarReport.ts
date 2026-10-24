// 22.10.2026 — Word/PDF rapor bölümleri (SAF): Upagrahalar ve Graha Asta / Udaya. Yalnız KAYITLI teknik veri (yeni hesap YOK). İki uçta
// sağlayıcı yorumu yoktur (rapor "Otomatik yorum yok" notunu genel akıştan basar). Ekrandaki yöntem / kapsam metinleriyle AYNI dizgeler.

import { SIGN_LABELS, formatDegree } from "../labels/tr";
import { GRAHA_LABELS, NAKSHATRA_LABELS } from "../topics/vedic";
import type { SignId } from "../model/western";
import {
  GULIKA_PANCHANGA_NOTE,
  HELIACAL_EVENT_LABELS,
  HELIACAL_HORIZON_LABELS,
  HELIACAL_METHOD_NOTE,
  HELIACAL_SCOPE_NOTE,
  HELIACAL_VS_COMBUSTION_NOTE,
  UPAGRAHA_BASIS,
  UPAGRAHA_GROUP_LABELS,
  UPAGRAHA_HOUSE_NOTE,
  UPAGRAHA_IDS,
  UPAGRAHA_NAMES,
  UPAGRAHA_NOT_BODY_NOTE,
  UPAGRAHA_PARTIAL_LABEL,
  UPAGRAHA_PARTIAL_NOTE,
  UPAGRAHA_SCHOOL_NOTE,
  UPAGRAHA_SYSTEMS_NOTE,
  VEDIC_HELIACAL_TECHNICAL_SCHEMA,
  VEDIC_UPAGRAHA_TECHNICAL_SCHEMA,
  fmtDayTr,
  heliacalEventTimeText,
  heliacalPlaceText,
  type UpagrahaId,
  type VedicHeliacalEvent,
  type VedicHeliacalTechnical,
} from "../model/vedicNoktalar";
import type { ReportBuilderLike } from "./vedicMatchReport";

type O = Record<string, unknown>;
const DASH = "—";
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v);
const arr = <T = O>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const dec = (v: unknown, d = 2) => {
  const n = num(v);
  return n === null ? DASH : n.toFixed(d).replace(".", ",");
};
const AY: Record<string, string> = { lahiri: "Lahiri (Chitrapaksha)", raman: "B.V. Raman", "kp-newcomb": "KP-Newcomb", "kp-old": "KP (eski tablo)" };
const signL = (v: unknown) => (typeof v === "string" && v in SIGN_LABELS ? SIGN_LABELS[v as SignId] : DASH);

export const VEDIC_NOKTA_TECHNIQUES: ReadonlySet<string> = new Set(["vedic.upagraha", "vedic.heliacal"]);

export function vedicNoktaReport(b: ReportBuilderLike, technique: string, t: O) {
  if (technique === "vedic.upagraha") return upagrahaReport(b, t);
  if (technique === "vedic.heliacal") return heliacalReport(b, t);
}

function upagrahaReport(b: ReportBuilderLike, t: O) {
  if (t.schema !== VEDIC_UPAGRAHA_TECHNICAL_SCHEMA) {
    b.p("Bu kayıtta upagraha teknik verisi eksik.", "warn");
    return;
  }
  b.h(2, "Upagrahalar — hesaplanan duyarlı noktalar");
  const f = isObj(t.frame) ? t.frame : {};
  const d1 = isObj(t.d1) ? t.d1 : null;
  // 24.10.2026 kısmi sonuç (kutup günü / gecesi): zaman tabanlı tablo basılmaz, yerine açık not; tam kayıtlarda çıktı DEĞİŞMEZ.
  const partial = isObj(t.partial);
  b.kv([
    ["Zodyak", "Sidereal (nirayana)"],
    ["Ayanamsa", `${AY[String(f.ayanamsa)] ?? String(f.ayanamsa ?? DASH)}${num(f.ayanamsaDegrees) !== null ? ` (${formatDegree(f.ayanamsaDegrees as number)})` : ""}`],
    ["Güneş türevli zincirin Güneş'i", `${dec(t.impliedSun)}°`],
    ["Lagna (Vedik D1 kaydından)", d1 ? signL(d1.lagnaRashi) : "D1 kaydı yok — ev gösterilmez"],
    ["D1 Güneş'i ile fark", d1 ? `${dec(d1.sunDiff, 3)}° ${d1.sunConsistent === true ? "(tutarlı)" : "(UYARI: tolerans üstü)"}` : DASH],
    ...(partial ? ([["Sonuç", `${UPAGRAHA_PARTIAL_LABEL} — yalnız Güneş türevli noktalar`]] as [string, string][]) : []),
  ]);
  if (partial) b.p(UPAGRAHA_PARTIAL_NOTE, "warn");
  b.p(UPAGRAHA_NOT_BODY_NOTE, "muted");
  if (d1 && d1.sunConsistent === false) b.p("Uyarı: Güneş türevli noktaların dayandığı Güneş boylamı Vedik D1 kaydındaki Güneş boylamından tolerans üstünde farklı; değerler düzeltilmeden verilmiştir.", "warn");
  const row = (p: O) => {
    const id = String(p.id) as UpagrahaId;
    const nak = typeof p.nakshatra === "string" ? (NAKSHATRA_LABELS[p.nakshatra] ?? p.nakshatra) : DASH;
    return [
      UPAGRAHA_NAMES[id] ?? String(p.id),
      `${signL(p.rashi)} ${num(p.degreeInRashi) !== null ? formatDegree(p.degreeInRashi as number) : DASH}`,
      `${dec(p.longitude)}°`,
      `${nak} · ${String(p.pada ?? DASH)}. pada`,
      ...(d1 ? [typeof p.house === "number" ? `${p.house}. ev` : DASH] : []),
      UPAGRAHA_BASIS[id] ?? DASH,
    ];
  };
  const cols = ["Nokta", "Burç · derece", "Boylam", "Nakshatra · pada", ...(d1 ? ["Ev (Lagna'dan)"] : []), "Dayanak"];
  const widths = d1 ? [1.4, 1.6, 1, 1.8, 1, 2.4] : [1.4, 1.6, 1, 1.8, 2.4];
  const known = (xs: O[]) => xs.filter((p) => (UPAGRAHA_IDS as readonly string[]).includes(String(p.id)));
  if (!partial) b.table(cols, known(arr(t.timeBased)).map(row), { widths, caption: UPAGRAHA_GROUP_LABELS.time, compact: true });
  b.table(cols, known(arr(t.sunBased)).map(row), { widths, caption: UPAGRAHA_GROUP_LABELS.sun, compact: true });
  b.p(UPAGRAHA_SYSTEMS_NOTE, "muted");
  b.p(UPAGRAHA_SCHOOL_NOTE, "muted");
  b.p(GULIKA_PANCHANGA_NOTE, "muted");
  b.p(UPAGRAHA_HOUSE_NOTE, "muted");
}

function heliacalReport(b: ReportBuilderLike, t: O) {
  if (t.schema !== VEDIC_HELIACAL_TECHNICAL_SCHEMA || !isObj(t.place) || typeof t.date !== "string") {
    b.p("Bu kayıtta heliakal görünürlük teknik verisi eksik.", "warn");
    return;
  }
  const x = t as unknown as VedicHeliacalTechnical;
  b.h(2, `Graha Asta / Udaya — ${fmtDayTr(x.date)}`);
  b.kv([
    ["Değerlendirme günü (yerel)", fmtDayTr(x.date)],
    ["Gözlem yeri", heliacalPlaceText(x.place)],
    ["Astada olan grahalar", arr<O>(x.grahas).filter((g) => g.visible === false).map((g) => GRAHA_LABELS[String(g.id)] ?? String(g.id)).join(", ") || "yok"],
    ["Ufuk geçişi olmayan", arr<string>(x.omitted).map((g) => GRAHA_LABELS[g] ?? g).join(", ") || "yok"],
  ]);
  const ev = (e: VedicHeliacalEvent | null) => {
    if (!e) return "arama penceresinde yok";
    const tt = heliacalEventTimeText(e, x.place);
    return `${HELIACAL_EVENT_LABELS[e.type] ?? e.type} · ${tt.local} · ${tt.utc} · ${e.horizon === "east" ? "doğu" : "batı"} ufku · ${dec(e.timeDegrees)}° / ${e.kalamsa}°`;
  };
  b.table(
    ["Graha", "Durum", "Ufuk", "Zaman derecesi / sınır", "Boylam farkı", "Son olay", "Sonraki olay"],
    arr<VedicHeliacalTechnical["grahas"][number]>(x.grahas).map((g) => [
      `${GRAHA_LABELS[g.id] ?? g.id}${g.retrograde ? " (geri)" : ""}`,
      g.visible ? "Görünür" : "Astada",
      HELIACAL_HORIZON_LABELS[g.horizon] ?? DASH,
      `${dec(g.timeDegrees)}° / ${g.kalamsa}°`,
      `${dec(g.longitudeSeparation)}°`,
      ev(g.lastEvent),
      ev(g.nextEvent),
    ]),
    { widths: [1.3, 0.9, 1.6, 1.1, 0.9, 2.6, 2.6], caption: "Heliakal görünürlük (kalamsa)", compact: true },
  );
  b.p(HELIACAL_METHOD_NOTE, "muted");
  b.p(HELIACAL_VS_COMBUSTION_NOTE, "muted");
  b.p(HELIACAL_SCOPE_NOTE, "muted");
}
