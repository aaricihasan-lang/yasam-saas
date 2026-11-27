/**
 * Şifa Rehberi V2 — GERÇEK API rotalarının ortak parçaları. Her rota AYNI sırayı AÇIKÇA uygular
 * (proje envanter harness'ı kapıyı rota dosyasında arar — scripts/faz1-p3-access-management-test.ts):
 *   1) if (!sifaV2Enabled()) return sifaV2NotFound();          — sürüm bayrağı (V1 çalışırken V2 API'si yok)
 *   2) const guard = await requireModuleAccess(req, "sifa_rehberi"); if (!guard.ok) return guard.response;
 *      — mevcut oturum + kullanıcı/tenant + üyelik/deneme kapısı + modül izni
 *   2b) if (!(await sifaV2Ready(guard.db))) return sifaV2NotFound();  — YAYIN HAZIRLIĞI (F4-R2): üç F3 migration'ı
 *      (20280130000200 + 000300 + 000400) tamamlanmadan bayrak açık olsa da Şifa KAPALI kalır
 *   3) yazma ucunda: if (guard.is_demo_account) return demoReadOnlyResponse();
 *   4) const c = sifaV2Context(guard);                          — kapsam YALNIZ oturumdan
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseDb } from "@/lib/sifa-rehberi-v2/server/dbAdapters";
import { supabaseStorage, type SifaV2Storage } from "@/lib/sifa-rehberi-v2/server/storage";
import type { Scope, SifaV2Db } from "@/lib/sifa-rehberi-v2/server/service";
import { sifaV2EnabledFromEnv } from "@/lib/sifa-rehberi-v2/versionRoute";

export function sifaV2Enabled(): boolean {
  return sifaV2EnabledFromEnv();
}

/**
 * YAYIN HAZIRLIĞI (F4-R2): Şifa yalnız `sifa_v2_f3_hazir()` (son migration 20280130000400 kurar; kapı ön koşulu F3 + YH)
 * true dönerse açılır. Fonksiyon yok / hata / false → kapalı ("bakımda", API 404). Bayrak tek başına yetmez: migration'lar
 * bitmeden yanlışlıkla bayrak açılsa bile eksik şemayla yazma OLMAZ. Sonuç süreç içinde 30 sn önbelleğe alınır.
 */
const HAZIR_TTL_MS = 30_000;
let hazirOnbellek: { deger: boolean; zaman: number } | null = null;
export async function sifaV2Ready(db: SupabaseClient): Promise<boolean> {
  const simdi = Date.now();
  if (hazirOnbellek && simdi - hazirOnbellek.zaman < HAZIR_TTL_MS) return hazirOnbellek.deger;
  let deger = false;
  try {
    const { data, error } = await db.rpc("sifa_v2_f3_hazir");
    deger = !error && data === true;
  } catch {
    deger = false;
  }
  hazirOnbellek = { deger, zaman: simdi };
  return deger;
}
/** Şifa ekranı açılır mı? Bayrak AÇIK + yayın hazırlık işareti (app/sifa-rehberi/layout.tsx bu kararı kullanır). */
export async function sifaEkranAcik(db: SupabaseClient): Promise<boolean> {
  return sifaV2Enabled() && (await sifaV2Ready(db));
}
/** Testler için: önbelleği sıfırla. */
export function sifaV2ReadyReset(): void {
  hazirOnbellek = null;
}

export function sifaV2NotFound(): NextResponse {
  return NextResponse.json({ error: "Bulunamadı." }, { status: 404 });
}

export type SifaV2Ctx = { db: SifaV2Db; storage: SifaV2Storage; scope: Scope; userId: string };

/** requireModuleAccess'in BAŞARILI sonucundan bağlam (tenant + kullanıcı yalnız oturumdan). */
export function sifaV2Context(guard: { db: SupabaseClient; tenantId: string; userId: string }): SifaV2Ctx {
  return {
    db: supabaseDb(guard.db),
    storage: supabaseStorage(guard.db),
    scope: { tenantId: guard.tenantId, userId: guard.userId },
    userId: guard.userId,
  };
}
