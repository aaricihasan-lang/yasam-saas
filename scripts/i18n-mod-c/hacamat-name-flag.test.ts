/**
 * I18N A8 (Owner §16) — Hacamat Takvimi `name_is_default`: migration UYGULANMADAN önce eski davranış güvenli mi?
 * Ağ / DB / sır YOK — sahte (mock) Supabase istemcisiyle sunucu yardımcısının davranışı sınanır.
 * Çalıştırma: npx tsx scripts/i18n-mod-c/hacamat-name-flag.test.ts
 *
 * Kanıtlanan:
 *  1) Kolon YOK (PGRST204 / 42703, kolon adı metinde) → aynı kayıt bayraksız BİR KEZ daha eklenir; sonuç bugünküyle aynı.
 *  2) Kolon VAR → kayıt name_is_default=true ile TEK istekte eklenir.
 *  3) Başka hata (23505, 23514, ağ, başka kolon) → yeniden deneme YOK; bugünkü güvenli hata yanıtı.
 *  4) Doğrulama (alan uzunluğu) ilk istekten ÖNCE çalışır; geçersiz alan DB'ye hiç gitmez.
 *  5) tenant_id her denemede sunucu değeri; istemci bayrağı yazamaz (writable dışı).
 */
import { insertEntityWithOptionalColumns, isMissingColumnError } from "../../lib/cupping/api";
import { CUPPING_TABLES, CALENDAR_PLAN_WRITABLE } from "../../lib/cupping/fields";
import { defaultPlanNameForSave } from "../../app/kupa/takvim/lib/systemNames";
import type { SupabaseClient } from "@supabase/supabase-js";

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string, detail?: unknown): void {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
}

type DbResult = { data: Record<string, unknown> | null; error: { code?: string; message?: string; details?: string } | null };
function mockDb(results: DbResult[]) {
  const calls: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const db = {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          calls.push({ table, payload });
          const r = results.shift() ?? { data: null, error: { code: "XX000", message: "beklenmeyen ek çağrı" } };
          return { select: () => ({ single: async () => r }) };
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const TABLE = CUPPING_TABLES.calendarPlans;
const TENANT = "00000000-0000-4000-8000-0000000000aa";
const fields = { name: defaultPlanNameForSave(2031), year: 2031 };
const PGRST204 = { code: "PGRST204", message: "Could not find the 'name_is_default' column of 'cupping_calendar_plans' in the schema cache" };

async function main(): Promise<void> {
  console.log("\n[A8 — opsiyonel kolon; migration öncesi güvenli]");

  // 1) Kolon yok (PostgREST şema önbelleği)
  {
    const row = { id: "p1", ...fields, tenant_id: TENANT };
    const { db, calls } = mockDb([{ data: null, error: PGRST204 }, { data: row, error: null }]);
    const r = await insertEntityWithOptionalColumns(db, TABLE, TENANT, fields, { name_is_default: true });
    ok(r.ok && (r as { data: Record<string, unknown> }).data.id === "p1", "kolon yok (PGRST204) → kayıt yine oluşur");
    ok(calls.length === 2 && calls[0].payload.name_is_default === true && !("name_is_default" in calls[1].payload),
      "ilk deneme bayraklı, ikinci deneme BAYRAKSIZ (bugünkü yük)", calls.map((c) => Object.keys(c.payload)));
    ok(JSON.stringify(calls[1].payload) === JSON.stringify({ ...fields, tenant_id: TENANT }),
      "ikinci deneme yükü bugünkü insertEntity yüküyle birebir (ad kanonik TR, tenant sunucudan)", calls[1].payload);
  }
  // 1b) Kolon yok (PG 42703)
  {
    const { db, calls } = mockDb([
      { data: null, error: { code: "42703", message: 'column "name_is_default" of relation "cupping_calendar_plans" does not exist' } },
      { data: { id: "p2" }, error: null },
    ]);
    const r = await insertEntityWithOptionalColumns(db, TABLE, TENANT, fields, { name_is_default: true });
    ok(r.ok && calls.length === 2, "kolon yok (42703) → bayraksız yeniden deneme");
  }
  // 2) Kolon var
  {
    const { db, calls } = mockDb([{ data: { id: "p3", name_is_default: true }, error: null }]);
    const r = await insertEntityWithOptionalColumns(db, TABLE, TENANT, fields, { name_is_default: true });
    ok(r.ok && calls.length === 1 && calls[0].payload.name_is_default === true && calls[0].payload.tenant_id === TENANT,
      "kolon var → tek istek, name_is_default=true, tenant sunucudan");
  }
  // 3) Başka hatalar yeniden denenmez
  for (const [label, err, status] of [
    ["23505 benzersizlik", { code: "23505", message: "duplicate key value" }, 409],
    ["23514 CHECK (ad kanonik değil)", { code: "23514", message: 'new row violates check constraint "cupping_calendar_plans_default_name_chk"' }, 500],
    ["PGRST204 başka kolon", { code: "PGRST204", message: "Could not find the 'other_col' column of 'cupping_calendar_plans' in the schema cache" }, 500],
    ["ağ/bilinmeyen", { message: "fetch failed" }, 500],
  ] as const) {
    const { db, calls } = mockDb([{ data: null, error: err }]);
    const r = await insertEntityWithOptionalColumns(db, TABLE, TENANT, fields, { name_is_default: true });
    const resp = (r as { response?: Response }).response;
    ok(!r.ok && calls.length === 1 && resp?.status === status, `${label} → yeniden deneme YOK, güvenli hata ${status}`, { calls: calls.length, status: resp?.status });
  }
  // 4) Doğrulama önce
  {
    const { db, calls } = mockDb([]);
    const r = await insertEntityWithOptionalColumns(db, TABLE, TENANT, { name: "x".repeat(5000), year: 2031 }, { name_is_default: true });
    ok(!r.ok && calls.length === 0, "aşırı uzun ad → DB'ye hiç istek gitmez (doğrulama aynı)");
  }
  // 5) Yardımcı + yazma izni
  ok(isMissingColumnError(PGRST204, ["name_is_default"]) && !isMissingColumnError(PGRST204, ["x"])
    && !isMissingColumnError({ code: "23505", message: "name_is_default" }, ["name_is_default"]) && !isMissingColumnError(null, ["name_is_default"]),
    "isMissingColumnError yalnız kolon-yok kodu + ADI VERİLEN kolon");
  ok(!(CALENDAR_PLAN_WRITABLE as readonly string[]).includes("name_is_default"), "bayrak istemci yazılabilir alanlarında DEĞİL");

  console.log(`\n=== A8 hacamat name_is_default: ${passed} PASS / ${failed} FAIL ===`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
