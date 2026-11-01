"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — tüm sayfa zemini (B duvar kâğıdı / "Tüm ana sayfa" fotoğrafı).
 *
 * Kişisel kök (<main class=pw>) içinde İLK çocuk olarak konur; içeriğin ARKASINDA çizilir (z-index -1, kök izole).
 *  - Fotoğraf tüm sayfada (Düzeltme 2026-11-01): tam yükseklik, maske YOK, yükseklik sınırı YOK, tek tip katman;
 *    "Sabit" (varsayılan) → görünür alana sabitlenir, içerik üzerinden akar; "Sayfayla kayar" → sayfanın tam boyunu
 *    kaplar (oran korunur, cover). Yumuşatma (bulanıklık) mobilde sınırlıdır.
 *  - B + hazır tema: onaylı duvar kâğıdı (ilk ekranı kaplar, aşağıda sayfa zeminine erir).
 * Kullanılmıyorsa (A/C hero fotoğrafı, varsayılan zemin) hiçbir şey çizmez.
 */
import type { CSSProperties } from "react";
import type { WorkspaceDesign } from "@/lib/workspace/schema";
import type { PersonalWorkspace } from "./usePersonalWorkspace";
import { PersonalPhoto, ThemeLayer } from "./PersonalHero";
import { designFacts, photoVars, brandVars } from "./personalRoot";
import styles from "./personal.module.css";

export default function PersonalPageLayer({ design, assetSrc }: { design: WorkspaceDesign; assetSrc: PersonalWorkspace["assetSrc"] }) {
  const f = designFacts(design);
  if (!f.page) return null;
  const vars = { ...photoVars(design.bg), ...brandVars(design.brand) } as CSSProperties;
  if (f.photoPage) {
    return (
      <div
        className={`${styles.pageLayer} ${styles.pagePhoto} ${f.attach === "scroll" ? styles.attachScroll : styles.attachFixed}`}
        style={vars}
        data-tone={f.tone}
        aria-hidden
        data-testid="home-page-bg"
      >
        <div className={styles.phLayer}>
          <PersonalPhoto assetId={design.bg.photoAssetId} assetSrc={assetSrc} />
        </div>
      </div>
    );
  }
  return (
    <div className={`${styles.pageLayer} ${styles.pageWall}`} style={vars} data-tone={f.tone} aria-hidden data-testid="home-page-bg">
      {f.hasPhoto ? (
        <div className={styles.phLayer}>
          <PersonalPhoto assetId={design.bg.photoAssetId} assetSrc={assetSrc} />
        </div>
      ) : (
        <ThemeLayer theme={design.bg.theme} />
      )}
    </div>
  );
}
