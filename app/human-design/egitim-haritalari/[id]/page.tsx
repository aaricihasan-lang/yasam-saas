"use client";

/**
 * Hazır Eğitim Haritaları — EĞİTMEN KİŞİ AYRINTISI (FAZ 2-B3). Owner görsel PASS prototipi: detayView; prototipteki temsilî
 * BodyGraph yer tutucusu YERİNE mevcut onaylı bileşen (HdComputedChartView — kişisel harita ekranıyla aynı; çizim DEĞİŞMEZ).
 * Veri: owner'ın doğruladığı KAYITLI snapshot (sunucu: getPublishedDetail). Açılışta sağlayıcı çağrısı / yeniden hesap YOK;
 * danışan kaydı, Danışan Yolculuğu veya kişisel HD analizi YAZILMAZ. Yayımlı değil / kaldırılmış / hatalı kimlik /
 * yetkisiz → tek tip "Sayfa bulunamadı".
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/egitimKatalog.module.css";
import { HdComputedChartView } from "@/app/human-design/kayitli-haritalar/components/HdComputedChartView";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import { EDU_CATEGORY_LABEL, type EduCatalogDetail } from "@/lib/human-design/education/educationContract";
import { catalogGet, fmtCalendarDate } from "../catalogApi";
import { EduLoading, EduNotFound, EduShell } from "../EduShell";

const ROLE_LABEL: Record<string, string> = { birth_time: "Doğum saati belgesi", date_place: "Tarih / yer", utc_standard: "Saat standardı kanıtı", extra: "Ek kaynak" };
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");
function fmtOffset(sec: number | null): string {
  if (sec === null) return "—";
  const a = Math.abs(sec);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${sec < 0 ? "−" : "+"}${p(Math.floor(a / 3600))}:${p(Math.floor((a % 3600) / 60))}:${p(a % 60)}`;
}

export default function EducationChartDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const [d, setD] = useState<EduCatalogDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");

  useEffect(() => {
    let live = true;
    void catalogGet(`/api/hd/education/charts/${encodeURIComponent(id)}`, (b) => (b.item && typeof b.item === "object" ? (b.item as EduCatalogDetail) : undefined)).then((r) => {
      if (!live) return;
      if (r.ok) { setD(r.data); setState("ok"); } else setState(r.notFound ? "notfound" : "error");
    });
    return () => { live = false; };
  }, [id]);

  if (state === "loading") return <EduLoading />;
  if (state === "notfound") return <EduNotFound />;
  if (state === "error" || !d) {
    return <EduShell><p className={base.err} role="alert">Harita şu anda yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin.</p></EduShell>;
  }

  return (
    <EduShell>
      <Link className={css.back} href="/human-design/egitim-haritalari">← Hazır Eğitim Haritaları</Link>
      <header className={css.dHead} aria-labelledby="edu-detail-title">
        <div>
          <span className={css.cKat}>{EDU_CATEGORY_LABEL[d.category] ?? d.category}</span>
          <h1 id="edu-detail-title" className={css.dTitle}>{d.displayName}</h1>
          <p className={css.sub2}>{fmtCalendarDate(d.birthDate)} · {d.documentedLocalTime} (belgedeki yerel saat) · {d.birthPlace}</p>
        </div>
        <span className={css.cTags}>
          <span className={`${base.tag} ${base.tOk}`}>Belgeli doğum saati</span>
          <span className={`${base.tag} ${base.tOk}`}>UTC doğrulandı</span>
        </span>
      </header>

      <section className={`${base.panel} ${css.chartPanel}`} aria-label="BodyGraph ve harita bilgileri">
        <HdComputedChartView result={d.chart.result as unknown as HdComputedChart} roxyRender={d.chart.render} showProviderNote={false} />
      </section>

      <div className={css.below}>
        <section className={base.panel} aria-labelledby="edu-src">
          <h2 id="edu-src" className={base.h2}>Doğum verisi ve kaynaklar</h2>
          <dl className={base.dl} style={{ marginTop: 10 }}>
            <dt>Belge ifadesi</dt><dd className={base.quote}>{d.documentQuote}</dd>
            {d.calendarNote ? (<><dt>Takvim notu</dt><dd>{d.calendarNote}</dd></>) : null}
          </dl>
          <ul className={base.srcList} style={{ marginTop: 12 }}>
            {d.sources.length ? d.sources.map((s, i) => (
              <li key={i}>
                <b>{ROLE_LABEL[s.role] ?? "Kaynak"}</b>
                <a className={base.ext} href={s.url} target="_blank" rel="noopener noreferrer">{s.institution ?? s.documentTitle ?? "Belgeyi görüntüle"}</a>
                <small>{[s.documentTitle && s.institution ? s.documentTitle : null, s.archiveRef, s.documentDate, s.primarySecondary ? `${s.primarySecondary} kaynak` : null, s.timeExplicit ? "saat belgede açık" : null, s.license ? `lisans: ${s.license}` : null].filter(Boolean).join(" · ")}</small>
              </li>
            )) : <li>Kaynak kaydı yok.</li>}
          </ul>
        </section>
        <section className={base.panel} aria-labelledby="edu-utc">
          <h2 id="edu-utc" className={base.h2}>Saat ve UTC</h2>
          <dl className={base.dl} style={{ marginTop: 10 }}>
            <dt>Belgedeki yerel saat</dt><dd>{d.documentedLocalTime}</dd>
            <dt>Saat standardı</dt><dd>{d.timeStandard ?? "—"}</dd>
            <dt>Ofset</dt><dd>{fmtOffset(d.utcOffsetSeconds)}</dd>
            <dt>UTC anı</dt><dd>{d.birthUtc}</dd>
            {d.latitude !== null && d.longitude !== null ? (<><dt>Koordinat</dt><dd>{d.latitude}, {d.longitude}</dd></>) : null}
            <dt>Metodoloji</dt><dd>{d.utcMethodology}</dd>
          </dl>
        </section>
      </div>

      <section className={`${base.panel} ${css.lowBand}`} aria-label="Kullanım bilgisi">
        <p>Bu harita platform yönetimi tarafından doğrulanmış kayıtlı hesap sonucudur (sürüm v{d.chart.version} · {fmtTime(d.chart.computedAt)}{d.approvedAt ? ` · yayın onayı ${fmtTime(d.approvedAt)}` : ""}). Açılışta yeniden hesaplama yapılmaz.</p>
        <p>Dört Ok / PHS bu eğitim haritasında yer almıyor. Bu ekran danışan kaydı oluşturmaz.</p>
        <p>Eğitim amaçlıdır; kişi, mirasçıları veya hak sahipleriyle herhangi bir ticari bağlantı, sponsorluk ya da onay ilişkisi yoktur.</p>
      </section>
    </EduShell>
  );
}
