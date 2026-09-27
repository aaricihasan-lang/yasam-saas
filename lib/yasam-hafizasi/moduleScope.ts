/**
 * YAŞAM HAFIZASI — AKTİF MODÜL KAPSAMI (ÜYE YÖNETİMİ FAZ 2 · owner kararı).
 *
 * TEK DOĞRULUK KAYNAĞI: users.module_permissions (Üye Yönetimi). Yaşam Hafızası kendi
 * modül listesini TUTMAZ; aktif kapsam her istekte uzmanın GÜNCEL izinlerinden türetilir
 * (alias-aware, lib/auth/moduleAccessCore.resolveModuleAccess). Böylece:
 *   - admin yeni modül açınca → Hafıza ek ayar olmadan o modülün kayıtlarını kapsar,
 *   - modül kapatılınca → aktif kapsamdan (arama/facet/yeni snapshot + mevcut snapshot okuma
 *     ve Word teslim eki) OTOMATİK çıkar,
 *   - geçmiş Hafıza kayıtları SİLİNMEZ (index + mevcut snapshot'lar korunur; yeniden açılınca
 *     aynı kayıtlar kendiliğinden tekrar görünür — gap/backfill gerekmez).
 *
 * Eşleme: Hafıza `source_module` (index satırı) → modül kapısı anahtar(lar)ı (HEPSİ gerekli).
 * Eşlemesi OLMAYAN kaynak (ör. yebs — admin-only merkezi referans) uzman için FAIL-CLOSED
 * kapsam dışıdır; admin (role=admin) tüm modülleri görür (resolveModuleAccess admin bypass).
 * SAF modül — server-bağımsız; harness ile birebir test edilir.
 */
import { resolveModuleAccess, type ModuleGateKey } from "@/lib/auth/moduleAccessCore";

/** Hafıza source_module → gerekli modül kapısı anahtarları (tümü açık olmalı). */
export const YH_SOURCE_MODULE_GATES: Readonly<Record<string, readonly ModuleGateKey[]>> = {
  // Mesleki (professional) index — YH_SOURCE_MODULES
  refleksoloji: ["reflexology"],
  sifa_rehberi: ["sifa_rehberi"],
  biyoenerji: ["energy_body"],
  dogaltas: ["stones"],
  aromaterapi: ["aromatherapy"],
  kisisel_arsiv: ["personal_archive"],
  numeroloji: ["numerology"],
  kupa_hacamat: ["cupping"],
  // Danışan (client) index — YH_CLIENT_INDEX_SOURCES: danışan yolculuğu verileri
  // app/api/clients (clients kapısı) üzerinden yazılır/okunur.
  danisan_kombinasyon: ["clients"],
  danisan_tas: ["clients"],
  danisan_seans: ["clients"],
  danisan_odev: ["clients"],
  danisan_not: ["clients"],
  randevu: ["appointments"],
  human_design: ["human_design"],
};

export type YhModuleScope = {
  readonly isAdmin: boolean;
  /** Aktif (erişilebilir) Hafıza source_module değerleri. */
  readonly activeSourceModules: ReadonlySet<string>;
};

/**
 * Uzmanın GÜNCEL module_permissions'ından aktif Hafıza kapsamını türetir (saklanmaz, cache yok).
 */
export function resolveYhModuleScope(role: unknown, modulePermissions: unknown): YhModuleScope {
  const isAdmin = String(role ?? "").trim().toLowerCase() === "admin";
  const active = new Set<string>();
  for (const [sourceModule, gates] of Object.entries(YH_SOURCE_MODULE_GATES)) {
    if (gates.every((g) => resolveModuleAccess(role, modulePermissions, g))) active.add(sourceModule);
  }
  return { isAdmin, activeSourceModules: active };
}

/** Bu source_module aktif kapsamda mı? Admin → her zaman; eşlemesiz kaynak → uzman için HAYIR. */
export function isYhSourceModuleInScope(scope: YhModuleScope, sourceModule: unknown): boolean {
  if (scope.isAdmin) return true;
  return typeof sourceModule === "string" && scope.activeSourceModules.has(sourceModule);
}

/** Sonuç listesini aktif kapsama indirger (satır SİLİNMEZ; yalnız sunumdan çıkar). */
export function filterByYhScope<T extends { module: string }>(scope: YhModuleScope, rows: readonly T[]): T[] {
  return rows.filter((r) => isYhSourceModuleInScope(scope, r.module));
}
