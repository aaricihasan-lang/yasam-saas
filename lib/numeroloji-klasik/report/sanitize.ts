/**
 * Klasik Numeroloji — rapor metin güvenliği (SAF).
 *
 * Her metin Word'e girmeden önce buradan geçer:
 *   • HTML/script etiketleri (+ script/style içeriği), açılı ayraçlar, `javascript:` silinir;
 *   • XML 1.0'da geçersiz kontrol / yön karakterleri silinir;
 *   • sağlayıcı markası, URL, API yolu, anahtar adı, uuid düşürülür (uzmana görünen metinde YASAK);
 *   • uzunluk kod noktası bazında sınırlanır (…).
 */

import { API_KEY_RE, API_PATH_RE, BRAND_TOKEN_RE, URL_RE, UUID_RE } from "../sanitizeShared";

// XML 1.0 dışı + görünmez yön / sıfır genişlik karakterleri (\t \n korunur, sonra boşluğa iner).
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿￾￿]/g;
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export const TEXT_CAP = Object.freeze({ short: 160, line: 600, para: 2400, long: 6000, trace: 1200 });

/** Metni rapora güvenli hale getirir; metin olmayan değer → "". */
export function safeText(v: unknown, max: number = TEXT_CAP.para): string {
  if (v === null || v === undefined) return "";
  let t = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
  if (!t) return "";
  t = t
    .normalize("NFC")
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(CTRL_RE, "")
    .replace(LONE_SURROGATE_RE, "")
    .replace(URL_RE, "")
    .replace(API_PATH_RE, "")
    .replace(API_KEY_RE, "")
    .replace(UUID_RE, "")
    .replace(BRAND_TOKEN_RE, "")
    .replace(/[ \t\r\n]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  const cps = Array.from(t);
  if (cps.length > max) t = `${cps.slice(0, Math.max(1, max - 1)).join("").trimEnd()}…`;
  return t;
}

/** Satır içi son temizlik (run düzeyi): aynı silmeler, ama baş/son boşluk ve çift boşluk KORUNUR. */
export function safeInline(v: string, max: number = TEXT_CAP.long): string {
  let t = v
    .normalize("NFC")
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(CTRL_RE, "")
    .replace(LONE_SURROGATE_RE, "")
    .replace(URL_RE, "")
    .replace(API_PATH_RE, "")
    .replace(API_KEY_RE, "")
    .replace(UUID_RE, "")
    .replace(BRAND_TOKEN_RE, "")
    .replace(/[\t\r\n]+/g, " ");
  const cps = Array.from(t);
  if (cps.length > max) t = `${cps.slice(0, Math.max(1, max - 1)).join("")}…`;
  return t;
}

/** Metin listesi (boşlar atılır, adet sınırlı). */
export function safeList(v: unknown, maxItems = 20, maxLen: number = TEXT_CAP.line): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = safeText(x, maxLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Sağlayıcının İngilizce iz/terim sözcükleri → Türkçe (hesap izi ve köprü adlarında). */
const TERM_TR: ReadonlyArray<readonly [RegExp, string]> = Object.freeze([
  [/\bLife Path\b/g, "Yaşam Yolu"],
  [/\bSoul Urge\b/g, "Ruh Güdüsü"],
  [/\bExpression\b/g, "İfade"],
  [/\bPersonality\b/g, "Kişilik"],
  [/\bBirth ?Day\b/gi, "Doğum Günü"],
  [/\bMaturity\b/g, "Olgunluk"],
  [/\bDestiny\b/g, "Kader"],
  [/\bVowels\b/g, "Sesli harfler"],
  [/\bConsonants\b/g, "Sessiz harfler"],
  [/\bMonth\b/g, "Ay"],
  [/\bDay\b/g, "Gün"],
  [/\bYear\b/g, "Yıl"],
  [/\bTotal\b/g, "Toplam"],
] as const);

export function localizeTerms(s: string): string {
  let t = s;
  for (const [re, rep] of TERM_TR) t = t.replace(re, rep);
  return t;
}

/** Hesap izi: güvenli + Türkçeleştirilmiş + sınırlı. */
export function safeTrace(v: unknown, max: number = TEXT_CAP.trace): string {
  return localizeTerms(safeText(v, max));
}

export function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

export function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}
