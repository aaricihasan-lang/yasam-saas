// Doğaltaş Kütüphanesi · Türkçe harf duyarsız katlama — DB `public.stone_library_fold` ile BİREBİR aynı
// (eşleme tablosu iki tarafta da aynı sırada; test: scripts/stone-library/f1-harness.ts "fold parity").

const FROM = "İIıÇçĞğÖöŞşÜüÂâÎîÛûÉéÈèÊêËëÁáÀàÄäÓóÒòÔôÍíÌìÏïÚúÙùÑñ";
const TO = "iiiccggoossuuaaiiuueeeeeeeeaaaaaaooooooiiiiiiuuuunn";

const MAP: ReadonlyMap<string, string> = new Map([...FROM].map((c, i) => [c, TO[i]]));

export function foldStoneLibraryText(value: string | null | undefined): string {
  let out = "";
  for (const ch of value ?? "") out += MAP.get(ch) ?? ch;
  return out
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
