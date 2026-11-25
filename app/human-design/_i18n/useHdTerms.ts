"use client";

// D-HD — Human Design KANONİK KOD → görünen etiket (gösterim eşlemesi; I18N).
//
// Kanonik değerler (tip/otorite/profil/tanım/merkez/kanal kodları, gezegen adı, merkez durumu) ÇEVRİLMEZ ve kontrol
// akışında kullanılmaz; yalnız ekranda görünen ad dile göre seçilir. Sözlük: messages/<dil>/hd.terms.json.
// TR değerleri mevcut kaynak etiketlerle (lib/human-design/constants.ts, codeHelpers, hdDisplayLabels, centerStates,
// planetGlyphs) BAYT-BAYT aynıdır — scripts/hd-i18n/terms-catalog.harness.ts kilitler. Bilinmeyen kod → kodun kendisi
// (uydurma yok), boş → "—" (mevcut yardımcılarla aynı).

import { useTranslations } from "next-intl";

type Group =
  | "type"
  | "authority"
  | "profile"
  | "definition"
  | "center"
  | "channel"
  | "centerState"
  | "planet"
  | "title"
  | "strategy"
  | "signature"
  | "notSelf"
  | "angle";

const angleKey = (angle: string): string | null => {
  const k = angle.toLowerCase().replace(/[\s_\-]+/g, "");
  return k === "rightangle" ? "right_angle" : k === "leftangle" ? "left_angle" : k === "juxtaposition" ? "juxtaposition" : null;
};

export function useHdTerms() {
  const t = useTranslations("hd.terms");
  const label = (group: Group, code: string | number | null | undefined): string => {
    if (code === null || code === undefined || code === "") return "—";
    const key = `${group}.${String(code)}`;
    return t.has(key) ? t(key) : String(code);
  };
  return {
    label,
    /** Ego otoritesinde tip ayrımı (codeHelpers.hdAuthorityDisplayLabel ile aynı kural). */
    authority: (code: string | null | undefined, typeCode: string | null | undefined): string => {
      if (code === "ego_heart" && typeCode === "manifestor") return label("authority", "ego_manifested");
      if (code === "ego_heart" && typeCode === "projector") return label("authority", "ego_projected");
      return label("authority", code);
    },
    /** Enkarnasyon açısı (sağlayıcı "Right Angle" / "RAX" değil, açı adı); bilinmeyen → ham değer. */
    angle: (angle: string | null | undefined): string => {
      if (!angle) return "—";
      const k = angleKey(angle);
      return k ? label("angle", k) : angle;
    },
  };
}
