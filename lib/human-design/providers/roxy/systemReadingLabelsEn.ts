// I18N (HD, R5 — Roxy ajanı bulgusu B2): Sistem Yorumu DTO'sunun SİSTEM etiketleri (başlık, ayrıntı etiketi, merkez /
// kanal / tip / otorite / tanım adı) sağlayıcı metin dili "tr" DIŞINDA iken İngilizce sözlükten gelir.
// Kaynak: messages/en/hd.terms.json (kanonik kod → EN terim) + messages/en/hd.reading.json (dto.*). TR yolu bu modülü
// KULLANMAZ — mevcut Türkçe çıktı birebir aynıdır. Yalnız gösterim; provider_raw / hesap / kimlik değişmez.

import enTerms from "@/messages/en/hd.terms.json";
import enReading from "@/messages/en/hd.reading.json";

type Dict = Record<string, string>;
const T = enTerms.hd.terms as unknown as Record<string, Dict>;
const D = enReading.hd.reading.dto as Dict;

const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

export const SR_EN = {
  title: (key: string): string | null => T.title?.[key] ?? null,
  term: (group: string, code: string | null | undefined): string | null => (code ? T[group]?.[code] ?? null : null),
  detail: (key: string, vars: Record<string, string | number> = {}): string => fill(D[key] ?? key, vars),
};
