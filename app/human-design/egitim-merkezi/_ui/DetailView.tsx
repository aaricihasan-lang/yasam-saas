"use client";

/**
 * F · Özel eğitim haritası ayrıntısı (FAZ 7 — gerçek BodyGraph).
 * BodyGraph YENİDEN ÇİZİLMEZ: kişisel kayıtlı harita ekranındaki onaylı bileşen (HdComputedChartView → premium BodyGraph,
 * 9 merkez / 64 kapı / 36 kanal / Personality–Design aktivasyonu / yarım kanal) aynen kullanılır. Veri, sunucunun ALLOWLIST
 * görünümüdür (doğum anı / koordinat / boylam / sağlayıcı metni yok); çizim durumu tam veriyle birebir aynıdır (test edildi).
 * Künye: takma ad (ya da açık isim izniyle güncel ad); doğum bilgisi yalnız izin kapsamındaysa sunucudan gelir.
 * Erişimi kapalı kayıt (izin geri çekildi / kaynak değişti / kanıt bozuk) için sunucu 404 döner → tek tip "bulunamadı".
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import kat from "@/app/_premium/hd-education/egitimKatalog.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { HdComputedChartView } from "@/app/human-design/kayitli-haritalar/components/HdComputedChartView";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import { PRIV_CATEGORY_LABEL, PRIV_FICTIONAL_DECLARATION_TEXT, PRIV_KIND_LABEL, PRIV_METHOD_LABEL, type PrivItemDetail } from "@/lib/human-design/education/private/privateContract";
import { ErrorView, LoadingView, NotFoundView, Shell } from "./Shell";
import { DeleteFlow, TwoStepConfirm } from "./DeleteFlow";
import { fmtDay, privCall, privDownload, useEduApiError, type Side } from "./privApi";
import { useEduLabel } from "./labels";

export function PrivateDetailView({ side, id, listHref, editHref }: { side: Side; id: string; listHref: string; editHref: string }) {
  const t = useTranslations("hd.education");
  const label = useEduLabel();
  const apiErr = useEduApiError();
  const router = useRouter();
  const [d, setD] = useState<PrivItemDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [modal, setModal] = useState<"delete" | "withdraw" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const base1 = side === "owner" ? "/api/admin/hd/education/private" : "/api/hd/education/private";

  const sp = useSearchParams();
  const flash = sp.get("kaydedildi") === "1" ? t("detail.flashSaved") : null;
  const fetchItem = useCallback(() => privCall<{ item: PrivItemDetail }>(side, `${base1}/items/${encodeURIComponent(id)}`), [side, base1, id]);
  const apply = useCallback((r: Awaited<ReturnType<typeof fetchItem>>) => {
    if (r.ok) { setD(r.body.item); setState("ok"); } else setState(r.notFound ? "notfound" : "error");
  }, []);
  const load = useCallback(async () => apply(await fetchItem()), [apply, fetchItem]);
  useEffect(() => {
    let live = true;
    void fetchItem().then((r) => { if (live) apply(r); });
    return () => { live = false; };
  }, [fetchItem, apply]);

  if (state === "loading") return <LoadingView />;
  if (state === "notfound") return <NotFoundView home={side === "owner" ? "/admin" : "/human-design"} />;
  if (state === "error" || !d) return <ErrorView message={t("ws.loadError")} onRetry={() => { setState("loading"); void load(); }} />;
  const ok = d.state === "ok" && !!d.chart;
  const fictional = d.kind === "kurgusal";
  const k = d.consent;

  return (
    <Shell>
      <Link className={kat.back} href={listHref}>← {side === "owner" ? "Eğitmen özel eğitim arşivleri" : t("hub.privateTitle")}</Link>
      <header className={kat.dHead}>
        <div>
          <span className={kat.cKat}>{side === "owner" ? `${d.trainer.name} · ` : t("detail.privatePrefix")}{label("privCategory", d.item.category, PRIV_CATEGORY_LABEL[d.item.category] ?? d.item.category)}</span>
          <h1 className={kat.dTitle} data-edu-detail-title>{d.item.title}</h1>
          <p className={kat.sub2}>
            <span className={`${base.tag} ${fictional ? oz.kindFic : oz.kindReal}`} data-edu-kind={d.kind}>{label("privKind", d.kind, PRIV_KIND_LABEL[d.kind])}</span>{" "}
            {d.displayName}{fictional ? t("detail.fictionalSuffix") : d.item.displayMode === "named" ? t("ws.namedSuffix") : t("ws.aliasSuffix")}
          </p>
        </div>
        <div className={oz.dAct}>
          <span className={`${base.tag} ${ok ? base.tOk : base.tBad} ${base.big}`} data-edu-detail-state={d.state}>{ok ? t("detail.open") : t("detail.closedTag")}</span>
          {ok && side === "trainer" ? <Link className={`${base.btn} ${base.save} ${oz.touch}`} href={`/human-design/egitim-merkezi/ozel/${encodeURIComponent(d.item.id)}/calisma-alani`} data-edu-workspace>{t("detail.openWorkspace")}</Link> : null}
          {ok ? <Link className={`${base.btn} ${base.ghost} ${oz.touch}`} href={editHref} data-edu-edit>{t("priv.edit")}</Link> : null}
          <button type="button" className={`${base.btn} ${base.danger} ${oz.touch}`} onClick={() => setModal("delete")} data-edu-delete>{t("priv.remove")}</button>
        </div>
      </header>
      {msg ?? flash ? <p className={base.msg} role="status" data-edu-msg>{msg ?? flash}</p> : null}

      {ok && d.chart ? (
        <section className={`${base.panel} ${kat.chartPanel} ${oz.chartStage}`} aria-label={t("detail.chartAria")} data-edu-bodygraph>
          <HdComputedChartView result={d.chart.view as unknown as HdComputedChart} roxyRender={d.chart.render}
            subject={{ ...d.chart.subject, utcDateTime: null, coordinates: null }} showProviderNote={false} />
        </section>
      ) : (
        <section className={base.panel}>
          <div className={`${oz.result} ${oz.resultBad}`} role="alert" data-edu-closed>
            <span>{t("detail.closedBody", { reason: k?.withdrawnAt ? t("detail.reasonWithdrawn", { date: fmtDay(k.withdrawnAt) }) : d.state === "source_changed" ? t("detail.reasonSourceChanged") : t("detail.reasonInvalid") })}</span>
          </div>
        </section>
      )}

      <div className={kat.below}>
        <section className={base.panel} aria-labelledby="edu-notes">
          <h2 id="edu-notes" className={base.h2}>{t("detail.notesTitle")}</h2>
          {d.item.description ? <p className={base.lead}>{d.item.description}</p> : null}
          <p className={oz.notes} data-edu-notes-view>{d.item.teachingNotes || t("detail.noNotes")}</p>
        </section>
        {!fictional && !k ? (
          <section className={base.panel} aria-labelledby="edu-consent" data-edu-consent-missing>
            <h2 id="edu-consent" className={base.h2}>{t("detail.consentTitle")}</h2>
            <dl className={base.dl}>
              <dt>{t("detail.kind")}</dt><dd>{label("privKind", "gercek", PRIV_KIND_LABEL.gercek)}</dd>
              <dt>{t("detail.clientConsent")}</dt><dd>{t("detail.consentMissing")}</dd>
            </dl>
          </section>
        ) : fictional || !k ? (
          <section className={base.panel} aria-labelledby="edu-consent" data-edu-fictional-info>
            <h2 id="edu-consent" className={base.h2}>{t("detail.recordKind")}</h2>
            <dl className={base.dl}>
              <dt>{t("detail.kind")}</dt><dd>{label("privKind", "kurgusal", PRIV_KIND_LABEL.kurgusal)}</dd>
              <dt>{t("detail.clientConsent")}</dt><dd>{t("detail.noConsentNeeded")}</dd>
              <dt>{t("detail.trainerDeclaration")}</dt><dd>{PRIV_FICTIONAL_DECLARATION_TEXT}</dd>
              <dt>{t("detail.declaredOn")}</dt><dd>{d.fictional ? fmtDay(d.fictional.declaredAt) : "—"}</dd>
            </dl>
          </section>
        ) : (
          <section className={base.panel} aria-labelledby="edu-consent">
            <h2 id="edu-consent" className={base.h2}>{t("detail.consentTitle")}</h2>
            <dl className={base.dl}>
              <dt>{t("detail.scope")}</dt><dd>{k.displayScope === "acik_isim" ? t("detail.scopeNamed") : t("detail.scopeAnon")}</dd>
              <dt>{t("detail.birthData")}</dt><dd>{k.includeBirthData ? t("detail.birthShown") : t("detail.birthHidden")}</dd>
              <dt>{k.method === "egitmen_beyani" ? t("detail.declaredOn") : t("detail.consentDate")}</dt><dd>{fmtDay(k.givenOn)}</dd>
              <dt>{t("detail.method")}</dt><dd>{label("privMethod", k.method, PRIV_METHOD_LABEL[k.method] ?? k.method)}</dd>
              <dt>{t("detail.textVersion")}</dt><dd>{k.textVersion}</dd>
              <dt>{t("detail.status")}</dt><dd data-edu-consent-state>{k.withdrawnAt ? t("detail.withdrawnOn", { date: fmtDay(k.withdrawnAt) }) : t("detail.valid")}</dd>
            </dl>
            <div className={base.actions}>
              {k.method !== "egitmen_beyani" ? (
                <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} data-edu-evidence-dl
                  onClick={async () => { const r = await privDownload(side, `${base1}/consents/${k.id}/evidence`, "izin-kaniti"); setMsg(r.ok ? t("detail.evidenceDownloaded") : apiErr({ ...r, download: true })); }}>{t("detail.evidenceCopy")}</button>
              ) : null}
              {!k.withdrawnAt ? <button type="button" className={`${base.btn} ${base.danger} ${oz.touch}`} onClick={() => setModal("withdraw")} data-edu-withdraw>{t("detail.withdraw")}</button> : null}
            </div>
          </section>
        )}
      </div>
      <section className={`${base.panel} ${kat.lowBand}`} aria-label={t("detail.usageAria")}>
        {fictional
          ? <p>{t("detail.usageFictional")}</p>
          : <p>{t("detail.usageReal")}</p>}
        <p>{side === "owner" ? "Kayıt yalnız ekleyen eğitmene ve sistem sahibine görünür; başka eğitmenlerle paylaşılmaz, yayımlanmaz." : t("detail.visibility")}</p>
      </section>

      {modal === "delete" ? (
        <DeleteFlow side={side} endpoint={`${base1}/items/delete`} items={[{ id: d.item.id, title: d.item.title }]} onCancel={() => setModal(null)}
          onDone={() => router.push(`${listHref}?kaldirildi=1`)} />
      ) : null}
      {modal === "withdraw" ? (
        <TwoStepConfirm title={t("detail.withdrawTitle")} confirmLabel={t("detail.withdraw")} onCancel={() => setModal(null)}
          body1={<p>{t.rich("detail.withdrawBody1", { b: (c) => <b>{c}</b> })}</p>}
          body2={side === "owner" ? <p>İzin, <b>sistem sahibi kararı</b> olarak geri çekilecek. Onaylıyor musunuz?</p> : <p>{t.rich("detail.withdrawBody2", { b: (c) => <b>{c}</b> })}</p>}
          onConfirm={async () => {
            if (!k) return t("detail.noConsentOnRecord");
            const r = await privCall(side, `${base1}/consents/${k.id}/withdraw`, { method: "POST", body: { channel: side === "owner" ? "owner_karari" : "danisan_talebi", confirm: true } });
            if (!r.ok) return apiErr(r);
            setModal(null); setMsg(t("detail.withdrawnMsg"));
            if (side === "trainer") router.push(`${listHref}?izin=geri`); else void load();
            return null;
          }} />
      ) : null}
    </Shell>
  );
}

