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

// ─── P1-5: base-snapshot'lı 3-yollu birleştirme (lost update kapanışı) ─────────

/** Kararlı içerik özeti (anahtar sırası/undefined alanlar önemsiz) — organ girdisi karşılaştırması. */
function stableEntry(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableEntry).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableEntry(obj[k])}`).join(",")}}`;
}

/** İki organ girdisi içerik olarak aynı mı. */
export function organEntriesEqual(a: unknown, b: unknown): boolean {
  return stableEntry(a) === stableEntry(b);
}

type OrganSlot = { key: string; entry: unknown };

/** Kanonik organ kimliği → belgedeki (ilk) anahtar + girdi. */
function organIndex(doc: AtlasDocLike | null | undefined): Map<string, OrganSlot> {
  const m = new Map<string, OrganSlot>();
  if (!doc || typeof doc !== "object") return m;
  for (const key of organKeys(doc)) {
    const norm = normOrgan(key);
    if (!norm || m.has(norm)) continue;
    m.set(norm, { key, entry: doc[key] });
  }
  return m;
}

function cloneEntry<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function laterOf(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

export type AtlasThreeWayResult = {
  /** Birleşik belge (`_meta.tombstones` + `_meta.organUpdatedAt` seçilen taraftan). */
  document: AtlasDocLike;
  /**
   * Base'e göre HEM yerelde HEM sunucuda FARKLI biçimde değişen organlar (görünen ad).
   * Varsayılan politika ("local"): yerel sürüm KORUNUR; kullanıcı kararı beklenir.
   */
  conflicts: string[];
  /**
   * Base YOKKEN (LWW modu) sunucunun daha yeni sürümüne kaybeden YEREL organ girdileri
   * (görünen ad → girdi). Çağıran `atlas-conflict-backup` anahtarına yedekler.
   */
  lostLocal: Record<string, unknown>;
  mode: "three-way" | "lww";
};

/**
 * Organ bazında birleştirme.
 *
 * BASE VAR (3-yollu; base = istemcinin son bildiği sunucu belgesi):
 *   - yalnız yerel değişti          → yerel
 *   - yalnız sunucu değişti         → sunucu
 *   - ikisi de aynı biçimde değişti → sunucu (= yerel)
 *   - ikisi de FARKLI değişti       → ÇAKIŞMA: `onConflict` ("local" varsayılan) + conflicts[]
 *   "Değişim" organın varlığını da kapsar (silme = değişim). Mezar taşları seçilen taraftan.
 *
 * BASE YOK (eski istemci / ilk geçiş): organUpdatedAt LWW — ortak organda damgası daha
 *   YENİ olan kazanır (eşitlik → sunucu); sunucuya kaybeden farklı yerel girdi `lostLocal`
 *   ile yedeklenir. Tek tarafta olan organ korunur, ancak mezar taşı organın son
 *   güncellemesinden yeniyse DİRİLMEZ (zombie koruması — önceki davranış).
 *
 * Hayatta kalan organın `organUpdatedAt` damgası SEÇİLEN taraftan alınır (max DEĞİL —
 * kaybeden tarafın damgası kazanan içeriğe yapışıp sonraki LWW'yi yanıltmasın).
 */
export function mergeAtlasThreeWay(
  server: AtlasDocLike,
  local: AtlasDocLike,
  base: AtlasDocLike | null,
  now: string = new Date().toISOString(),
  onConflict: "local" | "server" = "local",
): AtlasThreeWayResult {
  const sMeta = server._meta ?? {};
  const lMeta = local._meta ?? {};
  const sUpd = sMeta.organUpdatedAt ?? {};
  const lUpd = lMeta.organUpdatedAt ?? {};
  const sTomb = sMeta.tombstones ?? {};
  const lTomb = lMeta.tombstones ?? {};
  const allTombstones = maxDateMap(sTomb, lTomb);

  const sIdx = organIndex(server);
  const lIdx = organIndex(local);
  const bIdx = base ? organIndex(base) : null;

  const out: AtlasDocLike = { _meta: {} };
  const survivorUpdatedAt: OrganTimeMap = {};
  const deletedTombstones: OrganTimeMap = {};
  const conflicts: string[] = [];
  const lostLocal: Record<string, unknown> = {};

  const keep = (slot: OrganSlot, norm: string, chosenUpd?: string, otherUpd?: string) => {
    out[slot.key] = cloneEntry(slot.entry);
    const at = chosenUpd ?? otherUpd;
    if (at) survivorUpdatedAt[norm] = at;
  };

  const norms = new Set<string>([...sIdx.keys(), ...lIdx.keys(), ...(bIdx ? bIdx.keys() : [])]);
  for (const norm of norms) {
    const s = sIdx.get(norm);
    const l = lIdx.get(norm);

    if (bIdx) {
      const b = bIdx.get(norm);
      const sv = s ? stableEntry(s.entry) : null;
      const lv = l ? stableEntry(l.entry) : null;
      const bv = b ? stableEntry(b.entry) : null;
      const localChanged = lv !== bv;
      const serverChanged = sv !== bv;
      let pick: "server" | "local";
      if (!localChanged) pick = "server";
      else if (!serverChanged) pick = "local";
      else if (lv === sv) pick = "server";
      else {
        const label = l?.key ?? s?.key ?? b?.key ?? norm;
        conflicts.push(label);
        pick = onConflict;
      }
      const chosen = pick === "server" ? s : l;
      if (chosen) {
        keep(
          chosen,
          norm,
          pick === "server" ? sUpd[norm] : lUpd[norm],
          pick === "server" ? lUpd[norm] : sUpd[norm],
        );
      } else {
        // Seçilen tarafta organ YOK (silinmiş) → mezar taşı (yoksa şimdi) bırak.
        deletedTombstones[norm] =
          (pick === "server" ? sTomb[norm] : lTomb[norm]) ?? allTombstones[norm] ?? now;
      }
      continue;
    }

    // ── LWW (base yok) ──
    const upd = laterOf(sUpd[norm], lUpd[norm]) ?? EPOCH;
    const tomb = allTombstones[norm];
    if (tomb && !(upd > tomb)) continue; // silinmiş → atla (zombie koruması)
    if (s && l) {
      if (organEntriesEqual(s.entry, l.entry)) {
        keep(s, norm, sUpd[norm], lUpd[norm]);
      } else if ((lUpd[norm] ?? EPOCH) > (sUpd[norm] ?? EPOCH)) {
        keep(l, norm, lUpd[norm], sUpd[norm]);
      } else {
        keep(s, norm, sUpd[norm], lUpd[norm]);
        lostLocal[l.key] = cloneEntry(l.entry);
      }
    } else if (s) {
      keep(s, norm, sUpd[norm], lUpd[norm]);
    } else if (l) {
      keep(l, norm, lUpd[norm], sUpd[norm]);
    }
  }

  const survivingNorms = new Set(organKeys(out).map(normOrgan));
  const keptTombstones: OrganTimeMap = {};
  for (const [k, v] of Object.entries({ ...allTombstones, ...deletedTombstones })) {
    if (survivingNorms.has(k)) continue; // hayatta kalan / dirilmiş organın mezar taşını düş
    keptTombstones[k] = v;
  }

  out._meta = {
    version: "1",
    updated_at: now,
    tombstones: keptTombstones,
    organUpdatedAt: survivorUpdatedAt,
  };
  return { document: out, conflicts, lostLocal, mode: bIdx ? "three-way" : "lww" };
}

/**
 * Tombstone-farkında birleştirme (base'siz yol — geriye dönük API).
 *   - Ortak organda organUpdatedAt LWW (eşitlik → sunucu); yalnız yerelde olan organ
 *     KORUNUR — ancak mezar taşı organın son güncellemesinden yeniyse organ DİRİLMEZ.
 *   - Hayatta kalan organların mezar taşları düşer; kalan mezar taşları (başka
 *     cihazlardaki bayat kopyaları bastırmak için) korunur.
 * Base snapshot'ı olan çağıranlar `mergeAtlasThreeWay` kullanır (P1-5).
 */
export function mergeAtlasWithTombstones(
  server: AtlasDocLike,
  local: AtlasDocLike,
  now: string = new Date().toISOString(),
): AtlasDocLike {
  return mergeAtlasThreeWay(server, local, null, now).document;
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
