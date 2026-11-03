// 02.11.2026 — Word/PDF rapor bölümü (SAF): Transit Taraması (#646). Yalnız KAYITLI teknik veri (yeni hesap YOK). Ekrandaki
// etiketlerle aynı dizgeler (lib/astrology/model/westernTransitScan). Zamanlar gösterim saat diliminde; belirsizlik 1 saati aşarsa
// saat yerine tarih (≈).

import {
  TRANSIT_SCAN_ASPECT_LABELS as ASP,
  TRANSIT_SCAN_CLASS_LABELS,
  TRANSIT_SCAN_LABELS as L,
  TRANSIT_SCAN_SIGNS,
  TRANSIT_SCAN_SIGN_KEYS,
  transitScanSourceText,
  transitScanUnc,
  type TransitScanTechnical,
} from "../model/westernTransitScan";
import type { ReportBuilderLike } from "./vedicMatchReport";

const DASH = "—";
const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export function transitScanReport(b: ReportBuilderLike, raw: Record<string, unknown>) {
  const t = raw as unknown as TransitScanTechnical;
  if (!t.scan || !Array.isArray(t.scan.windows)) {
    b.p("Kayıtta transit taraması verisi yok.", "muted");
    return;
  }
  const tz = t.displayTz || "Europe/Istanbul";
  const tzLabel = tz === "Europe/Istanbul" ? "TSİ" : tz;
  const fmt = (ms: number) => {
    try {
      return new Intl.DateTimeFormat("tr-TR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
    } catch {
      return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
    }
  };
  const when = (ms: number | null, u: number | null | undefined) => (ms === null ? DASH : (u ?? 0) > 3600 ? `≈ ${fmt(ms).slice(0, 10)}` : fmt(ms));
  b.h(2, `Transit Taraması — ${dmy(t.range.start)} – ${dmy(t.range.end)}`);
  b.kv([
    ["Tarama aralığı", `${dmy(t.range.start)} – ${dmy(t.range.end)} (bitiş günü dahil)`],
    ["Orb", `${String(t.orb).replace(".", ",")}° (tüm açılar)`],
    ["Transit gezegenler", t.bodies.map((x) => L[x] ?? x).join(", ")],
    ["Natal noktalar", t.natal.map((x) => L[x.id] ?? x.id).join(", ") || DASH],
    ["Açılar", t.aspects.map((x) => ASP[x] ?? x).join(", ")],
    ["Ek olaylar", [t.include.stations ? "istasyonlar" : null, t.include.ingresses ? "burç girişleri" : null].filter(Boolean).join(", ") || DASH],
    ["Saat dilimi", tzLabel],
    ["Kaynak", transitScanSourceText(t)],
  ]);
  b.h(3, `Orb pencereleri (${t.scan.windows.length})`);
  b.table(
    ["Transit", "Orba giriş", "Tam an(lar)", "Orbdan çıkış", "Tür"],
    t.scan.windows.map((w) => [
      `${L[w.a] ?? w.a} ${ASP[w.aspect] ?? w.aspect} ${L[w.b] ?? w.b}`,
      w.startsBeforeRange ? "aralık başında içeride" : `${when(w.enterMs, w.enterUncertaintySec)} ${transitScanUnc(w.enterUncertaintySec)}`.trim(),
      w.passes.length ? w.passes.map((p) => `${when(p.ms, p.uncertaintySec)} (${p.pass}/${p.of})${p.aRetrograde ? " ℞" : ""}`).join("; ") : `tam olmuyor · en yakın ${w.closest.separationDeg.toFixed(2).replace(".", ",")}°`,
      w.endsAfterRange ? "aralık sonunda içeride" : `${when(w.exitMs, w.exitUncertaintySec)} ${transitScanUnc(w.exitUncertaintySec)}`.trim(),
      TRANSIT_SCAN_CLASS_LABELS[w.classification] ?? w.classification,
    ]),
    { widths: [2, 1.8, 2.6, 1.8, 1.4], compact: true, empty: "Bu aralıkta orb penceresi yok." },
  );
  const ev = [...t.scan.events].sort((a, x) => a.ms - x.ms);
  b.h(3, `Olay takvimi (${ev.length})`);
  b.table(
    [`Tarih (${tzLabel})`, "Tür", "Olay", "Belirsizlik"],
    ev.map((e) => {
      const type = e.type === "station" ? `İstasyon (${e.station === "direct" ? "direkt" : "retro"})` : e.type === "ingress" ? "Burç girişi" : e.type === "exact" ? `Tam açı${e.of && e.of > 1 ? ` ${e.pass}/${e.of}` : ""}` : e.type === "orb_enter" ? "Orba giriş" : "Orbdan çıkış";
      const sign = e.toSign ?? e.other;
      const what =
        e.type === "station"
          ? `${L[e.body] ?? e.body} ${e.station === "direct" ? "direkt" : "retro"} döner`
          : e.type === "ingress"
            ? `${L[e.body] ?? e.body} ${sign ? (TRANSIT_SCAN_SIGNS[TRANSIT_SCAN_SIGN_KEYS.indexOf(sign)] ?? sign) : DASH} burcuna girer${e.retrograde ? " ℞" : ""}`
            : `${L[e.body] ?? e.body} ${e.aspect ? (ASP[e.aspect] ?? e.aspect) : ""} ${e.other ? (L[e.other] ?? e.other) : ""}`.trim();
      return [when(e.ms, e.uncertaintySec), type, what, transitScanUnc(e.uncertaintySec)];
    }),
    { widths: [1.6, 1.4, 3.2, 0.9], compact: true, empty: "Bu aralıkta olay yok." },
  );
}
