"use client";

/**
 * B · Merkezî / özel arşiv ayrımı (FAZ 7). Yalnız iki yetkisi de olan eğitmene gösterilir: merkezî katalog yetkisi yoksa merkezî
 * özellikten söz edilmez (tek tip "bulunamadı"). Metin yalnız açıklamadır; işlem yok.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import kat from "@/app/_premium/hd-education/egitimKatalog.module.css";
import { LoadingView, NotFoundView, Shell, useAccess } from "../_ui/Shell";
import { privCall } from "../_ui/privApi";

function Row({ t }: { t: string }) {
  return <li><span className={oz.tickMark} aria-hidden="true">✓</span><span>{t}</span></li>;
}

export default function ArchivesComparePage() {
  const t = useTranslations("hd.education");
  const access = useAccess("trainer", "/api/hd/education/private/access");
  const [central, setCentral] = useState<"loading" | "ok" | "no">("loading");
  useEffect(() => {
    if (access !== "ok") return;
    let live = true;
    void privCall("trainer", "/api/hd/education/access").then((r) => { if (live) setCentral(r.ok ? "ok" : "no"); });
    return () => { live = false; };
  }, [access]);
  if (access === "loading" || (access === "ok" && central === "loading")) return <LoadingView />;
  if (access !== "ok" || central !== "ok") return <NotFoundView />;
  return (
    <Shell>
      <Link className={kat.back} href="/human-design/egitim-merkezi">{t("common.backToCenter")}</Link>
      <header className={base.hero}>
        <p className={base.eyebrow}>{t("common.eyebrowCenter")}</p>
        <h1 className={base.title}>{t("archives.title")}</h1>
        <p className={base.sub}>{t("archives.sub")}</p>
      </header>
      <section className={oz.cmp} data-edu-compare>
        <article className={base.panel}>
          <div className={oz.cmpHead}><h2>{t("hub.centralTitle")}</h2><span className={`${base.tag} ${base.tInfo} ${base.big}`}>{t("archives.readOnly")}</span></div>
          <ul className={oz.ticks}>
            <Row t={t("archives.central1")} />
            <Row t={t("archives.central2")} />
            <Row t={t("archives.central3")} />
            <Row t={t("archives.central4")} />
          </ul>
          <div className={base.actions}><Link className={`${base.btn} ${base.ghost} ${oz.touch}`} href="/human-design/egitim-haritalari">{t("archives.openCentral")}</Link></div>
        </article>
        <article className={`${base.panel} ${oz.own}`}>
          <div className={oz.cmpHead}><h2>{t("hub.privateTitle")}</h2><span className={`${base.tag} ${base.tOk} ${base.big}`}>{t("archives.privateTag")}</span></div>
          <ul className={oz.ticks}>
            <Row t={t("archives.private1")} />
            <Row t={t("archives.private2")} />
            <Row t={t("archives.private3")} />
            <Row t={t("archives.private4")} />
          </ul>
          <div className={base.actions}><Link className={`${base.btn} ${base.save} ${oz.touch}`} href="/human-design/egitim-merkezi/ozel">{t("archives.openPrivate")}</Link></div>
        </article>
      </section>
      <p className={base.note}>{t("archives.note")}</p>
    </Shell>
  );
}
