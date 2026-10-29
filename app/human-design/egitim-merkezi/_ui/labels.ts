// Kayıt satırı skaler kodları (type_code / authority_code / profile_code) → mevcut uygulama sözlüğündeki Türkçe etiketler.
// Yeni sözlük YOK: lib/human-design/codeHelpers yeniden kullanılır; tanınmayan kod boş döner (tahmin yok).
import { hdAuthorityLabelFromCode, hdProfileLabelFromCode, hdTypeLabelFromCode } from "@/lib/human-design/codeHelpers";

const safe = (f: (c: string) => string, c: string | null | undefined) => {
  if (!c) return "";
  try { return f(c) || ""; } catch { return ""; }
};
export const hdTypeTr = (c: string | null | undefined) => safe(hdTypeLabelFromCode, c);
export const hdAuthorityTr = (c: string | null | undefined) => safe(hdAuthorityLabelFromCode, c);
export const hdProfileTr = (c: string | null | undefined) => safe(hdProfileLabelFromCode, c);
