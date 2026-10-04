/**
 * DEMO VİTRİN — sentetik fixture → migration SQL üreticisi (deterministik).
 *
 * Kaynak: lib/demo/demoVitrinFixture.ts (TEK KAYNAK). Çıktı:
 *   supabase/migrations/20271005300000_demo_vitrin_fixture_seed.sql
 *
 * Kullanım:
 *   npx tsx scripts/demo-vitrin/buildSeedSql.ts          → dosyayı yazar
 *   npx tsx scripts/demo-vitrin/buildSeedSql.ts --check  → dosya güncel değilse exit 1
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEMO_TENANT_ID,
  DEMO_ACCOUNT_EMAIL,
  DEMO_CLIENTS_SEED,
  DEMO_NOTES_SEED,
  DEMO_APPOINTMENTS_SEED,
  DEMO_STONES_SEED,
  DEMO_SESSIONS_SEED,
  DEMO_HOMEWORKS_SEED,
  DEMO_ANALYSES_SEED,
  DEMO_CHARGES_SEED,
  DEMO_ANAMNESES_SEED,
  DEMO_CONSENTS_SEED,
  DEMO_NUTRITION_PROFILES_SEED,
  DEMO_NUTRITION_MEASUREMENTS_SEED,
  DEMO_NUTRITION_PREFERENCES_SEED,
  DEMO_NUTRITION_PLAN,
  PLAN_NUTRIENT_CODES,
  buildChakraAnalysisData,
  planDayId,
  planItemNutrientId,
} from "../../lib/demo/demoVitrinFixture";

export const SEED_MIGRATION_FILE = "20271005300000_demo_vitrin_fixture_seed.sql";

const T = `'${DEMO_TENANT_ID}'::uuid`;
const U = "(SELECT u.id FROM public.users u WHERE u.tenant_id = " + T +
  " AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = '" + DEMO_ACCOUNT_EMAIL + "')";

function q(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function n(v: number | null | undefined): string {
  return v === null || v === undefined ? "NULL" : String(v);
}
function j(v: unknown): string {
  return `${q(JSON.stringify(v))}::jsonb`;
}
const uuid = (v: string) => `'${v}'::uuid`;
const day = (off: number) => `(current_date + (${off}))`;
const dayText = (off: number) => `to_char(current_date + (${off}), 'YYYY-MM-DD')`;
const ts = (off: number) => `(now() + interval '${off} days')`;
const at = (off: number, hour: number) =>
  `(((current_date + (${off}))::timestamp + interval '${hour} hours') AT TIME ZONE 'Europe/Istanbul')`;

function insert(table: string, cols: string[], rows: string[][], conflict = "ON CONFLICT (id) DO NOTHING"): string {
  const body = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `INSERT INTO public.${table} (${cols.join(", ")})\nVALUES\n${body}\n${conflict};\n`;
}

export function buildSeedSql(): string {
  const out: string[] = [];
  out.push(`-- ============================================================================
-- DEMO VİTRİN — SENTETİK ÖRNEK VERİ (uzman@test.com demo tenant'ı)
--
-- OTOMATİK ÜRETİLDİ — elle düzenleme. Kaynak: lib/demo/demoVitrinFixture.ts
-- Üretici: npx tsx scripts/demo-vitrin/buildSeedSql.ts (harness --check ile birebir doğrular).
--
-- KAPSAM: YALNIZ demo tenant ${DEMO_TENANT_ID} (users.is_demo_account=true,
-- email=${DEMO_ACCOUNT_EMAIL}). Gerçek uzman/tenant verisine DOKUNMAZ.
-- İÇERİK: açıkça sentetik (kurgusal adlar, 0500 000 xx xx telefonlar, example.test e-postalar).
-- İDEMPOTENT: tüm id'ler sabit; ON CONFLICT DO NOTHING → tekrar uygulama duplicate üretmez,
-- mevcut satırı DEĞİŞTİRMEZ. Tarihler uygulama anına göre gün ofsetiyle yazılır.
-- GÜVENLİK KİLİDİ: tenant yoksa, demo kullanıcı yoksa veya tenant'ta demo-OLMAYAN kullanıcı
-- varsa migration HATA verip hiçbir şey yazmaz (tek transaction).
-- NOT: client_notes/client_sessions/client_homeworks/client_stones/appointments üzerindeki
-- Yaşam Hafızası CDC tetikleyicileri birkaç outbox olayı üretir; işçi demo tenant'ı
-- "excluded-demo" olarak no-op/deindex ile kapatır (index'e demo verisi YAZILMAZ).
-- ============================================================================
BEGIN;

DO $demo_guard$
DECLARE
  v_demo_user uuid;
  v_non_demo integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = ${T}) THEN
    RAISE EXCEPTION 'demo vitrin seed: demo tenant bulunamadı (%)', '${DEMO_TENANT_ID}';
  END IF;
  SELECT count(*) INTO v_non_demo FROM public.users
   WHERE tenant_id = ${T} AND coalesce(is_demo_account, false) = false;
  IF v_non_demo > 0 THEN
    RAISE EXCEPTION 'demo vitrin seed: demo tenant demo-olmayan kullanıcı içeriyor (%) — durduruldu', v_non_demo;
  END IF;
  v_demo_user := ${U};
  IF v_demo_user IS NULL THEN
    RAISE EXCEPTION 'demo vitrin seed: demo kullanıcı (%) bulunamadı', '${DEMO_ACCOUNT_EMAIL}';
  END IF;
END
$demo_guard$;
`);

  out.push("-- Danışanlar");
  out.push(insert("clients",
    ["id", "tenant_id", "user_id", "ad", "soyad", "name", "telefon", "email", "dogum", "gorusme", "burc", "kan", "mizac", "created_at"],
    DEMO_CLIENTS_SEED.map((c) => [
      uuid(c.id), T, U, q(c.ad), q(c.soyad), q(`${c.ad} ${c.soyad}`), q(c.telefon), q(c.email), q(c.dogum),
      dayText(c.gorusmeOffsetDays), q(c.burc), q(c.kan), q(c.mizac), ts(c.createdOffsetDays),
    ])));

  out.push("-- Notlar (client_notes: danışan başına tek satır)");
  out.push(insert("client_notes",
    ["id", "tenant_id", "client_id", "saglik_notu", "adres", "oneriler", "notlar"],
    DEMO_NOTES_SEED.map((x) => [uuid(x.id), T, uuid(x.clientId), q(x.saglik), q(x.adres), q(x.oneriler), q(x.notlar)])));

  out.push("-- Randevular");
  out.push(insert("appointments",
    ["id", "tenant_id", "client_id", "user_id", "title", "appointment_date", "notes", "status"],
    DEMO_APPOINTMENTS_SEED.map((x) => [uuid(x.id), T, uuid(x.clientId), U, q(x.title), at(x.offsetDays, x.hour), q(x.notes), q(x.status)])));

  out.push("-- Danışan taşları");
  out.push(insert("client_stones",
    ["id", "tenant_id", "client_id", "stone_name", "stone_type", "usage_area", "note", "stone_date", "created_at"],
    DEMO_STONES_SEED.map((x) => [uuid(x.id), T, uuid(x.clientId), q(x.name), q(x.type), q(x.usageArea), q(x.note), day(x.offsetDays), ts(x.offsetDays)])));

  out.push("-- Seanslar");
  out.push(insert("client_sessions",
    ["id", "tenant_id", "client_id", "tarih", "session_date", "session_type", "duration_minutes", "fee", "session_note", "actions_done", "suggestions", "next_plan", "created_at"],
    DEMO_SESSIONS_SEED.map((x) => [
      uuid(x.id), T, uuid(x.clientId), dayText(x.offsetDays), day(x.offsetDays), q(x.type), n(x.minutes), n(x.fee),
      q(x.note), q(x.actions), q(x.suggestions), q(x.nextPlan), ts(x.offsetDays),
    ])));

  out.push("-- Ödevler");
  out.push(insert("client_homeworks",
    ["id", "tenant_id", "client_id", "title", "homework_type", "description", "start_date", "end_date", "status", "expert_note", "created_at"],
    DEMO_HOMEWORKS_SEED.map((x) => [
      uuid(x.id), T, uuid(x.clientId), q(x.title), q(x.type), q(x.description), day(x.startOffsetDays), day(x.endOffsetDays),
      q(x.status), q(x.expertNote), ts(x.startOffsetDays),
    ])));

  out.push("-- Analizler (Çakra Analizi — AnalizlerTab anahtar şeması)");
  out.push(insert("client_analyses",
    ["id", "tenant_id", "client_id", "analysis_type", "analysis_data", "note", "created_at"],
    DEMO_ANALYSES_SEED.map((x) => [uuid(x.id), T, uuid(x.clientId), q("chakra"), j(buildChakraAnalysisData(x.marks)), q(x.note), ts(x.offsetDays)])));

  out.push("-- Ücretlendirme");
  out.push(insert("client_charges",
    ["id", "tenant_id", "client_id", "charge_date", "category", "amount", "detail", "note", "created_at"],
    DEMO_CHARGES_SEED.map((x) => [uuid(x.id), T, uuid(x.clientId), day(x.offsetDays), q(x.category), n(x.amount), q(x.detail), q(x.note), ts(x.offsetDays)])));

  out.push("-- Anamnez (std-v1, tamamlanmış)");
  out.push(insert("client_anamneses",
    ["id", "tenant_id", "client_id", "kind", "title", "assessment_date", "status", "template_key", "template_version",
      "form_custom", "answers", "source_links", "client_snapshot", "revision", "created_by_user_id", "updated_by_user_id",
      "completed_by_user_id", "created_at", "updated_at", "completed_at"],
    DEMO_ANAMNESES_SEED.map((x) => {
      const c = DEMO_CLIENTS_SEED.find((cl) => cl.id === x.clientId)!;
      return [
        uuid(x.id), T, uuid(x.clientId), q("initial"), q(x.title), day(x.offsetDays), q("completed"), q("standard"), q("std-v1"),
        j({ hidden: [], labels: {}, enabledSections: [], custom: [] }), j(x.answers), j({}),
        j({ ad: c.ad, soyad: c.soyad, dogum: c.dogum }), "2", U, U, U, ts(x.offsetDays), ts(x.offsetDays), ts(x.offsetDays),
      ];
    })));

  out.push("-- KVKK onam kayıtları");
  out.push(insert("client_consents",
    ["id", "tenant_id", "client_id", "consent_type", "status", "text_version", "method", "source", "note", "recorded_by_user_id", "recorded_at"],
    DEMO_CONSENTS_SEED.map((x) => [
      uuid(x.id), T, uuid(x.clientId), q(x.type), q(x.status), q("kvkk-2026-10"), q(x.method), q("demo_vitrin_fixture"),
      q("Sentetik örnek onam kaydı."), U, ts(x.offsetDays),
    ])));

  out.push("-- Beslenme: danışan profili");
  out.push(insert("nutrition_client_profiles",
    ["id", "tenant_id", "client_id", "goal_type", "goal_note", "activity_level", "dietary_pattern", "daily_meal_count",
      "target_weight_kg", "water_note", "lifestyle_note", "general_note"],
    DEMO_NUTRITION_PROFILES_SEED.map((x) => [
      uuid(x.id), T, uuid(x.clientId), q(x.goalType), q(x.goalNote), q(x.activityLevel), q(x.dietaryPattern),
      n(x.dailyMealCount), n(x.targetWeightKg), q(x.waterNote), q(x.lifestyleNote), q(x.generalNote),
    ]), "ON CONFLICT DO NOTHING"));

  out.push("-- Beslenme: ölçümler");
  out.push(insert("nutrition_client_measurements",
    ["id", "tenant_id", "client_id", "measured_at", "weight_kg", "height_cm", "waist_cm", "hip_cm", "note"],
    DEMO_NUTRITION_MEASUREMENTS_SEED.map((x) => [
      uuid(x.id), T, uuid(x.clientId), at(x.offsetDays, 9), n(x.weightKg), n(x.heightCm), n(x.waistCm), n(x.hipCm), q(x.note),
    ])));

  out.push("-- Beslenme: tercih / kaçınma");
  out.push(insert("nutrition_client_food_preferences",
    ["id", "tenant_id", "client_id", "stance", "food_id", "food_label", "note"],
    DEMO_NUTRITION_PREFERENCES_SEED.map((x) => [uuid(x.id), T, uuid(x.clientId), q(x.stance), "NULL", q(x.foodLabel), q(x.note)])));

  const P = DEMO_NUTRITION_PLAN;
  out.push("-- Beslenme: plan (aktif, revizyon 1) + günler + öğünler + kalemler + besin snapshot'ları");
  out.push(insert("nutrition_plans",
    ["id", "tenant_id", "title", "note", "start_date", "end_date", "daily_energy_target", "status", "plan_family_id", "revision_number"],
    [[uuid(P.id), T, q(P.title), q(P.note), day(P.startOffsetDays), day(P.startOffsetDays + P.lengthDays - 1), n(P.energyTarget), q("active"), uuid(P.familyId), "1"]]));
  out.push(insert("nutrition_plan_days",
    ["id", "tenant_id", "plan_id", "plan_date"],
    Array.from({ length: P.lengthDays }, (_, i) => [uuid(planDayId(i)), T, uuid(P.id), day(P.startOffsetDays + i)])));
  out.push(insert("nutrition_plan_meals",
    ["id", "tenant_id", "plan_id", "plan_day_id", "meal_type", "label", "sort_order"],
    P.meals.map((m) => [uuid(m.id), T, uuid(P.id), uuid(P.dayId), q(m.mealType), q(m.label), n(m.sort)])));
  const items = P.meals.flatMap((m) => m.items.map((it) => ({ meal: m, it })));
  out.push(insert("nutrition_plan_items",
    ["id", "tenant_id", "plan_id", "meal_id", "food_id", "grams", "quantity", "food_name_snapshot", "food_ownership_snapshot",
      "portion_label_snapshot", "portion_gram_snapshot", "sort_order", "note"],
    items.map(({ meal, it }, idx) => [
      uuid(it.id), T, uuid(P.id), uuid(meal.id), "NULL", n(it.grams), "1", q(it.label), q("custom"),
      q(it.portion), n(it.grams), n(meal.items.indexOf(it)), q(idx === 0 ? "Sentetik örnek kalem." : null),
    ])));
  out.push(insert("nutrition_plan_item_nutrients",
    ["id", "tenant_id", "item_id", "nutrient_code", "amount", "unit_code"],
    items.flatMap(({ it }, idx) =>
      PLAN_NUTRIENT_CODES.map((c, ci) => [uuid(planItemNutrientId(idx, ci)), T, uuid(it.id), q(c.code), n(it.per100[c.code]), q(c.unit)]),
    )));
  out.push("-- Plan ↔ danışan bağı");
  out.push(insert("nutrition_plan_clients",
    ["tenant_id", "plan_family_id", "client_id", "assigned_by"],
    [[T, uuid(P.familyId), uuid(P.clientId), U]], "ON CONFLICT (tenant_id, plan_family_id) DO NOTHING"));

  out.push("COMMIT;\n");
  return out.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const file = path.join(process.cwd(), "supabase", "migrations", SEED_MIGRATION_FILE);
  const sql = buildSeedSql();
  if (process.argv.includes("--check")) {
    const cur = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    if (cur !== sql) {
      console.error(`✗ ${SEED_MIGRATION_FILE} güncel değil — npx tsx scripts/demo-vitrin/buildSeedSql.ts`);
      process.exit(1);
    }
    console.log(`✓ ${SEED_MIGRATION_FILE} fixture kaynağıyla birebir aynı.`);
  } else {
    writeFileSync(file, sql);
    console.log(`yazıldı: supabase/migrations/${SEED_MIGRATION_FILE} (${sql.length} bayt)`);
  }
}
