/**
 * WT7 — sentetik ZZ_ danışan veri kümeleri (unit + performans testleri).
 * Gerçek kullanıcı verisi YOK. Her danışan tekli raporun tüm bölümlerini doldurur
 * (genel bilgiler, randevu, taş, seans, ücret [ödendi/ödenmedi/belirtilmemiş], ödev, analiz).
 */
import type { ClientDataset } from "@/app/api/clients/[id]/word-report/clientReportBuilder";

export const LONG_TAIL = "SON_KELIME_KESILMEDI_ĞÜŞİÖÇ";

export function longText(i: number): string {
  // ~3 KB serbest metin; sonu ayırt edici işaretle biter (kesilme testi).
  const unit = `Danışan ${i} için uzun not — çğıöşü ÇĞİÖŞÜ "tırnak" & <açı> ayraç. `;
  return unit.repeat(40) + LONG_TAIL + `_${i}`;
}

export function makeDataset(i: number, opts: { rich?: boolean } = {}): ClientDataset {
  const rich = opts.rich ?? true;
  const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const ad = `ZZ_Ayşe${i}`;
  const soyad = `Çiğdem-Işık${i}`;
  return {
    client: {
      id, ad, soyad, telefon: `0555 000 ${String(i).padStart(4, "0")}`,
      dogum: "1990-03-15", gorusme: "27.09.2026", burc: "Balık", kan: "A Rh+", mizac: "sovdavi",
      profile_image_url: null,
    },
    notes: {
      saglik_notu: rich ? longText(i) : `Sağlık notu ${i}`,
      adres: `İzmir / Karşıyaka ${i}`,
      oneriler: `Öneri ${i}: günlük yürüyüş.`,
      notlar: null,
    },
    appointments: [
      { id: `${id}-a1`, title: `ZZ randevu ${i}`, notes: "Randevu notu ğüş", appointment_date: "2026-09-27T07:00:00Z", status: "bekliyor" },
      { id: `${id}-a2`, title: `ZZ gece görüşmesi ${i}`, notes: null, appointment_date: "2026-09-26T22:30:00Z", status: "tamamlandi" },
    ],
    stones: [{ id: `${id}-s1`, stone_name: "iolit", stone_type: "Taşıma", stone_date: "2026-09-27", created_at: "2026-09-27T09:00:00Z" }],
    sessions: [{ id: `${id}-se1`, session_date: "2026-09-27", session_type: `Enerji Seansı ${i}`, duration_minutes: 45, created_at: "2026-09-27T09:00:00Z" }],
    homeworks: [{
      id: `${id}-h1`, title: `Nefes çalışması ${i}`, homework_type: "Günlük", description: rich ? longText(i + 1000) : "Sabah 5 dk.",
      start_date: "2026-09-27", end_date: "2026-10-04", status: "devam",
      expert_note: `GIZLI_UZMAN_NOTU_${i}`, client_feedback: "İyi geldi.", created_at: "2026-09-27T09:00:00Z",
    }],
    analyses: [{ id: `${id}-an1`, analysis_type: "chakra", analysis_data: null, note: `Analiz notu ${i}`, created_at: "2026-09-26T22:22:00Z" }],
    charges: [
      { id: `${id}-c1`, charge_date: "2026-09-27", category: "session", detail: `Seans ${i}`, amount: 1500, payment_status: "paid", created_at: "2026-09-27T09:00:00Z" },
      { id: `${id}-c2`, charge_date: "2026-09-28", category: "other", detail: `Krem ${i}`, amount: 350.5, payment_status: "unpaid", created_at: "2026-09-28T09:00:00Z" },
      { id: `${id}-c3`, charge_date: "2026-09-20", category: "analysis", detail: "Eski kayıt", amount: 1000, payment_status: null, created_at: "2026-09-20T09:00:00Z" },
    ],
  };
}
