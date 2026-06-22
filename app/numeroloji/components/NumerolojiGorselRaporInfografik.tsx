"use client";

import {
  forwardRef,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type Ref,
} from "react";
import { turkishUpper, ELEMENT_ORDER, LETTER_TO_CHAKRA, type HarfYankilanisiSegment } from "@/lib/numeroloji";
import { nrDisplay, type NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";

function mergeRefs<T>(...refs: Array<Ref<T> | undefined | null>) {
  return (node: T | null) => {
    for (const r of refs) {
      if (!r) continue;
      if (typeof r === "function") r(node);
      else (r as MutableRefObject<T | null>).current = node;
    }
  };
}

/** Görsel rapor — çakra satırı orta başlık (referans A4 poster, 10 çakra). */
const GORSEL_CAKRA_TR_A4: Record<number, string> = {
  10: "10. Çakra — Taç",
  9: "9. Çakra — Üçüncü Göz",
  8: "8. Çakra — Ruh Yıldızı",
  7: "7. Çakra — Taç",
  6: "6. Çakra — Alın",
  5: "5. Çakra — Boğaz",
  4: "4. Çakra — Kalp",
  3: "3. Çakra — Solar Pleksus",
  2: "2. Çakra — Sakral",
  1: "1. Çakra — Kök",
};

function gorselMeaningfulLines(raw: string | null | undefined, maxLines: number): string[] {
  const lines = (raw || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => {
      if (/^=+$/.test(l)) return false;
      if (/={2,}/.test(l) && /(YILLARI|HARFLER|ZİRVE|MÜCADELE|DEĞİŞİM|YÖNTEM)/i.test(l)) return false;
      if (/^={1,3}\s*$/.test(l)) return false;
      if (/^İsim Soyisim:/i.test(l)) return false;
      if (/^Doğum Tarihi:/i.test(l)) return false;
      if (/^Kullanılan harf dizisi/i.test(l)) return false;
      if (/^Harflerin yaşlara göre/i.test(l)) return false;
      if (/^Not:/i.test(l)) return false;
      if (/^Geçerli harf/i.test(l)) return false;
      if (/^İsimde çakra tablosuna/i.test(l)) return false;
      if (/^\d+ harf\)/.test(l)) return false;
      if (/^Doğum tarihinin sadeleşmiş/i.test(l)) return false;
      if (/^Doğum tarihinin sadeleştirilmiş/i.test(l)) return false;
      if (/^Notlar:$/i.test(l)) return false;
      if (/^\d+\. HESAPLAMA/i.test(l)) return false;
      if (/^Konu için:/i.test(l)) return false;
      if (/^İlk mücadele konusu/i.test(l)) return false;
      if (/^Konu sayısı:/i.test(l)) return false;
      if (/^\s*\d+\s*-\s*\d+\s*=/.test(l)) return false;
      if (/^\d+\)\s/.test(l)) return false;
      if (/^\d+\.\s*ZİRVE\s+YILI/i.test(l)) return false;
      if (/^\d+\.\s*MÜCADELE/i.test(l)) return false;
      if (/^Notlar:/i.test(l)) return false;
      if (/^Numerolojide\s+36/i.test(l)) return false;
      if (/^•\s/.test(l)) return false;
      if (/^Gün\s*:/i.test(l)) return false;
      if (/^Ay\s*:/i.test(l)) return false;
      if (/^Yıl\s*:/i.test(l)) return false;
      if (/^Etki Dönemi/i.test(l)) return false;
      if (/^1\)\s*TARİH/i.test(l)) return false;
      if (/^2\)\s*GÜN/i.test(l)) return false;
      if (/^PUAN/i.test(l)) return false;
      if (/^ÇIKTI/i.test(l)) return false;
      if (/^\*{3,}/.test(l)) return false;
      if (/^#{1,3}\s/.test(l)) return false;
      if (/^\[[\d\s|]+\]$/i.test(l)) return false;
      return true;
    });
  return lines.slice(0, maxLines);
}

/** Görsel rapor: yalnızca doğum yılına göre ilk değişim bloğu (metin motorundan) */
function gorselDegisimIlkBlok(metni: string | null | undefined): string {
  const s = metni || "";
  const i = s.search(/2\)\s*GÜN/i);
  if (i > 0) return s.slice(0, i);
  return s;
}

function gorselDegisimOzetSatirlari(metni: string | null | undefined, maxN: number): string[] {
  const out: string[] = [];
  for (const raw of gorselDegisimIlkBlok(metni).split(/\r?\n/)) {
    const l = raw.trim();
    const m = l.match(/^(\d+)\.\s*Değişim:\s*(\d+)\s*(?:→|->)\s*Çakra:\s*(\d+)/i);
    if (m) {
      out.push(`${m[1]}. değişim · ${m[2]} · ${m[3]}. çakra`);
      if (out.length >= maxN) break;
    }
  }
  return out;
}

function gorselNormalizeHarfDizisi(fn: string, ln: string): string[] {
  return Array.from(turkishUpper(`${fn} ${ln}`.trim())).filter((ch) => /[A-ZÇĞİÖŞÜ]/.test(ch));
}

type GorselHarfKart = HarfYankilanisiSegment | { letter: string; eksik: true };

function gorselHarfKartlari(fn: string, ln: string, motorSegs: HarfYankilanisiSegment[] | undefined): GorselHarfKart[] {
  const chars = gorselNormalizeHarfDizisi(fn, ln);
  const pool = Array.isArray(motorSegs) ? [...motorSegs] : [];
  return chars.map((ch) => {
    const i = pool.findIndex((s) => turkishUpper(s.letter) === ch);
    if (i >= 0) {
      const [s] = pool.splice(i, 1);
      return s;
    }
    return { letter: ch, eksik: true as const };
  });
}

/** Görsel rapor — ad/soyad harfleri "H A S A N / A R I C I" biçiminde */
function gorselHarfBaslikSpaced(fn: string, ln: string): string {
  const spaced = (w: string) =>
    Array.from(w.trim().toLocaleUpperCase("tr-TR").replace(/\s/g, "")).join(" ");
  const ad = fn
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(spaced)
    .join("  ");
  const soy = ln
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(spaced)
    .join("  ");
  if (!ad && !soy) return "—";
  if (!soy) return ad;
  if (!ad) return soy;
  return `${ad} / ${soy}`;
}

function gorselTasMetinTemiz(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

type GorselTemaId = "kozmikMor" | "altinMist" | "kuzeyIsiklari" | "okyanusDerinligi";

const GORSEL_TEMA_LIST: { id: GorselTemaId; label: string }[] = [
  { id: "kozmikMor", label: "Kozmik Mor" },
  { id: "altinMist", label: "Altın Mist" },
  { id: "kuzeyIsiklari", label: "Kuzey Işıkları" },
  { id: "okyanusDerinligi", label: "Okyanus Derinliği" },
];

/** Kozmik Mor — yıldız / nokta dokusu */
const KOZMIK_STARFIELD = [
  "radial-gradient(circle at 6% 11%, rgba(255,255,255,0.45) 0.5px, transparent 0.65px)",
  "radial-gradient(circle at 18% 8%, rgba(216,180,254,0.5) 0.45px, transparent 0.6px)",
  "radial-gradient(circle at 92% 14%, rgba(255,255,255,0.38) 0.5px, transparent 0.65px)",
  "radial-gradient(circle at 78% 22%, rgba(196,181,253,0.42) 0.45px, transparent 0.58px)",
  "radial-gradient(circle at 44% 6%, rgba(255,255,255,0.32) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 12% 38%, rgba(237,233,254,0.36) 0.45px, transparent 0.6px)",
  "radial-gradient(circle at 88% 42%, rgba(255,255,255,0.34) 0.5px, transparent 0.65px)",
  "radial-gradient(circle at 30% 52%, rgba(216,180,254,0.32) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 65% 58%, rgba(255,255,255,0.38) 0.45px, transparent 0.6px)",
  "radial-gradient(circle at 8% 68%, rgba(196,181,253,0.36) 0.45px, transparent 0.58px)",
  "radial-gradient(circle at 95% 72%, rgba(255,255,255,0.32) 0.5px, transparent 0.65px)",
  "radial-gradient(circle at 52% 78%, rgba(167,139,250,0.4) 0.45px, transparent 0.6px)",
  "radial-gradient(circle at 22% 88%, rgba(255,255,255,0.34) 0.45px, transparent 0.58px)",
  "radial-gradient(circle at 72% 92%, rgba(237,233,254,0.36) 0.5px, transparent 0.65px)",
  "radial-gradient(circle at 40% 34%, rgba(255,255,255,0.24) 0.35px, transparent 0.5px)",
  "radial-gradient(circle at 58% 18%, rgba(196,181,253,0.28) 0.35px, transparent 0.5px)",
].join(", ");

const ALTIN_STARFIELD = [
  "radial-gradient(circle at 10% 20%, rgba(254,243,199,0.35) 0.45px, transparent 0.6px)",
  "radial-gradient(circle at 85% 15%, rgba(252,211,77,0.3) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 50% 45%, rgba(253,230,138,0.22) 0.35px, transparent 0.5px)",
  "radial-gradient(circle at 22% 78%, rgba(254,249,195,0.28) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 92% 72%, rgba(251,191,36,0.25) 0.45px, transparent 0.58px)",
].join(", ");

const KUZEY_STARFIELD = [
  "radial-gradient(circle at 14% 12%, rgba(240,253,250,0.4) 0.45px, transparent 0.58px)",
  "radial-gradient(circle at 88% 18%, rgba(204,251,241,0.35) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 48% 38%, rgba(167,243,208,0.28) 0.35px, transparent 0.5px)",
  "radial-gradient(circle at 70% 82%, rgba(236,254,255,0.32) 0.4px, transparent 0.55px)",
].join(", ");

const OKYANUS_STARFIELD = [
  "radial-gradient(circle at 12% 22%, rgba(224,242,254,0.35) 0.45px, transparent 0.58px)",
  "radial-gradient(circle at 78% 12%, rgba(186,230,253,0.3) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 40% 58%, rgba(103,232,249,0.22) 0.35px, transparent 0.5px)",
  "radial-gradient(circle at 90% 68%, rgba(165,243,252,0.28) 0.4px, transparent 0.55px)",
].join(", ");

function GorselTemaDekoratif({ temaId }: { temaId: GorselTemaId }) {
  const wrap = "pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]";
  if (temaId === "kozmikMor") {
    return (
      <>
        <div
          className={wrap}
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 8% 12%, rgba(192,132,252,0.42), transparent 55%), radial-gradient(ellipse 125% 80% at 45% -8%, rgba(167,139,250,0.5), transparent 58%), radial-gradient(ellipse 90% 60% at 100% 20%, rgba(109,40,217,0.42), transparent 52%), radial-gradient(ellipse 70% 55% at 0% 85%, rgba(76,29,149,0.4), transparent 50%), radial-gradient(ellipse 55% 45% at 75% 70%, rgba(139,92,246,0.28), transparent 48%)",
            opacity: 0.58,
          }}
          aria-hidden
        />
        <div className={`${wrap} opacity-[0.22]`} style={{ backgroundImage: KOZMIK_STARFIELD, backgroundSize: "120% 120%" }} aria-hidden />
        <div
          className={`${wrap} opacity-[0.14]`}
          style={{ backgroundImage: KOZMIK_STARFIELD, backgroundSize: "100% 100%", backgroundPosition: "18% 22%" }}
          aria-hidden
        />
        <div
          className={wrap}
          style={{
            opacity: 0.2,
            backgroundImage:
              "repeating-linear-gradient(88deg, transparent, transparent 72px, rgba(251,191,36,0.045) 72px, rgba(251,191,36,0.045) 73px, transparent 73px, transparent 144px), repeating-linear-gradient(0deg, transparent, transparent 96px, rgba(253,224,71,0.03) 96px, rgba(253,224,71,0.03) 97px, transparent 97px, transparent 192px)",
          }}
          aria-hidden
        />
        <div
          className={`${wrap} mix-blend-screen opacity-[0.1]`}
          style={{ boxShadow: "inset 0 0 100px rgba(192,132,252,0.35)" }}
          aria-hidden
        />
        <div
          className={`${wrap} opacity-[0.1]`}
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 35%, var(--gr-particle) 0.55px, transparent 0.72px), radial-gradient(circle at 76% 48%, var(--gr-particle) 0.48px, transparent 0.65px), radial-gradient(circle at 42% 82%, var(--gr-particle) 0.5px, transparent 0.68px), radial-gradient(ellipse 55% 38% at 8% 92%, rgba(88,28,135,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 92% 8%, rgba(109,40,217,0.18), transparent 52%)",
            backgroundSize: "100% 100%",
          }}
          aria-hidden
        />
        <div
          className={wrap}
          style={{
            opacity: 0.14,
            background:
              "radial-gradient(ellipse 45% 30% at 8% 12%, rgba(251,191,36,0.12), transparent 55%), radial-gradient(ellipse 40% 28% at 92% 88%, rgba(167,139,250,0.14), transparent 52%)",
          }}
          aria-hidden
        />
      </>
    );
  }
  if (temaId === "altinMist") {
    return (
      <>
        <div
          className={wrap}
          style={{
            opacity: 0.76,
            background:
              "radial-gradient(ellipse 95% 50% at 50% -5%, rgba(251,191,36,0.32), transparent 54%), radial-gradient(ellipse 85% 65% at 90% 95%, rgba(180,83,9,0.45), transparent 55%), radial-gradient(ellipse 70% 55% at 8% 88%, rgba(120,53,15,0.38), transparent 50%), radial-gradient(ellipse 50% 40% at 40% 40%, rgba(245,158,11,0.12), transparent 55%), radial-gradient(ellipse 60% 35% at 50% 100%, rgba(254,243,199,0.08), transparent 60%)",
          }}
          aria-hidden
        />
        <div
          className={wrap}
          style={{
            opacity: 0.35,
            backgroundImage:
              "radial-gradient(ellipse 80% 50% at 25% 35%, rgba(254,249,195,0.08), transparent 60%), radial-gradient(ellipse 70% 45% at 70% 55%, rgba(253,230,138,0.06), transparent 58%)",
          }}
          aria-hidden
        />
        <div className={`${wrap} opacity-[0.22]`} style={{ backgroundImage: ALTIN_STARFIELD, backgroundSize: "100% 100%" }} aria-hidden />
        <div className={`${wrap} opacity-[0.12]`} style={{ backgroundImage: ALTIN_STARFIELD, backgroundSize: "140% 140%", backgroundPosition: "30% 40%" }} aria-hidden />
        <div
          className={wrap}
          style={{
            opacity: 0.4,
            backgroundImage:
              "repeating-linear-gradient(115deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 48px), linear-gradient(180deg, rgba(251,191,36,0.04), transparent 35%)",
          }}
          aria-hidden
        />
        <div
          className={wrap}
          style={{ opacity: 0.35, boxShadow: "inset 0 0 0 1px rgba(251,191,36,0.14), inset 0 0 90px rgba(120,53,9,0.2)" }}
          aria-hidden
        />
        <div
          className={`${wrap} opacity-[0.1]`}
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 28%, var(--gr-particle) 0.52px, transparent 0.7px), radial-gradient(circle at 68% 72%, var(--gr-particle) 0.48px, transparent 0.64px), radial-gradient(ellipse 60% 45% at 85% 12%, rgba(120,53,15,0.2), transparent 55%)",
            backgroundSize: "100% 100%",
          }}
          aria-hidden
        />
        <div
          className={wrap}
          style={{
            opacity: 0.2,
            background:
              "repeating-linear-gradient(90deg, transparent, transparent 56px, rgba(253,224,71,0.04) 56px, rgba(253,224,71,0.04) 57px, transparent 57px, transparent 112px), radial-gradient(ellipse 70% 35% at 50% 100%, rgba(180,83,9,0.12), transparent 58%)",
          }}
          aria-hidden
        />
      </>
    );
  }
  if (temaId === "kuzeyIsiklari") {
    return (
      <>
        <div
          className={wrap}
          style={{
            background:
              "radial-gradient(ellipse 100% 70% at 50% 0%, rgba(15,23,42,0.85), transparent 45%), radial-gradient(ellipse 95% 55% at 5% 25%, rgba(34,197,94,0.35), transparent 52%), radial-gradient(ellipse 90% 60% at 95% 15%, rgba(45,212,191,0.28), transparent 54%), radial-gradient(ellipse 80% 70% at 50% 100%, rgba(30,58,138,0.35), transparent 52%)",
            opacity: 0.88,
          }}
          aria-hidden
        />
        <div
          className={wrap}
          style={{
            opacity: 0.45,
            background:
              "linear-gradient(185deg, rgba(94,234,212,0.12) 0%, transparent 22%), repeating-linear-gradient(8deg, transparent 0 64px, rgba(45,212,191,0.035) 64px, rgba(45,212,191,0.035) 65px, transparent 65px 128px)",
          }}
          aria-hidden
        />
        <div
          className={`${wrap} left-[-25%] top-[-8%] h-[130%] w-[130%] blur-3xl`}
          style={{
            background:
              "conic-gradient(from 120deg at 40% 40%, transparent 0deg, rgba(52,211,153,0.12) 80deg, transparent 150deg, rgba(6,182,212,0.14) 220deg, transparent 300deg)",
            opacity: 0.32,
          }}
          aria-hidden
        />
        <div
          className={`${wrap} left-[-20%] top-[-12%] h-[125%] w-[125%] blur-3xl`}
          style={{
            background:
              "conic-gradient(from 200deg at 58% 32%, transparent 0deg, rgba(52,211,153,0.18) 55deg, transparent 110deg, rgba(6,182,212,0.15) 190deg, transparent 250deg, rgba(16,185,129,0.12) 310deg, transparent 360deg)",
            opacity: 0.38,
          }}
          aria-hidden
        />
        <div className={`${wrap} opacity-[0.2]`} style={{ backgroundImage: KUZEY_STARFIELD, backgroundSize: "100% 100%" }} aria-hidden />
        <div className={`${wrap} opacity-[0.11]`} style={{ backgroundImage: KUZEY_STARFIELD, backgroundSize: "130% 130%", backgroundPosition: "40% 30%" }} aria-hidden />
        <div
          className={wrap}
          style={{ opacity: 0.1, boxShadow: "inset 0 0 80px rgba(45,212,191,0.2)" }}
          aria-hidden
        />
        <div
          className={`${wrap} opacity-[0.1]`}
          style={{
            backgroundImage:
              "radial-gradient(circle at 22% 44%, var(--gr-particle) 0.5px, transparent 0.66px), radial-gradient(circle at 80% 36%, var(--gr-particle) 0.46px, transparent 0.62px), radial-gradient(ellipse 70% 50% at 50% 0%, rgba(45,212,191,0.12), transparent 48%)",
            backgroundSize: "100% 100%",
          }}
          aria-hidden
        />
        <div
          className={wrap}
          style={{
            opacity: 0.16,
            backgroundImage:
              "linear-gradient(118deg, transparent 42%, rgba(52,211,153,0.05) 48%, rgba(6,182,212,0.06) 52%, transparent 58%)",
            backgroundSize: "180% 100%",
          }}
          aria-hidden
        />
      </>
    );
  }
  /* okyanusDerinligi */
  return (
    <>
      <div
        className={wrap}
        style={{
          background:
            "radial-gradient(ellipse 100% 60% at 50% 110%, rgba(8,47,73,0.75), transparent 58%), radial-gradient(ellipse 70% 45% at 12% 8%, rgba(30,64,175,0.42), transparent 52%), radial-gradient(ellipse 75% 50% at 92% 18%, rgba(12,74,110,0.4), transparent 50%), radial-gradient(ellipse 55% 40% at 48% 48%, rgba(14,116,144,0.18), transparent 55%)",
          opacity: 0.82,
        }}
        aria-hidden
      />
      <div
        className={wrap}
        style={{
          opacity: 0.4,
          backgroundImage:
            "radial-gradient(circle at 28% 72%, rgba(103,232,249,0.14) 0%, transparent 28%), radial-gradient(circle at 72% 68%, rgba(56,189,248,0.12) 0%, transparent 26%), radial-gradient(circle at 50% 88%, rgba(14,165,233,0.1) 0%, transparent 32%)",
        }}
        aria-hidden
      />
      <div
        className={wrap}
        style={{
          opacity: 0.28,
          backgroundImage:
            "radial-gradient(ellipse 140% 24% at 30% 80%, rgba(103,232,249,0.14), transparent), radial-gradient(ellipse 120% 20% at 75% 88%, rgba(56,189,248,0.1), transparent), linear-gradient(175deg, transparent 55%, rgba(8,145,178,0.08) 100%)",
        }}
        aria-hidden
      />
      <div className={`${wrap} opacity-[0.18]`} style={{ backgroundImage: OKYANUS_STARFIELD, backgroundSize: "100% 100%" }} aria-hidden />
      <div className={`${wrap} opacity-[0.1]`} style={{ backgroundImage: OKYANUS_STARFIELD, backgroundSize: "125% 125%", backgroundPosition: "20% 60%" }} aria-hidden />
      <div
        className={wrap}
        style={{
          opacity: 0.22,
          backgroundImage:
            "radial-gradient(ellipse 100% 22% at 20% 62%, rgba(103,232,249,0.1), transparent), radial-gradient(ellipse 90% 18% at 78% 58%, rgba(56,189,248,0.08), transparent), radial-gradient(ellipse 110% 20% at 50% 78%, rgba(14,165,233,0.09), transparent)",
        }}
        aria-hidden
      />
      <div
        className={wrap}
        style={{
          opacity: 0.12,
          background:
            "repeating-linear-gradient(-6deg, transparent 0 40px, rgba(14,165,233,0.025) 40px, rgba(14,165,233,0.025) 41px, transparent 41px 88px)",
        }}
        aria-hidden
      />
      <div className={wrap} style={{ opacity: 0.1, boxShadow: "inset 0 -60px 80px rgba(56,189,248,0.15)" }} aria-hidden />
      <div
        className={`${wrap} opacity-[0.1]`}
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 62%, var(--gr-particle) 0.52px, transparent 0.68px), radial-gradient(circle at 84% 28%, var(--gr-particle) 0.48px, transparent 0.64px), radial-gradient(ellipse 65% 42% at 50% 100%, rgba(14,165,233,0.14), transparent 52%)",
          backgroundSize: "100% 100%",
        }}
        aria-hidden
      />
      <div
        className={wrap}
        style={{
          opacity: 0.14,
          backgroundImage:
            "repeating-linear-gradient(-8deg, transparent, transparent 22px, rgba(56,189,248,0.03) 22px, rgba(56,189,248,0.03) 23px, transparent 23px, transparent 48px)",
        }}
        aria-hidden
      />
    </>
  );
}

/** Görsel rapor — renk paleti (CSS değişkenleri) + dekor katmanları ayrı */
const GORSEL_TEMA_VARS = {
  kozmikMor: {
    "--gr-bg-top": "#1a0a2e",
    "--gr-bg-mid": "#0c0614",
    "--gr-bg-bot": "#000000",
    "--gr-blob-1": "rgba(139,92,246,0.14)",
    "--gr-blob-2": "rgba(245,158,11,0.11)",
    "--gr-nebula": "rgba(88,28,135,0.35)",
    "--gr-border-outer": "rgba(139,92,246,0.28)",
    "--gr-shadow": "rgba(139,92,246,0.32)",
    "--gr-ring": "rgba(251,191,36,0.16)",
    "--gr-header-border": "rgba(251,191,36,0.28)",
    "--gr-eyebrow": "rgba(196,181,253,0.92)",
    "--gr-title-shadow": "rgba(167,139,250,0.28)",
    "--gr-header-divider": "rgba(139,92,246,0.22)",
    "--gr-name": "#ffffff",
    "--gr-birth": "rgba(221,214,254,0.9)",
    "--gr-card-bg": "rgba(0,0,0,0.38)",
    "--gr-card-border": "rgba(139,92,246,0.22)",
    "--gr-h3": "rgba(221,214,254,0.96)",
    "--gr-h3-border": "rgba(251,191,36,0.22)",
    "--gr-number": "#ffffff",
    "--gr-key": "rgba(253,230,138,0.92)",
    "--gr-pin-border": "rgba(167,139,250,0.38)",
    "--gr-pin-bg": "rgba(46,16,101,0.52)",
    "--gr-pin-shadow": "rgba(139,92,246,0.22)",
    "--gr-el-bg": "rgba(46,16,101,0.32)",
    "--gr-el-border": "rgba(139,92,246,0.16)",
    "--gr-el-label": "rgba(196,181,253,0.82)",
    "--gr-el-muted": "rgba(167,139,250,0.82)",
    "--gr-cakra-wrap-from": "rgba(46,16,101,0.32)",
    "--gr-cakra-wrap-to": "rgba(0,0,0,0.52)",
    "--gr-cakra-wrap-border": "rgba(139,92,246,0.26)",
    "--gr-row-bg": "rgba(0,0,0,0.38)",
    "--gr-row-border": "rgba(139,92,246,0.16)",
    "--gr-empty": "rgba(124,58,237,0.42)",
    "--gr-cakra-sk": "rgba(221,214,254,1)",
    "--gr-cakra-tr": "rgba(167,139,250,0.9)",
    "--gr-cakra-dot": "rgba(196,181,253,1)",
    "--gr-dot-glow": "rgba(167,139,250,0.48)",
    "--gr-line-border": "rgba(251,191,36,0.48)",
    "--gr-line-bg": "rgba(255,255,255,0.04)",
    "--gr-line-text": "rgba(237,233,254,0.96)",
    "--gr-dash": "rgba(139,92,246,0.72)",
    "--gr-harf-border": "rgba(139,92,246,0.16)",
    "--gr-harf-bg": "rgba(46,16,101,0.28)",
    "--gr-harf-label": "rgba(196,181,253,0.92)",
    "--gr-harf-body": "rgba(237,233,254,0.92)",
    "--gr-harf-meta": "rgba(167,139,250,0.82)",
    "--gr-glow-ana": "0 0 36px rgba(124,58,237,0.42), 0 0 72px rgba(88,28,135,0.22), inset 0 0 28px rgba(139,92,246,0.14)",
    "--gr-glow-yan": "0 0 32px rgba(59,130,246,0.38), 0 0 64px rgba(30,64,175,0.18), inset 0 0 22px rgba(96,165,250,0.12)",
    "--gr-glow-ifade": "0 0 32px rgba(245,158,11,0.32), 0 0 56px rgba(180,83,9,0.16), inset 0 0 24px rgba(251,191,36,0.12)",
    "--gr-glow-hayat": "0 0 34px rgba(45,212,191,0.36), 0 0 60px rgba(13,148,136,0.18), inset 0 0 24px rgba(34,211,238,0.1)",
    "--gr-spine-gradient": "linear-gradient(180deg, #c4b5fd 0%, #a78bfa 14%, #818cf8 28%, #22d3ee 42%, #34d399 56%, #fbbf24 70%, #fb923c 84%, #f87171 100%)",
    "--gr-gold-faint": "rgba(251,191,36,0.38)",
    "--gr-particle": "rgba(237,233,254,0.55)",
  },
  altinMist: {
    "--gr-bg-top": "#1c1208",
    "--gr-bg-mid": "#0f0a06",
    "--gr-bg-bot": "#050302",
    "--gr-blob-1": "rgba(217,119,6,0.14)",
    "--gr-blob-2": "rgba(180,83,9,0.1)",
    "--gr-nebula": "rgba(120,53,15,0.32)",
    "--gr-border-outer": "rgba(245,158,11,0.28)",
    "--gr-shadow": "rgba(245,158,11,0.22)",
    "--gr-ring": "rgba(253,224,71,0.18)",
    "--gr-header-border": "rgba(253,224,71,0.26)",
    "--gr-eyebrow": "rgba(253,230,138,0.88)",
    "--gr-title-shadow": "rgba(251,191,36,0.22)",
    "--gr-header-divider": "rgba(180,83,9,0.28)",
    "--gr-name": "#fffbeb",
    "--gr-birth": "rgba(254,243,199,0.88)",
    "--gr-card-bg": "rgba(12,8,4,0.45)",
    "--gr-card-border": "rgba(245,158,11,0.22)",
    "--gr-h3": "rgba(254,243,199,0.94)",
    "--gr-h3-border": "rgba(253,224,71,0.24)",
    "--gr-number": "#fffbeb",
    "--gr-key": "rgba(253,224,71,0.95)",
    "--gr-pin-border": "rgba(251,191,36,0.35)",
    "--gr-pin-bg": "rgba(69,26,3,0.55)",
    "--gr-pin-shadow": "rgba(245,158,11,0.2)",
    "--gr-el-bg": "rgba(69,26,3,0.38)",
    "--gr-el-border": "rgba(245,158,11,0.16)",
    "--gr-el-label": "rgba(253,230,138,0.78)",
    "--gr-el-muted": "rgba(252,211,77,0.72)",
    "--gr-cakra-wrap-from": "rgba(69,26,3,0.35)",
    "--gr-cakra-wrap-to": "rgba(9,6,3,0.55)",
    "--gr-cakra-wrap-border": "rgba(251,191,36,0.24)",
    "--gr-row-bg": "rgba(12,8,4,0.42)",
    "--gr-row-border": "rgba(180,83,9,0.2)",
    "--gr-empty": "rgba(180,83,9,0.45)",
    "--gr-cakra-sk": "rgba(255,251,235,0.98)",
    "--gr-cakra-tr": "rgba(252,211,77,0.88)",
    "--gr-cakra-dot": "rgba(254,240,138,0.95)",
    "--gr-dot-glow": "rgba(251,191,36,0.42)",
    "--gr-line-border": "rgba(253,224,71,0.45)",
    "--gr-line-bg": "rgba(255,255,255,0.035)",
    "--gr-line-text": "rgba(254,243,199,0.95)",
    "--gr-dash": "rgba(180,83,9,0.68)",
    "--gr-harf-border": "rgba(245,158,11,0.18)",
    "--gr-harf-bg": "rgba(69,26,3,0.32)",
    "--gr-harf-label": "rgba(253,230,138,0.88)",
    "--gr-harf-body": "rgba(255,251,235,0.9)",
    "--gr-harf-meta": "rgba(252,211,77,0.78)",
    "--gr-glow-ana": "0 0 36px rgba(180,83,9,0.38), 0 0 72px rgba(120,53,15,0.22), inset 0 0 28px rgba(245,158,11,0.16)",
    "--gr-glow-yan": "0 0 30px rgba(59,130,246,0.28), 0 0 56px rgba(30,58,138,0.14), inset 0 0 20px rgba(147,197,253,0.1)",
    "--gr-glow-ifade": "0 0 40px rgba(253,224,71,0.42), 0 0 80px rgba(245,158,11,0.22), inset 0 0 30px rgba(254,243,199,0.14)",
    "--gr-glow-hayat": "0 0 34px rgba(20,184,166,0.34), 0 0 64px rgba(15,118,110,0.16), inset 0 0 22px rgba(45,212,191,0.1)",
    "--gr-spine-gradient": "linear-gradient(180deg, #fde68a 0%, #fbbf24 16%, #f59e0b 33%, #ea580c 50%, #d97706 66%, #fcd34d 83%, #fef3c7 100%)",
    "--gr-gold-faint": "rgba(253,224,71,0.42)",
    "--gr-particle": "rgba(254,249,195,0.45)",
  },
  kuzeyIsiklari: {
    "--gr-bg-top": "#061a1f",
    "--gr-bg-mid": "#040f14",
    "--gr-bg-bot": "#02080a",
    "--gr-blob-1": "rgba(34,211,238,0.12)",
    "--gr-blob-2": "rgba(167,139,250,0.1)",
    "--gr-nebula": "rgba(13,148,136,0.28)",
    "--gr-border-outer": "rgba(45,212,191,0.26)",
    "--gr-shadow": "rgba(34,211,238,0.22)",
    "--gr-ring": "rgba(52,211,153,0.14)",
    "--gr-header-border": "rgba(94,234,212,0.26)",
    "--gr-eyebrow": "rgba(165,243,252,0.9)",
    "--gr-title-shadow": "rgba(34,211,238,0.2)",
    "--gr-header-divider": "rgba(45,212,191,0.22)",
    "--gr-name": "#ecfeff",
    "--gr-birth": "rgba(165,243,252,0.88)",
    "--gr-card-bg": "rgba(4,20,24,0.42)",
    "--gr-card-border": "rgba(45,212,191,0.2)",
    "--gr-h3": "rgba(204,251,241,0.95)",
    "--gr-h3-border": "rgba(94,234,212,0.22)",
    "--gr-number": "#f0fdfa",
    "--gr-key": "rgba(167,243,208,0.92)",
    "--gr-pin-border": "rgba(94,234,212,0.32)",
    "--gr-pin-bg": "rgba(6,78,59,0.42)",
    "--gr-pin-shadow": "rgba(34,211,238,0.18)",
    "--gr-el-bg": "rgba(6,78,59,0.32)",
    "--gr-el-border": "rgba(45,212,191,0.14)",
    "--gr-el-label": "rgba(153,246,228,0.8)",
    "--gr-el-muted": "rgba(110,231,183,0.75)",
    "--gr-cakra-wrap-from": "rgba(6,78,59,0.32)",
    "--gr-cakra-wrap-to": "rgba(2,12,16,0.55)",
    "--gr-cakra-wrap-border": "rgba(45,212,191,0.24)",
    "--gr-row-bg": "rgba(4,20,24,0.4)",
    "--gr-row-border": "rgba(13,148,136,0.18)",
    "--gr-empty": "rgba(13,116,104,0.48)",
    "--gr-cakra-sk": "rgba(236,254,255,0.98)",
    "--gr-cakra-tr": "rgba(153,246,228,0.88)",
    "--gr-cakra-dot": "rgba(167,243,208,0.95)",
    "--gr-dot-glow": "rgba(52,211,153,0.45)",
    "--gr-line-border": "rgba(94,234,212,0.42)",
    "--gr-line-bg": "rgba(255,255,255,0.035)",
    "--gr-line-text": "rgba(204,251,241,0.95)",
    "--gr-dash": "rgba(45,212,191,0.65)",
    "--gr-harf-border": "rgba(45,212,191,0.16)",
    "--gr-harf-bg": "rgba(6,78,59,0.3)",
    "--gr-harf-label": "rgba(167,243,208,0.9)",
    "--gr-harf-body": "rgba(236,254,255,0.9)",
    "--gr-harf-meta": "rgba(110,231,183,0.8)",
    "--gr-glow-ana": "0 0 34px rgba(52,211,153,0.36), 0 0 68px rgba(13,148,136,0.2), inset 0 0 26px rgba(167,243,208,0.12)",
    "--gr-glow-yan": "0 0 32px rgba(34,211,238,0.4), 0 0 64px rgba(6,182,212,0.18), inset 0 0 22px rgba(165,243,252,0.12)",
    "--gr-glow-ifade": "0 0 28px rgba(253,224,71,0.26), 0 0 52px rgba(234,179,8,0.12), inset 0 0 20px rgba(250,204,21,0.08)",
    "--gr-glow-hayat": "0 0 36px rgba(45,212,191,0.42), 0 0 72px rgba(20,184,166,0.2), inset 0 0 26px rgba(94,234,212,0.12)",
    "--gr-spine-gradient": "linear-gradient(180deg, #e9d5ff 0%, #a7f3d0 18%, #5eead4 36%, #22d3ee 54%, #34d399 72%, #2dd4bf 88%, #0f766e 100%)",
    "--gr-gold-faint": "rgba(94,234,212,0.45)",
    "--gr-particle": "rgba(236,254,255,0.5)",
  },
  okyanusDerinligi: {
    "--gr-bg-top": "#071426",
    "--gr-bg-mid": "#030c18",
    "--gr-bg-bot": "#01060e",
    "--gr-blob-1": "rgba(14,165,233,0.12)",
    "--gr-blob-2": "rgba(59,130,246,0.1)",
    "--gr-nebula": "rgba(30,58,138,0.32)",
    "--gr-border-outer": "rgba(56,189,248,0.26)",
    "--gr-shadow": "rgba(14,165,233,0.2)",
    "--gr-ring": "rgba(125,211,252,0.14)",
    "--gr-header-border": "rgba(56,189,248,0.24)",
    "--gr-eyebrow": "rgba(186,230,253,0.9)",
    "--gr-title-shadow": "rgba(14,165,233,0.22)",
    "--gr-header-divider": "rgba(37,99,235,0.25)",
    "--gr-name": "#f0f9ff",
    "--gr-birth": "rgba(186,230,253,0.88)",
    "--gr-card-bg": "rgba(3,24,48,0.45)",
    "--gr-card-border": "rgba(56,189,248,0.2)",
    "--gr-h3": "rgba(224,242,254,0.95)",
    "--gr-h3-border": "rgba(125,211,252,0.22)",
    "--gr-number": "#f8fafc",
    "--gr-key": "rgba(125,211,252,0.92)",
    "--gr-pin-border": "rgba(56,189,248,0.32)",
    "--gr-pin-bg": "rgba(12,74,110,0.48)",
    "--gr-pin-shadow": "rgba(14,165,233,0.18)",
    "--gr-el-bg": "rgba(12,74,110,0.35)",
    "--gr-el-border": "rgba(37,99,235,0.16)",
    "--gr-el-label": "rgba(186,230,253,0.8)",
    "--gr-el-muted": "rgba(125,211,252,0.75)",
    "--gr-cakra-wrap-from": "rgba(12,74,110,0.35)",
    "--gr-cakra-wrap-to": "rgba(2,12,28,0.55)",
    "--gr-cakra-wrap-border": "rgba(56,189,248,0.24)",
    "--gr-row-bg": "rgba(3,24,48,0.42)",
    "--gr-row-border": "rgba(30,64,175,0.18)",
    "--gr-empty": "rgba(29,78,216,0.42)",
    "--gr-cakra-sk": "rgba(240,249,255,0.98)",
    "--gr-cakra-tr": "rgba(147,197,253,0.88)",
    "--gr-cakra-dot": "rgba(186,230,253,0.95)",
    "--gr-dot-glow": "rgba(56,189,248,0.45)",
    "--gr-line-border": "rgba(125,211,252,0.4)",
    "--gr-line-bg": "rgba(255,255,255,0.035)",
    "--gr-line-text": "rgba(224,242,254,0.95)",
    "--gr-dash": "rgba(56,189,248,0.68)",
    "--gr-harf-border": "rgba(56,189,248,0.16)",
    "--gr-harf-bg": "rgba(12,74,110,0.32)",
    "--gr-harf-label": "rgba(186,230,253,0.9)",
    "--gr-harf-body": "rgba(240,249,255,0.9)",
    "--gr-harf-meta": "rgba(125,211,252,0.8)",
    "--gr-glow-ana": "0 0 34px rgba(37,99,235,0.4), 0 0 68px rgba(30,58,138,0.22), inset 0 0 26px rgba(59,130,246,0.14)",
    "--gr-glow-yan": "0 0 32px rgba(56,189,248,0.42), 0 0 62px rgba(14,165,233,0.2), inset 0 0 22px rgba(125,211,252,0.12)",
    "--gr-glow-ifade": "0 0 28px rgba(251,191,36,0.28), 0 0 52px rgba(217,119,6,0.12), inset 0 0 20px rgba(253,224,71,0.08)",
    "--gr-glow-hayat": "0 0 38px rgba(34,211,238,0.45), 0 0 76px rgba(8,145,178,0.22), inset 0 0 28px rgba(103,232,249,0.14)",
    "--gr-spine-gradient": "linear-gradient(180deg, #93c5fd 0%, #38bdf8 17%, #22d3ee 34%, #14b8a6 51%, #0ea5e9 68%, #2563eb 85%, #1e3a8a 100%)",
    "--gr-gold-faint": "rgba(56,189,248,0.42)",
    "--gr-particle": "rgba(224,242,254,0.48)",
  },
} as Record<GorselTemaId, CSSProperties>;

/** Çakra omurgası satır noktası renkleri (1–10) */
const GORSEL_CAKRA_NOKTA: Record<number, string> = {
  10: "#ddd6fe",
  9: "#f0abfc",
  8: "#c4b5fd",
  7: "#e9d5ff",
  6: "#a5b4fc",
  5: "#67e8f9",
  4: "#4ade80",
  3: "#facc15",
  2: "#fb923c",
  1: "#f87171",
};

/** Görsel rapor: çakra listesi üstten alta 10 → 1 (referans poster). */
const GORSEL_CAKRA_SIRA: readonly number[] = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const GORSEL_EL_TINT: Record<string, string> = {
  Ateş: "rgba(251,146,60,0.35)",
  Su: "rgba(56,189,248,0.35)",
  Hava: "rgba(103,232,249,0.32)",
  Toprak: "rgba(74,222,128,0.32)",
};

function gorselTasAdSatirlari(raw: string): string[] {
  return raw
    .split(/[,;،]+/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const GORSEL_TAS_ROSET = ["#fbbf24", "#c084fc", "#34d399", "#38bdf8", "#fb7185"] as const;

function GorselTasKolonu({ baslik, metin }: { baslik: string; metin: string }) {
  const items = gorselTasAdSatirlari(metin);
  if (!items.length) return null;
  return (
    <div
      className="flex min-h-0 flex-col rounded-lg border-[0.5px] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      style={{ borderColor: "var(--gr-row-border)", backgroundColor: "var(--gr-row-bg)" }}
    >
      <p className="text-[7px] font-semibold uppercase tracking-[0.12em] sm:text-[7.5px]" style={{ color: "var(--gr-h3)" }}>
        {baslik}
      </p>
      <ul className="mt-1 space-y-0.5">
        {items.map((t, i) => (
          <li key={`${baslik}-${i}-${t.slice(0, 16)}`} className="flex items-start gap-1.5 text-[9px] leading-snug sm:text-[10px]">
            <span
              className="mt-[0.3rem] h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-white/15"
              style={{ backgroundColor: GORSEL_TAS_ROSET[i % GORSEL_TAS_ROSET.length] }}
              aria-hidden
            />
            <span style={{ color: "var(--gr-line-text)" }}>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Görsel rapor — ince köşe / teker sembolü (birebir kopya değil, atmosfer) */
function GorselRaporKoseDekor() {
  const c = "text-[color:var(--gr-gold-faint)]";
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]" aria-hidden>
      <svg
        className={`absolute -right-2 -top-2 h-[5.5rem] w-[5.5rem] opacity-[0.11] sm:h-28 sm:w-28 sm:opacity-[0.14] ${c}`}
        viewBox="0 0 100 100"
        fill="none"
      >
        <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="0.35" opacity="0.55" />
        <circle cx="50" cy="50" r="34" stroke="currentColor" strokeWidth="0.28" opacity="0.45" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          const x1 = 50 + 38 * Math.cos(a - 0.04);
          const y1 = 50 + 38 * Math.sin(a - 0.04);
          const x2 = 50 + 38 * Math.cos(a + 0.04);
          const y2 = 50 + 38 * Math.sin(a + 0.04);
          return <path key={i} d={`M50 50 L${x1} ${y1} M50 50 L${x2} ${y2}`} stroke="currentColor" strokeWidth="0.22" opacity="0.5" />;
        })}
      </svg>
      <svg className={`absolute bottom-2 left-1 h-9 w-9 opacity-[0.1] sm:bottom-3 sm:left-2 sm:h-11 sm:w-11 ${c}`} viewBox="0 0 40 48" fill="none">
        <path
          d="M20 2 L34 16 L28 44 L12 44 L6 16 Z"
          stroke="currentColor"
          strokeWidth="0.6"
          fill="currentColor"
          fillOpacity="0.06"
        />
        <path d="M20 12 L26 22 L22 36 L18 36 L14 22 Z" stroke="currentColor" strokeWidth="0.35" fill="currentColor" fillOpacity="0.04" />
      </svg>
      <svg className={`absolute bottom-2 right-1 h-10 w-10 opacity-[0.09] sm:bottom-4 sm:right-2 sm:h-12 sm:w-12 ${c}`} viewBox="0 0 48 48" fill="none">
        <path
          d="M8 38 Q22 8 40 34"
          stroke="currentColor"
          strokeWidth="0.55"
          strokeLinecap="round"
          opacity="0.65"
        />
        <path d="M14 36 Q24 18 34 32" stroke="currentColor" strokeWidth="0.35" strokeLinecap="round" opacity="0.4" />
      </svg>
    </div>
  );
}

function GorselAltinSatir({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden>
      <div
        className="h-px flex-1 opacity-90"
        style={{
          background: "linear-gradient(90deg, transparent, var(--gr-gold-faint), transparent)",
        }}
      />
      <span
        className="inline-block size-1 rotate-45 border opacity-90"
        style={{
          borderColor: "var(--gr-gold-faint)",
          backgroundColor: "var(--gr-card-bg)",
          boxShadow: "0 0 8px var(--gr-gold-faint)",
        }}
      />
      <div
        className="h-px flex-1 opacity-90"
        style={{
          background: "linear-gradient(90deg, transparent, var(--gr-gold-faint), transparent)",
        }}
      />
    </div>
  );
}

function GorselKutuBaslik({ children, className = "", noBorder = false }: { children: ReactNode; className?: string; noBorder?: boolean }) {
  return (
    <h3
      className={`pb-2 text-lg font-black tracking-wide ${className}`}
      style={{
        color: "var(--gr-h3)",
        borderBottom: noBorder ? undefined : "1px solid var(--gr-h3-border)",
      }}
    >
      {children}
    </h3>
  );
}

/** Element satırı — küçük çizgi ikon (Hava / Su / Ateş / Toprak). */
function GorselElementMiniSembol({ el }: { el: string }) {
  const c = "text-[color:var(--gr-key)] opacity-80";
  if (el === "Hava") {
    return (
      <svg className={`${c} mx-auto h-8 w-8`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M4 16c2-4 6-6 10-4s8 2 10-2" strokeWidth="1" strokeLinecap="round" />
        <path d="M3 12c2-3 5-4 8-2" strokeWidth="0.85" strokeLinecap="round" opacity="0.85" />
      </svg>
    );
  }
  if (el === "Su") {
    return (
      <svg className={`${c} mx-auto h-8 w-8`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M12 4c2 4 6 8 6 12a6 6 0 1 1-12 0c0-4 4-8 6-12z" strokeWidth="0.9" fill="currentColor" fillOpacity="0.12" />
      </svg>
    );
  }
  if (el === "Ateş") {
    return (
      <svg className={`${c} mx-auto h-8 w-8`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          d="M12 3c1 4-2 6-2 10 0 3 2 5 4 6-1-2 0-4 2-5 1 3-1 7-4 8 5-2 7-7 0-19z"
          strokeWidth="0.45"
          fill="currentColor"
          fillOpacity="0.2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg className={`${c} mx-auto h-3.5 w-3.5`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M6 18l6-12 6 12H6z" strokeWidth="0.9" fill="currentColor" fillOpacity="0.12" strokeLinejoin="round" />
    </svg>
  );
}

function GorselNumeroSembol({ tip }: { tip: "ana" | "yan" | "ifade" | "hayat" }) {
  const base = "mx-auto mt-auto shrink-0 text-[color:var(--gr-key)] opacity-80";
  if (tip === "ana") {
    return (
      <svg className={`${base} h-10 w-10`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.5L12 15.3 6.4 19.3l2.1-6.5L3 8.8h6.8L12 2z"
          strokeWidth="0.55"
          fill="currentColor"
          fillOpacity="0.2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (tip === "yan") {
    return (
      <svg className={`${base} h-5 w-9`} viewBox="0 0 36 16" fill="none" stroke="currentColor" aria-hidden>
        <path
          d="M9 8c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6zm12 0c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z"
          strokeWidth="1.05"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (tip === "ifade") {
    return (
      <svg className={`${base} h-6 w-6`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <ellipse cx="12" cy="12" rx="9" ry="6" strokeWidth="0.85" fill="currentColor" fillOpacity="0.12" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" fillOpacity="0.35" strokeWidth="0.45" />
      </svg>
    );
  }
  return (
    <svg className={`${base} h-6 w-8`} viewBox="0 0 32 20" fill="none" stroke="currentColor" aria-hidden>
      <path d="M6 14c2-6 8-10 14-8 2.5 0.8 4 2.5 4.5 4.5" strokeWidth="1.05" strokeLinecap="round" />
      <circle cx="8" cy="14" r="1.6" fill="currentColor" fillOpacity="0.35" strokeWidth="0.45" />
    </svg>
  );
}

type GorselRaporInfografikProps = {
  out: NumerolojiMotorOut;
  isimGoster: string;
  dogumGoster: string;
  firstName: string;
  lastName: string;
  temaId: GorselTemaId;
  uzmanAdi: string;
  gorselTaslariGoster: boolean;
  tasBileklik: string;
  tasKolye: string;
  tasKutle: string;
};

const GorselRaporInfografik = forwardRef<HTMLDivElement, GorselRaporInfografikProps>(function GorselRaporInfografik(
  {
    out,
    isimGoster,
    dogumGoster,
    firstName,
    lastName,
    temaId,
    uzmanAdi,
    gorselTaslariGoster,
    tasBileklik,
    tasKolye,
    tasKutle,
  },
  ref,
) {
  const css = GORSEL_TEMA_VARS[temaId];
  const Y = 5;
  const hy = out.harflerinYankilanisi;
  const motorSegs = Array.isArray(hy) && hy.length ? hy : undefined;
  const harfKartlari = gorselHarfKartlari(firstName, lastName, motorSegs);

  const bileklikT = gorselTasMetinTemiz(tasBileklik);
  const kolyeT = gorselTasMetinTemiz(tasKolye);
  const kutleT = gorselTasMetinTemiz(tasKutle);
  const tasAny = Boolean(bileklikT || kolyeT || kutleT);
  const tasBolumuAcik = gorselTaslariGoster && tasAny;
  const uzmanGoster = gorselTasMetinTemiz(uzmanAdi);

  const peaks = out.zirveYillari?.peaks ?? [];
  const zirveGoster: string[] = (
    peaks.length > 0
      ? peaks.slice(0, Y).map((p) => `${p.index}. zirve · ${p.age} yaş · ${p.topic}. çakra`)
      : gorselMeaningfulLines(out.zirveYillariMetni, Y)
  ).slice(0, Y);

  const mucObj = out.mucadeleYillari;
  let mucGoster: string[] = [];
  if (mucObj) {
    const m1 = (mucObj.method1 ?? []).map((m) => `${m.index}. mücadele · ${m.age} yaş · ${m.topic}. çakra`);
    const m2 = (mucObj.method2 ?? []).map((m) => `${m.index}. mücadele · ${m.age} yaş · ${m.topic}. çakra`);
    mucGoster = [...m1, ...m2].slice(0, Y);
  }
  if (mucGoster.length === 0) mucGoster = gorselMeaningfulLines(out.mucadeleYillariMetni, Y);

  let degGoster = gorselDegisimOzetSatirlari(out.degisimDonusumMetni, Y);
  if (!degGoster.length) degGoster = gorselMeaningfulLines(out.degisimDonusumMetni, Y);
  degGoster = degGoster.slice(0, Y);

  const harfBaslikStr = gorselHarfBaslikSpaced(firstName, lastName);

  const numerolojiKartlari = [
    { label: "Ana Kulvar", r: out.anaKulvar, glowVar: "--gr-glow-ana", tip: "ana" as const },
    { label: "Yan Kulvar", r: out.yanKulvar, glowVar: "--gr-glow-yan", tip: "yan" as const },
    { label: "İfade Sayısı", r: out.ifadeSayisi, glowVar: "--gr-glow-ifade", tip: "ifade" as const },
    { label: "Hayat Yolu / DM", r: out.hayatYolu, glowVar: "--gr-glow-hayat", tip: "hayat" as const },
  ];

  return (
    <div
      ref={mergeRefs(ref)}
      data-gorsel-rapor-root
      style={{ ...css, border: "1px solid var(--gr-border-outer)", boxShadow: "0 28px 90px -32px rgba(0,0,0,0.65), 0 0 0 1px var(--gr-ring)" }}
      id="numeroloji-kayit-gorsel-rapor-png-root"
      className="numeroloji-gorsel-root relative w-[1400px] min-h-[1980px] shrink-0 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top,#4c1d95_0%,#241038_38%,#0f0618_100%)] px-8 py-8 font-sans text-white print:shadow-none"
    >
      <GorselTemaDekoratif temaId={temaId} />
      <GorselRaporKoseDekor />

      <header className="relative z-[2] pb-2 text-center sm:pb-2.5">
        <GorselAltinSatir className="mb-1.5 opacity-80" />
        <div className="mx-auto mb-0.5 flex justify-center opacity-[0.55]" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[color:var(--gr-gold-faint)]">
            <path
              d="M12 2v3.5M12 18.5V22M4.2 4.2l2.5 2.5m10.6 10.6l2.5 2.5M2 12h3.5m13 0H22M4.2 19.8l2.5-2.5m10.6-10.6l2.5-2.5"
              stroke="currentColor"
              strokeWidth="0.55"
              strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="0.45" fill="none" opacity="0.85" />
          </svg>
        </div>
        <h2 className="text-5xl font-black tracking-[0.10em]" style={{ color: "var(--gr-h3)" }}>
          NUMEROLOJİK YAŞAM HARİTASI
        </h2>
        <GorselAltinSatir className="mt-3 opacity-75" />
        <div className="mx-auto mt-4 w-full max-w-3xl space-y-1.5">
          <p className="text-3xl font-black" style={{ color: "var(--gr-name)" }}>{(isimGoster || "").trim() || "—"}</p>
          <p className="text-lg font-medium" style={{ color: "var(--gr-birth)" }}>
            {(dogumGoster || "").trim().replace(/\//g, ".") || "—"}
          </p>
        </div>
        <div
          className="mx-auto mt-2 h-px max-w-xs opacity-70"
          style={{ background: "linear-gradient(90deg, transparent, var(--gr-header-divider), transparent)" }}
        />
      </header>

      <div className="gorsel-sec-kartlar relative z-[2] mt-6 grid grid-cols-4 gap-4">
        {numerolojiKartlari.map(({ label, r, glowVar, tip }) => (
          <section
            key={label}
            className="relative flex min-h-[160px] min-w-0 flex-col overflow-hidden rounded-2xl border p-6 text-center"
            style={{
              background: `linear-gradient(150deg, rgba(255,255,255,0.07) 0%, var(--gr-card-bg) 55%)`,
              borderColor: "var(--gr-card-border)",
              boxShadow: `var(${glowVar})`,
            }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden />
            <GorselKutuBaslik className="text-sm font-black tracking-[0.14em]">{label}</GorselKutuBaslik>
            {(() => {
              const val = nrDisplay(r);
              const numCls =
                val.length <= 4
                  ? "text-7xl leading-none"
                  : val.length <= 8
                    ? "text-5xl leading-tight"
                    : "text-4xl leading-tight";
              return (
                <p
                  className={`gorsel-kart-num mt-4 font-black tabular-nums whitespace-normal break-words ${numCls}`}
                  style={{ color: "var(--gr-number)" }}
                >
                  {val}
                </p>
              );
            })()}
            <div className="mx-auto mt-3 flex items-end justify-center opacity-75">
              <GorselNumeroSembol tip={tip} />
            </div>
          </section>
        ))}
      </div>

      {/* 2. sıra: sol PIN, sağ Elementler (referans A4 — çakra bu satırda değil) */}
      <div className="gorsel-sec-pin-element relative z-[2] mt-6 grid grid-cols-2 gap-4">
        <section
          className="flex min-h-[220px] min-w-0 flex-col rounded-2xl border p-6"
          style={{ backgroundColor: "var(--gr-card-bg)", borderColor: "var(--gr-card-border)" }}
        >
          <GorselKutuBaslik className="text-center text-xl">PIN KODU</GorselKutuBaslik>
          <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-3">
            {(() => {
              const pin = out.pinKodu;
              const cell = (v: string | number, key: string) => (
                <span
                  key={key}
                  className="gorsel-pin-cell relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border text-2xl font-black tabular-nums"
                  style={{
                    backgroundColor: "var(--gr-pin-bg)",
                    borderColor: "var(--gr-pin-border)",
                    color: "var(--gr-number)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 0 14px -4px var(--gr-pin-shadow)",
                  }}
                >
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" aria-hidden />
                  {v ?? "—"}
                </span>
              );
              return (
                <>
                  <div className="flex justify-center gap-[3px]">
                    {[pin.k1, pin.k2, pin.k3, pin.k4, pin.k5].map((v, i) => cell(v, `p5-${i}`))}
                  </div>
                  <div className="flex justify-center gap-[3px]">
                    {[pin.k6, pin.k7].map((v, i) => cell(v, `p2-${i}`))}
                  </div>
                  <div className="flex justify-center">{cell(pin.k8, "p1-8")}</div>
                  <div className="flex justify-center">{cell(pin.k9, "p1-9")}</div>
                  <span className="mt-0.5 text-[9px] leading-none opacity-70" style={{ color: "var(--gr-gold-faint)" }} aria-hidden>
                    ✦
                  </span>
                </>
              );
            })()}
          </div>
        </section>

        <section
          className="flex min-h-[220px] min-w-0 flex-col rounded-2xl border p-6"
          style={{ backgroundColor: "var(--gr-card-bg)", borderColor: "var(--gr-card-border)" }}
        >
          <GorselKutuBaslik className="text-center text-xl">Elementler</GorselKutuBaslik>
          <div className="mt-4 grid min-h-[150px] flex-1 grid-cols-4 gap-3">
            {ELEMENT_ORDER.map((el) => {
              const elTint = GORSEL_EL_TINT[el] ?? "rgba(255,255,255,0.05)";
              return (
                <div
                  key={el}
                  className="relative flex min-h-[150px] min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border py-4"
                  style={{
                    background: `linear-gradient(160deg, ${elTint}, var(--gr-el-bg))`,
                    borderColor: "var(--gr-el-border)",
                    boxShadow: `0 0 28px -10px ${elTint}`,
                  }}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" aria-hidden />
                  <GorselElementMiniSembol el={el} />
                  <span className="w-full text-center text-sm font-black tracking-wide" style={{ color: "var(--gr-el-label)" }}>{el}</span>
                  <p className="gorsel-el-count text-6xl font-black tabular-nums leading-none" style={{ color: "var(--gr-number)" }}>
                    {out.elementler.counts[el]}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* 3. Çakra omurgası — tam genişlik, 10 satır, scrollbar yok */}
      <section
        className="gorsel-sec-cakra-tam relative z-[2] mt-6 overflow-visible rounded-2xl border p-6"
        style={{ backgroundColor: "var(--gr-cakra-wrap-from)", borderColor: "var(--gr-cakra-wrap-border)" }}
      >
        <GorselKutuBaslik className="pb-2 text-center text-2xl tracking-[0.14em]">Çakra omurgası</GorselKutuBaslik>
        <div className="relative mt-4 overflow-visible pl-6">
          <div
            className="pointer-events-none absolute left-[8px] top-0.5 bottom-0.5 w-[2px] -translate-x-1/2 sm:left-[10px]"
            style={{ filter: "blur(0.25px)", opacity: 0.85 }}
            aria-hidden
          >
            <div
              className="h-full w-full rounded-full"
              style={{
                background: "var(--gr-spine-gradient)",
                boxShadow: "0 0 10px rgba(255,255,255,0.1), 0 0 18px var(--gr-dot-glow)",
              }}
            />
          </div>
          <div className="gorsel-cakra-rows space-y-2">
            {GORSEL_CAKRA_SIRA.map((cNo) => {
              const left = out.cakraOmurgasi.sayilar[cNo] ?? 0;
              const right = out.cakraOmurgasi.harfler[cNo] ?? 0;
              const midFull = GORSEL_CAKRA_TR_A4[cNo] ?? `${cNo}. Çakra`;
              const emptyRow = left === 0 && right === 0;
              const dot = GORSEL_CAKRA_NOKTA[cNo] ?? "#fff";
              return (
                <div key={cNo} className="relative">
                  <span
                    aria-hidden
                    className="absolute left-[-5px] top-1/2 z-[2] h-2 w-2 -translate-y-1/2 rounded-full border-[0.5px] border-white/20"
                    style={{
                      backgroundColor: dot,
                      boxShadow: `0 0 8px ${dot}, 0 0 16px ${dot}66`,
                    }}
                  />
                  <div
                    className="grid min-h-[38px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 rounded-xl border px-5 py-1.5"
                    style={{ backgroundColor: "var(--gr-row-bg)", borderColor: "var(--gr-row-border)" }}
                  >
                    <div
                      className="flex min-h-[24px] flex-wrap items-center justify-end gap-1 text-lg leading-none"
                      style={{ color: "var(--gr-cakra-sk)" }}
                      aria-hidden
                    >
                      {emptyRow ? (
                        <span className="opacity-30">—</span>
                      ) : (
                        Array.from({ length: left }, (_, i) => (
                          <span key={`o-${cNo}-${i}`} className="opacity-90">
                            ○
                          </span>
                        ))
                      )}
                    </div>
                    <div className="min-w-0 shrink px-3 text-center" title={midFull}>
                      <p className="text-base font-bold leading-snug" style={{ color: "var(--gr-cakra-tr)" }}>{midFull}</p>
                    </div>
                    <div
                      className="flex min-h-[24px] flex-wrap items-center justify-start gap-1 text-lg leading-none"
                      style={{ color: "var(--gr-cakra-dot)" }}
                      aria-hidden
                    >
                      {emptyRow ? (
                        <span className="opacity-30">—</span>
                      ) : (
                        Array.from({ length: right }, (_, i) => (
                          <span key={`f-${cNo}-${i}`}>●</span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="gorsel-sec-yillar relative z-[2] mt-6 grid grid-cols-3 gap-4">
        {[
          { title: "Değişim — Dönüşüm", lines: degGoster },
          { title: "Zirve Yılları", lines: zirveGoster },
          { title: "Mücadele Yılları", lines: mucGoster },
        ].map(({ title, lines }) => (
          <section
            key={title}
            className="flex min-h-[180px] min-w-0 flex-col rounded-2xl border p-5"
            style={{ backgroundColor: "var(--gr-card-bg)", borderColor: "var(--gr-card-border)" }}
          >
            <GorselKutuBaslik className="shrink-0 text-xl tracking-[0.12em]">{title}</GorselKutuBaslik>
            <div className="mt-3 flex flex-1 flex-col space-y-1.5 overflow-visible">
              {lines.length ? (
                lines.map((line, i) => (
                  <p key={i} className="break-words text-base font-semibold leading-7" style={{ color: "var(--gr-line-text)" }}>
                    {line}
                  </p>
                ))
              ) : (
                <p className="text-base opacity-40" style={{ color: "var(--gr-cakra-sk)" }}>—</p>
              )}
            </div>
          </section>
        ))}
      </div>

      <section
        className="gorsel-sec-harf relative z-[2] mt-6 min-h-[260px] overflow-visible rounded-2xl border p-7"
        style={{ backgroundColor: "var(--gr-card-bg)", borderColor: "var(--gr-card-border)" }}
      >
        <GorselAltinSatir className="mb-2 opacity-80" />
        <GorselKutuBaslik noBorder className="pb-0 text-center text-2xl tracking-[0.18em]">
          Harflerin Yankılanışı
        </GorselKutuBaslik>
        <GorselAltinSatir className="mt-2 opacity-75" />
        <p className="mt-3 text-center text-xl font-black" style={{ color: "var(--gr-name)" }}>{harfBaslikStr}</p>
        <div className="mt-5 flex w-full flex-wrap justify-center gap-3">
          {harfKartlari.length === 0 ? (
            <p className="col-span-full text-center text-[10px]" style={{ color: "var(--gr-dash)" }}>
              —
            </p>
          ) : null}
          {harfKartlari.map((item, idx) => {
            const rozetOrtak =
              "relative z-0 flex min-h-[145px] w-[100px] shrink-0 flex-col items-center justify-center overflow-visible rounded-2xl border border-violet-300/40 bg-white/10 p-4 text-center";
            if ("eksik" in item && item.eksik) {
              const ck = LETTER_TO_CHAKRA[item.letter];
              return (
                <div
                  key={`${item.letter}-${idx}`}
                  className={rozetOrtak}
                  style={{
                    borderColor: "var(--gr-harf-border)",
                    background: `linear-gradient(165deg, rgba(255,255,255,0.12), transparent 40%), var(--gr-harf-bg)`,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 0 20px -8px var(--gr-gold-faint)",
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-white/[0.18] via-transparent to-transparent opacity-80"
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute inset-x-1 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-90"
                    aria-hidden
                  />
                  <span className="relative z-[1] text-4xl font-black leading-none text-white">{item.letter}</span>
                  <span className="relative z-[1] mt-2 text-sm font-semibold leading-5 text-slate-100">
                    {ck != null ? `${ck}. çakra` : "—"}
                  </span>
                  <span className="relative z-[1] mt-1 text-sm font-semibold leading-5 text-slate-100">—</span>
                </div>
              );
            }
            const seg = item as HarfYankilanisiSegment;
            return (
              <div
                key={`${seg.letter}-${idx}`}
                className={rozetOrtak}
                style={{
                  borderColor: "var(--gr-harf-border)",
                  background: `linear-gradient(165deg, rgba(255,255,255,0.14), transparent 42%), var(--gr-harf-bg)`,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 0 22px -8px var(--gr-gold-faint)",
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-white/[0.2] via-transparent to-transparent opacity-85"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute inset-x-1 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-amber-200/35 to-transparent opacity-90"
                  aria-hidden
                />
                <span className="relative z-[1] text-4xl font-black leading-none text-white">{seg.letter}</span>
                <span className="relative z-[1] mt-2 text-sm font-semibold leading-5 text-slate-100">
                  {seg.chakra}. çakra
                </span>
                <span className="relative z-[1] mt-1 text-sm font-semibold leading-5 text-slate-100">
                  {seg.ageStart}–{seg.ageEnd}
                  {seg.yearStart != null ? (
                    <span className="text-slate-200">
                      {" "}
                      ·{seg.yearStart}
                      {seg.yearEnd != null && seg.yearEnd !== seg.yearStart ? `–${seg.yearEnd}` : ""}
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {tasBolumuAcik ? (
        <section
          className="gorsel-sec-tas relative z-[2] mt-2 overflow-hidden rounded-lg border-[0.5px] bg-gradient-to-b from-[color:var(--gr-card-bg)] to-black/25 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[6px] sm:mt-2.5 sm:rounded-xl sm:p-2.5"
          style={{ borderColor: "var(--gr-card-border)", boxShadow: "0 0 24px -12px var(--gr-shadow)" }}
        >
          <GorselAltinSatir className="mb-1 opacity-80" />
          <GorselKutuBaslik className="pb-1 text-[7px] sm:text-[7.5px]">Önerilen Doğaltaşlar</GorselKutuBaslik>
          <div className="gorsel-sec-tas-body mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2">
            <GorselTasKolonu baslik="Bileklik taşları" metin={bileklikT} />
            <GorselTasKolonu baslik="Kolye taşları" metin={kolyeT} />
            <GorselTasKolonu baslik="Kütle taşları" metin={kutleT} />
          </div>
          <GorselAltinSatir className="mt-1.5 opacity-70" />
        </section>
      ) : null}

      {uzmanGoster ? (
        <footer
          className="gorsel-sec-uzman relative z-[2] mt-2 border-t border-[color:var(--gr-header-border)] pt-2 text-center sm:mt-2.5 sm:pt-2.5"
        >
          <GorselAltinSatir className="mb-1.5 opacity-75" />
          <p
            className="text-[7.5px] font-semibold uppercase tracking-[0.2em] sm:text-[8px]"
            style={{ color: "var(--gr-h3)", fontFamily: "Georgia, 'Palatino Linotype', Palatino, serif" }}
          >
            Analizi Düzenleyen Numerolog
          </p>
          <p
            className="mt-1 text-lg font-medium italic leading-snug tracking-wide sm:text-xl"
            style={{
              color: "var(--gr-key)",
              textShadow: "0 0 14px var(--gr-title-shadow), 0 0 24px rgba(251,191,36,0.15)",
              fontFamily: "Georgia, 'Palatino Linotype', Palatino, serif",
            }}
          >
            {uzmanGoster}
          </p>
          <div
            className="mx-auto mt-1.5 h-px max-w-[11rem] opacity-60"
            style={{ background: "linear-gradient(90deg, transparent, var(--gr-gold-faint), transparent)" }}
          />
        </footer>
      ) : null}
    </div>
  );
});

GorselRaporInfografik.displayName = "GorselRaporInfografik";

export { GorselRaporInfografik, GORSEL_TEMA_LIST };
export type { GorselTemaId };
