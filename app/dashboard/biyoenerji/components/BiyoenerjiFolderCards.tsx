"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  BIOENERJI_GROUP_ORDER,
  BIOENERJI_SECTIONS_IN_ORDER,
  type BiyoenerjiGroupId,
  type BiyoenerjiSectionKey,
} from "../biyoenerjiFolderConfig";
import { tiltLeave, tiltMove } from "@/app/_premium/enerji-beden/cardTilt";
import styles from "@/app/_premium/biyoenerji/biyoenerji.module.css";

/**
 * Biyoenerji landing — 6 alan TEK canonical grid'te (masaüstü 3×2, tablet 2, mobil 1). Kartlar tek kaynaktan
 * (folderConfig: adres, başlık, açıklama, ikon) beslenir; placeholder yok.
 * 2026-10-18 premium görünüm (owner onaylı prototip eae69b6): sağda onaylı referanstan kesilmiş görsel + yumuşak ışık
 * katmanı; "Aç →" YOK, kartın tamamı tek bağlantı. IA grup etiketi (Anatomi, Nedenler…) korunur. Yalnız görsel
 * eşleme burada (config'e dokunulmadı).
 */
type Glow = { kind: "chakra" | "aura" | "symbol"; x: number; y: number; w: number; h: number; dur: number };

const ART: Record<BiyoenerjiSectionKey, { file: string; w: number; h: number; glow?: Glow }> = {
  cakralar: { file: "cakralar", w: 254, h: 259, glow: { kind: "chakra", x: 48.4, y: 44, w: 16, h: 78, dur: 9 } },
  "enerji-bedenleri": { file: "enerji-bedenleri", w: 242, h: 259, glow: { kind: "aura", x: 52.5, y: 48, w: 92, h: 86, dur: 11 } },
  "bilincalti-sebepleri": { file: "bilincalti", w: 203, h: 259 },
  seanslar: { file: "seanslar", w: 192, h: 254 },
  imajinasyonlar: { file: "imajinasyonlar", w: 220, h: 254 },
  "sembol-dili": { file: "sembol-dili", w: 266, h: 254, glow: { kind: "symbol", x: 56.4, y: 43, w: 64, h: 66, dur: 60 } },
};

/** IA grubu (FAZ 2): her kartın küçük kategori etiketi — tek kaynak folderConfig BIOENERJI_GROUP_ORDER. */
const GROUP_TITLE: Record<BiyoenerjiGroupId, string> = BIOENERJI_GROUP_ORDER.reduce(
  (acc, g) => {
    acc[g.id] = g.title;
    return acc;
  },
  {} as Record<BiyoenerjiGroupId, string>,
);

const GLOW_CLASS = { chakra: styles.glowChakra, aura: styles.glowAura, symbol: styles.glowSymbol } as const;

export default function BiyoenerjiFolderCards() {
  return (
    <div className={styles.cards}>
      {BIOENERJI_SECTIONS_IN_ORDER.map((card) => {
        const { Icon } = card;
        const art = ART[card.key];
        const g = art.glow;
        return (
          <Link
            key={card.href}
            href={card.href}
            className={styles.card}
            data-card={card.key}
            onPointerMove={(e) => tiltMove(e)}
            onPointerLeave={tiltLeave}
          >
            <div className={styles.cardArt} style={{ aspectRatio: `${art.w} / ${art.h}` }} aria-hidden>
              <span className={styles.artLayer}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/premium/biyoenerji/${art.file}.webp`} width={art.w} height={art.h} alt="" decoding="async" draggable={false} />
                {g ? (
                  <span
                    className={`${styles.glow} ${GLOW_CLASS[g.kind]}`}
                    style={
                      {
                        "--gxp": `${g.x}%`,
                        "--gyp": `${g.y}%`,
                        "--gw": `${g.w}%`,
                        "--gh": `${g.h}%`,
                        "--dur": `${g.dur}s`,
                      } as CSSProperties
                    }
                  />
                ) : null}
              </span>
              <span className={styles.sheen} />
            </div>
            <div className={styles.cardBody}>
              <span className={styles.cardIcon} aria-hidden>
                <Icon className="h-[26px] w-[26px]" strokeWidth={1.7} />
              </span>
              <span className={styles.cardGroup}>{GROUP_TITLE[card.group]}</span>
              <h3 className={styles.cardTitle}>{card.title}</h3>
              <p className={styles.cardDesc}>{card.desc}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
