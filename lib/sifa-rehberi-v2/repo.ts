/**
 * PROTOTİP depo: tarayıcı localStorage'ında, uzman (ownerId) başına AYRI anahtar.
 * Canlı veritabanına HİÇBİR bağlantı yok. Gerçek üründe bu katman sunucu API'si olacak:
 *   - ownerId/tenantId OTURUMDAN alınır (istemciden kabul edilmez),
 *   - her yazım "sahiplik + döngü + derinlik" doğrulamasından geçer,
 *   - Kaydet tek atomik değişiklik kümesi (changeset) gönderir.
 * Bu sınıf aynı sözleşmeyi taklit eder: başka uzmanın kaydını içeren yazım REDDEDİLİR.
 */
import { upgradeLegacyLabels } from "@/lib/sifa-rehberi-v2/related";
import { validateWorkspace } from "@/lib/sifa-rehberi-v2/tree";
import type { Workspace } from "@/lib/sifa-rehberi-v2/types";

export const STORAGE_PREFIX = "sifa-v2-prototip:v2:";

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

export type SaveResult = { ok: true; savedAt: string } | { ok: false; error: string };

export class PrototypeRepo {
  constructor(
    private readonly store: KeyValueStore,
    private readonly seed: (ownerId: string) => Workspace,
  ) {}

  private key(ownerId: string) {
    return STORAGE_PREFIX + ownerId;
  }

  /** Yalnız istenen uzmanın çalışma alanı döner; yoksa sentetik tohumdan oluşturulur. */
  load(sessionOwnerId: string): Workspace {
    const raw = this.store.getItem(this.key(sessionOwnerId));
    if (raw) {
      try {
        const ws = JSON.parse(raw) as Workspace;
        // Önceki aşamadan kalan sentetik kayıtta yalnız görünen ad yükseltilir (kimlik/bağlantı aynı).
        if (ws.ownerId === sessionOwnerId) return upgradeLegacyLabels(ws);
      } catch {
        /* bozuk kayıt → tohumdan */
      }
    }
    const ws = this.seed(sessionOwnerId);
    this.store.setItem(this.key(sessionOwnerId), JSON.stringify(ws));
    return ws;
  }

  /** Oturum sahibi dışındaki herhangi bir kayıt → RED (sunucu sözleşmesi taklidi). */
  save(sessionOwnerId: string, ws: Workspace): SaveResult {
    if (ws.ownerId !== sessionOwnerId) return { ok: false, error: "Başka uzmanın çalışma alanına yazılamaz." };
    const errors = validateWorkspace(ws);
    if (errors.length) return { ok: false, error: `Kayıt bütünlüğü hatası: ${errors.slice(0, 3).join("; ")}` };
    try {
      this.store.setItem(this.key(sessionOwnerId), JSON.stringify(ws));
    } catch {
      return { ok: false, error: "Tarayıcı depolama alanı dolu (prototip sınırı). Büyük görselleri kaldırıp tekrar deneyin." };
    }
    return { ok: true, savedAt: new Date().toISOString() };
  }

  reset(ownerId: string): Workspace {
    this.store.removeItem(this.key(ownerId));
    return this.load(ownerId);
  }
}
