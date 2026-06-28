/**
 * Biyoenerji Çakralar ↔ Doğaltaş Eşleştirme — saf (test edilebilir) çekirdek.
 *
 * Salt-okuma eşleştirme: Biyoenerji çakra detayındaki çakra adı ile Doğaltaş
 * taş kayıtlarının çakra atamasını ("stones.chakras" dizisi + "assignments"
 * JSON içindeki "Çakra Atama" bölümü) Türkçe-normalize ederek karşılaştırır.
 *
 * Tasarım ilkesi (düşük risk): YANLIŞ POZİTİFTENSE EKSİK EŞLEŞME tercih edilir.
 * - Çakra eşleşmesi kanonik anahtar EŞİTLİĞİ ile yapılır (substring değil).
 * - Manuel↔otomatik çapraz kontrol, parçalanmış adların normalize EŞİTLİĞİdir.
 *
 * Hiçbir veri yazılmaz; bioenergy_chakras.stones bu modülde asla değişmez.
 */
import { getAssignmentSection, normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";

// ─── Girdi/çıktı tipleri ─────────────────────────────────────────────────────

/** Eşleştirme için bir Doğaltaş taşından gereken minimum alanlar. */
export type ChakraMatchStone = {
  id: string;
  stone_name: string;
  chakras: string[] | null;
  assignments: unknown;
};

/** Panelde gösterilecek eşleşen taş. */
export type MatchedStone = {
  id: string;
  name: string;
  /** Aynı taş manuel "Taşlar" metninde de geçiyor mu? */
  inManual: boolean;
};

export type ChakraMatchResult = {
  stones: MatchedStone[];
  /** En az bir taş hem manuelde hem otomatik eşleşmede var mı? */
  hasOverlap: boolean;
};

// ─── Çakra kanonik anahtar ───────────────────────────────────────────────────

/**
 * "çakra"/"çakrası"/"çakraları" gibi jenerik sözcükleri atar; geriye çekirdek
 * ad kalır. ("Kalp Çakrası" → "kalp", "Kök Çakra" → "kok")
 */
function stripChakraWords(normalized: string): string {
  return normalized
    .split(/\s+/)
    .filter((w) => w && !w.startsWith("cakra"))
    .join(" ")
    .trim();
}

/**
 * Bilinen çakra eş-anlamlıları → tek kanonik anahtar.
 * Anahtarlar `stripChakraWords(normalizeTr(...))` çıktısına göredir.
 */
const CHAKRA_ALIASES: Record<string, string> = {
  // Kök
  kok: "kok",
  muladhara: "kok",
  // Sakral
  sakral: "sakral",
  svadhisthana: "sakral",
  // Solar Pleksus
  "solar pleksus": "solar_pleksus",
  solar: "solar_pleksus",
  pleksus: "solar_pleksus",
  manipura: "solar_pleksus",
  // Kalp
  kalp: "kalp",
  anahata: "kalp",
  // Boğaz
  bogaz: "bogaz",
  vishuddha: "bogaz",
  // Üçüncü Göz / Alın
  "ucuncu goz": "ucuncu_goz",
  alin: "ucuncu_goz",
  ajna: "ucuncu_goz",
  // Taç
  tac: "tac",
  sahasrara: "tac",
};

/**
 * Bir çakra adını kararlı kanonik anahtara çevirir.
 * Bilinen eş-anlamlılar haritalanır; bilinmeyen özel adlar için çekirdek metin
 * (normalize) anahtar olarak döner → yalnızca BİREBİR aynı özel adlar eşleşir.
 * Boş/anlamsız girdide null.
 */
export function chakraCanonicalKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const core = stripChakraWords(normalizeTr(name));
  if (!core) return null;
  return CHAKRA_ALIASES[core] ?? core;
}

// ─── Taşın çakra anahtarları ─────────────────────────────────────────────────

/**
 * Bir Doğaltaş taşının atandığı çakraların kanonik anahtar kümesi.
 * Kaynak: stones.chakras dizisi + assignments "Çakra Atama" bölümü.
 */
export function stoneChakraKeys(stone: ChakraMatchStone): Set<string> {
  const fromColumn = Array.isArray(stone.chakras) ? stone.chakras.map((c) => String(c)) : [];
  const fromAssignments = getAssignmentSection(stone.assignments, "cakra", "çakra", "chakra");
  const keys = new Set<string>();
  for (const raw of [...fromColumn, ...fromAssignments]) {
    const key = chakraCanonicalKey(raw);
    if (key) keys.add(key);
  }
  return keys;
}

/** Taş, verilen çakraya atanmış mı? (kanonik anahtar eşitliği) */
export function stoneMatchesChakra(
  stone: ChakraMatchStone,
  chakraName: string | null | undefined,
): boolean {
  const target = chakraCanonicalKey(chakraName);
  if (!target) return false;
  return stoneChakraKeys(stone).has(target);
}

// ─── Manuel "Taşlar" metni ───────────────────────────────────────────────────

/**
 * Manuel taş metnini aday taş adlarına böler.
 * Satır sonu / ; / , / madde işareti ile ayrılır; "Ad: açıklama" biçiminde
 * yalnızca ":" öncesi alınır. Normalize edilmiş, benzersiz, kısa-gürültü
 * (<2 karakter) ayıklanmış liste döner.
 */
export function parseManualStoneNames(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawLine of text.split(/[\n;,]+/)) {
    // baştaki madde işaretlerini at
    const cleaned = rawLine.replace(/^\s*[-•·–—*]+\s*/, "");
    // "Ad: açıklama" → "Ad"
    const head = cleaned.split(":")[0] ?? "";
    const key = normalizeTr(head).trim();
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Bir taş adı manuel aday listesinde (normalize eşitlik) var mı? */
function isStoneInManual(stoneName: string, manualKeys: Set<string>): boolean {
  const key = normalizeTr(stoneName).trim();
  if (!key) return false;
  return manualKeys.has(key);
}

// ─── Ana eşleştirme ──────────────────────────────────────────────────────────

/**
 * Verilen çakra için Doğaltaş'tan eşleşen taşları döner; her birinin manuel
 * metinde de geçip geçmediğini işaretler. Sonuç Türkçe alfabetik sıralıdır.
 */
export function matchStonesForChakra(
  chakraName: string | null | undefined,
  stones: ChakraMatchStone[],
  manualStonesText: string | null | undefined,
): ChakraMatchResult {
  const target = chakraCanonicalKey(chakraName);
  if (!target) return { stones: [], hasOverlap: false };

  const manualKeys = new Set(parseManualStoneNames(manualStonesText));
  const seenStone = new Set<string>();
  const matched: MatchedStone[] = [];
  let hasOverlap = false;

  for (const stone of stones) {
    const name = (stone.stone_name ?? "").trim();
    if (!name) continue;
    if (!stoneChakraKeys(stone).has(target)) continue;

    // Aynı taş adını iki kez gösterme (tenant + kütüphane çakışması olabilir)
    const dedupeKey = normalizeTr(name);
    if (seenStone.has(dedupeKey)) continue;
    seenStone.add(dedupeKey);

    const inManual = isStoneInManual(name, manualKeys);
    if (inManual) hasOverlap = true;
    matched.push({ id: stone.id, name, inManual });
  }

  matched.sort((a, b) => a.name.localeCompare(b.name, "tr-TR", { sensitivity: "base" }));
  return { stones: matched, hasOverlap };
}
