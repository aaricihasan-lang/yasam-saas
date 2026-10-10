// HD Bilgi Bankası — uzman kayıt alanlarının GÖRÜNEN adları ve açıklamaları (SAF; tek kaynak).
//
// Gizlilik düzenlemesi (2026-10-09): yalnız arayüz adları değişti; DB kolonları AYNEN:
//   content       → "Bilgi ve Açıklamalar"   (uzman Word'e eklemeyi SEÇERSE rapora girer)
//   expert_notes  → "Özel Çalışma Notları"   (danışan raporuna HİÇBİR durumda girmez — sunucu kuralı)

export const KB_CONTENT_LABEL = "Bilgi ve Açıklamalar";
export const KB_NOTES_LABEL = "Özel Çalışma Notları";

/** Kategoriye göre konu ifadesi ("Bu kapı", "Bu kanal" …); bilinmeyen/serbest → "Bu konu". */
export function kbSubjectPhrase(category: string | null | undefined): string {
  switch (category) {
    case "Kapılar": return "Bu kapı";
    case "Kanallar": return "Bu kanal";
    case "Merkezler": return "Bu merkez";
    case "Tipler": return "Bu tip";
    case "Otoriteler": return "Bu otorite";
    case "Profiller": return "Bu profil";
    case "Tanımlar": return "Bu tanım";
    case "Stratejiler": return "Bu strateji";
    default: return "Bu konu";
  }
}

export function kbContentHelp(category: string | null | undefined): string {
  return `${kbSubjectPhrase(category)} hakkında eğitimlerinizden, kitaplarınızdan ve kendi çalışmalarınızdan edindiğiniz bilgileri yazabilirsiniz. Bu bilgiler yalnızca siz Word raporuna eklemeyi seçerseniz raporda yer alır.`;
}

export const KB_NOTES_HELP = "Kendiniz için hatırlatmalar ve özel çalışma notları yazabilirsiniz. Bu notlar danışan raporuna aktarılmaz.";
