"use client";

/**
 * Hazır Eğitim Haritaları — OWNER kişi sayfası (owner kararı 29.10.2026: ayrıntı listenin altında değil, AYRI sayfada).
 * Erişim: üst layout katı owner (aksi notFound); veri her istekte requireEducationOwner. İçerik ve yönetim işlevleri
 * mevcut OwnerSubjectDetail ile AYNI (kaynaklar, doğum/UTC, BodyGraph, hukuk, yayın kontrol listesi, onay geçmişi).
 * Geri: listeye arama / filtre / sekme ve kaydırma konumu korunarak dönülür.
 */

import { useParams, useRouter } from "next/navigation";
import { premiumFontVars } from "@/app/_premium/fonts";
import css from "@/app/_premium/hd-education/egitimYonetim.module.css";
import ov from "../../ownerViews.module.css";
import { OwnerSubjectDetail } from "../../OwnerSubjectDetail";
import { readListReturn } from "../../listState";

export default function EducationOwnerSubjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const back = () => router.push(readListReturn());
  return (
    <main className={`${css.page} ${premiumFontVars}`}>
      <div className={css.inner}>
        <header className={css.hero}>
          <p className={css.eyebrow}>YAŞAM SİSTEMİ · OWNER YÖNETİMİ</p>
          <h1 className={css.title}>Hazır Eğitim Haritaları</h1>
          <p className={css.sub}>Kişi ayrıntısı</p>
        </header>
        <div className={ov.backBar}>
          <button type="button" className={ov.backBtn} onClick={back} data-edu-back>← Listeye dön</button>
          <span className={ov.crumb}>Hazır Eğitim Haritaları / Kişi</span>
        </div>
        <OwnerSubjectDetail key={id} id={id} />
        <div className={ov.backBar}>
          <button type="button" className={ov.backBtn} onClick={back}>← Listeye dön</button>
        </div>
      </div>
    </main>
  );
}
