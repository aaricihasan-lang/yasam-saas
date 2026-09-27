/**
 * Refleksoloji — aktif oturumun kapsamlı depo erişimi (istemci yardımcısı).
 *
 * `scopedStorage` saf çekirdeğini oturum kullanıcısına bağlar. Not/atlas/protokol
 * depoları YALNIZ bu yardımcılar üzerinden okur/yazar → her okuma/yazma o anki
 * kullanıcının `refleks:v2:{tenant}:{user}:*` anahtarına gider.
 */

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import {
  readScopedJson,
  resolveReflexScope,
  scopeId,
  writeScopedJson,
  type ReflexDataset,
  type ReflexScope,
} from "./scopedStorage";

export function currentReflexScope(): ReflexScope | null {
  if (typeof window === "undefined") return null;
  return resolveReflexScope(readYasamUser());
}

/** Kapsamın kararlı kimliği (senkron sonucu uygulanırken kullanıcı değişti mi kontrolü). */
export function currentReflexScopeId(): string | null {
  const s = currentReflexScope();
  return s ? scopeId(s) : null;
}

export function readReflex<T>(dataset: ReflexDataset): T | null {
  return readScopedJson<T>(currentReflexScope(), dataset);
}

export function writeReflex(dataset: ReflexDataset, value: unknown): boolean {
  return writeScopedJson(currentReflexScope(), dataset, value);
}

/** Kimlik başlıkları (tenant sunucuda oturumdan çözülür). */
export function reflexUserHeaders(): Record<string, string> | null {
  const uid = readYasamUser()?.id;
  const token = readSessionToken();
  if (!uid || !token) return null;
  return { "x-user-id": uid, "x-session-token": token };
}

export function isReflexDemo(): boolean {
  return readYasamUser()?.is_demo_account === true;
}

/** Sunucu senkronu uygun mu: tarayıcı + demo değil + oturum + kapsam (tenant+kullanıcı). */
export function isReflexSyncEligible(): boolean {
  if (typeof window === "undefined") return false;
  if (isReflexDemo()) return false;
  if (!currentReflexScope()) return false;
  return reflexUserHeaders() !== null;
}
