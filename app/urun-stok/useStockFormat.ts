"use client";

/**
 * Ürün & Stok — para / miktar gösterimi lib/i18n/format'a bağlanır (F1-R3 D2; K3 koordinatör isteği 3).
 *
 * - Kaynak dilde (tr) lib biçimleyicisinin KENDİSİ çağrılır → TR çıktısı karakteri karakterine aynı
 *   (ör. "₺1.234,50", fmtQty "12.5"). Negatif tutar biçimi de (₺-5,00) değişmez.
 * - Diğer dillerde: para `formatCurrency(tutar, locale)` (para birimi TRY — kur dönüşümü YOK, tutar
 *   DEĞİŞMEZ); miktar, lib'in yuvarladığı değer üzerinden `formatNumber` (yuvarlama lib ile aynı kalır).
 * Hesaplama, karşılaştırma ve kayıtlar bu fonksiyonlara BAĞLANMAZ; yalnız ekran metni.
 */
import { useMemo } from "react";
import { useLocale } from "next-intl";
import { DEFAULT_LOCALE, type ActiveLocale } from "@/lib/i18n/locales";
import { formatCurrency, formatNumber } from "@/lib/i18n/format";

type MoneyFn = (x: number) => string;
type QtyFn = (x: number, maxDec?: number) => string;

export function useStockFormat(lib: { fmtMoney: MoneyFn; fmtQty?: QtyFn }) {
  const locale = useLocale() as ActiveLocale;
  const { fmtMoney: libMoney, fmtQty: libQty } = lib;
  return useMemo(() => {
    const isSourceLocale = locale === DEFAULT_LOCALE;
    const fmtMoney: MoneyFn = (x) => (isSourceLocale ? libMoney(x) : formatCurrency(x, locale, "TRY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const fmtQty: QtyFn = (x, maxDec) => {
      const s = libQty ? (maxDec === undefined ? libQty(x) : libQty(x, maxDec)) : String(x);
      if (isSourceLocale) return s;
      const n = Number(s);
      return Number.isFinite(n) ? formatNumber(n, { maximumFractionDigits: 20 }, locale) : s;
    };
    return { fmtMoney, fmtQty };
  }, [locale, libMoney, libQty]);
}
