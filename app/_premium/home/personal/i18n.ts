"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — ana sayfa kişiselleştirme görünümünün metinleri.
 * I18N-F1-R3 (F0 #26): ayrı TR/EN sözlüğü next-intl kataloğuna taşındı → messages/{tr,en}/home.personal.json
 * (ns `home.personal`). Metinler eski sözlükle BİREBİR (TR ve EN); artık katalog kapıları (C1–C10 eşlik, ICU,
 * Türkçe dondurma) bu metinleri de görüyor. Bileşen API'si (usePwText) değişmedi.
 * KDO-05: hazır bölge adları kaldırıldı (Serbest Yerleştir). KDO-06: Okuma modu metinleri kaldırıldı.
 */
import { useTranslations } from "next-intl";

export const PW_TEXT_KEYS = [
  "viewMode",
  "view_auto",
  "view_day",
  "view_night",
  "view_focus",
  "viewDesc_auto",
  "viewDesc_day",
  "viewDesc_night",
  "viewDesc_focus",
  "autoNow",
  "editWorkspace",
  "editDisabledDemo",
  "favorites",
  "logoLabel",
  "logoEditLabel",
  "logoFreeEditLabel",
  "logoKept",
  "logoNoFit",
  "logoRejected",
  "logoDropInvalid",
  "logoDropOk",
  "logoDropNo",
  "logoFrameMissing",
] as const;

export type PwTextKey = (typeof PW_TEXT_KEYS)[number];

/** Bileşenler için: aktif dile göre metin işlevi (katalog: home.personal). */
export function usePwText(): (key: PwTextKey) => string {
  const t = useTranslations("home.personal");
  return (key) => t(key);
}
