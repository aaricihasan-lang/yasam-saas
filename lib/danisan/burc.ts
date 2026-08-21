/**
 * lib/danisan/burc.ts — doğum tarihinden burç hesabı (canonical, saf, paylaşımlı).
 *
 * AMAÇ: Burç, giriş yolundan (UI form / API POST / API PATCH) bağımsız olarak AYNI
 * olmalı. Bu helper tek doğruluk kaynağıdır; sunucu (authoritative) ve UI (anlık
 * gösterim) aynı fonksiyonu kullanır.
 *
 * NOT: Tarih sınırları mevcut UI algoritmasından (danisan-yolculugu/kayit) BİREBİR
 * taşındı — astronomi/numeroloji revizyonu DEĞİL. `dogum` "YYYY-MM-DD" DATE değeri.
 * Boş/geçersiz → null (DB null semantiğiyle uyumlu).
 */
export function computeBurc(dogum: string | null | undefined): string | null {
  if (!dogum) return null;
  const parts = String(dogum).split("-");
  if (parts.length !== 3) return null;
  const ay = Number(parts[1]);
  const gun = Number(parts[2]);
  if (!Number.isFinite(ay) || !Number.isFinite(gun)) return null;
  if ((ay === 3 && gun >= 21) || (ay === 4 && gun <= 19)) return "Koç";
  if ((ay === 4 && gun >= 20) || (ay === 5 && gun <= 20)) return "Boğa";
  if ((ay === 5 && gun >= 21) || (ay === 6 && gun <= 20)) return "İkizler";
  if ((ay === 6 && gun >= 21) || (ay === 7 && gun <= 22)) return "Yengeç";
  if ((ay === 7 && gun >= 23) || (ay === 8 && gun <= 22)) return "Aslan";
  if ((ay === 8 && gun >= 23) || (ay === 9 && gun <= 22)) return "Başak";
  if ((ay === 9 && gun >= 23) || (ay === 10 && gun <= 22)) return "Terazi";
  if ((ay === 10 && gun >= 23) || (ay === 11 && gun <= 21)) return "Akrep";
  if ((ay === 11 && gun >= 22) || (ay === 12 && gun <= 21)) return "Yay";
  if ((ay === 12 && gun >= 22) || (ay === 1 && gun <= 19)) return "Oğlak";
  if ((ay === 1 && gun >= 20) || (ay === 2 && gun <= 18)) return "Kova";
  // Geçerli ay/gün aralığı dışında (ör. ay 0/13) burç üretme.
  if (ay >= 1 && ay <= 12) return "Balık";
  return null;
}
