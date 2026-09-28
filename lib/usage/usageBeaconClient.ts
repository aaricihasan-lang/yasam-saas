/**
 * USAGE360 — İSTEMCİ BEACON GÖNDERİCİSİ (tarayıcı; tek yol).
 *
 * Yalnız sunucunun kabul ettiği istemci sinyallerini gönderir: ping, module_opened,
 * tarayıcıda üretilen dışa aktarım (report_exported) ve istemci hatası (action_failed).
 * CREATE/UPDATE/DELETE buradan GÖNDERİLEMEZ (tip + sunucu şeması engeller).
 *
 * Etkinlik: root layout'taki UsageTracker, sunucudaki USAGE360_ENABLED değerini
 * `setUsageBeaconEnabled` ile bildirir. Kapalıyken (varsayılan) hiçbir istek atılmaz.
 * Yalnız sabit enum değerleri gider; dosya adı / içerik / URL / hata mesajı ASLA.
 */
import type { ModuleGateKey } from "@/lib/auth/moduleAccess";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { ClientErrorClass } from "@/lib/usage/usageTaxonomy";

const BEACON_URL = "/api/usage/beacon";

let beaconEnabled = false;

export function setUsageBeaconEnabled(enabled: boolean): void {
  beaconEnabled = enabled;
}

export type UsageBeaconBody =
  | { kind: "ping"; module?: ModuleGateKey }
  | { kind: "module_opened"; module: ModuleGateKey }
  | { kind: "report_exported"; module: ModuleGateKey; subEntity?: string; nonce?: string }
  | {
      kind: "action_failed";
      module: ModuleGateKey;
      errorClass: ClientErrorClass;
      failedAction?: "report_exported" | "file_uploaded";
      subEntity?: string;
      nonce?: string;
    };

export function sendUsageBeacon(body: UsageBeaconBody): void {
  if (!beaconEnabled || typeof window === "undefined") return;
  const user = readYasamUser();
  const token = readSessionToken();
  // Uzman değilse / demo / oturumsuz → gönderme (sunucu da ayrıca no-op yapar).
  if (!user || !token || user.role !== "expert" || user.is_demo_account === true) return;
  void fetch(BEACON_URL, {
    method: "POST",
    keepalive: true,
    cache: "no-store",
    headers: { "content-type": "application/json", "x-user-id": user.id, "x-session-token": token },
    body: JSON.stringify(body),
  }).catch(() => {
    /* telemetri hatası kullanıcıyı etkilemez */
  });
}

/** Tek kullanıcı eylemi için rastgele dedup nonce'u (çift tık / retry tek sayılır). */
function newNonce(): string {
  const c = globalThis.crypto;
  const raw = c && typeof c.randomUUID === "function" ? c.randomUUID() : `${Date.now()}${Math.random()}`;
  return raw.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 24);
}

/**
 * Tarayıcıda üretilen raporun (PDF / DOCX / PNG / yazdır) KULLANICI tarafından başarıyla
 * dışa aktarıldığı an çağrılır. Sayfa render'ı rapor olayı DEĞİLDİR.
 */
export function reportUsageExport(module: ModuleGateKey, subEntity?: string): void {
  sendUsageBeacon({ kind: "report_exported", module, ...(subEntity ? { subEntity } : {}), nonce: newNonce() });
}

/** Tarayıcıdaki dışa aktarım / yükleme başarısızlığı (yalnız sınıf; mesaj/stack YOK). */
export function reportUsageClientFailure(
  module: ModuleGateKey,
  errorClass: ClientErrorClass,
  failedAction?: "report_exported" | "file_uploaded",
  subEntity?: string,
): void {
  sendUsageBeacon({
    kind: "action_failed",
    module,
    errorClass,
    ...(failedAction ? { failedAction } : {}),
    ...(subEntity ? { subEntity } : {}),
    nonce: newNonce(),
  });
}
