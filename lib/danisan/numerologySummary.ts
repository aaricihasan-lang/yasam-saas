/**
 * H-10 — Danışan Yolculuğu "Numerolojik Özet" (detay kartı + Yolculuk sekmesi otomatik olayı) SUNUCU hesabı.
 *
 * Eskiden bu değerler TARAYICIDA, Numeroloji yetkisinden bağımsız hesaplanıyordu. Artık yalnız
 * /api/clients/[id]/numerology-summary (clients + tenant + numerology yetkisi) bu modülü çağırır.
 *
 * - Numeroloji motoru DEĞİŞMEZ: aynı fonksiyonlar, aynı girdiler (eski istemci koduyla birebir).
 * - Gelecek Yıllar: zirveler numerology_future_years alt-yetkisi yoksa yıl sınırıyla süzülür
 *   (Numeroloji modülü / Word ile AYNI yardımcılar: chronoLimitYear + cutoffZirvePeaks).
 */
import { calcHayatYolu } from "@/lib/numeroloji/hayatYolu";
import { calcIfadeSayisi } from "@/lib/numeroloji/ifadeSayisi";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { calcKisiselYil } from "@/lib/numeroloji/kisiselYil";
import { calcElementleri } from "@/lib/numeroloji/elementler";
import { calcZirveYillari, type ZirveResult } from "@/lib/numeroloji/zirveYillari";
import { hesaplaPinKodu } from "@/lib/numeroloji/pinKodu";
import { chronoLimitYear, cutoffZirvePeaks } from "@/app/numeroloji/utils/chronoCutoff";

export type NumerologySummary = {
  hayatYolu: string;
  ifadeSayisi: string;
  anaKulvar: string;
  yanKulvar: string;
  kisiselYil: string;
  elementler: ReturnType<typeof calcElementleri> | null;
  zirve: ZirveResult | null;
  gucluSayilar: number[];
  eksikSayilar: number[];
  eksikElement: string[];
  /** Gelecek Yıllar yetkisi yoksa gizlenen (henüz başlamamış) zirve sayısı. */
  hiddenFuturePeaks: number;
};

/** "YYYY-MM-DD" → "DD.MM.YYYY" (eski istemci yardımcısıyla aynı). */
function isoToDDMMYYYY(iso: string): string {
  const p = iso.split("-");
  if (p.length !== 3 || p[0]!.length !== 4) return "";
  return `${p[2]}.${p[1]}.${p[0]}`;
}

export function computeNumerologySummary(
  input: { ad: string; soyad: string; dogum: string },
  opts: { futureYears: boolean; currentYear: number },
): NumerologySummary | null {
  const dogum = input.dogum.trim();
  if (!dogum) return null;
  const firstName = input.ad.trim();
  const lastName = input.soyad.trim();
  const hasName = Boolean(firstName || lastName);
  const disp = (fn: () => { display: string }) => { try { return fn().display; } catch { return "—"; } };

  const out: NumerologySummary = {
    hayatYolu: disp(() => calcHayatYolu(dogum)),
    ifadeSayisi: hasName ? disp(() => calcIfadeSayisi(firstName, lastName)) : "—",
    anaKulvar: hasName ? disp(() => calcAnaKulvar(firstName, lastName)) : "—",
    yanKulvar: hasName ? disp(() => calcYanKulvar(firstName, lastName)) : "—",
    kisiselYil: disp(() => calcKisiselYil(dogum)),
    elementler: null,
    zirve: null,
    gucluSayilar: [],
    eksikSayilar: [],
    eksikElement: [],
    hiddenFuturePeaks: 0,
  };

  const dogumTR = isoToDDMMYYYY(dogum);
  if (!dogumTR) return out;
  try { out.elementler = calcElementleri(dogumTR); } catch { /* sessiz */ }
  try {
    const z = calcZirveYillari(dogumTR);
    if (z) {
      const birthYear = Number(dogum.slice(0, 4));
      const limit = chronoLimitYear(opts.currentYear, opts.futureYears);
      const by = Number.isFinite(birthYear) ? birthYear : null;
      // Kart her iki yöntemin yaşını gösterir → alt-yetki yoksa (25.10.2026) zirve yalnız gösterilen TÜM yaşları
      // başlamışsa döner; başlamamış bir yöntem yaşı yanıtta yer almaz (Numeroloji sekmesi / modül ucuyla aynı kural).
      const visible = cutoffZirvePeaks(z.peaks, by, limit).filter((p) =>
        by === null || [p.yasMetot1, p.yasMetot2].every((a) => typeof a !== "number" || by + a <= limit));
      out.zirve = { ...z, peaks: visible };
      out.hiddenFuturePeaks = (z.peaks?.length ?? 0) - visible.length;
    }
  } catch { /* sessiz */ }
  try {
    const pin = hesaplaPinKodu(dogumTR);
    const digits = [pin.k1, pin.k2, pin.k3, pin.k4, pin.k5, pin.k6, pin.k7, pin.k8];
    const freq: Record<number, number> = {};
    for (const d of digits) if (d >= 1 && d <= 9) freq[d] = (freq[d] ?? 0) + 1;
    out.gucluSayilar = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => (freq[n] ?? 0) >= 2);
    out.eksikSayilar = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !freq[n]);
  } catch { /* sessiz */ }
  if (out.elementler) {
    const counts = (out.elementler as { counts?: Record<string, number> }).counts ?? {};
    out.eksikElement = (["Hava", "Su", "Ateş", "Toprak"] as const).filter((e) => (counts[e] ?? 0) === 0);
  }
  return out;
}
