"use client";

/**
 * Satış ana sayfası — yeni üyelere özel açılış kampanyası duyurusu (owner revizyonu 2026-11-07, v7).
 * Kompakt lacivert-altın rozet; masaüstünde nav ile laptop arasındaki boşlukta mutlak konumlu (içeriği itmez), mobilde kompakt satır.
 * Yalnız bilgilendirir: buton/bağlantı YOK, tıklanmaz. Metinler gerçek HTML'dir (i18n: home.landingPremium.campaign).
 *
 * Vaat sınırı: bitiş tarihi, geri sayım, kişi/stok sınırı, süreli fiyat garantisi veya ödeme taahhüdü YOK.
 * HAREKET YOK.
 */
import { Gift } from "lucide-react";
import { useTranslations } from "next-intl";
import lp from "@/app/_premium/landing/landing.module.css";

export default function CampaignBand() {
  const t = useTranslations("home.landingPremium.campaign");

  return (
    <aside className={lp.campaign} aria-label={t("aria")} data-testid="campaign-band">
      <Gift className={lp.campaignIcon} aria-hidden />
      <p className={lp.campaignTitle}>{t("title")}</p>
      <span className={lp.campaignSep} aria-hidden />
      <p className={lp.campaignPrice}>
        <strong className={lp.campaignAmount}>{t("priceAmount")}</strong>
        <span className={lp.campaignPer}>{t("priceSuffix")}</span>
      </p>
    </aside>
  );
}
