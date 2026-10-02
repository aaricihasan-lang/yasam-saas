/**
 * NUM-F07 / NUM-F08 — Bilgi Bankası silme onayı (saf yardımcılar).
 *
 * - F07: Toplu silme YALNIZ ekranda görünen (filtreden geçen) ∩ seçili satırlara uygulanır;
 *   onay metni adet + kayıt özeti içerir (≤10 madde + "+N kayıt daha").
 * - F08: Açıklama kaydı silinince DB'de ON DELETE CASCADE ile ona bağlı kaynak notları
 *   (numerology_knowledge_source_entries) ve kaynak bağlantıları (numerology_record_sources)
 *   da silinir. Bu bilinçli bir cascade'dir; onay metni etkisini açıkça gösterir.
 *   Kaynak kütüphanesindeki kaynaklar (numerology_sources) SİLİNMEZ (RESTRICT).
 */

export type KbSilmeSatiri = {
  id: string;
  recordId: string;
  kayitTuru: "aciklama" | "dogaltas";
  analizTuru: string;
  deger: string;
};

export type KbSilmeEtkisi = {
  /** Silinecek açıklama kayıtlarına bağlı kaynak notu sayısı (bilinmiyorsa null). */
  notSayisi: number | null;
  /** Silinecek açıklama kayıtlarına bağlı kaynak bağlantısı sayısı (bilinmiyorsa null). */
  baglantiSayisi: number | null;
};

const OZET_LIMIT = 10;

/** Görünen satırlar ∩ seçili id'ler (görünmeyen seçim ASLA silinmez). */
export function gorunenSeciliSatirlar<T extends { id: string }>(gorunen: readonly T[], seciliIds: ReadonlySet<string>): T[] {
  return gorunen.filter((r) => seciliIds.has(r.id));
}

/** Silinecek açıklama kayıtlarına bağlı not/bağlantı sayısı. */
export function hesaplaKbSilmeEtkisi(
  satirlar: readonly KbSilmeSatiri[],
  notlar: readonly { knowledge_record_id: string }[] | null,
  baglantilar: readonly { knowledge_record_id: string }[] | null,
): KbSilmeEtkisi {
  const ids = new Set(satirlar.filter((r) => r.kayitTuru === "aciklama").map((r) => r.recordId));
  return {
    notSayisi: notlar ? notlar.filter((n) => ids.has(n.knowledge_record_id)).length : null,
    baglantiSayisi: baglantilar ? baglantilar.filter((b) => ids.has(b.knowledge_record_id)).length : null,
  };
}

function satirEtiketi(r: KbSilmeSatiri): string {
  return `${r.analizTuru} — ${r.deger} (${r.kayitTuru === "aciklama" ? "Açıklama" : "Doğaltaş Atama"})`;
}

/** Silme etkisi cümlesi (yoksa boş string). */
export function kbSilmeEtkisiMetni(satirlar: readonly KbSilmeSatiri[], etki: KbSilmeEtkisi): string {
  const aciklamaVar = satirlar.some((r) => r.kayitTuru === "aciklama");
  if (!aciklamaVar) return "";
  if (etki.notSayisi === null || etki.baglantiSayisi === null) {
    return "Açıklama kayıtlarına bağlı kaynak notları ve kaynak bağlantıları varsa onlar da kalıcı olarak silinir (sayı okunamadı). Kaynak kütüphanesindeki kaynaklar silinmez.";
  }
  if (etki.notSayisi === 0 && etki.baglantiSayisi === 0) return "";
  return `Bu açıklama kayıtlarına bağlı ${etki.notSayisi} kaynak notu ve ${etki.baglantiSayisi} kaynak bağlantısı da kalıcı olarak silinecek. Kaynak kütüphanesindeki kaynaklar silinmez.`;
}

/** Masaüstü onay metni: adet + özet + cascade etkisi. */
export function kbSilmeOnayMetni(satirlar: readonly KbSilmeSatiri[], etki: KbSilmeEtkisi): string {
  const n = satirlar.length;
  const lines: string[] = [];
  if (n === 1) {
    lines.push(`"${satirEtiketi(satirlar[0])}" kaydını kalıcı olarak silmek istediğinize emin misiniz?`);
  } else {
    lines.push(`${n} kaydı kalıcı olarak silmek istediğinize emin misiniz?`);
    for (const r of satirlar.slice(0, OZET_LIMIT)) lines.push(`• ${satirEtiketi(r)}`);
    if (n > OZET_LIMIT) lines.push(`+${n - OZET_LIMIT} kayıt daha`);
  }
  const etkiMetni = kbSilmeEtkisiMetni(satirlar, etki);
  if (etkiMetni) lines.push("", etkiMetni);
  lines.push("", "Bu işlem geri alınamaz.");
  return lines.join("\n");
}
