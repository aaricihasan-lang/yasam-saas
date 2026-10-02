import { hesaplaNumeroloji } from "./numerolojiMotor";

/**
 * Numeroloji hesaplama metodolojisi sürümü (NUM-F02).
 *
 * Kayıtlı analizlerde `analysis_data.calc.methodology` olarak SUNUCUDA damgalanır.
 * Damgası bu değere eşit olmayan (eski) kayıtlar, ekranda/Word'de güncel yöntemle
 * yeniden hesaplanarak ve bu durum AÇIKÇA belirtilerek gösterilir; kayıtlı ilk sonuç
 * (snapshot) veritabanında DEĞİŞTİRİLMEZ.
 *
 * Kaynak: "kitap 1. seviye.pdf" (252 s.) ve "kitap 2. seviye.pdf" (239 s.) — Pera Akademi
 * Numeroloji Eğitimi. Kural → sayfa eşlemesi: docs/numeroloji-pdf-metodoloji-spec.md
 */
export const NUMEROLOJI_METHODOLOGY_VERSION = "pdf-k1k2-2026-10";

export const NUMEROLOJI_METHODOLOGY_LABEL = "Numeroloji Eğitimi kitap 1. ve 2. seviye metodolojisi";

/** Kayıt doğum tarihi (GG/AA/YYYY, GG.AA.YYYY veya YYYY-AA-GG) → motor girdisi (GG.AA.YYYY). */
export function birthDateForEngine(raw: string): string {
  const s = String(raw ?? "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[3].padStart(2, "0")}.${iso[2].padStart(2, "0")}.${iso[1]}`;
  return s.replace(/\//g, ".").replace(/-/g, ".");
}

type ResultLike = { key?: unknown; display?: unknown } | null | undefined;
type PinLike = Record<string, unknown> | null | undefined;

function keyOf(r: ResultLike): string {
  if (!r || typeof r !== "object") return "";
  const k = typeof r.key === "string" ? r.key : "";
  const d = typeof r.display === "string" ? r.display : "";
  return (k || d).trim();
}

function pinOf(p: PinLike): string {
  if (!p || typeof p !== "object") return "";
  return ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"].map((k) => String(p[k] ?? "")).join(",");
}

/** Çekirdek imza: kayıt/rapor tutarlılığını belirleyen değerler. */
export function coreSignature(motor: unknown): string {
  const m = (motor ?? {}) as Record<string, unknown>;
  return [
    keyOf(m.anaKulvar as ResultLike),
    keyOf(m.yanKulvar as ResultLike),
    keyOf(m.ifadeSayisi as ResultLike),
    keyOf(m.hayatYolu as ResultLike),
    pinOf(m.pinKodu as PinLike),
  ].join("|");
}

/**
 * NUM-F01 (sunucu): istemcinin gönderdiği motor sonucu, aynı ad/soyad/doğum tarihinden
 * GÜNCEL motorla üretilen sonuçla birebir mi? Değilse kayıt reddedilir
 * ("yeni kişi + eski kişinin sayıları" ya da eski önbellekli motor kaydedilemez).
 */
export function verifyMotorMatchesInputs(
  name: string,
  surname: string,
  birthDate: string,
  motor: unknown,
): { ok: true } | { ok: false; reason: "invalid_input" | "mismatch" } {
  const fn = String(name ?? "").trim();
  const ln = String(surname ?? "").trim();
  const bd = String(birthDate ?? "").trim();
  if (!fn || !ln || !bd) return { ok: false, reason: "invalid_input" };
  let expected: unknown;
  try {
    expected = hesaplaNumeroloji({ firstName: fn, lastName: ln, birthDate: birthDateForEngine(bd) });
  } catch {
    return { ok: false, reason: "invalid_input" };
  }
  return coreSignature(expected) === coreSignature(motor) ? { ok: true } : { ok: false, reason: "mismatch" };
}
