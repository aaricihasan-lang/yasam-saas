/**
 * Klasik Numeroloji — görsel (PNG) rapor SVG kurucusu (SAF; IO yok, sağlayıcı çağrısı yok).
 *
 * YALNIZ kayıtlı, normalize edilmiş kişi analizini okur (`ClassicReportRecord`). Çıktı tek bir SVG belgesidir;
 * PNG'ye çevirme sunucuda `png.ts` (resvg + depo içi Geist TTF) ile yapılır → yerel ve Vercel'de aynı görüntü.
 *
 * İçerik: ekol (Klasik Numeroloji · Pisagor / Kalde), altı temel sayı, karmik dersler + borçlar, kişisel
 * yıl / ay / gün, içinde bulunulan zirve ve zorluk dönemi, Kalde özeti, iki sistem uyumu, (varsa) günün sembolik
 * sayısı. Bağımsız kontrolde farkı çıkan değer "kontrol farkı" rozetiyle gösterilir (kesin sonuç gibi sunulmaz).
 * Sağlayıcı adı, ham yanıt, provider_meta GİRMEZ. Tüm metin XML-kaçışlıdır; uzunluklar sınırlıdır.
 */
import type { ChaldeanResult, ChartResult, ClassicNumber, DailyResult, DualResult, Period, PersonalDayResult, Verification } from "../model";
import type { ClassicReportRecord } from "./types";

export const PNG_REPORT_WIDTH = 1200;
const W = PNG_REPORT_WIDTH;
const PAD = 64;
const INNER = W - PAD * 2;

const C = Object.freeze({
  deep: "#0c1630",
  navy: "#13234a",
  ink: "#0f1a33",
  inkSoft: "#44526e",
  ice: "#a9d4f2",
  iceStrong: "#6fb4e4",
  line: "#d5e0ec",
  surface: "#f4f8fc",
  card: "#ffffff",
  accent: "#1f5fa8",
  gold: "#c9a45c",
  warn: "#a15c00",
  warnBg: "#fff4e0",
  violet: "#4b2390",
  violetBg: "#efe6fd",
});

export const PNG_FONT_FAMILY = "Geist";

const CORE_ORDER = [
  ["lifePath", "Yaşam Yolu"],
  ["expression", "İfade (Kader)"],
  ["soulUrge", "Ruh Güdüsü"],
  ["personality", "Kişilik"],
  ["birthDay", "Doğum Günü"],
  ["maturity", "Olgunluk"],
] as const;

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// ── Yardımcılar ───────────────────────────────────────────────────────────────────────────────

/** XML kaçış + kontrol / görünmez biçim karakterlerini ayıklama + uzunluk sınırı. */
export function xmlText(v: unknown, max = 400): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  const s = String(v)
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const cut = [...s].length > max ? `${[...s].slice(0, max - 1).join("")}…` : s;
  return cut.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Yaklaşık satır kaydırma (Geist ortalama glif genişliği ≈ 0,54 em). Kaçış ÖNCESİ metinle çalışır. */
export function wrapText(raw: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const per = Math.max(8, Math.floor(maxWidth / (fontSize * 0.54)));
  const words = raw.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if ([...next].length <= per) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = [...w].length > per ? `${[...w].slice(0, per - 1).join("")}…` : w;
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  const consumed = lines.join(" ").length;
  if (consumed < words.join(" ").length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = `${[...last].slice(0, Math.max(1, per - 1)).join("").replace(/[ .,;:]+$/, "")}…`;
  }
  return lines;
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function asNumber(v: unknown): ClassicNumber | null {
  const o = rec(v);
  return o && isNum(o.value) ? (o as unknown as ClassicNumber) : null;
}
function mismatch(v: Verification | undefined | null): boolean {
  return !!v && v.status === "mismatch";
}
function fmtIso(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}
function fmtBirth(input: unknown): string {
  const b = rec(rec(input)?.birth);
  if (!b || !isNum(b.year) || !isNum(b.month) || !isNum(b.day)) return "";
  return `${String(b.day).padStart(2, "0")}.${String(b.month).padStart(2, "0")}.${b.year}`;
}
function ageAt(input: unknown, iso: string | null): number | null {
  const b = rec(rec(input)?.birth);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!b || !m || !isNum(b.year) || !isNum(b.month) || !isNum(b.day)) return null;
  let a = Number(m[1]) - b.year;
  if (Number(m[2]) < b.month || (Number(m[2]) === b.month && Number(m[3]) < b.day)) a--;
  return a >= 0 ? a : null;
}
function currentPeriod(list: Period[] | undefined, age: number | null): Period | null {
  if (!Array.isArray(list) || age === null) return null;
  return list.find((p) => isNum(p.startAge) && age >= p.startAge && (p.endAge === null || age <= p.endAge)) ?? null;
}

type Out = string[];

function text(out: Out, x: number, y: number, s: string, size: number, color: string, opts: { weight?: number; anchor?: "start" | "middle" | "end"; spacing?: number } = {}): void {
  out.push(
    `<text x="${x}" y="${y}" font-family="${PNG_FONT_FAMILY}" font-size="${size}" fill="${color}"${opts.weight ? ` font-weight="${opts.weight}"` : ""}${opts.anchor && opts.anchor !== "start" ? ` text-anchor="${opts.anchor}"` : ""}${opts.spacing ? ` letter-spacing="${opts.spacing}"` : ""}>${s}</text>`,
  );
}
function rect(out: Out, x: number, y: number, w: number, h: number, fill: string, r = 18, stroke?: string): void {
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="1.5"` : ""}/>`);
}
function pill(out: Out, x: number, y: number, label: string, fg: string, bg: string, size = 17): number {
  const w = Math.round([...label].length * size * 0.56 + 28);
  rect(out, x, y, w, size + 16, bg, (size + 16) / 2);
  text(out, x + 14, y + size + 3, xmlText(label, 60), size, fg, { weight: 600 });
  return w;
}
function sectionTitle(out: Out, y: number, title: string, sub?: string): number {
  out.push(`<rect x="${PAD}" y="${y + 6}" width="6" height="30" rx="3" fill="${C.gold}"/>`);
  text(out, PAD + 20, y + 30, xmlText(title, 80), 28, C.navy, { weight: 700 });
  if (sub) text(out, PAD + 20, y + 58, xmlText(sub, 140), 17, C.inkSoft);
  return y + (sub ? 78 : 56);
}

/** Tek sayı kartı (temel sayılar / döngüler). */
function numberCard(out: Out, x: number, y: number, w: number, h: number, label: string, n: ClassicNumber | null, value: string | null, sub: string[], flag: boolean): void {
  rect(out, x, y, w, h, C.card, 20, C.line);
  text(out, x + 24, y + 40, xmlText(label, 40), 19, C.inkSoft, { weight: 600 });
  text(out, x + 24, y + 112, xmlText(value ?? (n ? String(n.value) : "—"), 12), 64, C.navy, { weight: 700 });
  let by = y + 140;
  for (const s of sub.slice(0, 2)) {
    text(out, x + 24, by, xmlText(s, 48), 16, C.inkSoft);
    by += 22;
  }
  // Rozetler kartın sağında ALT ALTA (hiçbiri sessizce düşmez); en önemli olan (kontrol farkı) en üstte.
  const badges: Array<[string, string, string]> = [];
  if (flag) badges.push(["Kontrol farkı", C.warn, C.warnBg]);
  if (n?.type === "master") badges.push(["Usta sayı", C.violet, C.violetBg]);
  if (n && isNum(n.karmicDebt)) badges.push([`Karmik borç ${n.karmicDebt}`, C.warn, C.warnBg]);
  let byy = y + 22;
  for (const [t, fg, bg] of badges) {
    const bw = Math.round([...t].length * 14 * 0.58 + 22);
    rect(out, x + w - 20 - bw, byy, bw, 28, bg, 14);
    text(out, x + w - 20 - bw + 11, byy + 19, xmlText(t, 30), 14, fg, { weight: 600 });
    byy += 34;
  }
}

// ── Kurucu ────────────────────────────────────────────────────────────────────────────────────

export type PngReportOptions = { generatedAt: Date; expertName?: string | null };

export type PngReportSvg = { svg: string; width: number; height: number; sections: string[] };

/** Kişi analizi → görsel rapor SVG'si. Kişi haritası (chart) ya da Kalde sonucu yoksa null. */
export function buildClassicPngSvg(record: ClassicReportRecord, opts: PngReportOptions): PngReportSvg | null {
  if (record.kind !== "person") return null;
  const R = rec(record.result) ?? {};
  const chart = rec(R.chart) && rec(rec(R.chart)?.core) ? (R.chart as unknown as ChartResult) : null;
  const chal = rec(R.chaldean) && rec(rec(R.chaldean)?.destiny) ? (R.chaldean as unknown as ChaldeanResult) : null;
  const dual = rec(R.dual) && rec(rec(R.dual)?.pythagorean) ? (R.dual as unknown as DualResult) : null;
  const day = rec(R.personal_day) && isNum(rec(R.personal_day)?.personalDay) ? (R.personal_day as unknown as PersonalDayResult) : null;
  const daily = rec(R.daily) && asNumber(rec(R.daily)?.number) ? (R.daily as unknown as DailyResult) : null;
  if (!chart && !chal) return null;

  const input = rec(record.input);
  const name = (typeof input?.fullName === "string" ? input.fullName : chart?.profile?.name) || record.title || "Klasik Numeroloji";
  const ref = record.referenceDate ?? (typeof input?.targetDate === "string" ? input.targetDate : null);
  const body: Out = [];
  const sections: string[] = [];

  // ── Başlık bandı
  const headH = 300;
  body.push(`<rect x="0" y="0" width="${W}" height="${headH}" fill="url(#hdr)"/>`);
  body.push(`<circle cx="${W - 120}" cy="70" r="190" fill="${C.iceStrong}" opacity="0.08"/>`);
  body.push(`<circle cx="${W - 40}" cy="250" r="120" fill="${C.ice}" opacity="0.07"/>`);
  text(body, PAD, 72, "YAŞAM SİSTEMİ · NUMEROLOJİ MERKEZİ", 17, C.ice, { weight: 600, spacing: 2.4 });
  text(body, PAD, 112, "Klasik Numeroloji Raporu", 24, "#dbe9f7");
  const nameLines = wrapText(name, INNER - 40, 52, 1);
  text(body, PAD, 178, xmlText(nameLines[0] ?? "", 60), 52, "#ffffff", { weight: 700 });
  const metaParts = [fmtBirth(record.input) ? `Doğum ${fmtBirth(record.input)}` : "", ref ? `Hedef tarih ${fmtIso(ref)}` : ""].filter(Boolean);
  if (metaParts.length) text(body, PAD, 218, xmlText(metaParts.join("  ·  "), 120), 20, "#dbe9f7");
  let cx = PAD;
  cx += pill(body, cx, 240, "Yöntem: Klasik Numeroloji", C.deep, C.ice) + 10;
  if (chart) cx += pill(body, cx, 240, "Pisagor (Batı)", "#ffffff", "#2b3b66") + 10;
  if (chal) cx += pill(body, cx, 240, "Kalde (Cheiro)", "#ffffff", "#2b3b66") + 10;
  if (cx < W - PAD - 220) pill(body, cx, 240, "Usta sayılar 11 · 22 · 33 korunur", "#dbe9f7", "#1d2c55", 15);

  let y = headH + 44;

  // ── Temel sayılar
  if (chart) {
    sections.push("core");
    y = sectionTitle(body, y, "Temel Sayılar", "Pisagor (Batı) yöntemi · harf değerleri A=1 … I=9 döngüsü");
    const gap = 20;
    const cw = Math.floor((INNER - gap * 2) / 3);
    const ch = 178;
    CORE_ORDER.forEach(([k, label], i) => {
      const n = asNumber((chart.core as Record<string, unknown>)[k]);
      const col = i % 3;
      const row = Math.floor(i / 3);
      const sub = [n?.meaning?.title ?? ""].filter(Boolean);
      numberCard(body, PAD + col * (cw + gap), y + row * (ch + gap), cw, ch, label, n, null, sub, mismatch(n?.verification));
    });
    y += ch * 2 + gap + 40;
  }

  // ── Karmik
  if (chart) {
    sections.push("karmic");
    y = sectionTitle(body, y, "Karmik Bilgiler", "Eksik sayılar (karmik dersler) ve ara toplamlarda görülen karmik borçlar");
    const boxH = 150;
    const half = Math.floor((INNER - 20) / 2);
    rect(body, PAD, y, half, boxH, C.surface, 20, C.line);
    text(body, PAD + 24, y + 38, "Karmik dersler", 20, C.navy, { weight: 700 });
    const miss = Array.isArray(chart.karmicLessons?.missingNumbers) ? chart.karmicLessons.missingNumbers.filter(isNum).slice(0, 9) : [];
    if (miss.length) {
      let mx = PAD + 24;
      for (const m of miss) {
        rect(body, mx, y + 60, 52, 52, C.card, 26, C.line);
        text(body, mx + 26, y + 95, String(m), 26, C.navy, { weight: 700, anchor: "middle" });
        mx += 62;
      }
    } else {
      text(body, PAD + 24, y + 90, "Eksik sayı yok — ad tüm sayıları içeriyor.", 18, C.inkSoft);
    }
    if (mismatch(chart.karmicLessons?.verification)) pill(body, PAD + half - 170, y + 18, "Kontrol farkı", C.warn, C.warnBg, 14);
    const bx = PAD + half + 20;
    rect(body, bx, y, half, boxH, C.surface, 20, C.line);
    text(body, bx + 24, y + 38, "Karmik borçlar", 20, C.navy, { weight: 700 });
    const debts = Array.isArray(chart.karmicDebt?.debtNumbers) ? chart.karmicDebt.debtNumbers.filter(isNum).slice(0, 4) : [];
    if (debts.length) {
      let dx = bx + 24;
      for (const d of debts) dx += pill(body, dx, y + 66, `${d}`, C.warn, C.warnBg, 22) + 10;
      text(body, bx + 24, y + 134, "13 · 14 · 16 · 19 ara toplamlarından biri görülür.", 15, C.inkSoft);
    } else {
      text(body, bx + 24, y + 90, "Karmik borç görülmüyor.", 18, C.inkSoft);
    }
    if (mismatch(chart.karmicDebt?.verification)) pill(body, bx + half - 170, y + 18, "Kontrol farkı", C.warn, C.warnBg, 14);
    y += boxH + 44;
  }

  // ── Dönemsel
  const py = chart?.personalYear ?? null;
  if (py || day || daily) {
    sections.push("timing");
    const refM = ref ? Number(ref.slice(5, 7)) : null;
    y = sectionTitle(body, y, "Dönemsel Bilgiler", ref ? `Hedef tarih ${fmtIso(ref)} · kişisel yıl 1 Ocak’ta değişir` : "Kişisel döngüler");
    const cards: Array<{ label: string; value: string; sub: string; flag: boolean }> = [];
    if (py && isNum(py.personalYear)) cards.push({ label: "Kişisel Yıl", value: String(py.personalYear), sub: py.theme ?? "", flag: mismatch(py.verification) });
    if (py?.personalMonth && isNum(py.personalMonth.personalMonth)) cards.push({ label: `Kişisel Ay${refM ? ` · ${MONTHS[refM - 1]}` : ""}`, value: String(py.personalMonth.personalMonth), sub: py.personalMonth.theme ?? "", flag: mismatch(py.personalMonth.verification) });
    if (day) cards.push({ label: "Kişisel Gün", value: String(day.personalDay), sub: day.theme ?? "", flag: mismatch(day.verification) });
    if (cards.length) {
      const gap = 20;
      const n = cards.length;
      const cw = Math.floor((INNER - gap * (n - 1)) / n);
      cards.forEach((c, i) => numberCard(body, PAD + i * (cw + gap), y, cw, 168, c.label, null, c.value, [c.sub].filter(Boolean), c.flag));
      y += 168 + 24;
    }
    const age = ageAt(record.input, ref);
    const pin = currentPeriod(chart?.pinnacles, age);
    const chl = currentPeriod(chart?.challenges, age);
    if (pin || chl) {
      rect(body, PAD, y, INNER, 96, C.surface, 20, C.line);
      text(body, PAD + 24, y + 38, xmlText(`Hedef tarihte ${age} yaş`, 40), 18, C.inkSoft, { weight: 600 });
      const parts: string[] = [];
      if (pin) parts.push(`${pin.position}. zirve: ${pin.number} (${pin.startAge}–${pin.endAge ?? "…"} yaş)`);
      if (chl) parts.push(`${chl.position}. zorluk: ${chl.number}`);
      text(body, PAD + 24, y + 72, xmlText(parts.join("   ·   "), 120), 22, C.navy, { weight: 700 });
      y += 96 + 24;
    }
    if (daily) {
      const dn = asNumber(daily.number);
      rect(body, PAD, y, INNER, 92, C.violetBg, 20);
      text(body, PAD + 24, y + 38, xmlText(`Günün sayısı (sembolik) · ${fmtIso(daily.date)}`, 80), 18, C.violet, { weight: 600 });
      text(body, PAD + 24, y + 74, xmlText(`${dn?.value ?? "—"}${dn?.meaning?.title ? ` · ${dn.meaning.title}` : ""}`, 60), 24, C.violet, { weight: 700 });
      text(body, W - PAD - 24, y + 74, "Doğum verisinden hesaplanmaz · Kişisel Gün değildir", 15, C.violet, { anchor: "end" });
      y += 92 + 24;
    }
    y += 20;
  }

  // ── Kalde
  if (chal) {
    sections.push("chaldean");
    y = sectionTitle(body, y, "Kalde (Cheiro) İsim Analizi", "Harf değerleri 1–8 · bileşik sayılar 10–52 ayrı yorumlanır · Pisagor ile karıştırılmaz");
    const parts: Array<[string, unknown]> = [["Kader", chal.destiny], ["Ruh", chal.soulUrge], ["Kişilik", chal.personality]];
    const gap = 20;
    const cw = Math.floor((INNER - gap * 2) / 3);
    parts.forEach(([label, p], i) => {
      const o = rec(p);
      const root = o && isNum(o.root) ? o.root : o && isNum(o.value) ? o.value : null;
      const comp = o && isNum(o.compound) ? o.compound : null;
      const sub = [comp !== null ? `Bileşik ${comp}` : "", i === 0 && chal.numberMeaning?.planet ? `Gezegen: ${chal.numberMeaning.planet}` : ""].filter(Boolean);
      numberCard(body, PAD + i * (cw + gap), y, cw, 168, label, null, root !== null ? String(root) : "—", sub, mismatch((o?.verification ?? null) as Verification | null));
    });
    y += 168 + 24;
    const destRoot = isNum(rec(chal.destiny)?.root) ? (rec(chal.destiny)?.root as number) : null;
    // Yalnız sağlayıcı işareti VE kök gerçekten 4/8 ise (tutarsız işaret kesin bilgi gibi sunulmaz).
    if (chal.caution && (destRoot === 4 || destRoot === 8)) {
      rect(body, PAD, y, INNER, 56, C.warnBg, 16);
      text(body, PAD + 24, y + 36, xmlText(`Klasik yöntem notu: Kader kökü ${destRoot} — Kalde geleneğinde dikkat gerektiren sayılardan.`, 120), 17, C.warn, { weight: 600 });
      y += 56 + 24;
    }
    y += 20;
  }

  // ── İki sistem
  if (dual) {
    sections.push("dual");
    const p = asNumber(dual.pythagorean);
    const c = rec(dual.chaldean);
    const cr = c && isNum(c.root) ? c.root : c && isNum(c.value) ? c.value : null;
    rect(body, PAD, y, INNER, 92, C.surface, 20, C.line);
    text(body, PAD + 24, y + 38, "İki sistem (isim sayısı)", 18, C.inkSoft, { weight: 600 });
    text(body, PAD + 24, y + 74, xmlText(`Pisagor ${p?.value ?? "—"}  ·  Kalde ${cr ?? "—"}  —  ${dual.agreement ? "kökler uyumlu" : "kökler farklı (yöntem farkı, hata değildir)"}`, 120), 22, C.navy, { weight: 700 });
    y += 92 + 44;
  }

  // ── Alt bilgi
  const footY = y;
  body.push(`<line x1="${PAD}" y1="${footY}" x2="${W - PAD}" y2="${footY}" stroke="${C.line}" stroke-width="1.5"/>`);
  const at = opts.generatedAt;
  const dateTr = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).format(at);
  const left = [`Rapor tarihi ${dateTr}`, opts.expertName ? `Hazırlayan: ${opts.expertName}` : ""].filter(Boolean).join("  ·  ");
  text(body, PAD, footY + 36, xmlText(left, 140), 16, C.inkSoft);
  const note = "Bu içerik kişisel farkındalık ve gelişim amaçlıdır; tıbbi, psikolojik, hukuki veya finansal tavsiye niteliği taşımaz.";
  const nl = wrapText(note, INNER, 15, 2);
  nl.forEach((l, i) => text(body, PAD, footY + 64 + i * 22, xmlText(l, 200), 15, C.inkSoft));
  if (record.status === "partial") text(body, PAD, footY + 64 + nl.length * 22 + 6, "Kısmi analiz: bazı teknikler hesaplanamadı.", 15, C.warn, { weight: 600 });
  const height = Math.ceil(footY + 64 + nl.length * 22 + 40);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">`,
    `<defs><linearGradient id="hdr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.deep}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient></defs>`,
    `<rect x="0" y="0" width="${W}" height="${height}" fill="#ffffff"/>`,
    ...body,
    `</svg>`,
  ].join("");
  return { svg, width: W, height, sections };
}
