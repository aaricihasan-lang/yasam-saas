import { wellnessNote, type WellnessNoteKind } from "@/lib/docx/reportDisclaimer";

/**
 * Sağlık/wellness bağlamlı ekranlar için ince bilgilendirme dipnotu (FA-16).
 *
 * Kasıtlı olarak DİKKAT ÇEKMEYEN: küçük punto, gri, ikon/uyarı kutusu yok
 * (BiyoenerjiDisclaimer stili). Uzmanın içeriğine müdahale etmez; yalnız
 * kaydın destekleyici niteliğini hatırlatır.
 */
export function WellnessNote({ kind = "general", className = "" }: { kind?: WellnessNoteKind; className?: string }) {
  return (
    <p className={`px-1 text-[11px] font-medium leading-relaxed text-slate-400 ${className}`}>
      {wellnessNote(kind).full}
    </p>
  );
}
