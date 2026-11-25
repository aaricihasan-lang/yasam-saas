// Kayıt satırı skaler kodları (type_code / authority_code / profile_code) → mevcut uygulama sözlüğündeki Türkçe etiketler.
// Yeni sözlük YOK: lib/human-design/codeHelpers yeniden kullanılır; tanınmayan kod boş döner (tahmin yok).
import { hdAuthorityLabelFromCode, hdProfileLabelFromCode, hdTypeLabelFromCode } from "@/lib/human-design/codeHelpers";
import { useTranslations } from "next-intl";
import { useHdLabels } from "@/app/human-design/_i18n/useHdLabels";
import { anchorLabel, type AnnAnchor, type AnnCenterId } from "@/lib/human-design/education/annotations/annotationContract";

const safe = (f: (c: string) => string, c: string | null | undefined) => {
  if (!c) return "";
  try { return f(c) || ""; } catch { return ""; }
};
export const hdTypeTr = (c: string | null | undefined) => safe(hdTypeLabelFromCode, c);
export const hdAuthorityTr = (c: string | null | undefined) => safe(hdAuthorityLabelFromCode, c);
export const hdProfileTr = (c: string | null | undefined) => safe(hdProfileLabelFromCode, c);

/**
 * I18N (HD Eğitim Merkezi) — aynı etiketler ekran dilinde, TR GEÇİŞLİ: TR'de yukarıdaki yardımcılar AYNEN (metin bayt-bayt aynı);
 * diğer dillerde hd.terms. Boş kod → "" (tahmin yok; filtre(Boolean) davranışı aynı). Kanonik kod değişmez.
 */
export function useEduHdLabels() {
  const L = useHdLabels();
  const en = (g: "type" | "authority" | "profile", c: string | null | undefined) => (c ? L.terms.label(g, c) : "");
  return {
    isTr: L.isTr,
    type: (c: string | null | undefined) => (L.isTr ? hdTypeTr(c) : en("type", c)),
    authority: (c: string | null | undefined) => (L.isTr ? hdAuthorityTr(c) : en("authority", c)),
    profile: (c: string | null | undefined) => (L.isTr ? hdProfileTr(c) : en("profile", c)),
  };
}

export type EduLabelGroup =
  | "privCategory" | "privState" | "privKind" | "privMethod" | "eduCategory" | "evidence" | "evidenceHint" | "bioLang" | "bioSection" | "bioSourceKind";

/**
 * Eğitim sözlük kodu → görünen ad (yalnız gösterim). TR'de lib sözlüğündeki metin AYNEN döner (`tr` argümanı; katalog TR
 * değerleri aynı sözlükten üretildi); diğer dillerde hd.education.labels.<grup>.<kod>. Bilinmeyen kod → TR yedeği / kodun kendisi.
 * DB / API / filtre değerleri her zaman koddur.
 */
export function useEduLabel() {
  const t = useTranslations("hd.education.labels");
  const isTr = useHdLabels().isTr;
  return (group: EduLabelGroup, code: string | null | undefined, tr?: string | null): string => {
    const c = String(code ?? "");
    if (isTr) return tr ?? c;
    const key = `${group}.${c}`;
    return c && t.has(key) ? t(key) : tr ?? c;
  };
}

const ANN_CENTER_TERM: Readonly<Record<AnnCenterId, string>> = {
  Head: "head", Ajna: "ajna", Throat: "throat", G: "g_identity", Heart: "heart_ego", Sacral: "sacral", Root: "root", Spleen: "spleen", SolarPlexus: "solar_plexus",
};

/** Çizim hedefi (kapı / kanal / merkez) görünen adı. TR: lib anchorLabel AYNEN; diğer dillerde hd.terms + katalog. */
export function useAnchorLabel() {
  const L = useHdLabels();
  const t = useTranslations("hd.education.ws");
  return (a: AnnAnchor | null): string | null => {
    if (L.isTr || !a) return anchorLabel(a);
    if (a.k === "g") return t("anchorGate", { id: String(a.id) });
    if (a.k === "h") return t("anchorChannel", { id: a.id });
    return L.terms.label("center", ANN_CENTER_TERM[a.id]);
  };
}
