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

export type OrganTimeMap = Record<string, string>; // normalizedName -> ISO tarih

export type AtlasMetaLike = {
  version?: string;
  updated_at?: string;
  tombstones?: OrganTimeMap;
  organUpdatedAt?: OrganTimeMap;
};

export type AtlasDocLike = { _meta?: AtlasMetaLike } & Record<string, unknown>;

const EPOCH = "1970-01-01T00:00:00.000Z";

export function normOrgan(name: string): string {
  return name.trim().toLocaleLowerCase("tr");
}

export function isOrganEntryLike(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "taban" in (value as Record<string, unknown>) &&
    "yan" in (value as Record<string, unknown>)
  );
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
