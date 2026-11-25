"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { readYasamUser, syncYasamUserFromDb, type YasamUser } from "@/lib/auth/yasamUser";
import { ENERGY_BODY_HUB_CHILDREN, canSeeHubChild } from "@/lib/auth/hubVisibility";
import { tiltLeave, tiltMove } from "@/app/_premium/enerji-beden/cardTilt";
import styles from "@/app/_premium/enerji-beden/enerjiBeden.module.css";

export type EnergyFolder = {
  /** Kanonik (dil-bağımsız) kart kimliği — React anahtarı; görünen metin i18nKey ile çözülür. */
  title: string;
  /** Görünen başlık/açıklama/rozet anahtarı (bodyEnergyHub.cards.<i18nKey>). */
  i18nKey: "bioenergy" | "reflexology" | "cupping";
  desc: string;
  href: string;
  badge: string;
  /** Kart renk tonu (premium CSS modülünde data-accent). */
  accent: "violet" | "mint" | "rose";
  /** Onaylı referanstan kesilmiş dekoratif kart görseli. */
  art: { src: string; w: number; h: number };
};

const CHILD_BY_HREF = new Map(ENERGY_BODY_HUB_CHILDREN.map((child) => [child.href, child]));

/**
 * Enerji & Beden alt kartları — owner kararı: uzman KENDİSİNE AÇILMAMIŞ alt modülü GÖRMEZ.
 * Biyoenerji / Refleksoloji / Kupa kartlarının her biri yalnız ilgili gerçek izinle görünür
 * (lib/auth/hubVisibility tek kaynak; REF-020: Refleksoloji yalnız granular reflexology/
 * refleksoloji izniyle — energy_body fallback YOK). Sunucu yetkisi ayrıca zorlanır.
 * İzinler canlı DB'den kesinleşmeden kart render EDİLMEZ (yetkisiz kart flash etmez).
 */
export function EnergyFoldersClient({ folders }: { folders: readonly EnergyFolder[] }) {
  const t = useTranslations("bodyEnergyHub");
  const [user, setUser] = useState<YasamUser | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readYasamUser();
    void syncYasamUserFromDb(cached)
      .then((fresh) => {
        if (!cancelled) setUser(fresh ?? cached ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(cached ?? null);
      })
      .finally(() => {
        if (!cancelled) setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = resolved
    ? folders.filter((f) => {
        const child = CHILD_BY_HREF.get(f.href);
        return child ? canSeeHubChild(user, child) : false;
      })
    : [];

  return (
    <section className={styles.cards} aria-label={t("cardsAria")}>
      {visible.map((folder) => (
        <Link
          key={folder.title}
          href={folder.href}
          className={styles.card}
          data-accent={folder.accent}
          onPointerMove={(e) => tiltMove(e)}
          onPointerLeave={tiltLeave}
        >
          <div className={styles.cardArt} aria-hidden>
            <span className={styles.artLayer}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={folder.art.src} width={folder.art.w} height={folder.art.h} alt="" decoding="async" draggable={false} />
            </span>
          </div>
          <div className={styles.cardBody}>
            <span className={styles.badge}>{t(`cards.${folder.i18nKey}.badge`)}</span>
            <h2 className={styles.cardTitle}>{t(`cards.${folder.i18nKey}.title`)}</h2>
            <p className={styles.cardDesc}>{t(`cards.${folder.i18nKey}.desc`)}</p>
          </div>
        </Link>
      ))}
    </section>
  );
}
