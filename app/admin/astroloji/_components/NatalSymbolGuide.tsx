"use client";

/**
 * Natal "Semboller" rehberi (2026-11-04) — yeni başlayanlar için kısa, TEKNİK tanımlar. Yorum / astrolojik iddia içermez:
 * gök cismi ve noktalar astronomik / hesap tanımıyla, açılar açı değeriyle anlatılır. Profesyonel kullanıcıyı yormamak için
 * ayrı sekmededir (çarkta yalnız ipucu). Haritaya özgü bilgiler (düğüm türü, Şans Noktası gündüz/gece) teknik veriden okunur.
 *
 * I18N mod-g (25.11.2026): metinler katalogda (atlas.natal.symbols); gezegen / burç / açı / element / nitelik / düğüm / retro adları
 * ortak terim kataloğundan (terms.*; TR değerleri lib/astrology/labels/tr.ts ile birebir — scripts/astrology/atlas-terms-catalog.harness.ts).
 * TR çıktı önceki sürümle karakteri karakterine aynı (scripts/astrology/atlas-natal-symbols-i18n.harness.ts).
 */

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { AspectType, NatalTechnical, SignId } from "@/lib/astrology/model/western";
import { BODY_IDS, SIGN_IDS } from "@/lib/astrology/model/western";
import { ASPECT_GLYPHS, BODY_GLYPHS, SIGN_ELEMENT, SIGN_GLYPHS } from "@/lib/astrology/labels/tr";
import styles from "./natalWheel.module.css";

const ASPECT_DEG: Record<AspectType, number> = {
  conjunction: 0,
  semi_sextile: 30,
  semi_square: 45,
  sextile: 60,
  square: 90,
  trine: 120,
  sesquiquadrate: 135,
  quincunx: 150,
  opposition: 180,
};

const MAJOR_ORDER: AspectType[] = ["conjunction", "sextile", "square", "trine", "opposition"];
const MINOR_ORDER: AspectType[] = ["semi_sextile", "semi_square", "sesquiquadrate", "quincunx"];

const SIGN_MODALITY: Record<SignId, "cardinal" | "fixed" | "mutable"> = {
  aries: "cardinal",
  cancer: "cardinal",
  libra: "cardinal",
  capricorn: "cardinal",
  taurus: "fixed",
  leo: "fixed",
  scorpio: "fixed",
  aquarius: "fixed",
  gemini: "mutable",
  virgo: "mutable",
  sagittarius: "mutable",
  pisces: "mutable",
};

const ELEMENT_INK: Record<string, string> = { fire: "#dc2626", earth: "#15803d", air: "#ca8a04", water: "#2563eb" };

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{title}</h4>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

function Row({ glyph, name, children, glyphInk }: { glyph: ReactNode; name: string; children: ReactNode; glyphInk?: string }) {
  return (
    <li className="flex gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className={`${styles.symbol} w-8 shrink-0 text-center text-xl leading-6`} style={glyphInk ? { color: glyphInk } : undefined} aria-hidden="true">
        {glyph}
      </span>
      <span className="min-w-0 text-sm leading-6 text-slate-700">
        <strong className="font-semibold text-slate-900">{name}</strong>
        <span className="text-slate-400"> — </span>
        {children}
      </span>
    </li>
  );
}

export default function NatalSymbolGuide({ technical }: { technical: NatalTechnical }) {
  const t = useTranslations("atlas.natal.symbols");
  const tt = useTranslations("terms");
  const sect = technical.points?.partOfFortune?.sect ?? null;
  // Düğüm türü kanonik kimlik ("true" | "mean"); tanınmayan değer ham gösterilir (önceki davranış: etiket ?? ham değer).
  const nodeType = technical.nodeType as string | null | undefined;
  const nodeLabel = nodeType === "true" || nodeType === "mean" ? tt(`nodeType.${nodeType}`) : String(nodeType ?? "");
  return (
    <div className="flex flex-col gap-3" data-testid="natal-symbol-guide">
      <p className="rounded-lg border border-slate-200 bg-[#fbfaf7] px-3 py-2 text-sm leading-6 text-slate-600">
        {t.rich("intro", { strong: (c) => <strong>{c}</strong> })}
      </p>

      <Block title={t("blockBodies")}>
        <ul>
          {BODY_IDS.map((id) => (
            <Row key={id} glyph={BODY_GLYPHS[id]} name={tt(`body.${id}`)}>
              {t(`body.${id}`)}
              {id === "north_node" ? ` ${t("nodeHere", { node: nodeLabel })}` : ""}
            </Row>
          ))}
          <Row glyph="⊗" name={t("fortuneName")} glyphInk="#0f766e">
            {t("fortuneText")}
            {sect ? ` ${sect === "day" ? t("sectDay") : t("sectNight")}` : ""}
          </Row>
          <Row glyph="Vx" name="Vertex" glyphInk="#0f766e">
            {t("vertexText")}
          </Row>
        </ul>
      </Block>

      <Block title={t("blockAngles")}>
        <ul>
          <Row glyph="ASC" name={t("ascName")}>
            {t("ascText")}
          </Row>
          <Row glyph="DSC" name={t("dscName")}>
            {t("dscText")}
          </Row>
          <Row glyph="MC" name={t("mcName")}>
            {t("mcText")}
          </Row>
          <Row glyph="IC" name={t("icName")}>
            {t("icText")}
          </Row>
        </ul>
        <p className="mt-1 text-xs leading-5 text-slate-500">{t("anglesNote")}</p>
      </Block>

      <Block title={t("blockSigns")}>
        <ul className="grid gap-x-4 sm:grid-cols-2">
          {SIGN_IDS.map((s, i) => (
            <Row key={s} glyph={SIGN_GLYPHS[s]} name={tt(`zodiac.${s}`)} glyphInk={ELEMENT_INK[SIGN_ELEMENT[s]]}>
              {i * 30}°–{i * 30 + 30}° · {tt(`element.${SIGN_ELEMENT[s]}`)} · {tt(`modality.${SIGN_MODALITY[s]}`)}
            </Row>
          ))}
        </ul>
        <p className="mt-1 text-xs leading-5 text-slate-500">{t("signsNote")}</p>
      </Block>

      <Block title={t("blockAspects")}>
        <ul>
          {[...MAJOR_ORDER, ...MINOR_ORDER].map((a) => (
            <Row key={a} glyph={ASPECT_GLYPHS[a]} name={tt(`aspect.${a}`)}>
              {t("aspectText", { deg: ASPECT_DEG[a] })}
              {` ${MAJOR_ORDER.includes(a) ? t("aspectMajor") : t("aspectMinor")}`}
            </Row>
          ))}
        </ul>
        <p className="mt-1 text-xs leading-5 text-slate-500">{t("aspectsNote")}</p>
      </Block>

      <Block title={t("blockOrb")}>
        <ul>
          <Row glyph="orb" name={t("orbName")}>
            {t("orbText")}
          </Row>
          <Row glyph="℞" name={tt("motion.retrograde")} glyphInk="#be123c">
            {t("retroText")}
          </Row>
          <Row glyph="°′" name={t("degreeName")}>
            {t("degreeText")}
          </Row>
        </ul>
      </Block>
    </div>
  );
}
