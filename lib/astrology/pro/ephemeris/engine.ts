// Gökyüzü Atlası — PROFESYONEL EFEMERİS: etkin KONUM MOTORU bilgisi ve ön kontrol (yalnız sunucu).
//
// Kural (03.11.2026 owner): DE440 seçiliyken veri dosyası yoksa hesap AÇIK HATA ile durur; eski motora sessiz düşüş YOK. Eski motor
// yalnız ATLAS_PRO_EPHEMERIS_ENGINE=legacy ile (kontrollü geri dönüş) çalışır ve sonuçta bu açıkça yazılır.

import { proEphemerisEngine } from "./flags";
import { de440Status, DE440_FILE } from "../../positions/de440/source";

export type PositionEngineInfo = {
  id: "jpl_de440" | "astronomy_engine_legacy";
  /** Kullanıcıya görünen kısa ad. */
  label: string;
  /** true → düşük hassasiyetli yedek motor (ekranda uyarı). */
  fallback: boolean;
  note: string;
};

export function positionEngineInfo(): PositionEngineInfo {
  return proEphemerisEngine() === "de440"
    ? {
        id: "jpl_de440",
        label: "NASA/JPL DE440",
        fallback: false,
        note: `Konumlar NASA/JPL DE440 gezegen ve Ay efemerisinden (değiştirilmemiş resmî dosya, SHA-256 doğrulamalı; ${DE440_FILE.citation}); IAU 2006 presesyon + IAU 2000A nütasyon. Verilen TT anında konum hatası ≤0,1″; UT ile verilen anlarda ΔT belirsizliği ayrıca eklenir.`,
      }
    : {
        id: "astronomy_engine_legacy",
        label: "Yedek motor (düşük hassasiyet)",
        fallback: true,
        note: "Yedek konum motoru etkin: konum hatası yay saniyesi düzeyinde (yaklaşık 20″'ye kadar); istasyon yakını derece geçişleri ve yavaş gezegenlerin olay anları saatler mertebesinde sapabilir.",
      };
}

/** Hesap öncesi ön kontrol: DE440 seçili ve dosya kullanılamıyorsa hata mesajı. */
export function ensurePositionEngine(): { ok: true } | { ok: false; error: string } {
  if (proEphemerisEngine() !== "de440") return { ok: true };
  const s = de440Status();
  return s.ok ? { ok: true } : { ok: false, error: "Yüksek hassasiyetli efemeris verisi şu anda kullanılamıyor; hesap yapılmadı (düşük hassasiyetli sonuç gösterilmez)." };
}
