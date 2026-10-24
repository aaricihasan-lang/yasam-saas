// Sade Sati dönem tarihleri — Word/PDF bölümü (SAF; yalnız KAYITLI teknik veri, yeni hesap YOK). Ekranla aynı metinler.

import { SIGN_LABELS } from "../labels/tr";
import type { SignId } from "../model/western";
import type { SadeSatiPeriods } from "./periods";
import { SADE_SATI_PERIODS_STATUS_TEXT, SS_PERIODS_METHOD_TEXT, SS_PERIODS_SCOPE_NOTE, SS_PHASE_SHORT, SS_RELATION_LABEL, ssIstanbul, ssMoonBoundaryText, ssPeriodsSourceText, ssSummaryLines, ssUtc } from "./labels";

type B = {
  h(level: 1 | 2 | 3, text: string): void;
  p(text: string, tone?: "muted" | "warn"): void;
  table(columns: string[], rows: string[][], opts?: { widths?: number[]; caption?: string; compact?: boolean; empty?: string }): void;
};
const signL = (s: string) => SIGN_LABELS[s as SignId] ?? s;

export function sadeSatiPeriodsReport(b: B, periods: unknown, status: unknown): void {
  b.h(3, "Sade Sati dönem tarihleri");
  const st = status as { state?: string; reason?: string };
  const p = periods as SadeSatiPeriods | undefined;
  if (st.state !== "ok" || !p || !Array.isArray(p.cycles)) {
    b.p(SADE_SATI_PERIODS_STATUS_TEXT[st.reason ?? ""] ?? "Dönem tarihleri bu kayıtta yok.", "warn");
    return;
  }
  for (const l of ssSummaryLines(p)) b.p(l);
  const warn = ssMoonBoundaryText(p);
  if (warn) b.p(warn, "warn");
  for (const c of p.cycles) {
    b.p(`${SS_RELATION_LABEL[c.relation]}: ${ssUtc(c.start)} → ${ssUtc(c.end)}${c.partial ? " (kısmi: katalog kapsamı dışına taşıyor)" : ""}${c.beginsBeforeBirth ? " (doğumdan önce başlamış)" : ""}`);
    b.table(
      ["Evre", "Satürn", "Giriş (UTC)", "Giriş (Türkiye saati)", "Çıkış (UTC)"],
      c.segments.map((s) => [
        SS_PHASE_SHORT[s.phase],
        signL(s.sign),
        `${ssUtc(s.start?.utc)}${s.start?.motion === "retrograde" ? " · geri dönüş (℞)" : ""}${s.start?.nearStation ? " · duraklamaya yakın" : ""}`,
        ssIstanbul(s.start?.utc),
        `${ssUtc(s.end?.utc)}${s.end?.nearStation ? " · duraklamaya yakın" : ""}`,
      ]),
      { widths: [1.3, 1.1, 2.2, 2, 2], compact: true },
    );
    for (const x of c.interruptions) b.p(`Kesinti: Satürn ${signL(x.sign)} burcunda (geçici çıkış) — ${ssUtc(x.start)} → ${ssUtc(x.end)}`, "muted");
    b.table(
      ["Evre", "K2a (ilk giriş)", "K2b (kalıcı giriş)"],
      (["rising", "peak", "setting"] as const).map((ph) => [SS_PHASE_SHORT[ph], `${ssUtc(c.k2a[ph].start)} → ${ssUtc(c.k2a[ph].end)}`, `${ssUtc(c.k2b[ph].start)} → ${ssUtc(c.k2b[ph].end)}`]),
      { widths: [1.3, 3, 3], compact: true, caption: "Karşılaştırma özetleri" },
    );
  }
  b.p(SS_PERIODS_METHOD_TEXT, "muted");
  b.p(ssPeriodsSourceText(p), "muted");
  b.p(SS_PERIODS_SCOPE_NOTE, "muted");
  b.p(`Metodoloji damgası: ${p.method} · katalog SHA-256 ${p.catalog.sha256.slice(0, 12)}…`, "muted");
}
