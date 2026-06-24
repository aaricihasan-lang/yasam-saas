// Demo fixture — Aromaterapi Bilgi Bankası.
// is_demo_account=true hesabında gerçek tenant referans içeriği (fetchReferenceSheets)
// HİÇ çekilmez; bunun yerine bu örnek sheet'ler gösterilir. İçerik DemoGate ile
// blur'lanır — başlıklar/sekmeler görünür, gövde örnek metindir (gerçek veri değil).

import type { ReferenceSheet } from "@/lib/aromaterapi/aromatherapyKnowledgeData";

function row(
  sheetId: string,
  rowIndex: number,
  cells: Record<string, string>,
  isHeader = false,
) {
  return {
    id: `demo-aroma-kb-${sheetId}-${rowIndex}`,
    sheet_id: sheetId,
    row_index: rowIndex,
    cells,
    is_header: isHeader,
  };
}

export const DEMO_AROMA_KNOWLEDGE_SHEETS: ReferenceSheet[] = [
  {
    id: "demo-aroma-kb-genel",
    sheet_name: "Genel Bilgi",
    display_title: "Genel Bilgi",
    headers: [],
    sort_order: 0,
    rows: [
      row("genel", 0, { "0": "AROMATERAPİYE GİRİŞ" }),
      row("genel", 1, {
        "1": "Aromaterapi, bitkilerden elde edilen uçucu yağların bütünsel iyilik hâli için kullanıldığı tamamlayıcı bir yaklaşımdır. (Demo örnek metin)",
      }),
      row("genel", 2, { "0": "Uçucu Yağ", "1": "Bitkinin aromatik bileşenlerini yoğun biçimde içeren uçucu sıvı. (Demo örnek tanım)" }),
      row("genel", 3, { "0": "Taşıyıcı Yağ", "1": "Uçucu yağların cilde güvenle uygulanması için seyreltildiği sabit bitkisel yağ. (Demo örnek tanım)" }),
      row("genel", 4, { "1": "Tam sürümde bu bölümde uzman tarafından hazırlanmış ayrıntılı referans içeriği yer alır." }),
    ],
  },
  {
    id: "demo-aroma-kb-eldeetme",
    sheet_name: "Uçucu Yağ Elde Etme Yöntemleri",
    display_title: "Uçucu Yağ Elde Etme Yöntemleri",
    headers: [],
    sort_order: 1,
    rows: [
      row("eldeetme", 0, { "0": "Yöntem", "1": "Açıklama", "2": "Uygun Bitki", "3": "Not" }, true),
      row("eldeetme", 1, { "0": "Su Buharı Damıtması", "1": "Demo örnek açıklama", "2": "Lavanta", "3": "—" }),
      row("eldeetme", 2, { "0": "Soğuk Pres", "1": "Demo örnek açıklama", "2": "Narenciye", "3": "—" }),
      row("eldeetme", 3, { "0": "Çözücü Ekstraksiyon", "1": "Demo örnek açıklama", "2": "Yasemin", "3": "—" }),
    ],
  },
  {
    id: "demo-aroma-kb-etki",
    sheet_name: "Uçucu Yağların Etki Mekanizması",
    display_title: "Uçucu Yağların Etki Mekanizması",
    headers: [],
    sort_order: 2,
    rows: [
      row("etki", 0, { "0": "ETKİ YOLAKLARI" }),
      row("etki", 1, { "1": "Koku alma sistemi ve cilt yoluyla emilim üzerine demo örnek açıklama metni." }),
      row("etki", 2, { "1": "Tam sürümde bu bölümde etki mekanizmalarına dair ayrıntılı referans içeriği açık olarak sunulur." }),
    ],
  },
];
