// 2026-10-22 — Word/PDF rapor bölümü (SAF): Deklinasyon paralelleri (aylık). Yalnız KAYITLI teknik veri (yeni hesap YOK).
// Ekrandaki yöntem / kapsam metinleriyle AYNI dizgeler kullanılır. Hüküm / yorum metni yoktur (sağlayıcı yorum vermez).

import { BODY_LABELS } from "../labels/tr";
import type { BodyId } from "../model/western";
import {
  DECLINATION_BODIES,
  DECLINATION_METHOD_TEXT,
  DECLINATION_OOB_NOTE,
  DECLINATION_SCOPE_TEXT,
  DECLINATION_TYPE_GLYPHS,
  DECLINATION_TYPE_LABELS,
  declinationMonthLabel,
  fmtDeclination,
  fmtOrb,
  isOutOfBounds,
  type DeclinationContactType,
} from "../model/westernDeclination";
import { formatInZone } from "../transitDetail";
import type { ReportBuilderLike } from "./vedicMatchReport";

type O = Record<string, unknown>;
const DASH = "—";
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bodyL = (v: unknown) => (typeof v === "string" && v in BODY_LABELS ? BODY_LABELS[v as BodyId] : DASH);
const utcL = (v: string) => `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)} ${v.slice(11, 16)} UTC`;
const isType = (v: unknown): v is DeclinationContactType => v === "parallel" || v === "contraparallel";

export function declinationParallelsReport(b: ReportBuilderLike, t: O, opts: O) {
  const month = typeof t.month === "string" ? t.month : "";
  const tz = typeof opts.displayTz === "string" && opts.displayTz !== "UTC" ? opts.displayTz : null;
  const contacts = (Array.isArray(t.contacts) ? t.contacts : []).filter(
    (c): c is O => isObj(c) && typeof c.exactUtc === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(c.exactUtc) && isType(c.type) && num(c.declinationA) !== null && num(c.declinationB) !== null,
  );
  const s = isObj(t.summary) ? t.summary : {};
  b.h(2, `Deklinasyon paralelleri — ${month ? declinationMonthLabel(month) : DASH}`);
  b.kv([
    ["Ay (UTC sınırları)", month ? declinationMonthLabel(month) : DASH],
    ["Gök cisimleri", `${DECLINATION_BODIES.length} (Ay hariç)`],
    ["Orb sınırı", num(t.orbLimit) !== null ? fmtOrb(t.orbLimit as number) : DASH],
    ["Ay düğümü", t.nodeType === "mean" ? "Ortalama düğüm" : t.nodeType === "true" ? "Gerçek düğüm" : DASH],
    ["Koordinat", "Yer merkezli, görünür konum, tarihin ekvatoru"],
    ["Gösterim saat dilimi", tz ?? "UTC"],
    ["Temas sayısı", `${num(s.total) ?? contacts.length} (paralel ${num(s.parallel) ?? DASH}, kontraparalel ${num(s.contraparallel) ?? DASH})`],
  ]);
  b.table(
    ["Kesinleşme (UTC)", ...(tz ? [`Yerel saat (${tz})`] : []), "Tür", "Gök cisimleri", "Deklinasyon 1", "Deklinasyon 2", "Orb", "OOB"],
    contacts.map((c) => {
      const at = c.exactUtc as string;
      const local = tz ? formatInZone(at, tz) : null;
      const type = c.type as DeclinationContactType;
      const dA = c.declinationA as number;
      const dB = c.declinationB as number;
      const oob = [isOutOfBounds(dA, at) ? bodyL(c.a) : null, isOutOfBounds(dB, at) ? bodyL(c.b) : null].filter(Boolean).join(", ");
      return [
        utcL(at),
        ...(tz ? [local ? `${local.text} (${local.zone})` : DASH] : []),
        DECLINATION_TYPE_LABELS[type],
        `${bodyL(c.a)} ${DECLINATION_TYPE_GLYPHS[type]} ${bodyL(c.b)}`,
        `${bodyL(c.a)} ${fmtDeclination(dA)}`,
        `${bodyL(c.b)} ${fmtDeclination(dB)}`,
        num(c.orb) !== null ? fmtOrb(c.orb as number) : DASH,
        oob || DASH,
      ];
    }),
    { widths: tz ? [1.7, 1.9, 1.2, 2, 1.6, 1.6, 0.8, 1] : [1.7, 1.2, 2, 1.6, 1.6, 0.8, 1], caption: "Kronolojik temas çizelgesi", empty: "Bu ayda seçilen orb içinde deklinasyon teması yok." },
  );
  b.p(DECLINATION_METHOD_TEXT, "muted");
  b.p(DECLINATION_SCOPE_TEXT, "muted");
  b.p(DECLINATION_OOB_NOTE, "muted");
}
