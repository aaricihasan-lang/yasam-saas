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

// ─── RF-01/02/03/13: BÖLGE düzeyinde 3-yollu birleştirme ──────────────────────
//
// Eski model "ortak organda sunucu kazanır" idi: iki cihaz aynı organa (farklı
// yüzeylere) bölge eklediğinde biri SESSİZCE kayboluyordu. Yeni model:
//   base   = bu cihazın son birleştirdiği / gönderdiği SUNUCU belgesi
//   local  = cihazdaki belge (eşitlenmemiş kullanıcı değişiklikleri dahil)
//   remote = sunucunun şimdiki belgesi
// Her BÖLGE (region.id) ayrı 3-yollu karar alır → farklı bölgeler/yüzeyler daima
// korunur. Gerçek çakışma (aynı bölge iki tarafta FARKLI değişti) sessiz kayıp yerine
// raporlanır (conflicts) ve yerel sürüm korunur; silme × düzenleme → düzenleme kazanır.
//
// Toplu küçülme koruması: organın tamamen kaybolması ancak silen tarafta MEZAR TAŞI
// varsa kabul edilir (tüm meşru silme yolları mezar taşı yazar). Mezar taşsız "kayıp"
// organ = bozuk/bayat durum → organ KORUNUR.

/** Kararlı içerik özeti (anahtar sırası / undefined alanlar önemsiz). */
function stableValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableValue(obj[k])}`).join(",")}}`;
}

type OrganSlot = { key: string; entry: Record<string, unknown> };
type RegionSlot = { view: string; foot: string; region: Record<string, unknown>; sig: string };

const CANONICAL_VIEWS = ["taban", "yan_ic", "yan_dis"] as const;
const FEET = ["sol", "sag"] as const;

/** Kanonik organ kimliği → belgedeki (ilk) anahtar + girdi. */
function organIndex(doc: AtlasDocLike | null | undefined): Map<string, OrganSlot> {
  const m = new Map<string, OrganSlot>();
  if (!doc || typeof doc !== "object") return m;
  for (const key of organKeys(doc)) {
    const norm = normOrgan(key);
    if (!norm) continue;
    const prev = m.get(norm);
    if (!prev) {
      m.set(norm, { key, entry: doc[key] as Record<string, unknown> });
      continue;
    }
    // Aynı kanonik organın ikinci anahtarı (ör. NFC/NFD veya büyük/küçük harf farkı):
    // bölgeleri İLK anahtarda birleştir — hiçbir bölge düşmez.
    const union = new Map(regionIndex(prev.entry));
    for (const [id, slot] of regionIndex(doc[key] as Record<string, unknown>)) {
      if (!union.has(id)) union.set(id, slot);
    }
    m.set(norm, { key: prev.key, entry: buildEntry([...union.values()]) });
  }
  return m;
}

/** Organ girdisindeki bölgeler (id → görünüm/ayak + içerik imzası). İlk görülen id kazanır. */
function regionIndex(entry: Record<string, unknown> | undefined): Map<string, RegionSlot> {
  const m = new Map<string, RegionSlot>();
  if (!entry || typeof entry !== "object") return m;
  for (const [view, bucket] of Object.entries(entry)) {
    if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
    for (const foot of FEET) {
      const list = (bucket as Record<string, unknown>)[foot];
      if (!Array.isArray(list)) continue;
      for (const region of list) {
        if (!region || typeof region !== "object") continue;
        const id = (region as { id?: unknown }).id;
        if (typeof id !== "string" || !id || m.has(id)) continue;
        const r = region as Record<string, unknown>;
        m.set(id, { view, foot, region: r, sig: `${view}/${foot}|${stableValue(r)}` });
      }
    }
  }
  return m;
}

function buildEntry(slots: RegionSlot[]): Record<string, unknown> {
  const entry: Record<string, Record<string, unknown[]>> = {};
  for (const v of CANONICAL_VIEWS) entry[v] = { sol: [], sag: [] };
  for (const s of slots) {
    if (!entry[s.view]) entry[s.view] = { sol: [], sag: [] };
    entry[s.view][s.foot].push(JSON.parse(JSON.stringify(s.region)));
  }
  return entry;
}

function laterOf(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

export type AtlasThreeWayResult = {
  document: AtlasDocLike;
  /** Aynı bölge iki tarafta FARKLI değişti → yerel sürüm korundu (görünen organ adları). */
  conflicts: string[];
  /** "three-way": base var; "union": base yok (ilk geçiş) → hiçbir bölge düşmez. */
  mode: "three-way" | "union";
};

/**
 * Organ + bölge düzeyinde birleştirme. Saf; girdileri DEĞİŞTİRMEZ.
 *
 * BASE VAR — her bölge için: yalnız yerel değişti → yerel; yalnız uzak değişti → uzak;
 *   ikisi aynı → o; ikisi farklı → çakışma (silme × düzenleme → düzenleme; düzenleme ×
 *   düzenleme → yerel + conflicts[]).
 * BASE YOK — birleşim: iki taraftaki tüm bölgeler korunur; aynı id farklıysa
 *   organUpdatedAt'i yeni olan; mezar taşı organın son güncellemesinden yeniyse organ
 *   dirilmez (zombie koruması — önceki davranış).
 */
export function mergeAtlasThreeWay(
  server: AtlasDocLike,
  local: AtlasDocLike,
  base: AtlasDocLike | null,
  now: string = new Date().toISOString(),
): AtlasThreeWayResult {
  const sMeta = server?._meta ?? {};
  const lMeta = local?._meta ?? {};
  const sUpd = sMeta.organUpdatedAt ?? {};
  const lUpd = lMeta.organUpdatedAt ?? {};
  const sTomb = sMeta.tombstones ?? {};
  const lTomb = lMeta.tombstones ?? {};
  const allTomb = maxDateMap(sTomb, lTomb);
  const allUpd = maxDateMap(sUpd, lUpd);

  const sIdx = organIndex(server);
  const lIdx = organIndex(local);
  const bIdx = base ? organIndex(base) : null;

  const out: AtlasDocLike = { _meta: {} };
  const survivorUpd: OrganTimeMap = {};
  const deletedTomb: OrganTimeMap = {};
  const conflicts: string[] = [];

  const norms = new Set<string>([...sIdx.keys(), ...lIdx.keys(), ...(bIdx ? bIdx.keys() : [])]);
  for (const norm of norms) {
    let s = sIdx.get(norm);
    let l = lIdx.get(norm);
    const label = l?.key ?? s?.key ?? bIdx?.get(norm)?.key ?? norm;

    if (bIdx) {
      const b = bIdx.get(norm);
      // Toplu küçülme koruması: mezar taşı OLMADAN kaybolan organ "dokunulmamış" sayılır.
      if (b && !l && !lTomb[norm]) l = b;
      if (b && !s && !sTomb[norm]) s = b;

      const bR = regionIndex(b?.entry);
      const lR = regionIndex(l?.entry);
      const sR = regionIndex(s?.entry);
      const ids = new Set<string>([...lR.keys(), ...sR.keys(), ...bR.keys()]);
      const picked: RegionSlot[] = [];
      let organConflict = false;
      for (const id of ids) {
        const bv = bR.get(id)?.sig ?? null;
        const lv = lR.get(id)?.sig ?? null;
        const sv = sR.get(id)?.sig ?? null;
        let pick: RegionSlot | undefined;
        if (lv === bv) pick = sR.get(id);
        else if (sv === bv) pick = lR.get(id);
        else if (lv === sv) pick = lR.get(id);
        else if (lv === null) pick = sR.get(id); // yerelde silindi, uzakta düzenlendi → düzenleme kazanır
        else if (sv === null) pick = lR.get(id); // uzakta silindi, yerelde düzenlendi → düzenleme kazanır
        else {
          pick = lR.get(id);
          organConflict = true;
        }
        if (pick) picked.push(pick);
      }
      if (organConflict) conflicts.push(label);

      const eB = !!b;
      const eL = !!l;
      const eS = !!s;
      const exists = picked.length > 0 || (eL === eB ? eS : eS === eB ? eL : eL);
      if (exists) {
        out[label] = buildEntry(picked);
        const at = laterOf(sUpd[norm], lUpd[norm]);
        if (at) survivorUpd[norm] = at;
      } else {
        deletedTomb[norm] = allTomb[norm] ?? now;
      }
      continue;
    }

    // ── base YOK: birleşim ──
    const upd = allUpd[norm] ?? EPOCH;
    const tomb = allTomb[norm];
    if (tomb && !(upd > tomb)) continue; // silinmiş → dirilmez
    const lR = regionIndex(l?.entry);
    const sR = regionIndex(s?.entry);
    const localNewer = (lUpd[norm] ?? EPOCH) > (sUpd[norm] ?? EPOCH);
    const picked: RegionSlot[] = [];
    for (const id of new Set<string>([...lR.keys(), ...sR.keys()])) {
      const lr = lR.get(id);
      const sr = sR.get(id);
      if (lr && sr) picked.push(lr.sig === sr.sig || !localNewer ? sr : lr);
      else picked.push((lr ?? sr)!);
    }
    out[label] = buildEntry(picked);
    if (allUpd[norm]) survivorUpd[norm] = allUpd[norm];
  }

  const survivingNorms = new Set(organKeys(out).map(normOrgan));
  const keptTomb: OrganTimeMap = {};
  for (const [k, v] of Object.entries({ ...allTomb, ...deletedTomb })) {
    if (survivingNorms.has(k)) continue;
    keptTomb[k] = v;
  }
  out._meta = { version: "1", updated_at: now, tombstones: keptTomb, organUpdatedAt: survivorUpd };
  return { document: out, conflicts, mode: bIdx ? "three-way" : "union" };
}

/** Geriye dönük API: base'siz (birleşim) yol — hiçbir bölge düşmez, mezar taşları korunur. */
export function mergeAtlasWithTombstones(
  server: AtlasDocLike,
  local: AtlasDocLike,
  now: string = new Date().toISOString(),
): AtlasDocLike {
  return mergeAtlasThreeWay(server, local, null, now).document;
}

/**
 * Organ listesi birleştirmesi (ad kümesi). Belgedeki organlarla aynı kural: bir adın
 * listeden çıkması ancak MEZAR TAŞI ile (organ sil / yeniden adlandır — tüm meşru yollar
 * yazar) kabul edilir; mezar taşsız "eksik" ad bayat/bozuk yerel durumdur → korunur.
 * Böylece liste: (yerel ∪ uzak ∪ belgedeki organlar) − ölü (mezar taşlı) organlar.
 * `base` imzası 3-yollu çağrılarla uyum için tutulur.
 */
export function mergeOrganListThreeWay(
  server: string[],
  local: string[],
  _base: string[] | null,
  meta: AtlasMetaLike | undefined,
  documentOrgans: string[] = [],
): string[] {
  void _base;
  const dead = deadOrganKeys(meta);
  const index = (list: string[] | null) => {
    const m = new Map<string, string>();
    for (const raw of list ?? []) {
      const t = (raw ?? "").trim();
      const k = t ? organKey(t) : "";
      if (k && !m.has(k)) m.set(k, t);
    }
    return m;
  };
  const L = index(local);
  const S = index(server);
  const D = index(documentOrgans);
  const out: string[] = [];
  for (const k of new Set<string>([...L.keys(), ...S.keys(), ...D.keys()])) {
    if (dead.has(k) && !D.has(k)) continue;
    out.push(L.get(k) ?? S.get(k) ?? D.get(k) ?? k);
  }
  return out.sort((a, b) => a.localeCompare(b, "tr"));
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
