/**
 * Tombstone-farkında Refleksoloji Atlas birleştirmesi (saf / tarayıcısız).
 *
 * SORUN (zombie / duplicate): atlas hidrasyonu "additive union" idi — bir cihazda
 * silinen/yeniden adlandırılan organ, başka cihazın bayat localStorage'ından
 * "yalnız yerelde var" sanılıp diriliyor ve tekrar sunucuya yazılıyordu.
 *
 * ÇÖZÜM: silme/yeniden-adlandırma bir mezar taşı (`tombstones[norm] = deletedAt`)
 * bırakır; her organın son güncellenme zamanı `organUpdatedAt[norm]` tutulur.
 * Birleştirmede organ, ancak son güncellemesi son silinmesinden YENİYSE hayatta
 * kalır. Mezar taşları belgenin `_meta` alanında yaşar → mevcut jsonb kolonuyla
 * otomatik senkron olur (ŞEMA DEĞİŞİKLİĞİ YOK).
 *
 * Not: bu modül DOM/localStorage bilmez; test edilebilir olması için saf tutulur.
 * `AtlasDocLike` gerçek `AtlasDocument` ile yapısal uyumludur.
 */

import { organKey } from "@/app/refleksoloji/bolge-haritasi/utils/organUtils";

export type OrganTimeMap = Record<string, string>; // normalizedName -> ISO tarih

export type AtlasMetaLike = {
  version?: string;
  updated_at?: string;
  tombstones?: OrganTimeMap;
  organUpdatedAt?: OrganTimeMap;
};

export type AtlasDocLike = { _meta?: AtlasMetaLike } & Record<string, unknown>;

const EPOCH = "1970-01-01T00:00:00.000Z";

/**
 * Organ kimliği TEK kaynaktan: PR #201 kanonik `organKey`
 * (NFC → whitespace normalize → trim → tr-lower → NFC). Tombstone /
 * organUpdatedAt anahtarları ve zombie mantığı DAİMA bunu kullanır — NFD
 * karaciğer tombstone'u ile NFC KARACİĞER organ listesi AYNI kanonik organ
 * sayılır. Bağımsız ikinci normalizer YOK.
 */
export function normOrgan(name: string): string {
  return organKey(name);
}

export function isOrganEntryLike(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  // Organ entry = taban + en az bir yan varyantı. Yeni canonical: yan_ic/yan_dis;
  // legacy "yan" da kabul (normalize öncesi ham belge merge'de KAYBOLMASIN — §24).
  return "taban" in v && ("yan_ic" in v || "yan_dis" in v || "yan" in v);
}

function ensureMeta(doc: AtlasDocLike): Required<Pick<AtlasMetaLike, "tombstones" | "organUpdatedAt">> & AtlasMetaLike {
  if (!doc._meta || typeof doc._meta !== "object") doc._meta = {};
  const m = doc._meta;
  if (!m.tombstones || typeof m.tombstones !== "object") m.tombstones = {};
  if (!m.organUpdatedAt || typeof m.organUpdatedAt !== "object") m.organUpdatedAt = {};
  return m as Required<Pick<AtlasMetaLike, "tombstones" | "organUpdatedAt">> & AtlasMetaLike;
}

/** Organ eklendi/güncellendi → son-güncelleme damgası + mezar taşını kaldır. */
export function markOrganUpserted(
  doc: AtlasDocLike,
  name: string,
  at: string = new Date().toISOString(),
): void {
  const key = normOrgan(name);
  if (!key) return;
  const m = ensureMeta(doc);
  m.organUpdatedAt[key] = at;
  if (m.tombstones[key]) delete m.tombstones[key];
}

/** Organ silindi / yeniden adlandırıldı (eski ad) → mezar taşı + damgayı kaldır. */
export function markOrganDeleted(
  doc: AtlasDocLike,
  name: string,
  at: string = new Date().toISOString(),
): void {
  const key = normOrgan(name);
  if (!key) return;
  const m = ensureMeta(doc);
  m.tombstones[key] = at;
  if (m.organUpdatedAt[key]) delete m.organUpdatedAt[key];
}

function maxDateMap(a?: OrganTimeMap, b?: OrganTimeMap): OrganTimeMap {
  const out: OrganTimeMap = {};
  for (const src of [a, b]) {
    if (!src || typeof src !== "object") continue;
    for (const [k, v] of Object.entries(src)) {
      if (typeof v !== "string") continue;
      if (!out[k] || v > out[k]) out[k] = v;
    }
  }
  return out;
}

function organKeys(doc: AtlasDocLike): string[] {
  return Object.keys(doc).filter((k) => k !== "_meta" && isOrganEntryLike(doc[k]));
}

/**
 * Tombstone-farkında birleştirme.
 *   - Ortak organda sunucu kazanır; yalnız yerelde olan organ KORUNUR — ancak
 *     mezar taşı organın son güncellemesinden yeniyse organ DİRİLMEZ.
 *   - Hayatta kalan organların mezar taşları düşer; kalan mezar taşları (başka
 *     cihazlardaki bayat kopyaları bastırmak için) korunur.
 */
export function mergeAtlasWithTombstones(
  server: AtlasDocLike,
  local: AtlasDocLike,
  now: string = new Date().toISOString(),
): AtlasDocLike {
  const sMeta = server._meta ?? {};
  const lMeta = local._meta ?? {};
  const tombstones = maxDateMap(sMeta.tombstones, lMeta.tombstones);
  const organUpdatedAt = maxDateMap(sMeta.organUpdatedAt, lMeta.organUpdatedAt);

  const out: AtlasDocLike = { _meta: {} };
  const survivorUpdatedAt: OrganTimeMap = {};

  const keys = new Set<string>([...organKeys(server), ...organKeys(local)]);
  for (const key of keys) {
    const norm = normOrgan(key);
    const upd = organUpdatedAt[norm] ?? EPOCH;
    const tomb = tombstones[norm];
    // Organ hayatta kalır: mezar taşı yoksa VEYA son güncelleme mezardan yeniyse.
    if (tomb && !(upd > tomb)) continue; // silinmiş → atla
    // Ortak organda sunucu kazanır (yalnız yereldeyse yerel korunur).
    const entry = isOrganEntryLike(server[key]) ? server[key] : local[key];
    out[key] = entry;
    if (organUpdatedAt[norm]) survivorUpdatedAt[norm] = organUpdatedAt[norm];
  }

  const survivingNorms = new Set(organKeys(out).map(normOrgan));
  const keptTombstones: OrganTimeMap = {};
  for (const [k, v] of Object.entries(tombstones)) {
    if (survivingNorms.has(k)) continue; // dirilmiş organın mezar taşını düş
    keptTombstones[k] = v;
  }

  out._meta = {
    version: "1",
    updated_at: now,
    tombstones: keptTombstones,
    organUpdatedAt: survivorUpdatedAt,
  };
  return out;
}

/**
 * Silinmiş (tombstone'lu, silinmeden sonra yeniden EKLENMEMİŞ) organların
 * kanonik anahtar kümesi. Bunlar organ listesinden filtrelenmeli — aksi halde
 * bir cihazın bayat organ_list'i silinen organı sonsuza dek diriltir (zombie).
 */
export function deadOrganKeys(meta: AtlasMetaLike | undefined): Set<string> {
  const tombstones = meta?.tombstones ?? {};
  const organUpdatedAt = meta?.organUpdatedAt ?? {};
  const dead = new Set<string>();
  for (const [k, deletedAt] of Object.entries(tombstones)) {
    if (typeof deletedAt !== "string") continue;
    const upd = organUpdatedAt[k] ?? EPOCH;
    if (!(upd > deletedAt)) dead.add(organKey(k)); // kanonik anahtar
  }
  return dead;
}

/**
 * Organ listesi için TOMBSTONE-farkında + KANONİK birleştirme.
 *   - Kanonik kimlik (organKey: NFC + Türkçe küçük harf + boşluk) ile
 *     tekilleştirir → "KARACİĞER" ile "karaciğer" tek satır.
 *   - Silinen/temizlenen (dead) organ, bayat kopyadan DİRİLMEZ.
 * Girdi sırası: sunucu önce (mevcut union davranışıyla uyumlu), sonra Türkçe
 * sıralama. Yalnız ekranda gizleme değil — lifecycle invariantını sağlar.
 */
export function mergeOrganListsWithTombstones(
  server: string[],
  local: string[],
  meta: AtlasMetaLike | undefined,
): string[] {
  const dead = deadOrganKeys(meta);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...(server ?? []), ...(local ?? [])]) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) continue;
    const key = organKey(trimmed);
    if (!key || seen.has(key) || dead.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.sort((a, b) => a.localeCompare(b, "tr"));
}
