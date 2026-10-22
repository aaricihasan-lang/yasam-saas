/**
 * inventorySyncState.ts — yerel stok önbelleği ↔ sunucu eşitleme durumu (BUG-021).
 *
 * Sorun: yükleme sırasında "önbellekte olup DB'de olmayan" her kalem "eski yerel kayıt" sayılıp
 * POST ile yeniden oluşturuluyordu. Oysa böyle bir kalem iki farklı şey olabilir:
 *   (a) bu cihazda oluşturulmuş, buluta henüz yazılamamış kayıt  → KORUNMALI (yüklenmeli)
 *   (b) başka cihazda / bu cihazda silinmiş, önbellekte kalmış kayıt → GERİ OLUŞTURULMAMALI
 * İkisi önbellekten ayırt edilemez. Bu yüzden (a) AÇIKÇA işaretlenir: yeni kayıt önbelleğe
 * yazılmadan önce "bekleyen" listesine eklenir, sunucu oluşturmayı onaylayınca çıkarılır.
 *
 *  - Durum kaydı VAR + kalem bekleyen   → (a): yüklenir.
 *  - Durum kaydı VAR + kalem bekleyen değil → (b): önbellekten düşürülür (yeniden oluşturulmaz).
 *  - Durum kaydı YOK (bu cihaz yeni modele ilk kez geçiyor; eski önbellek) → (a)/(b) bilinemez:
 *    kalem YENİDEN OLUŞTURULMAZ ve SİLİNMEZ; cihazda karantinaya alınır ve kullanıcıya adlarıyla
 *    bildirilir (gerekirse yeniden ekler). Ne sessiz geri gelme ne sessiz kayıp.
 *
 * Tüm erişim tenant'a bağlıdır; başka tenant'ın durumu yok sayılır. localStorage erişilemezse
 * (gizli mod vb.) durum "yok" sayılır → en güvenli dal (karantina) çalışır.
 */

type StoredState = { tenant: string; pending: string[] };
type StoredQuarantine = { tenant: string; items: { id: string; name: string }[]; shown: boolean };

const stateKey = (base: string) => `${base}__sync_state_v1`;
const quarantineKey = (base: string) => `${base}__legacy_quarantine_v1`;

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* depolama dolu/erişilemez: durum yazılamaz → sonraki yüklemede güvenli dal */
  }
}

export type InventorySyncState = { known: boolean; pending: Set<string> };

export function readInventorySyncState(base: string, tenant: string): InventorySyncState {
  const s = readJson<StoredState>(stateKey(base));
  if (!s || s.tenant !== tenant || !Array.isArray(s.pending)) return { known: false, pending: new Set() };
  return { known: true, pending: new Set(s.pending.filter((x) => typeof x === "string")) };
}

function writeState(base: string, tenant: string, pending: Set<string>): void {
  writeJson(stateKey(base), { tenant, pending: [...pending] } satisfies StoredState);
}

/** Yeni (henüz buluta yazılmamış) kaydı önbelleğe yazmadan ÖNCE çağrılır. */
export function markInventoryPending(base: string, tenant: string, id: string): void {
  const s = readInventorySyncState(base, tenant);
  s.pending.add(id);
  writeState(base, tenant, s.pending);
}

/** Sunucu oluşturmayı/silmeyi onayladı → bekleyen listesinden çıkar. */
export function clearInventoryPending(base: string, tenant: string, ids: Iterable<string>): void {
  const s = readInventorySyncState(base, tenant);
  if (!s.known) return;
  let changed = false;
  for (const id of ids) changed = s.pending.delete(id) || changed;
  if (changed) writeState(base, tenant, s.pending);
}

export type LocalOnlyPlan<T> = { upload: T[]; dropped: T[]; quarantined: T[] };

/**
 * DB yüklemesi BAŞARILI olduktan sonra çağrılır. `dbIds` sunucudaki kimliklerdir.
 * Sunucuda görünen bekleyenler temizlenir; durum kaydı (yoksa) oluşturulur.
 */
export function planLocalOnlyItems<T extends { id: string; name?: string }>(
  base: string,
  tenant: string,
  localOnly: T[],
  dbIds: ReadonlySet<string>,
): LocalOnlyPlan<T> {
  const s = readInventorySyncState(base, tenant);
  const plan: LocalOnlyPlan<T> = { upload: [], dropped: [], quarantined: [] };
  for (const it of localOnly) {
    if (!s.known) plan.quarantined.push(it);
    else if (s.pending.has(it.id)) plan.upload.push(it);
    else plan.dropped.push(it);
  }
  for (const id of [...s.pending]) if (dbIds.has(id)) s.pending.delete(id);
  writeState(base, tenant, s.pending);
  if (plan.quarantined.length) {
    const q = readJson<StoredQuarantine>(quarantineKey(base));
    const prev = q && q.tenant === tenant && Array.isArray(q.items) ? q.items : [];
    const seen = new Set(prev.map((x) => x.id));
    const items = [...prev];
    for (const it of plan.quarantined) {
      if (!seen.has(it.id)) items.push({ id: it.id, name: String(it.name ?? "") });
    }
    // Ham kalem verisi de saklanır (silinmez); yalnız otomatik yeniden oluşturulmaz.
    const rawKey = `${quarantineKey(base)}__raw`;
    const prevRaw = readJson<{ tenant: string; items: T[] }>(rawKey);
    const rawItems = prevRaw && prevRaw.tenant === tenant && Array.isArray(prevRaw.items) ? prevRaw.items : [];
    const rawSeen = new Set(rawItems.map((x) => x.id));
    writeJson(rawKey, { tenant, items: [...rawItems, ...plan.quarantined.filter((x) => !rawSeen.has(x.id))] });
    writeJson(quarantineKey(base), { tenant, items, shown: false } satisfies StoredQuarantine);
  }
  return plan;
}

/**
 * Karantinadaki kalem adlarını BİR KEZ döndürür (gösterildi olarak işaretler). Sayfa kullanıcıya
 * bildirir; veri cihazda kalır.
 */
export function takeQuarantineNotice(base: string, tenant: string): string[] {
  const q = readJson<StoredQuarantine>(quarantineKey(base));
  if (!q || q.tenant !== tenant || q.shown || !Array.isArray(q.items) || !q.items.length) return [];
  writeJson(quarantineKey(base), { ...q, shown: true });
  return q.items.map((x) => x.name || "(adsız ürün)");
}

export function quarantineNoticeText(names: string[]): string {
  return (
    `Bu cihazın eski önbelleğinde sunucuda bulunmayan ${names.length} kayıt vardı: ${names.join(", ")}. ` +
    "Başka bir cihazda silinmiş olabilecekleri için otomatik olarak yeniden oluşturulmadılar. " +
    "Hâlâ gerekiyorsa yeniden ekleyin."
  );
}
