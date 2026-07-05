/**
 * lib/dogaltas/duplicateName.ts — Modül-bazlı çift kayıt kontrolü için isim normalleştirme (DT-P1-1).
 *
 * Aynı kabul edilir: "Ametist", "ametist", "AMETİST", "Ametİst", " Ametist ",
 * fazla boşluklu "Ametist". Türkçe İ/i/ı karmaşası düzgün çözülür (normalizeTrSearch
 * tr-TR küçük harf + ı/İ katlama yapar).
 *
 * Kapsam: yalnız isim/başlık/ad karşılaştırması. Her modül KENDİ tablosunda kullanır.
 */
import { normalizeTrSearch } from "@/lib/dogaltas/mineralsListFetch";

export function normalizeDuplicateName(name: unknown): string {
  const trimmed = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return normalizeTrSearch(trimmed);
}

/** Duplicate kontrolü yapılan modül tipleri. */
export type DuplicateType = "stone" | "mineral" | "knowledge" | "combination";
