// Plan önizlemesinde atlanan bölüm gerekçeleri (ör. ek noktalar) — yalnız GÖSTERİM yardımcıları; plan/hesap mantığı değişmez.
export type SkippedSection = { section: string; label: string; reason: string };

/** Aynı gerekçeyi taşıyan bölümleri tek satırda toplar (ilk görülme sırası korunur). */
export function groupSkipped(xs: SkippedSection[]): { sections: string[]; labels: string[]; reason: string }[] {
  const out: { sections: string[]; labels: string[]; reason: string }[] = [];
  for (const x of xs) {
    const g = out.find((o) => o.reason === x.reason);
    if (g) {
      g.sections.push(x.section);
      g.labels.push(x.label);
    } else out.push({ sections: [x.section], labels: [x.label], reason: x.reason });
  }
  return out;
}

/**
 * Seçim TAMAMEN atlanan bölümler yüzünden engelliyse (NO_UNIT; engel metni = "<teknik>: " + gerekçelerin birleşimi) engel metnini
 * her gerekçe bir kez ve ilgili bölümlerle yeniden yazar; aksi hâlde engel metni aynen döner. Bilgi kaybı yok: yalnız birebir
 * eşleşen metin yeniden yazılır.
 */
export function compactBlocked(blocked: { code: string; error: string } | null | undefined, skipped: SkippedSection[] | null | undefined): { text: string; fullySkipped: boolean } | null {
  if (!blocked) return null;
  const xs = skipped ?? [];
  const tail = `: ${xs.map((x) => x.reason).join(" ")}`;
  if (blocked.code !== "NO_UNIT" || xs.length === 0 || !blocked.error.endsWith(tail)) return { text: blocked.error, fullySkipped: false };
  const prefix = blocked.error.slice(0, blocked.error.length - tail.length);
  const body = groupSkipped(xs)
    .map((g) => `${g.labels.join(" ve ")} — ${g.reason}`)
    .join(" ");
  return { text: `${prefix} hesaplanamaz. ${body}`, fullySkipped: true };
}
