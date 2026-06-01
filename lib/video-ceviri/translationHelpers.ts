const MAX_WORDS_PER_CHUNK = 2500;

export function splitIntoChunks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Kısa metni parçalamaya gerek yok
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount <= MAX_WORDS_PER_CHUNK) return [trimmed];

  // Cümle sonu noktalamalarına göre böl
  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);

  if (sentences.length <= 1) {
    // Cümle sonu yoksa kelime bazlı böl
    const words = trimmed.split(/\s+/);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += MAX_WORDS_PER_CHUNK) {
      chunks.push(words.slice(i, i + MAX_WORDS_PER_CHUNK).join(" "));
    }
    return chunks;
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sentence of sentences) {
    const wc = sentence.split(/\s+/).filter(Boolean).length;
    if (currentWords + wc > MAX_WORDS_PER_CHUNK && current.length > 0) {
      chunks.push(current.join(" "));
      current = [sentence];
      currentWords = wc;
    } else {
      current.push(sentence);
      currentWords += wc;
    }
  }
  if (current.length > 0) {
    chunks.push(current.join(" "));
  }
  return chunks;
}
