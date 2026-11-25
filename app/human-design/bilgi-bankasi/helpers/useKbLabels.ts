"use client";

// Bilgi Bankası — YALNIZ GÖSTERİM etiketleri (I18N-F1-R5 HD).
//
// DB'deki kategori değeri Türkçe kanoniktir (HD_KNOWLEDGE_CATEGORIES: "Tipler", "Kapılar" …) ve DEĞİŞMEZ: kayıt, filtre,
// sorgu ve kod üretimi her dilde aynı TR değerle çalışır. Okuma sınırında değer koda (HD_KNOWLEDGE_CATEGORY_PREFIX) eşlenir
// ve yalnız ekranda görünen ad dile göre seçilir. Yapısal seçeneklerin kaydedilen kodu/başlığı da değişmez; yalnız
// <option> metni çevrilir. TR ekranında mevcut kaynak etiketler AYNEN döner (bayt-bayt; useLocale() === "tr").

import { useLocale, useTranslations } from "next-intl";
import { HD_KNOWLEDGE_CATEGORY_PREFIX, type HdKnowledgeCategory } from "@/lib/human-design/constants";
import { HD_CENTER_KB_FAMILIES, type StructuredOption } from "@/lib/human-design/codeHelpers";
import { useHdTerms } from "../../_i18n/useHdTerms";
import { KB_NETWORK_ERROR } from "./kbNetworkError";

/** DB kanonik kategori → gösterim kodu (bilinmeyen → null; ham değer gösterilir). */
export function kbCategoryCode(category: string): string | null {
  return (HD_KNOWLEDGE_CATEGORY_PREFIX as Record<string, string>)[category] ?? null;
}

const CENTER_FAMILY_STATE: Record<string, string> = {
  [HD_CENTER_KB_FAMILIES.defined]: "defined",
  [HD_CENTER_KB_FAMILIES.undefined]: "undefined",
  [HD_CENTER_KB_FAMILIES.open]: "open",
};

export function useKbLabels() {
  const locale = useLocale();
  const tr = locale === "tr";
  const t = useTranslations("hd.knowledge");
  const terms = useHdTerms();

  /** Kategori görünen adı; TR'de DB değeri aynen. */
  const category = (cat: string): string => {
    if (tr) return cat;
    const code = kbCategoryCode(cat);
    return code ? t(`category.${code}`) : cat;
  };

  /** Yapısal seçenek görünen adı (kaydedilen opt.code / opt.label değişmez). */
  const option = (cat: HdKnowledgeCategory | string, opt: StructuredOption): string => {
    if (tr) return opt.label;
    switch (cat) {
      case "Tipler":
        return terms.label("type", opt.code);
      case "Otoriteler":
        return terms.label("authority", opt.code);
      case "Profiller":
        return terms.label("profile", opt.code);
      case "Tanımlar": // i18n-ignore: DB kanonik kategori değeri (karşılaştırma; gösterilmez)
        return terms.label("definition", opt.code);
      case "Kanallar":
        return terms.label("channel", opt.code.replace(/_/g, "-"));
      case "Kapılar": // i18n-ignore: DB kanonik kategori değeri (karşılaştırma; gösterilmez)
        return t("gateOption", { n: opt.code });
      case "Merkezler": {
        const m = /^(tanimli|tanimsiz|tam_acik|acik)_(.+)$/.exec(opt.code);
        if (!m) return opt.label;
        const center = terms.label("center", m[2]);
        if (m[1] === HD_CENTER_KB_FAMILIES.legacy) return t("legacyCenterOption", { center });
        return `${terms.label("centerState", CENTER_FAMILY_STATE[m[1]])} — ${center}`;
      }
      default:
        return opt.label;
    }
  };

  /** İstemci yardımcısı hata metni: ortak ağ hatası ekran diline eşlenir; sunucu metni aynen. */
  const err = (e: string | null | undefined): string => (!tr && e === KB_NETWORK_ERROR ? t("networkError") : String(e ?? ""));

  return { category, option, err, isTr: tr };
}
