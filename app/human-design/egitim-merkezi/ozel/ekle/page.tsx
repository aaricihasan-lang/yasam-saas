"use client";

/**
 * D · Eğitim arşivine ekleme akışı (FAZ 7 — owner düzeltmesi).
 *   ADIM 1 Kaynak Human Design haritasını seç (kendi kayıtlı, hesaplanmış haritası; yeniden hesap YOK) → "Devam et"
 *   ADIM 2 Danışanın geçerli eğitim iznini doğrula (yoksa izin kaydı — E) → "Devam et"
 *   ADIM 3 Eğitim başlığı, takma ad, kategori, notlar → SON: "Eğitim Arşivime Ekle"
 * İzin olmadan kayıt oluşmaz (istemci + sunucu + DB). Geri dönüldüğünde alanlar korunur (aynı sayfa durumu).
 * Mükerrer kayıt sunucuda engellenir (UNIQUE + RPC); ekran mevcut kaydı gösterir. Başarı yalnız sunucu kimlik döndürünce.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import kat from "@/app/_premium/hd-education/egitimKatalog.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { PRIV_CATEGORIES, PRIV_CATEGORY_LABEL, PRIV_UUID_RE, type PrivCategory } from "@/lib/human-design/education/private/privateContract";
import { ErrorView, LoadingView, NotFoundView, Shell, useAccess } from "../../_ui/Shell";
import { ConsentForm } from "../../_ui/ConsentForm";
import { NewAnalysisButton } from "../../_ui/NewAnalysisEntry";
import { fmtDay, privCall } from "../../_ui/privApi";
import { hdAuthorityTr, hdProfileTr, hdTypeTr } from "../../_ui/labels";

type ChartRow = { id: string; client_id: string | null; client_name: string | null; birth_date: string | null; type_code: string | null; profile_code: string | null;
  authority_code: string | null; source: string | null; created_at: string };
type Consent = { id: string; consenterName: string; displayScope: "anonim" | "acik_isim"; includeBirthData: boolean; givenOn: string; method: string;
  withdrawnAt: string | null; evidence: { mime: string } | null; textVersion: string };
type Status = { eligible: boolean; reason: "duplicate" | "not_computed" | "no_client" | null; itemId: string | null; hdClientId: string | null; consents: Consent[] };
const REASON: Record<string, string> = {
  duplicate: "Bu harita zaten eğitim arşivinizde. Aynı harita ikinci kez eklenemez.",
  not_computed: "Bu kayıt hesaplanmış bir harita değil. Yalnız hesaplanmış kayıtlı haritalar eklenebilir.",
  no_client: "Bu harita bir danışana bağlı değil. Danışan izni bağlanamadığı için eklenemez.",
};

function AddFlow() {
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
  const [newConsent, setNewConsent] = useState(false);
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
    if (r.ok) { setStatus(r.body.status); setStatusErr(null); } else { setStatus(null); setStatusErr(r.notFound ? "Harita bulunamadı veya bu harita size ait değil." : r.error); }
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
  const validConsents = (status?.consents ?? []).filter((k) => !k.withdrawnAt && !!k.evidence);
  const consent = validConsents.find((k) => k.id === consentId) ?? null;
  const shownCharts = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("tr-TR");
    return (charts ?? []).filter((c) => !t || (c.client_name ?? "").toLocaleLowerCase("tr-TR").includes(t));
  }, [charts, q]);

  if (access === "loading") return <LoadingView />;
  if (access === "denied") return <NotFoundView />;
  if (access === "error" || loadErr) return <ErrorView message="Kayıtlı haritalarınız yüklenemedi." />;
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
    if (!r.ok && r.code === "DUPLICATE") { setErr({ text: "Bu harita zaten eğitim arşivinizde; ikinci kayıt oluşturulmadı.", dup: true }); void loadStatus(chartId); return; }
    setErr({ text: r.ok ? "Sunucu kayıt kimliği döndürmedi; kayıt oluşturulmadı." : r.error });
  }

  const steps = ["Kaynak harita", "Danışan izni", "Eğitim bilgileri"];
  const canStep3 = !!consent;
  const titleOk = f.title.trim().length >= 1 && f.title.trim().length <= 160;
  const aliasOk = f.alias.trim().length >= 1 && f.alias.trim().length <= 80;

  if (done) {
    return (
      <Shell>
        <section className={base.panel} data-edu-add-success>
          <div className={`${oz.result} ${oz.resultOk}`} role="status"><span><b>Harita eğitim arşivinize eklendi.</b> Kayıt yalnız size ve sistem sahibine görünür.</span></div>
          <div className={base.actions}>
            <Link className={`${base.btn} ${base.ghost} ${oz.touch}`} href="/human-design/egitim-merkezi/ozel">Özel arşivime dön</Link>
            <Link className={`${base.btn} ${base.save} ${oz.touch}`} href={`/human-design/egitim-merkezi/ozel/${done}`} data-edu-open-new>Haritayı aç</Link>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <Link className={kat.back} href="/human-design/egitim-merkezi/ozel">← Bana Özel Eğitim Haritaları</Link>
      <header className={kat.dHead}>
        <div>
          <p className={base.eyebrow}>EĞİTİM ARŞİVİNE EKLE</p>
          <h1 className={kat.dTitle}>Danışan haritasını eğitim örneği yap</h1>
          <p className={kat.sub2}>Kaynak: danışanın kayıtlı haritası · yeniden hesaplama ve kopya yok</p>
        </div>
      </header>
      <ol className={oz.steps} aria-label="Adımlar">
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
              <h3>Mevcut haritayı ekle</h3>
              <p>Danışanınızın kayıtlı, hesaplanmış haritasını aşağıdan seçin. Hazır hesap kullanılır; yeni hesaplama yapılmaz.</p>
            </div>
            <div className={oz.method} data-edu-method="new">
              <h3>Yeni Human Design analizi yap</h3>
              <p>Yaşam Sistemi&apos;nin gerçek analiz ekranında danışanı ve doğum bilgilerini girin; harita normal şekilde hesaplanıp kaydedilir. Açılan haritada
                “Eğitim Arşivime Ekle”ye basınca bu adımlara dönersiniz.</p>
              <NewAnalysisButton />
            </div>
          </div>
          <h2 className={base.h2} style={{ marginTop: 16 }}>Kaynak Human Design haritasını seçin</h2>
          <p className={base.lead}>Yalnız sizin kayıtlı, hesaplanmış haritalarınız listelenir. Hazır hesap kullanılır; ücretli çağrı yapılmaz.</p>
          {charts.length > 6 ? <input className={`${base.input} ${oz.search}`} type="search" placeholder="Danışan adına göre ara" aria-label="Danışan adına göre ara" value={q} onChange={(e) => setQ(e.target.value)} /> : null}
          {!charts.length ? <p className={base.empty} data-edu-nocharts>Kayıtlı hesaplanmış haritanız yok. Yukarıdaki “Yeni Human Design Analizi” ile danışan haritası oluşturun.</p> : (
            <ul className={oz.pickList} role="radiogroup" aria-label="Kayıtlı haritalar">
              {shownCharts.map((c) => (
                <li key={c.id}>
                  <label className={`${oz.pick} ${chartId === c.id ? oz.pickOn : ""}`} data-edu-chart={c.id}>
                    <input type="radio" name="edu-chart" checked={chartId === c.id} onChange={() => { setChartId(c.id); setConsentId(null); setNewConsent(false); setStatus(null); setStatusErr(null); void loadStatus(c.id); }} />
                    <span><b>{c.client_name ?? "Danışan adı yok"}</b>
                      <small>{[hdTypeTr(c.type_code), hdProfileTr(c.profile_code), hdAuthorityTr(c.authority_code)].filter(Boolean).join(" · ")} · Kayıt {fmtDay(c.created_at)}</small></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {chartId && !status && !statusErr ? <p className={base.empty} aria-live="polite">Uygunluk denetleniyor…</p> : null}
          {statusErr ? <p className={base.err} role="alert">{statusErr}</p> : null}
          {status && !status.eligible ? (
            <div className={`${oz.result} ${oz.resultWarn}`} role="alert" data-edu-ineligible={status.reason ?? ""}>
              <span>{REASON[status.reason ?? ""] ?? "Bu harita eklenemez."}{status.reason === "duplicate" && status.itemId ? <> <Link className={base.ext} href={`/human-design/egitim-merkezi/ozel/${status.itemId}`}>Mevcut kaydı aç</Link></> : null}</span>
            </div>
          ) : null}
          <div className={base.actions}>
            <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} disabled={!status?.eligible} onClick={() => setStep(2)} data-edu-next="1">Devam et</button>
          </div>
        </section>
      ) : null}

      {step === 2 && status?.hdClientId ? (
        <section className={base.panel} data-edu-step="2">
          <h2 className={base.h2}>Danışanın eğitim iznini doğrulayın</h2>
          <p className={base.lead}>{chart?.client_name ?? "Seçili danışan"} için kayıtlı, geri çekilmemiş ve kanıtlı izin gerekir.</p>
          {validConsents.length ? (
            <ul className={oz.pickList} role="radiogroup" aria-label="Geçerli izinler">
              {validConsents.map((k) => (
                <li key={k.id}>
                  <label className={`${oz.pick} ${consentId === k.id ? oz.pickOn : ""}`} data-edu-consent={k.id}>
                    <input type="radio" name="edu-consent" checked={consentId === k.id} onChange={() => setConsentId(k.id)} />
                    <span><b>{k.displayScope === "acik_isim" ? "Açık isim izni" : "Anonim (takma ad) izni"} · {fmtDay(k.givenOn)}</b>
                      <small>İzni veren: {k.consenterName} · {k.includeBirthData ? "doğum bilgisi gösterilebilir" : "doğum bilgisi gösterilmez"} · metin {k.textVersion.replace("hd-egitim-izin-", "")}</small></span>
                  </label>
                </li>
              ))}
            </ul>
          ) : <div className={`${oz.result} ${oz.resultWarn}`} data-edu-noconsent><span>Bu danışan için geçerli eğitim izni yok. İzin olmadan kayıt oluşturulamaz.</span></div>}
          {(status.consents.length - validConsents.length) > 0 ? <p className={oz.hint}>{status.consents.length - validConsents.length} geri çekilmiş / kanıtı eksik izin listelenmedi.</p> : null}
          {newConsent ? (
            <ConsentForm hdClientId={status.hdClientId} clientLabel={chart?.client_name ?? "Seçili danışan"} onCancel={() => setNewConsent(false)}
              onSaved={(id) => { setNewConsent(false); void loadStatus(chartId as string).then(() => setConsentId(id)); }} />
          ) : (
            <div className={base.actions}>
              <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setNewConsent(true)} data-edu-new-consent>Yeni izin kaydet</button>
            </div>
          )}
          <div className={base.actions}>
            <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setStep(1)}>Geri</button>
            <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} disabled={!canStep3} onClick={() => setStep(3)} data-edu-next="2">Devam et</button>
          </div>
        </section>
      ) : null}

      {step === 3 && consent ? (
        <section className={base.panel} data-edu-step="3">
          <h2 className={base.h2}>Eğitim bilgileri</h2>
          <p className={base.lead}>Yalnız eğitimde görünen bilgiler. Doğum verisi ve hesap buradan değiştirilemez.</p>
          <div className={oz.form2}>
            <label className={oz.field}>Eğitim başlığı
              <input value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} data-edu-title />
            </label>
            <label className={oz.field}>Takma ad (eğitimde görünen)
              <input value={f.alias} maxLength={80} onChange={(e) => setF({ ...f, alias: e.target.value })} placeholder="ör. Örnek Danışan M." data-edu-alias />
            </label>
            <label className={oz.field}>Kategori
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as PrivCategory })} data-edu-category>
                {PRIV_CATEGORIES.map((c) => <option key={c} value={c}>{PRIV_CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
            <label className={oz.field}>Gösterim
              <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as "alias" | "named" })} data-edu-mode>
                <option value="alias">Takma ad (varsayılan)</option>
                <option value="named" disabled={consent.displayScope !== "acik_isim"}>Açık isim{consent.displayScope !== "acik_isim" ? " — izin kapsamında yok" : ""}</option>
              </select>
            </label>
            <label className={`${oz.field} ${oz.wide}`}>Kısa açıklama
              <textarea value={f.description} maxLength={2000} rows={2} onChange={(e) => setF({ ...f, description: e.target.value })} data-edu-desc />
            </label>
            <label className={`${oz.field} ${oz.wide}`}>Anlatım notları (yalnız siz ve sistem sahibi)
              <textarea value={f.notes} maxLength={20000} rows={5} onChange={(e) => setF({ ...f, notes: e.target.value })} data-edu-notes />
            </label>
          </div>
          {err ? (
            <div className={`${oz.result} ${err.dup ? oz.resultWarn : oz.resultBad}`} role="alert" data-edu-error>
              <span>{err.text}{err.dup && status?.itemId ? <> <Link className={base.ext} href={`/human-design/egitim-merkezi/ozel/${status.itemId}`}>Mevcut kaydı aç</Link></> : null}</span>
            </div>
          ) : null}
          <div className={base.actions}>
            <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setStep(2)} disabled={busy}>Geri</button>
            <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} onClick={submit} disabled={busy || !titleOk || !aliasOk} data-edu-submit>
              {busy ? "Ekleniyor…" : "Eğitim Arşivime Ekle"}
            </button>
          </div>
        </section>
      ) : null}
      {step > 1 && !status ? <p className={base.err} role="alert">Kaynak harita bilgisi kayboldu. <button type="button" className={base.linkBtn} onClick={() => router.refresh()}>Yenile</button></p> : null}
    </Shell>
  );
}

export default function AddPage() {
  return <Suspense fallback={<LoadingView />}><AddFlow /></Suspense>;
}
