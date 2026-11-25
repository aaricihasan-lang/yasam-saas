"use client";

/**
 * Uzman ana sayfası — "Yaşam Modülleri" merkez kart ızgarası (`home-hub-grid`).
 *
 * P3 (Kişisel Dijital Ofis): yalnız SUNUM AYRIŞTIRMASI. Kart sırası, kilit kararı (cardLock — çağıran tarafın
 * getCenterLock kuralı), bağlantılar, rozetler, sayaçlar, markup ve CSS sınıfları app/page.tsx'teki önceki satır içi hâliyle
 * BİREBİR aynıdır. Bu bileşen yetki KARARI vermez; yalnız çağıranın verdiği kilit sonucunu gösterir.
 * Kişisel gizleme / Favorilerim (lib/workspace/homeView.ts → HomeView.centers / favorites) bağlantısı sonraki aşamadadır.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays, ChartColumn, Flower2, Folder, Layers, Leaf, Package, type LucideIcon } from "lucide-react";
import type { ModuleLockReason, ModulePermissionKey } from "@/lib/auth/modulePermissions";
import { deriveYhCardStatus, type YhHealthPayload } from "@/lib/yasam-hafizasi/ui/healthStatus";
import type { ModuleCard } from "./homeCenters";
import premium from "./home.module.css";

// Kart nesneleri (owner'ın yüksek çözünürlüklü şeffaf kaynakları, ql-hd-*) + sayaç satırının sabit ikonu + kartın hafif
// renk vurgusu (yalnız görünüm; href / yetki ModuleCard'dan). Ton modüle sabittir, kayıt içeriğine bağlı değildir.
const CARD_VISUAL: Partial<Record<string, { img: string; StatIcon: LucideIcon; tone: string }>> = {
  clients: { img: "ql-hd-danisan", StatIcon: CalendarDays, tone: premium.toneLavender },
  yasam_hafizasi: { img: "ql-hd-hafiza", StatIcon: Layers, tone: premium.toneGold },
  stok: { img: "ql-hd-urun", StatIcon: Package, tone: premium.toneSand },
  energy_body: { img: "ql-hd-beden", StatIcon: Flower2, tone: premium.toneRose },
  sifa_rehberi: { img: "ql-hd-dogal", StatIcon: Leaf, tone: premium.toneSage },
  digital_content: { img: "ql-hd-dijital", StatIcon: Folder, tone: premium.toneSky },
  numerology: { img: "ql-hd-analiz", StatIcon: ChartColumn, tone: premium.toneLilac },
};

export type HomeModuleGridProps = {
  modules: ModuleCard[];
  cardLock: (item: ModuleCard) => ModuleLockReason | null;
  moduleStats: Partial<Record<ModulePermissionKey, number | null>>;
  lastDateByKey: Record<string, string>;
  yhHealth: YhHealthPayload | null | undefined;
  onLockedClick: (reason: ModuleLockReason) => void;
};

export default function HomeModuleGrid({ modules, cardLock, moduleStats, lastDateByKey, yhHealth, onLockedClick }: HomeModuleGridProps) {
  const t = useTranslations("home");
  return (
    <div className={premium.grid} data-testid="home-hub-grid">
      {modules.map((item, index) => {
        const total = modules.length;
        // Son kart 3 sütunlu düzende tek kalıyorsa (ör. 7 kart; 2026-10-18: Ürün & Stok en sonda): diğer kartlarla
        // AYNI boyutta normal kart, son satırda ortalanır (owner: geniş yatay kart YOK).
        const isLastSolo = index === total - 1 && total % 3 === 1;
        const soloClass = isLastSolo ? premium.soloCenter : "";
        const hasHref = item.href !== "#";
        const lockReason = cardLock(item);
        const isLocked = lockReason !== null;
        const isOpen = hasHref && !isLocked;
        const isComingSoon = lockReason === "coming_soon";
        const visual = CARD_VISUAL[item.permissionKey] ?? { img: "ql-hd-analiz", StatIcon: ChartColumn, tone: premium.toneLilac };
        const StatIcon = visual.StatIcon;
        // Çeviri metnindeki baştaki renkli 📅 süsü yerine kartta sabit altın takvim ikonu çizilir (metin aynı).
        const lastText = lastDateByKey[item.permissionKey]
          ? t("moduleCard.lastPrefix", { date: lastDateByKey[item.permissionKey] }).replace(/^[^\p{L}\p{N}]+/u, "")
          : null;
        const statText = item.hasStat
          ? moduleStats[item.permissionKey] === undefined
            ? t("moduleCard.loading")
            : moduleStats[item.permissionKey] === null
              ? "—"
              : moduleStats[item.permissionKey] === 0
                ? t("moduleCard.noRecords")
                : t(`modules.${item.permissionKey}.stat`, { n: moduleStats[item.permissionKey] as number })
          : item.permissionKey === "yasam_hafizasi"
            ? deriveYhCardStatus(yhHealth).text
            : t("common.contentReady");
        // Üst blok: nesne + başlık + açıklama (yerleşim CSS ızgara alanlarıyla; geniş kartta nesne solda, dar kartta üstte).
        const body = (
          <>
            <div className={premium.cardTop}>
              <span className={premium.iconStage} aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={premium.icon} src={`/premium/ana-sayfa/${visual.img}.webp`} alt="" />
              </span>
              <h3 className={premium.cardTitle}>{t(`modules.${item.permissionKey}.title`)}</h3>
              <p className={premium.cardDesc}>{t(`modules.${item.permissionKey}.desc`)}</p>
            </div>
            <p className={premium.cardMeta}>
              <span className={premium.metaStat}>
                <StatIcon className={premium.metaIcon} strokeWidth={1.6} aria-hidden />
                <span>{statText}</span>
              </span>
              {lastText ? (
                <span className={premium.metaLast}>
                  <CalendarDays className={premium.metaIconSm} strokeWidth={1.6} aria-hidden />
                  <span>{lastText}</span>
                </span>
              ) : null}
            </p>
          </>
        );
        const card = (
          <div className={`${premium.card} ${visual.tone} ${isOpen ? premium.cardOpen : ""}`}>
            {isLocked ? (
              <span className={`${premium.badge} ${isComingSoon ? premium.badgeSoon : premium.badgeLock}`}>
                {isComingSoon
                  ? t("common.comingSoon")
                  : lockReason === "permission" ? t("moduleCard.lockNoPermission") : t("moduleCard.lockMembership")}
              </span>
            ) : null}
            {body}
          </div>
        );

        if (isOpen) {
          return (
            <Link key={item.permissionKey} href={item.href} className={`${premium.cardLink} ${soloClass}`}>
              {card}
            </Link>
          );
        }
        return (
          <div
            key={item.permissionKey}
            className={`${soloClass} ${isComingSoon ? premium.cardSoon : premium.cardLocked}`}
            role={isLocked ? "button" : undefined}
            tabIndex={isLocked ? 0 : undefined}
            onClick={isLocked && lockReason ? () => onLockedClick(lockReason) : undefined}
            onKeyDown={isLocked && lockReason ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onLockedClick(lockReason); } } : undefined}
          >
            {card}
          </div>
        );
      })}

      {/* Beslenme girişi "Doğal Destek & Rehber" hub'ındadır (app/dogal-destek/DogalDestekCards.tsx);
          ana panelde bağımsız Beslenme kartı ve Doğal Pazar vitrin kartı YOK (owner kararları). */}
    </div>
  );
}
