"use client";

// Human Design transit — EKRAN DİLİ etiketleri (I18N-F1-R5 HD). YALNIZ gösterim: hesap, önbellek anahtarı (dil izolasyonu
// personalTransitService'te), kanonik kodlar DEĞİŞMEZ. TR ekranında mevcut lib etiketleri (transitLabels / transitMoment)
// AYNEN döner (bayt-bayt; useLocale() === "tr"); EN'de hd.terms sözlüğü + hd.transit kataloğu.

import { useLocale, useTranslations } from "next-intl";
import { bodyLabel, transitCenterLabel, transitChannelLabel } from "@/lib/human-design/transit/transitLabels";
import { TRANSIT_TIME_ZONE } from "@/lib/human-design/transit/transitMoment";
import type { CenterName } from "@/lib/human-design/engine/channels";
import type { PlanetName } from "@/lib/human-design/engine/types";
import { useHdTerms } from "../../_i18n/useHdTerms";

const ENGINE_TO_APP_CENTER: Record<CenterName, string> = {
  Head: "head",
  Ajna: "ajna",
  Throat: "throat",
  G: "g_identity",
  Heart: "heart_ego",
  Spleen: "spleen",
  SolarPlexus: "solar_plexus",
  Sacral: "sacral",
  Root: "root",
};

/** Hata kodları (sunucu + lib/transitMoment + istemci) → katalog anahtarı. Bilinmeyen kod → sunucunun metni. */
const ERROR_CODES = new Set([
  "INVALID_TIMEZONE",
  "INVALID_DATE",
  "INVALID_TIME",
  "DATE_OUT_OF_RANGE",
  "INVALID_OFFSET",
  "LOCAL_TIME_GAP",
  "LOCAL_TIME_AMBIGUOUS",
  "NETWORK",
]);

export function useTransitI18n() {
  const isTr = useLocale() === "tr";
  const t = useTranslations("hd.transit");
  const terms = useHdTerms();

  const center = (c: CenterName): string => {
    if (isTr) return transitCenterLabel(c);
    const full = terms.label("center", ENGINE_TO_APP_CENTER[c]);
    return full.replace(/\s*\(.*\)\s*$/, "").replace(/\s+Center$/, "").trim() || c;
  };
  const channel = (id: string, fallbackName: string): string => {
    if (isTr) return transitChannelLabel(id, fallbackName);
    const l = terms.label("channel", id);
    return l && l !== id ? l : `${id} ${fallbackName}`;
  };
  const body = (b: PlanetName): string => (isTr ? bodyLabel(b) : terms.label("planet", b));
  /** Saat dilimi görünen adı (Türkiye için "Türkiye saati"; diğerleri IANA adı). */
  const zoneName = (tz: string): string => (tz === TRANSIT_TIME_ZONE ? t("zone.turkeyTime") : tz);
  /** Kullanıcıya görünen hata: TR'de gelen metin aynen; diğer dillerde bilinen kod → katalog. */
  const error = (f: { error: string; code?: string | null }): string =>
    isTr || !f.code || !ERROR_CODES.has(f.code) ? f.error : t(`errors.${f.code}`);
  /** Sonuç başlığı: "GG.AA.YYYY saat SS:DD (bölge) için hesaplandı" (TR birebir). */
  const caption = (m: { localDate: string; localTime: string; timeZone: string }): string => {
    const [y, mo, d] = m.localDate.split("-");
    return t("caption", { date: isTr ? `${d}.${mo}.${y}` : `${d}/${mo}/${y}`, time: m.localTime, zone: zoneName(m.timeZone) });
  };
  return { isTr, t, center, channel, body, zoneName, error, caption };
}
