"use client";

/**
 * I18N: Aromaterapi enum (şema kodu) → ekran etiketi. Kanonik kodlar DEĞİŞMEZ; readLabels.ts Türkçe sözlükleri
 * (Word raporu ve harness kaynağı) aynen kalır. Ekran etiketi `aromatherapy.enums.<SÖZLÜK>.<kod>` anahtarından gelir
 * (TR değerleri readLabels.ts ile birebir). Kod boşsa "—"; katalogda olmayan (bilinmeyen) kod HAM KOD olarak
 * gösterilir — ham katalog anahtarı ASLA (readLabels `tr.label` dürüst yedek sözleşmesiyle aynı).
 */
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import * as READ_LABELS from "./readLabels";

const MAP_NAME = new Map<Readonly<Record<string, string>>, string>();
for (const [k, v] of Object.entries(READ_LABELS)) {
  if (k.endsWith("_TR") && v && typeof v === "object" && !MAP_NAME.has(v as Record<string, string>)) {
    MAP_NAME.set(v as Record<string, string>, k.slice(0, -3));
  }
}

export type EnumLabelFn = (map: Readonly<Record<string, string>>, code: string | null | undefined) => string;

export function useEnumLabel(): EnumLabelFn {
  const t = useTranslations("aromatherapy.enums");
  // Kararlı referans (useCallback bağımlılıklarında güvenle kullanılabilir).
  return useCallback<EnumLabelFn>((map, code) => {
    if (!code) return "—";
    const name = MAP_NAME.get(map);
    // Yalnız sözlüğün KENDİ anahtarı (prototip adlı kod — "constructor", "toString" vb. — katalog yoluna gitmez → ham kod).
    if (name && Object.prototype.hasOwnProperty.call(map, code) && t.has(`${name}.${code}`)) return t(`${name}.${code}`);
    return code;
  }, [t]);
}

/** Seçenek listesi (değer sırası korunur): [{ value, label }] — etiket ekran dilinde. */
export function useEnumOptions(): (values: readonly string[], map: Readonly<Record<string, string>>) => { value: string; label: string }[] {
  const label = useEnumLabel();
  return useCallback(
    (values: readonly string[], map: Readonly<Record<string, string>>) => values.map((value) => ({ value, label: label(map, value) })),
    [label],
  );
}
