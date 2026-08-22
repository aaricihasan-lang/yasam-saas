/**
 * HD Chart → Canonical · ASILI KAPI (Hanging Gate) Çözümleyici (SAF, deterministik)
 * ================================================================================
 *
 * Tek yetkili yapısal kaynak: motorun mevcut 36 kanal registry'si
 * (lib/human-design/engine/channels.ts · CHANNELS). İKİNCİ bir kanal listesi
 * OLUŞTURULMAZ. Yeni Human Design yorumu ÜRETİLMEZ — yalnız chart yapısı +
 * registry üzerinden deterministik türetim.
 *
 * Tanımlar:
 *   G   = benzersiz aktif kapılar
 *   CC  = registry'de İKİ kapısı da G'de olan kanallar (tamamlanmış)
 *   Uch = CC içindeki tüm kapılar ("channeled" = tanımlı)
 *   HG  = G \ Uch  → ASILI kapılar
 *
 * KİLİTLİ KARAR (duplication-prevention): bir kapı herhangi bir tamamlanmış
 * kanalın içindeyse (Uch) ASILI olarak GÖSTERİLMEZ — diğer eşleşmeleri eksik olsa
 * bile. Asılı kapı = aktif AMA hiçbir tamamlanmış kanalda değil.
 *
 * Her asılı kapı için potansiyel kanallar: registry'de o kapıyı içeren VE partner
 * kapısı chart'ta bulunmayan kanallar (yalnız yapısal metadata; yorum değil).
 */

import { CHANNELS, getDefinedChannels } from "@/lib/human-design/engine/channels";

/** Tamamlanmış kanal (registry'den; kimlik "minGate-maxGate"). */
export type ResolvedCompletedChannel = {
  code: string; // "35-36"
  name: string;
  gateA: number;
  gateB: number;
};

/** Asılı kapının tamamlanabileceği (partneri eksik) kanal. */
export type PotentialChannel = {
  code: string;
  name: string;
  partnerGate: number;
};

export type ResolvedHangingGate = {
  gate: number;
  potentialChannels: PotentialChannel[];
};

export type ChannelHangingResolution = {
  /** Benzersiz, artan; girişten türetilir. */
  activeGates: number[];
  completedChannels: ResolvedCompletedChannel[];
  /** CC içindeki kapılar (artan). */
  channeledGates: number[];
  hangingGates: ResolvedHangingGate[];
};

/** Girişten benzersiz, geçerli (1–64), artan kapı seti. Geçersizler burada elenmez
 *  (çağıran fail-loud raporlar); yalnız dedup + sort yapılır. */
export function uniqueSortedGates(gates: readonly number[]): number[] {
  return [...new Set(gates)].sort((a, b) => a - b);
}

/**
 * Benzersiz aktif kapılardan tamamlanmış kanalları ve asılı kapıları deterministik
 * çözer. SAF: DB/ağ/yan etki yok. Registry tek kaynak.
 */
export function resolveChannelsAndHanging(
  uniqueActiveGates: readonly number[],
): ChannelHangingResolution {
  const activeGates = uniqueSortedGates(uniqueActiveGates);
  const G = new Set(activeGates);

  // CC — iki kapısı da aktif olan registry kanalları (motor helper'ı reuse).
  const completed = getDefinedChannels(activeGates);
  const completedChannels: ResolvedCompletedChannel[] = completed
    .map((c) => ({ code: c.id, name: c.name, gateA: c.gateA, gateB: c.gateB }))
    .sort((a, b) => a.gateA - b.gateA || a.gateB - b.gateB);

  // Uch — tamamlanmış kanallardaki kapılar.
  const channeled = new Set<number>();
  for (const c of completed) {
    channeled.add(c.gateA);
    channeled.add(c.gateB);
  }

  // HG — aktif ama hiçbir tamamlanmış kanalda olmayan kapılar.
  const hangingGates: ResolvedHangingGate[] = [];
  for (const gate of activeGates) {
    if (channeled.has(gate)) continue; // KİLİTLİ: channeled kapı asılı sayılmaz.
    const potentialChannels: PotentialChannel[] = CHANNELS.filter(
      (c) => c.gateA === gate || c.gateB === gate,
    )
      .map((c) => {
        const partnerGate = c.gateA === gate ? c.gateB : c.gateA;
        return { code: c.id, name: c.name, partnerGate };
      })
      // Partner AKTİF değil (aktif olsaydı kanal tamamlanır, kapı channeled olurdu).
      .filter((p) => !G.has(p.partnerGate))
      .sort((a, b) => a.partnerGate - b.partnerGate);
    hangingGates.push({ gate, potentialChannels });
  }

  return {
    activeGates,
    completedChannels,
    channeledGates: [...channeled].sort((a, b) => a - b),
    hangingGates,
  };
}
