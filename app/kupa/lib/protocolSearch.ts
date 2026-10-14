/**
 * KUPA & HACAMAT — protokol listesi arama eşleşmesi (SAF; birim testli).
 *
 * Eşleşme alanları: başlık + kategori + ETİKETLER ("Arama ve Sınıflandırma Etiketleri").
 * Türkçe katlama tek ölçü: app/kupa/lib/trFold (İ→i, I→ı, ı≡i; harf duyarsız).
 * Boş/whitespace sorgu → her protokol eşleşir (filtre yok).
 */
import { trIncludes } from "./trFold";

export type ProtocolSearchable = {
  title: string;
  category?: string | null;
  tags?: readonly string[] | null;
};

export function protocolMatchesQuery(p: ProtocolSearchable, query: string): boolean {
  if (query.trim() === "") return true;
  if (trIncludes(p.title, query)) return true;
  if (p.category && trIncludes(p.category, query)) return true;
  // Etiketler TEK TEK denenir (birleştirilmiş metinde etiket sınırını aşan sahte eşleşme olmaz).
  return (p.tags ?? []).some((t) => typeof t === "string" && trIncludes(t, query));
}
