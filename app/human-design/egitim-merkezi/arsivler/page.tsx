"use client";

/**
 * B · Merkezî / özel arşiv ayrımı (FAZ 7). Yalnız iki yetkisi de olan eğitmene gösterilir: merkezî katalog yetkisi yoksa merkezî
 * özellikten söz edilmez (tek tip "bulunamadı"). Metin yalnız açıklamadır; işlem yok.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import kat from "@/app/_premium/hd-education/egitimKatalog.module.css";
import { LoadingView, NotFoundView, Shell, useAccess } from "../_ui/Shell";
import { privCall } from "../_ui/privApi";

function Row({ t }: { t: string }) {
  return <li><span className={oz.tickMark} aria-hidden="true">✓</span><span>{t}</span></li>;
}

export default function ArchivesComparePage() {
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
      <Link className={kat.back} href="/human-design/egitim-merkezi">← Eğitim Merkezi</Link>
      <header className={base.hero}>
        <p className={base.eyebrow}>HUMAN DESIGN EĞİTİM MERKEZİ</p>
        <h1 className={base.title}>İki ayrı arşiv</h1>
        <p className={base.sub}>Hazır örnekler ortaktır; özel arşiviniz yalnız size aittir</p>
      </header>
      <section className={oz.cmp} data-edu-compare>
        <article className={base.panel}>
          <div className={oz.cmpHead}><h2>Hazır Eğitim Haritaları</h2><span className={`${base.tag} ${base.tInfo} ${base.big}`}>Salt-okunur</span></div>
          <ul className={oz.ticks}>
            <Row t="Sistem yönetimi hazırlar, doğrular ve yayımlar" />
            <Row t="Belgeli doğum saati ve doğrulanmış UTC" />
            <Row t="Eğitmen değiştiremez, silemez, ekleyemez" />
            <Row t="Yalnız ayrıca yetki verilmiş eğitmenler görür" />
          </ul>
          <div className={base.actions}><Link className={`${base.btn} ${base.ghost} ${oz.touch}`} href="/human-design/egitim-haritalari">Hazır haritaları aç</Link></div>
        </article>
        <article className={`${base.panel} ${oz.own}`}>
          <div className={oz.cmpHead}><h2>Bana Özel Eğitim Haritaları</h2><span className={`${base.tag} ${base.tOk} ${base.big}`}>Yalnız siz + sistem sahibi</span></div>
          <ul className={oz.ticks}>
            <Row t="Kendi danışanınızın kayıtlı haritası (yeni hesap yok, kopya yok)" />
            <Row t="Danışanın belgeli izni zorunlu; varsayılan takma ad" />
            <Row t="Başka eğitmenler kaydın varlığını bile göremez" />
            <Row t="İzin geri çekilirse kayıt anında kapanır" />
          </ul>
          <div className={base.actions}><Link className={`${base.btn} ${base.save} ${oz.touch}`} href="/human-design/egitim-merkezi/ozel">Özel arşivimi aç</Link></div>
        </article>
      </section>
      <p className={base.note}>Özel kayıtlar hiçbir koşulda merkezî katalogda yayımlanmaz; bir eğitmene verilen özel arşiv yetkisi başka eğitmenlere erişim sağlamaz.</p>
    </Shell>
  );
}
