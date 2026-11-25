"use client";

/**
 * A · Human Design Eğitim Merkezi (FAZ 7). İki kategori: Hazır Eğitim Haritaları (merkezî, salt-okunur) ve Bana Özel Eğitim Haritaları.
 * Merkezî kategori YALNIZ eğitmenin ayrı merkezî yetkisi varsa (sunucu yoklaması 200) gösterilir — yetkisi olmayan özellikten habersiz kalır.
 * Sayılar sunucudan; sahte sayı yok. Yeni özel kayıt asıl giriş noktası: danışanın kayıtlı haritası ("Eğitim Arşivime Ekle").
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import kat from "@/app/_premium/hd-education/egitimKatalog.module.css";
import { ErrorView, LoadingView, NotFoundView, Shell, useAccess } from "./_ui/Shell";
import { NewAnalysisButton } from "./_ui/NewAnalysisEntry";
import { privCall } from "./_ui/privApi";

type Counts = { privateTotal: number; privateClosed: number; central: number | null };

export default function EducationCenterPage() {
  const t = useTranslations("hd.education");
  const access = useAccess("trainer", "/api/hd/education/private/access");
  const [c, setC] = useState<Counts | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (access !== "ok") return;
    let live = true;
    void (async () => {
      const [mine, cen] = await Promise.all([
        privCall<{ items: { state: string }[] }>("trainer", "/api/hd/education/private/items"),
        privCall<{ items: unknown[] }>("trainer", "/api/hd/education/charts"),
      ]);
      if (!live) return;
      if (!mine.ok) { setErr(true); return; }
      setC({ privateTotal: mine.body.items.length, privateClosed: mine.body.items.filter((x) => x.state !== "ok").length, central: cen.ok ? cen.body.items.length : null });
    })();
    return () => { live = false; };
  }, [access]);

  if (access === "loading" || (access === "ok" && !c && !err)) return <LoadingView />;
  if (access === "denied") return <NotFoundView />;
  if (access === "error" || err || !c) return <ErrorView message={t("hub.loadError")} />;

  return (
    <Shell>
      <Link className={kat.back} href="/human-design">← Human Design</Link>
      <header className={base.hero}>
        <p className={base.eyebrow}>HUMAN DESIGN</p>
        <h1 className={base.title}>{t("hub.title")}</h1>
        <p className={base.sub}>{t("hub.sub")}</p>
      </header>
      <section className={oz.cats} aria-label={t("hub.catsAria")} data-edu-cats>
        {c.central !== null ? (
          <Link className={oz.cat} href="/human-design/egitim-haritalari" data-edu-cat="merkezi">
            <span className={oz.catIcon} aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></svg>
            </span>
            <span className={oz.catBody}>
              <b>{t("hub.centralTitle")}</b>
              <small>{t("hub.centralDesc")}</small>
              <span className={oz.catMeta}>{t("hub.centralMeta", { n: String(c.central), count: c.central })}</span>
            </span>
            <span className={oz.catLock}>{t("hub.centralLock")}</span>
            <span className={oz.chev} aria-hidden="true">›</span>
          </Link>
        ) : null}
        <Link className={`${oz.cat} ${oz.catOwn}`} href="/human-design/egitim-merkezi/ozel" data-edu-cat="ozel">
          <span className={`${oz.catIcon} ${oz.catIconGreen}`} aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>
          </span>
          <span className={oz.catBody}>
            <b>{t("hub.privateTitle")}</b>
            <small>{t("hub.privateDesc")}</small>
            <span className={oz.catMeta} data-edu-private-count>{t("hub.privateMeta", { n: String(c.privateTotal), count: c.privateTotal })}{c.privateClosed ? t("hub.privateClosed", { n: String(c.privateClosed), count: c.privateClosed }) : ""}</span>
          </span>
          <span className={oz.catLock}>{t("hub.privateLock")}</span>
          <span className={oz.chev} aria-hidden="true">›</span>
        </Link>
      </section>
      <section className={base.panel}>
        <h2 className={base.h2}>{t("hub.howTitle")}</h2>
        <p className={base.lead}>
          {t.rich("hub.howBody", { b: (chunks) => <b>{chunks}</b> })}
        </p>
        <div className={base.actions}>
          {c.central !== null ? <Link className={`${base.btn} ${base.ghost} ${oz.touch}`} href="/human-design/egitim-merkezi/arsivler">{t("hub.compareLink")}</Link> : null}
          <Link className={`${base.btn} ${base.save} ${oz.touch}`} href="/human-design/egitim-merkezi/ozel/ekle?tur=kurgusal" data-edu-start-fictional>{t("hub.createFictional")}</Link>
          <Link className={`${base.btn} ${base.ghost} ${oz.touch}`} href="/human-design/egitim-merkezi/ozel/ekle?tur=gercek" data-edu-start-add>{t("hub.addReal")}</Link>
          <NewAnalysisButton className={`${base.btn} ${base.ghost} ${oz.touch}`} />
        </div>
      </section>
    </Shell>
  );
}
