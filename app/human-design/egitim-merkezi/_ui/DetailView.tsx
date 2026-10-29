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
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import kat from "@/app/_premium/hd-education/egitimKatalog.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { HdComputedChartView } from "@/app/human-design/kayitli-haritalar/components/HdComputedChartView";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import { PRIV_CATEGORY_LABEL, PRIV_FICTIONAL_DECLARATION_TEXT, PRIV_KIND_LABEL, PRIV_METHOD_LABEL, type PrivItemDetail } from "@/lib/human-design/education/private/privateContract";
import { ErrorView, LoadingView, NotFoundView, Shell } from "./Shell";
import { DeleteFlow, TwoStepConfirm } from "./DeleteFlow";
import { fmtDay, privCall, privDownload, type Side } from "./privApi";

export function PrivateDetailView({ side, id, listHref, editHref }: { side: Side; id: string; listHref: string; editHref: string }) {
  const router = useRouter();
  const [d, setD] = useState<PrivItemDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [modal, setModal] = useState<"delete" | "withdraw" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const base1 = side === "owner" ? "/api/admin/hd/education/private" : "/api/hd/education/private";

  const sp = useSearchParams();
  const flash = sp.get("kaydedildi") === "1" ? "Değişiklikler kaydedildi." : null;
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
  if (state === "error" || !d) return <ErrorView message="Harita şu anda yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin." onRetry={() => { setState("loading"); void load(); }} />;
  const ok = d.state === "ok" && !!d.chart;
  const fictional = d.kind === "kurgusal";
  const k = d.consent;

  return (
    <Shell>
      <Link className={kat.back} href={listHref}>← {side === "owner" ? "Eğitmen özel eğitim arşivleri" : "Bana Özel Eğitim Haritaları"}</Link>
      <header className={kat.dHead}>
        <div>
          <span className={kat.cKat}>{side === "owner" ? `${d.trainer.name} · ` : "Bana özel · "}{PRIV_CATEGORY_LABEL[d.item.category] ?? d.item.category}</span>
          <h1 className={kat.dTitle} data-edu-detail-title>{d.item.title}</h1>
          <p className={kat.sub2}>
            <span className={`${base.tag} ${fictional ? oz.kindFic : oz.kindReal}`} data-edu-kind={d.kind}>{PRIV_KIND_LABEL[d.kind]}</span>{" "}
            {d.displayName}{fictional ? " (kurgusal kişi)" : d.item.displayMode === "named" ? " (açık isim izniyle)" : " (takma ad)"}
          </p>
        </div>
        <div className={oz.dAct}>
          <span className={`${base.tag} ${ok ? base.tOk : base.tBad} ${base.big}`} data-edu-detail-state={d.state}>{ok ? "Erişime açık" : "Erişim kapalı"}</span>
          {ok && side === "trainer" ? <Link className={`${base.btn} ${base.save} ${oz.touch}`} href={`/human-design/egitim-merkezi/ozel/${encodeURIComponent(d.item.id)}/calisma-alani`} data-edu-workspace>Çalışma alanını aç</Link> : null}
          {ok ? <Link className={`${base.btn} ${base.ghost} ${oz.touch}`} href={editHref} data-edu-edit>Düzenle</Link> : null}
          <button type="button" className={`${base.btn} ${base.danger} ${oz.touch}`} onClick={() => setModal("delete")} data-edu-delete>Kaldır</button>
        </div>
      </header>
      {msg ?? flash ? <p className={base.msg} role="status" data-edu-msg>{msg ?? flash}</p> : null}

      {ok && d.chart ? (
        <section className={`${base.panel} ${kat.chartPanel} ${oz.chartStage}`} aria-label="BodyGraph ve harita bilgileri" data-edu-bodygraph>
          <HdComputedChartView result={d.chart.view as unknown as HdComputedChart} roxyRender={d.chart.render}
            subject={{ ...d.chart.subject, utcDateTime: null, coordinates: null }} showProviderNote={false} />
        </section>
      ) : (
        <section className={base.panel}>
          <div className={`${oz.result} ${oz.resultBad}`} role="alert" data-edu-closed>
            <span>Bu kaydın haritası gösterilmiyor: {k?.withdrawnAt ? `danışan izni ${fmtDay(k.withdrawnAt)} tarihinde geri çekildi` : d.state === "source_changed" ? "kaynak harita değişti" : "izin kaydı / kanıtı doğrulanamadı"}. Kayıt yalnız kaldırılabilir.</span>
          </div>
        </section>
      )}

      <div className={kat.below}>
        <section className={base.panel} aria-labelledby="edu-notes">
          <h2 id="edu-notes" className={base.h2}>Anlatım notları</h2>
          {d.item.description ? <p className={base.lead}>{d.item.description}</p> : null}
          <p className={oz.notes} data-edu-notes-view>{d.item.teachingNotes || "Henüz anlatım notu yok."}</p>
        </section>
        {!fictional && !k ? (
          <section className={base.panel} aria-labelledby="edu-consent" data-edu-consent-missing>
            <h2 id="edu-consent" className={base.h2}>İzin durumu</h2>
            <dl className={base.dl}>
              <dt>Tür</dt><dd>{PRIV_KIND_LABEL.gercek}</dd>
              <dt>Danışan izni</dt><dd>İzin kaydı bulunamadı — harita gösterilmez; kayıt yalnız kaldırılabilir.</dd>
            </dl>
          </section>
        ) : fictional || !k ? (
          <section className={base.panel} aria-labelledby="edu-consent" data-edu-fictional-info>
            <h2 id="edu-consent" className={base.h2}>Kayıt türü</h2>
            <dl className={base.dl}>
              <dt>Tür</dt><dd>{PRIV_KIND_LABEL.kurgusal}</dd>
              <dt>Danışan izni</dt><dd>Gerekmez — gerçek kişi bilgisi içermez</dd>
              <dt>Eğitmen beyanı</dt><dd>{PRIV_FICTIONAL_DECLARATION_TEXT}</dd>
              <dt>Beyan tarihi</dt><dd>{d.fictional ? fmtDay(d.fictional.declaredAt) : "—"}</dd>
            </dl>
          </section>
        ) : (
          <section className={base.panel} aria-labelledby="edu-consent">
            <h2 id="edu-consent" className={base.h2}>İzin durumu</h2>
            <dl className={base.dl}>
              <dt>Kapsam</dt><dd>{k.displayScope === "acik_isim" ? "Açık isim" : "Anonim · takma ad"}</dd>
              <dt>Doğum bilgisi</dt><dd>{k.includeBirthData ? "Gösterilebilir" : "Gösterilmiyor (izin kapsamı dışında)"}</dd>
              <dt>{k.method === "egitmen_beyani" ? "Beyan tarihi" : "İzin tarihi"}</dt><dd>{fmtDay(k.givenOn)}</dd>
              <dt>Yöntem</dt><dd>{PRIV_METHOD_LABEL[k.method] ?? k.method}</dd>
              <dt>Metin sürümü</dt><dd>{k.textVersion}</dd>
              <dt>Durum</dt><dd data-edu-consent-state>{k.withdrawnAt ? `Geri çekildi (${fmtDay(k.withdrawnAt)})` : "Geçerli"}</dd>
            </dl>
            <div className={base.actions}>
              {k.method !== "egitmen_beyani" ? (
                <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} data-edu-evidence-dl
                  onClick={async () => { const r = await privDownload(side, `${base1}/consents/${k.id}/evidence`, "izin-kaniti"); setMsg(r.ok ? "İzin kopyası indirildi." : r.error ?? null); }}>İzin kopyası</button>
              ) : null}
              {!k.withdrawnAt ? <button type="button" className={`${base.btn} ${base.danger} ${oz.touch}`} onClick={() => setModal("withdraw")} data-edu-withdraw>İzni geri çek</button> : null}
            </div>
          </section>
        )}
      </div>
      <section className={`${base.panel} ${kat.lowBand}`} aria-label="Kullanım bilgisi">
        {fictional
          ? <p>Kurgusal eğitim haritası: tamamen kurgusal doğum bilgisiyle Yaşam Sistemi&apos;nin Human Design motoruyla hesaplandı; danışan kaydı oluşturulmadı. Açılışta yeniden hesaplama yapılmaz.</p>
          : <p>Bu kayıt danışanın kayıtlı haritasına bağlıdır; açılışta yeniden hesaplama yapılmaz ve kopya tutulmaz. Kaynak harita değişirse kayıt otomatik olarak erişime kapanır.</p>}
        <p>Kayıt yalnız {side === "owner" ? "ekleyen eğitmene" : "size"} ve sistem sahibine görünür; başka eğitmenlerle paylaşılmaz, yayımlanmaz.</p>
      </section>

      {modal === "delete" ? (
        <DeleteFlow side={side} endpoint={`${base1}/items/delete`} items={[{ id: d.item.id, title: d.item.title }]} onCancel={() => setModal(null)}
          onDone={() => router.push(`${listHref}?kaldirildi=1`)} />
      ) : null}
      {modal === "withdraw" ? (
        <TwoStepConfirm title="Danışan izni geri çekilsin mi?" confirmLabel="İzni geri çek" onCancel={() => setModal(null)}
          body1={<p>Bu izne bağlı tüm eğitim kayıtları <b>anında</b> erişime kapanır; eski bağlantılar çalışmaz. Geri çekme geri alınamaz.</p>}
          body2={<p>İzin, <b>{side === "owner" ? "sistem sahibi kararı" : "danışan talebi"}</b> olarak geri çekilecek. Onaylıyor musunuz?</p>}
          onConfirm={async () => {
            if (!k) return "Bu kayıtta danışan izni yok.";
            const r = await privCall(side, `${base1}/consents/${k.id}/withdraw`, { method: "POST", body: { channel: side === "owner" ? "owner_karari" : "danisan_talebi", confirm: true } });
            if (!r.ok) return r.error;
            setModal(null); setMsg("İzin geri çekildi; kayıt erişime kapandı.");
            if (side === "trainer") router.push(`${listHref}?izin=geri`); else void load();
            return null;
          }} />
      ) : null}
    </Shell>
  );
}

