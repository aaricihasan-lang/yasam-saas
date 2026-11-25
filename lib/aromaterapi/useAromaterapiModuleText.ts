"use client";

/**
 * I18N: Aromaterapi bölüm kayıt defteri (aromaterapiModules.ts) Türkçe etiketleri kanonik/harness kaynağı olarak KALIR;
 * ekranda gösterim `aromatherapy.modules.<id>` ve `aromatherapy.facets.<anahtar>` katalog anahtarlarından gelir.
 * Kimliği katalogda olmayan (yeni eklenmiş) bölüm Türkçe kayıt defteri metniyle gösterilir (ham anahtar asla).
 */
import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MAX_BULK_DELETE_IDS } from "@/lib/api/bulkDeleteLimits";
import { writeMessageForCode as catalogWriteMessageForCode } from "./catalogWrite";
import { sourceMessageForCode } from "./sourceWrite";
import { writeMessageForCode as claimWriteMessageForCode } from "./claimWrite";
import type { AromaterapiModule } from "./aromaterapiModules";
import { oilTypeLabel } from "./aromatherapyData";

const FACET_KEY: Record<string, string> = {
  "/aromaterapi/ucucu-yaglar?view=list": "ucucu",
  "/aromaterapi/sabit-yaglar?view=list": "sabit",
  "/aromaterapi/maserasyon-yaglari?view=list": "maserasyon",
};

export function useAromaterapiModuleText() {
  const t = useTranslations("aromatherapy");
  return {
    label: (m: Pick<AromaterapiModule, "id" | "label">) => (t.has(`modules.${m.id}.label`) ? t(`modules.${m.id}.label`) : m.label),
    description: (m: Pick<AromaterapiModule, "id" | "description">) =>
      t.has(`modules.${m.id}.description`) ? t(`modules.${m.id}.description`) : m.description,
    facet: (f: { href: string; label: string }) => {
      const k = FACET_KEY[f.href];
      return k ? t(`facets.${k}`) : f.label;
    },
  };
}

/** oil_type (kanonik İngilizce kimlik: essential/carrier/…) → ekran etiketi; bilinmeyen tip TR etiket/ham değerle. */
export function useOilTypeLabel(): (oilType: string) => string {
  const t = useTranslations("aromatherapy.oilTypes");
  return (v) => (t.has(v) ? t(v) : oilTypeLabel(v));
}

/** Okuma API hata kodu → ekran metni (TR = lib/aromaterapi/readClient ERROR_MESSAGES birebir). */
export function useAromaReadError(): (code: string | null) => string {
  const t = useTranslations("aromatherapy.readErrors");
  return (code) => (code && t.has(code) ? t(code) : t("generic"));
}

/** Yağ formu alan etiketi / yer tutucusu (aromatherapy.oilFields.<alan>); katalogda yoksa okunur alan adı (ham katalog anahtarı asla). */
export function useOilFieldText() {
  const t = useTranslations("aromatherapy.oilFields");
  return {
    label: (k: string) => (t.has(`${k}.label`) ? t(`${k}.label`) : k.replace(/_raw$/, "").replace(/_/g, " ")),
    placeholder: (k: string) => (t.has(`${k}.placeholder`) ? t(`${k}.placeholder`) : undefined),
  };
}

/**
 * Katalog/yöntem yazma hata kodu → ekran metni. tr'de catalogWrite.writeMessageForCode birebir;
 * diğer dilde aromatherapy.writeErrors.<kod> (eşlenmeyen → genel metin).
 */
export function useCatalogWriteError(): (code: string | null) => string {
  const t = useTranslations("aromatherapy.writeErrors");
  const locale = useLocale();
  return (code) =>
    locale === "tr" ? catalogWriteMessageForCode(code) : code && t.has(code) ? t(code) : t("generic");
}

/**
 * Kaynak yazma hata kodu → ekran metni. tr'de sourceWrite.sourceMessageForCode birebir;
 * diğer dilde aromatherapy.sources.errors.<kod> → aromatherapy.writeErrors.<kod> → genel metin.
 */
export function useSourceWriteError(): (code: string | null) => string {
  const ts = useTranslations("aromatherapy.sources.errors");
  const tw = useTranslations("aromatherapy.writeErrors");
  const locale = useLocale();
  return (code) => {
    if (locale === "tr") return sourceMessageForCode(code);
    if (code && ts.has(code)) return ts(code);
    return code && tw.has(code) ? tw(code) : tw("generic");
  };
}

/**
 * Bilgi kaydı (claim) yazma hata kodu → ekran metni. tr'de claimWrite.writeMessageForCode birebir;
 * diğer dilde aromatherapy.claimWriteErrors.<kod> (eşlenmeyen → genel metin).
 */
export function useClaimWriteError(): (code: string | null) => string {
  const t = useTranslations("aromatherapy.claimWriteErrors");
  const locale = useLocale();
  return (code) =>
    locale === "tr" ? claimWriteMessageForCode(code) : code && t.has(code) ? t(code) : t("generic");
}

/**
 * Yağ/karışım/Word API hatası → ekran metni (gece eklenen dil-bağımsız AROMA_* kodları).
 * - tr: kütüphane/sunucu Türkçe metni BİREBİR (`error`; yoksa `fallback`) — eski davranış.
 * - diğer dil: `aromatherapy.errors.codes.<KOD>`; kod yoksa/eşlenmemişse `fallback` (Türkçe sızıntı yok).
 * `detail` biçimi: ayrıntı şablonlu çağrılar için tr'de sunucu metni, diğer dilde çevrilmiş kod metni (yoksa null).
 */
export function useAromaApiError() {
  const t = useTranslations("aromatherapy.errors.codes");
  const locale = useLocale();
  const codeText = useCallback(
    (code: string | null | undefined): string | null =>
      code && t.has(code) ? t(code, { max: MAX_BULK_DELETE_IDS }) : null,
    [t],
  );
  const text = useCallback(
    (error: string | null | undefined, code: string | null | undefined, fallback: string): string =>
      locale === "tr" ? (error ?? fallback) : (codeText(code) ?? fallback),
    [locale, codeText],
  );
  const detail = useCallback(
    (error: string | null | undefined, code: string | null | undefined): string | null =>
      locale === "tr" ? (error ?? null) : codeText(code),
    [locale, codeText],
  );
  return { text, detail, isSourceLocale: locale === "tr" };
}
