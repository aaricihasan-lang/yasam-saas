"use client";

// Rapor sekmesi — Word çıktısı. Kayıtlı analizden ya da kaydedilmemiş sonuçtan (sunucu önbellekten doğrular) üretilir
// (0 sağlayıcı çağrısı; taslak raporu kayıt OLUŞTURMAZ).

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { PERSON_REPORT_GROUPS, type PersonReportGroup, type ReportVariant } from "@/lib/numeroloji-klasik/report/types";
import { API_BASE, apiBlob, errorMessage, saveBlob, type ApiErr } from "../../_lib/api";
import { sourceBody, type ResultSource } from "../../_lib/draft";
import { Alert, Icon } from "../kit";

// Bölüm (PersonReportGroup) ve ayrıntı düzeyi (ReportVariant) kodları API'ye giden kanonik değerlerdir; yalnız gösterim
// numerology.classic.report.groups.<kod> / variants.<kod> katalogundan. Üretilen Word/PNG içeriği sunucuda (bu dosya değil).
const VARIANTS: ReportVariant[] = ["summary", "technical", "full"];

export function ReportPanel({ source, kind, title, subtitle, available }: { source: ResultSource; kind: string; title: string; subtitle: string; available: PersonReportGroup[] }) {
  const t = useTranslations("numerology.classic.report");
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
    const body: Record<string, unknown> = { kind: stonesOnly ? "stones" : kind, ...sourceBody(source) };
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
        <h2 className="nk-h2">{t("wordTitle")}</h2>
        <p className="nk-lead">{isPerson ? t("leadPerson") : t("leadOther")}</p>
        {isPerson ? (
          <fieldset style={{ border: 0, padding: 0, margin: "10px 0 0" }} disabled={variant === "full"}>
            <legend className="nk-sr-only">{t("sectionsLegend")}</legend>
            {available.map((g) => (
              <label key={g} className="nk-check">
                <input type="checkbox" checked={variant === "full" || include.includes(g)} onChange={(e) => setInclude((cur) => (e.target.checked ? [...cur, g] : cur.filter((x) => x !== g)))} />
                {t(`groups.${g}`)}
              </label>
            ))}
            {variant === "full" ? <p className="nk-hint" style={{ marginTop: 8 }}>{t("fullHint")}</p> : null}
          </fieldset>
        ) : null}
        {showVariants ? (
          <>
            <p className="nk-flabel nk-h3" style={{ marginTop: 14 }} id={`${uid}-ad`}>{t("detailLevel")}</p>
            <div className="nk-radio-row" role="radiogroup" aria-labelledby={`${uid}-ad`}>
              {VARIANTS.map((v) => (
                <label key={v} className="nk-radio" title={t(`variants.${v}.desc`)}>
                  <input type="radio" name={`${uid}-variant`} checked={variant === v} onChange={() => setVariant(v)} />
                  <span>{t(`variants.${v}.label`)}</span>
                </label>
              ))}
            </div>
          </>
        ) : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        {done ? <Alert tone="ok" live>{t("downloaded")}</Alert> : null}
        <div className="nk-btn-row nk-stretch" style={{ marginTop: 18 }}>
          <button className="nk-btn nk-primary" type="button" onClick={() => void download(false)} disabled={busy || (isPerson && variant !== "full" && include.length === 0)} data-testid="word-download">
            <Icon name="doc" />{busy ? t("preparing") : t("wordDownload")}
          </button>
          {isPerson && available.includes("stones") ? (
            <button className="nk-btn" type="button" onClick={() => void download(true)} disabled={busy} data-testid="word-stones">
              <Icon name="gem" />{t("stonesWord")}
            </button>
          ) : null}
        </div>
      </div>
      {isPerson ? <PngReportCard source={source} /> : null}
      <div className="nk-card nk-panel">
        <p className="nk-label-cap">{t("preview")}</p>
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

/** Görsel (PNG) rapor — kayıtlı veriden / doğrulanmış taslaktan sunucuda üretilir (0 sağlayıcı çağrısı); önce önizleme, sonra indirme. */
function PngReportCard({ source }: { source: ResultSource }) {
  const t = useTranslations("numerology.classic.report");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [img, setImg] = useState<{ url: string; blob: Blob; filename: string } | null>(null);
  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url); }, [img]);
  async function build() {
    setBusy(true);
    setError(null);
    const r = await apiBlob(`${API_BASE}/rapor/gorsel`, sourceBody(source), "klasik-numeroloji-raporu.png");
    setBusy(false);
    if (r.ok) setImg({ url: URL.createObjectURL(r.blob), blob: r.blob, filename: r.filename });
    else setError(errorMessage(r as ApiErr));
  }
  return (
    <div className="nk-card nk-panel" data-testid="png-card">
      <h2 className="nk-h2">{t("png.title")}</h2>
      <p className="nk-lead">{t("png.lead")}</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {img ? (
        <figure style={{ margin: "14px 0 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- yerel blob önizlemesi */}
          <img src={img.url} alt={t("png.alt")} data-testid="png-preview" style={{ width: "100%", height: "auto", borderRadius: 12, border: "1px solid var(--b-line)" }} />
        </figure>
      ) : null}
      <div className="nk-btn-row nk-stretch" style={{ marginTop: 18 }}>
        {img ? (
          <button className="nk-btn nk-primary" type="button" onClick={() => saveBlob(img.blob, img.filename)} data-testid="png-download">
            <Icon name="doc" />{t("png.download")}
          </button>
        ) : (
          <button className="nk-btn nk-primary" type="button" onClick={() => void build()} disabled={busy} data-testid="png-build">
            <Icon name="doc" />{busy ? t("preparing") : t("png.build")}
          </button>
        )}
      </div>
    </div>
  );
}
