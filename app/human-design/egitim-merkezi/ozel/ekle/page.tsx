"use client";

/**
 * D · Eğitim arşivine ekleme akışı (FAZ 7 — owner düzeltmesi; FAZ 14 izin sadeleştirme).
 *   ÖNCE TÜR: "Kurgusal Eğitim Haritası" (kurgusal doğum bilgisi + kurgusal beyan; izin / belge YOK; danışan kaydı oluşmaz)
 *             ya da "Gerçek Danışan Haritası" (aşağıdaki üç adım; izin adımında varsayılan SADE EĞİTMEN BEYANI, belge isteğe bağlı).
 *   ADIM 1 Kaynak Human Design haritasını seç (kendi kayıtlı, hesaplanmış haritası; yeniden hesap YOK) → "Devam et"
 *   ADIM 2 Danışanın geçerli eğitim iznini doğrula (yoksa izin kaydı — E) → "Devam et"
 *   ADIM 3 Eğitim başlığı, takma ad, kategori, notlar → SON: "Eğitim Arşivime Ekle"
 * İzin olmadan kayıt oluşmaz (istemci + sunucu + DB). Geri dönüldüğünde alanlar korunur (aynı sayfa durumu).
 * Mükerrer kayıt sunucuda engellenir (UNIQUE + RPC); ekran mevcut kaydı gösterir. Başarı yalnız sunucu kimlik döndürünce.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import kat from "@/app/_premium/hd-education/egitimKatalog.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { PRIV_CATEGORIES, PRIV_CATEGORY_LABEL, PRIV_UUID_RE, type PrivCategory } from "@/lib/human-design/education/private/privateContract";
import { ErrorView, LoadingView, NotFoundView, Shell, useAccess } from "../../_ui/Shell";
import { ConsentForm } from "../../_ui/ConsentForm";
import { DeclarationForm } from "../../_ui/DeclarationForm";
import { FictionalForm } from "../../_ui/FictionalForm";
import { NewAnalysisButton } from "../../_ui/NewAnalysisEntry";
import { fmtDay, privCall, useEduApiError } from "../../_ui/privApi";
import { useEduHdLabels, useEduLabel } from "../../_ui/labels";

type ChartRow = { id: string; client_id: string | null; client_name: string | null; birth_date: string | null; type_code: string | null; profile_code: string | null;
  authority_code: string | null; source: string | null; created_at: string };
type Consent = { id: string; consenterName: string; displayScope: "anonim" | "acik_isim"; includeBirthData: boolean; givenOn: string; method: string;
  withdrawnAt: string | null; evidence: { mime: string } | null; textVersion: string };
type Status = { eligible: boolean; reason: "duplicate" | "not_computed" | "no_client" | null; itemId: string | null; hdClientId: string | null; consents: Consent[] };
const REASONS = new Set(["duplicate", "not_computed", "no_client"]);

function AddFlow() {
  const t = useTranslations("hd.education");
  const L = useEduHdLabels();
  const label = useEduLabel();
  const apiErr = useEduApiError();
  const sp = useSearchParams();
  const router = useRouter();
  const access = useAccess("trainer", "/api/hd/education/private/access");
  const [charts, setCharts] = useState<ChartRow[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [step, setStep] = useState(1);
  // Kayıtlı harita ekranından gelen ?chart= : kaynak harita önceden seçili gelir (render'da türetilir; effect'te setState yok).
  const initialChart = (() => { const c = sp.get("chart"); return c && PRIV_UUID_RE.test(c) ? c : null; })();
  const [chartId, setChartId] = useState<string | null>(initialChart);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [consentId, setConsentId] = useState<string | null>(null);
  // FAZ 14: izin adımında varsayılan yol eğitmen beyanı; belgeli izin isteğe bağlı.
  const [consentMode, setConsentMode] = useState<null | "beyan" | "belge">(null);
  const setNewConsent = (v: boolean) => setConsentMode(v ? "belge" : null);
  // FAZ 14: kayıt türü. Kayıtlı haritadan (?chart=) gelinirse gerçek danışan; ?tur=kurgusal|gercek; yoksa önce tür seçilir.
  const [kind, setKind] = useState<null | "kurgusal" | "gercek">(() => {
    if (sp.get("chart")) return "gercek";
    const t = sp.get("tur");
    return t === "kurgusal" || t === "gercek" ? t : null;
  });
  const [q, setQ] = useState("");
  const [f, setF] = useState({ title: "", alias: "", category: "genel" as PrivCategory, mode: "alias" as "alias" | "named", description: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; dup?: boolean } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (access !== "ok") return;
    let live = true;
    void privCall<{ data: ChartRow[] }>("trainer", "/api/hd/charts").then((r) => {
      if (!live) return;
      if (r.ok) setCharts((r.body.data ?? []).filter((c) => c.source === "computed")); else setLoadErr(true);
    });
    return () => { live = false; };
  }, [access]);

  const fetchStatus = useCallback((id: string) => privCall<{ status: Status }>("trainer", `/api/hd/education/private/charts/${id}/status`), []);
  const applyStatus = useCallback((r: Awaited<ReturnType<typeof fetchStatus>>) => {
    if (r.ok) { setStatus(r.body.status); setStatusErr(null); } else { setStatus(null); setStatusErr(r.notFound ? t("add.chartNotFound") : apiErr(r)); }
    return r.ok ? r.body.status : null;
  }, []);
  const loadStatus = useCallback(async (id: string) => applyStatus(await fetchStatus(id)), [applyStatus, fetchStatus]);

  // Önceden seçili kaynak (ve izin sonrası ?step=2): uygunluk sunucudan; adım yalnız uygunsa ilerler.
  useEffect(() => {
    if (access !== "ok" || !initialChart) return;
    let live = true;
    void fetchStatus(initialChart).then((r) => {
      if (!live) return;
      const st = applyStatus(r);
      if (st?.eligible && sp.get("step") === "2") setStep(2);
    });
    return () => { live = false; };
  }, [access, initialChart, fetchStatus, applyStatus, sp]);

  const chart = useMemo(() => charts?.find((c) => c.id === chartId) ?? null, [charts, chartId]);
  // Geçerli izin: geri çekilmemiş + (belgeli yöntemde kanıtlı | eğitmen beyanı — beyanda dosya yoktur).
  const validConsents = (status?.consents ?? []).filter((k) => !k.withdrawnAt && (!!k.evidence || k.method === "egitmen_beyani"));
  const consent = validConsents.find((k) => k.id === consentId) ?? null;
  const shownCharts = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("tr-TR");
    return (charts ?? []).filter((c) => !t || (c.client_name ?? "").toLocaleLowerCase("tr-TR").includes(t));
  }, [charts, q]);

  if (access === "loading") return <LoadingView />;
  if (access === "denied") return <NotFoundView />;
  if (access === "error" || loadErr) return <ErrorView message={t("add.chartsError")} />;
  if (!charts) return <LoadingView />;

  async function submit() {
    if (!chartId || !consentId) return;
    setBusy(true); setErr(null);
    const r = await privCall<{ id: string }>("trainer", "/api/hd/education/private/items", { method: "POST", body: {
      chartId, consentId, title: f.title.trim(), aliasLabel: f.alias.trim(), category: f.category, displayMode: f.mode,
      description: f.description.trim() || null, teachingNotes: f.notes.trim() || null,
    } });
    setBusy(false);
    if (r.ok && r.body.id) { setDone(r.body.id); return; }
    if (!r.ok && r.code === "DUPLICATE") { setErr({ text: t("add.duplicate"), dup: true }); void loadStatus(chartId); return; }
    setErr({ text: r.ok ? t("add.noId") : apiErr(r) });
  }

  const steps = [t("add.step1"), t("add.step2"), t("add.step3")];
  const canStep3 = !!consent;
  const titleOk = f.title.trim().length >= 1 && f.title.trim().length <= 160;
  const aliasOk = f.alias.trim().length >= 1 && f.alias.trim().length <= 80;

  if (done) {
    return (
      <Shell>
        <section className={base.panel} data-edu-add-success>
          <div className={`${oz.result} ${oz.resultOk}`} role="status"><span>{t.rich("add.success", { b: (c) => <b>{c}</b> })}</span></div>
          <div className={base.actions}>
            <Link className={`${base.btn} ${base.ghost} ${oz.touch}`} href="/human-design/egitim-merkezi/ozel">{t("add.backToArchive")}</Link>
            <Link className={`${base.btn} ${base.save} ${oz.touch}`} href={`/human-design/egitim-merkezi/ozel/${done}`} data-edu-open-new>{t("priv.openChart")}</Link>
          </div>
        </section>
      </Shell>
    );
  }

  if (!kind) {
    return (
      <Shell>
        <Link className={kat.back} href="/human-design/egitim-merkezi/ozel">{t("add.back")}</Link>
        <header className={kat.dHead}>
          <div>
            <p className={base.eyebrow}>{t("add.eyebrow")}</p>
            <h1 className={kat.dTitle}>{t("add.chooseTitle")}</h1>
            <p className={kat.sub2}>{t("add.chooseSub")}</p>
          </div>
        </header>
        <section className={base.panel} data-edu-kind-choose>
          <div className={oz.kindPick}>
            <div className={oz.kindCard} data-edu-kind-card="kurgusal">
              <h2>{t("privKindFic")}</h2>
              <p>{t("add.ficDesc")}</p>
              <ul><li>{t("add.fic1")}</li><li>{t("add.fic2")}</li><li>{t("add.fic3")}</li></ul>
              <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} onClick={() => setKind("kurgusal")} data-edu-kind-pick="kurgusal">{t("add.ficPick")}</button>
            </div>
            <div className={oz.kindCard} data-edu-kind-card="gercek">
              <h2>{t("add.realTitle")}</h2>
              <p>{t("add.realDesc")}</p>
              <ul><li>{t("add.real1")}</li><li>{t("add.real2")}</li><li>{t("add.real3")}</li></ul>
              <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setKind("gercek")} data-edu-kind-pick="gercek">{t("add.realPick")}</button>
            </div>
          </div>
        </section>
      </Shell>
    );
  }

  if (kind === "kurgusal") {
    return (
      <Shell>
        <Link className={kat.back} href="/human-design/egitim-merkezi/ozel">{t("add.back")}</Link>
        <header className={kat.dHead}>
          <div>
            <p className={base.eyebrow}>{t("add.eyebrow")}</p>
            <h1 className={kat.dTitle}>{t("add.ficTitle")}</h1>
            <p className={kat.sub2}>{t("add.ficSub")}</p>
          </div>
          <div className={oz.dAct}>
            <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setKind(null)} data-edu-kind-back>{t("add.changeKind")}</button>
          </div>
        </header>
        <FictionalForm onDone={(id) => setDone(id)} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Link className={kat.back} href="/human-design/egitim-merkezi/ozel">{t("add.back")}</Link>
      <header className={kat.dHead}>
        <div>
          <p className={base.eyebrow}>{t("add.realEyebrow")}</p>
          <h1 className={kat.dTitle}>{t("add.realHeadTitle")}</h1>
          <p className={kat.sub2}>{t("add.realHeadSub")}</p>
        </div>
        {!sp.get("chart") ? (
          <div className={oz.dAct}>
            <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setKind(null)} data-edu-kind-back>{t("add.changeKind")}</button>
          </div>
        ) : null}
      </header>
      <ol className={oz.steps} aria-label={t("add.stepsAria")}>
        {steps.map((t, i) => (
          <li key={t} className={i + 1 < step ? oz.stepDone : i + 1 === step ? oz.stepOn : ""} aria-current={i + 1 === step ? "step" : undefined}>
            <span className={oz.stepNo}>{i + 1 < step ? "✓" : i + 1}</span>{t}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className={base.panel} data-edu-step="1">
          <div className={oz.methods} data-edu-methods>
            <div className={`${oz.method} ${oz.methodOn}`} data-edu-method="existing">
              <h3>{t("add.methodExisting")}</h3>
              <p>{t("add.methodExistingBody")}</p>
            </div>
            <div className={oz.method} data-edu-method="new">
              <h3>{t("add.methodNew")}</h3>
              <p>{t("add.methodNewBody")}</p>
              <NewAnalysisButton />
            </div>
          </div>
          <h2 className={base.h2} style={{ marginTop: 16 }}>{t("add.pickTitle")}</h2>
          <p className={base.lead}>{t("add.pickLead")}</p>
          {charts.length > 6 ? <input className={`${base.input} ${oz.search}`} type="search" placeholder={t("add.searchPh")} aria-label={t("add.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} /> : null}
          {!charts.length ? <p className={base.empty} data-edu-nocharts>{t("add.noCharts")}</p> : (
            <ul className={oz.pickList} role="radiogroup" aria-label={t("add.chartsAria")}>
              {shownCharts.map((c) => (
                <li key={c.id}>
                  <label className={`${oz.pick} ${chartId === c.id ? oz.pickOn : ""}`} data-edu-chart={c.id}>
                    <input type="radio" name="edu-chart" checked={chartId === c.id} onChange={() => { setChartId(c.id); setConsentId(null); setNewConsent(false); setStatus(null); setStatusErr(null); void loadStatus(c.id); }} />
                    <span><b>{c.client_name ?? t("add.noClientName")}</b>
                      <small>{[L.type(c.type_code), L.profile(c.profile_code), L.authority(c.authority_code)].filter(Boolean).join(" · ")}{t("add.savedOn", { date: fmtDay(c.created_at) })}</small></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {chartId && !status && !statusErr ? <p className={base.empty} aria-live="polite">{t("add.checking")}</p> : null}
          {statusErr ? <p className={base.err} role="alert">{statusErr}</p> : null}
          {status && !status.eligible ? (
            <div className={`${oz.result} ${oz.resultWarn}`} role="alert" data-edu-ineligible={status.reason ?? ""}>
              <span>{status.reason && REASONS.has(status.reason) ? t(`add.reason.${status.reason}`) : t("add.cannotAdd")}{status.reason === "duplicate" && status.itemId ? <> <Link className={base.ext} href={`/human-design/egitim-merkezi/ozel/${status.itemId}`}>{t("add.openExisting")}</Link></> : null}</span>
            </div>
          ) : null}
          <div className={base.actions}>
            <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} disabled={!status?.eligible} onClick={() => setStep(2)} data-edu-next="1">{t("common.continue")}</button>
          </div>
        </section>
      ) : null}

      {step === 2 && status?.hdClientId ? (
        <section className={base.panel} data-edu-step="2">
          <h2 className={base.h2}>{t("add.consentTitle")}</h2>
          <p className={base.lead}>{t("add.consentLead", { client: chart?.client_name ?? t("add.selectedClient") })}</p>
          {validConsents.length ? (
            <ul className={oz.pickList} role="radiogroup" aria-label={t("add.consentsAria")}>
              {validConsents.map((k) => (
                <li key={k.id}>
                  <label className={`${oz.pick} ${consentId === k.id ? oz.pickOn : ""}`} data-edu-consent={k.id}>
                    <input type="radio" name="edu-consent" checked={consentId === k.id} onChange={() => setConsentId(k.id)} />
                    <span><b>{k.method === "egitmen_beyani" ? t("detail.trainerDeclaration") : t("add.documented")} · {k.displayScope === "acik_isim" ? t("add.scopeNamed") : t("add.scopeAlias")} · {fmtDay(k.givenOn)}</b>
                      <small>{t("add.consentMeta", { name: k.consenterName, birth: k.includeBirthData ? t("add.birthShown") : t("add.birthHidden"), version: k.textVersion.replace(/^hd-egitim-(izin|beyan)-/, "") })}</small></span>
                  </label>
                </li>
              ))}
            </ul>
          ) : <div className={`${oz.result} ${oz.resultWarn}`} data-edu-noconsent><span>{t("add.noConsent")}</span></div>}
          {(status.consents.length - validConsents.length) > 0 ? <p className={oz.hint}>{t("add.hiddenConsents", { n: String(status.consents.length - validConsents.length), count: status.consents.length - validConsents.length })}</p> : null}
          {consentMode === "beyan" ? (
            <DeclarationForm hdClientId={status.hdClientId} clientLabel={chart?.client_name ?? t("add.selectedClient")} onCancel={() => setConsentMode(null)}
              onSaved={(id) => { setConsentMode(null); void loadStatus(chartId as string).then(() => setConsentId(id)); }} />
          ) : consentMode === "belge" ? (
            <ConsentForm hdClientId={status.hdClientId} clientLabel={chart?.client_name ?? t("add.selectedClient")} onCancel={() => setNewConsent(false)}
              onSaved={(id) => { setNewConsent(false); void loadStatus(chartId as string).then(() => setConsentId(id)); }} />
          ) : (
            <div className={base.actions}>
              <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} onClick={() => setConsentMode("beyan")} data-edu-new-declaration>{t("add.withDeclaration")}</button>
              <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setNewConsent(true)} data-edu-new-consent>{t("add.withDocument")}</button>
            </div>
          )}
          <div className={base.actions}>
            <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setStep(1)}>{t("common.back")}</button>
            <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} disabled={!canStep3} onClick={() => setStep(3)} data-edu-next="2">{t("common.continue")}</button>
          </div>
        </section>
      ) : null}

      {step === 3 && consent ? (
        <section className={base.panel} data-edu-step="3">
          <h2 className={base.h2}>{t("add.step3")}</h2>
          <p className={base.lead}>{t("add.step3Lead")}</p>
          <div className={oz.form2}>
            <label className={oz.field}>{t("form.title")}
              <input value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} data-edu-title />
            </label>
            <label className={oz.field}>{t("add.aliasLabel")}
              <input value={f.alias} maxLength={80} onChange={(e) => setF({ ...f, alias: e.target.value })} placeholder={t("add.aliasPh")} data-edu-alias />
            </label>
            <label className={oz.field}>{t("form.category")}
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as PrivCategory })} data-edu-category>
                {PRIV_CATEGORIES.map((c) => <option key={c} value={c}>{label("privCategory", c, PRIV_CATEGORY_LABEL[c])}</option>)}
              </select>
            </label>
            <label className={oz.field}>{t("form.display")}
              <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as "alias" | "named" })} data-edu-mode>
                <option value="alias">{t("add.aliasDefault")}</option>
                <option value="named" disabled={consent.displayScope !== "acik_isim"}>{t("detail.scopeNamed")}{consent.displayScope !== "acik_isim" ? t("form.namedNotInScope") : ""}</option>
              </select>
            </label>
            <label className={`${oz.field} ${oz.wide}`}>{t("add.shortDesc")}
              <textarea value={f.description} maxLength={2000} rows={2} onChange={(e) => setF({ ...f, description: e.target.value })} data-edu-desc />
            </label>
            <label className={`${oz.field} ${oz.wide}`}>{t("form.notesPrivate")}
              <textarea value={f.notes} maxLength={20000} rows={5} onChange={(e) => setF({ ...f, notes: e.target.value })} data-edu-notes />
            </label>
          </div>
          {err ? (
            <div className={`${oz.result} ${err.dup ? oz.resultWarn : oz.resultBad}`} role="alert" data-edu-error>
              <span>{err.text}{err.dup && status?.itemId ? <> <Link className={base.ext} href={`/human-design/egitim-merkezi/ozel/${status.itemId}`}>{t("add.openExisting")}</Link></> : null}</span>
            </div>
          ) : null}
          <div className={base.actions}>
            <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setStep(2)} disabled={busy}>{t("common.back")}</button>
            <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} onClick={submit} disabled={busy || !titleOk || !aliasOk} data-edu-submit>
              {busy ? t("add.adding") : t("add.submit")}
            </button>
          </div>
        </section>
      ) : null}
      {step > 1 && !status ? <p className={base.err} role="alert">{t("add.lost")} <button type="button" className={base.linkBtn} onClick={() => router.refresh()}>{t("add.refresh")}</button></p> : null}
    </Shell>
  );
}

export default function AddPage() {
  return <Suspense fallback={<LoadingView />}><AddFlow /></Suspense>;
}
