"use client";

// Rapor sekmesi — Word çıktısı. Kayıtlı analizden üretilir (0 sağlayıcı çağrısı).

import { useId, useState } from "react";
import { PERSON_REPORT_GROUPS, type PersonReportGroup, type ReportVariant } from "@/lib/numeroloji-klasik/report/types";
import { API_BASE, apiBlob, errorMessage, saveBlob, type ApiErr } from "../../_lib/api";
import { Alert, Icon } from "../kit";

export const REPORT_GROUP_LABELS: Readonly<Record<PersonReportGroup, string>> = Object.freeze({
  core: "Çekirdek sayılar",
  karmic: "Karmik dersler ve borçlar",
  timing: "Zirveler, zorluklar, kişisel döngüler",
  bridge: "Köprü sayıları",
  name_letters: "İsim harfleri",
  hidden_subconscious: "Gizli tutku ve bilinçaltı benlik",
  birthday_profile: "Doğum günü profili",
  maturity: "Olgunluk",
  chaldean: "Kalde (Cheiro)",
  dual: "İki sistem karşılaştırması",
  lucky: "Uğurlu ilişkiler",
  stones: "Taş önerileri (bilgilendirme notuyla)",
});

const VARIANTS: { v: ReportVariant; label: string; desc: string }[] = [
  { v: "summary", label: "Özet", desc: "Sayılar ve kısa anlamlar" },
  { v: "technical", label: "Teknik", desc: "Hesap izleri ve doğrulama durumu" },
  { v: "full", label: "Tam", desc: "Tüm bölümler ve yorumlar" },
];

export function ReportPanel({ analysisId, kind, title, subtitle, available }: { analysisId: string; kind: string; title: string; subtitle: string; available: PersonReportGroup[] }) {
  const uid = useId();
  const isPerson = kind === "person";
  const [variant, setVariant] = useState<ReportVariant>("technical");
  const [include, setInclude] = useState<PersonReportGroup[]>(available);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const showVariants = isPerson || kind === "names";

  async function download(stonesOnly = false) {
    setBusy(true);
    setError(null);
    setDone(false);
    const body: Record<string, unknown> = { kind: stonesOnly ? "stones" : kind, analysisId };
    if (showVariants && !stonesOnly) body.variant = variant;
    if (isPerson && !stonesOnly) body.include = variant === "full" ? [...available] : PERSON_REPORT_GROUPS.filter((g) => include.includes(g));
    const r = await apiBlob(`${API_BASE}/rapor`, body, "klasik-numeroloji-raporu.docx");
    setBusy(false);
    if (r.ok) {
      saveBlob(r.blob, r.filename);
      setDone(true);
    } else setError(errorMessage(r as ApiErr));
  }

  return (
    <div className="nk-report-grid">
      <div className="nk-card nk-panel">
        <h2 className="nk-h2">Word raporu</h2>
        <p className="nk-lead">{isPerson ? "Rapora girecek bölümleri seçin." : "Kayıtlı analizden Word raporu üretilir."}</p>
        {isPerson ? (
          <fieldset style={{ border: 0, padding: 0, margin: "10px 0 0" }} disabled={variant === "full"}>
            <legend className="nk-sr-only">Rapor bölümleri</legend>
            {available.map((g) => (
              <label key={g} className="nk-check">
                <input type="checkbox" checked={variant === "full" || include.includes(g)} onChange={(e) => setInclude((cur) => (e.target.checked ? [...cur, g] : cur.filter((x) => x !== g)))} />
                {REPORT_GROUP_LABELS[g]}
              </label>
            ))}
            {variant === "full" ? <p className="nk-hint" style={{ marginTop: 8 }}>Tam raporda tüm bölümler yer alır.</p> : null}
          </fieldset>
        ) : null}
        {showVariants ? (
          <>
            <p className="nk-flabel nk-h3" style={{ marginTop: 14 }} id={`${uid}-ad`}>Ayrıntı düzeyi</p>
            <div className="nk-radio-row" role="radiogroup" aria-labelledby={`${uid}-ad`}>
              {VARIANTS.map((x) => (
                <label key={x.v} className="nk-radio" title={x.desc}>
                  <input type="radio" name={`${uid}-variant`} checked={variant === x.v} onChange={() => setVariant(x.v)} />
                  <span>{x.label}</span>
                </label>
              ))}
            </div>
          </>
        ) : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        {done ? <Alert tone="ok" live>Rapor indirildi.</Alert> : null}
        <div className="nk-btn-row nk-stretch" style={{ marginTop: 18 }}>
          <button className="nk-btn nk-primary" type="button" onClick={() => void download(false)} disabled={busy || (isPerson && variant !== "full" && include.length === 0)} data-testid="word-download">
            <Icon name="doc" />{busy ? "Hazırlanıyor…" : "Word indir"}
          </button>
          {isPerson && available.includes("stones") ? (
            <button className="nk-btn" type="button" onClick={() => void download(true)} disabled={busy} data-testid="word-stones">
              <Icon name="gem" />Taş raporu (Word)
            </button>
          ) : null}
        </div>
      </div>
      <div className="nk-card nk-panel">
        <p className="nk-label-cap">Önizleme</p>
        <div className="nk-doc-preview" style={{ marginTop: 10 }} aria-hidden="true">
          <p className="nk-doc-title">{title}</p>
          <p className="nk-num-key">{subtitle}</p>
          <div className="nk-ph" /><div className="nk-ph nk-w80" /><div className="nk-ph nk-w60" />
          <div className="nk-ph" style={{ marginTop: 16 }} /><div className="nk-ph nk-w80" /><div className="nk-ph" /><div className="nk-ph nk-w60" />
        </div>
      </div>
    </div>
  );
}
