// ============================================================
// Beslenme — Plan REVİZYONU silme + SON-revizyon yetim binding temizliği DAVRANIŞ harness'i
// (PGlite, DB-real). nutrition_plan_delete_revision RPC'sini gerçek şema üzerinde doğrular.
//
// Kapsam:
//   Case 1: family'de 2 revizyon → birini sil → hedef silinir, diğer revizyon KALIR, binding KALIR.
//   Case 2: family'de 1 revizyon → sil → plan silinir, nutrition_plan_clients binding SİLİNİR.
//   Case 3: yabancı tenant plan → 45014 (NOT_FOUND); hiçbir binding değişmez.
//   Ek: gün/öğün/item composite-FK cascade; GERÇEK clients kaydı ASLA silinmez; unbound plan
//       silme binding'siz güvenli.
// FAIL → exit 1.
// ============================================================
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mig = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };

const db = new PGlite();
for (const r of ["anon", "authenticated", "service_role"]) { try { await db.exec(`CREATE ROLE ${r};`); } catch {} }

// ── Prereq: baseline tabloları (migration'larda değil) + set_updated_at ──
await db.exec(`
  CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

  CREATE TABLE public.clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    ad text, soyad text, kan text, mizac text,
    UNIQUE (tenant_id, id)
  );

  CREATE TABLE public.nutrition_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    plan_family_id uuid NOT NULL,
    revision_number integer NOT NULL DEFAULT 1,
    CONSTRAINT nutrition_plans_tenant_id_key UNIQUE (tenant_id, id),
    CONSTRAINT nutrition_plans_family_revision_key UNIQUE (tenant_id, plan_family_id, revision_number)
  );
  CREATE TABLE public.nutrition_plan_days (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    plan_date date NOT NULL,
    FOREIGN KEY (tenant_id, plan_id) REFERENCES public.nutrition_plans (tenant_id, id) ON DELETE CASCADE,
    UNIQUE (tenant_id, plan_id, id)
  );
  CREATE TABLE public.nutrition_plan_meals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    plan_day_id uuid NOT NULL,
    label text NOT NULL,
    FOREIGN KEY (tenant_id, plan_id, plan_day_id) REFERENCES public.nutrition_plan_days (tenant_id, plan_id, id) ON DELETE CASCADE,
    UNIQUE (tenant_id, plan_id, id)
  );
  CREATE TABLE public.nutrition_plan_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    meal_id uuid NOT NULL,
    grams numeric NOT NULL,
    food_name_snapshot text NOT NULL,
    FOREIGN KEY (tenant_id, plan_id, meal_id) REFERENCES public.nutrition_plan_meals (tenant_id, plan_id, id) ON DELETE CASCADE
  );
`);

// ── tenant_guard fn + plan_clients tablosu (400) + yeni delete-revision RPC ──
// (400 migration'ı nutrition_client_tenant_guard'ı profiles migration'ından bekler → onu da uygula.)
for (const f of [
  "20270102000000_nutrition_client_profiles.sql",
  "20270102000400_nutrition_plan_clients.sql",
  "20270123000000_nutrition_plan_delete_revision.sql",
]) {
  try { await db.exec(mig(f)); ok(`migration applies: ${f}`, true); }
  catch (e) { ok(`migration applies: ${f}`, false, e.message); }
}

// ── Fixtures ──
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const q = (s, p = []) => db.query(s, p);
const one = async (s, p = []) => (await q(s, p)).rows[0];
const val = async (s, p = []) => Object.values((await one(s, p)))[0];
const cnt = async (t, w, p) => Number(await val(`SELECT count(*) FROM ${t} WHERE ${w}`, p));
const tryErr = async (s, p = []) => { try { await q(s, p); return null; } catch (e) { return e; } };
const parseJ = (v) => (typeof v === "string" ? JSON.parse(v) : v);

const clientA = (await one(`INSERT INTO clients (tenant_id, ad, soyad) VALUES ($1,'Ayşe','Yılmaz') RETURNING id`, [TA])).id;
const clientB = (await one(`INSERT INTO clients (tenant_id, ad) VALUES ($1,'Foreign') RETURNING id`, [TB])).id;

// ── Case 1: 2 revizyon, birini sil → diğer + binding KALIR ──
console.log("\n[Case 1 — 2 revizyon; ara revizyon silinir, binding korunur]");
const fam1 = await val(`SELECT gen_random_uuid()`);
const p1v1 = (await one(`INSERT INTO nutrition_plans (tenant_id, title, plan_family_id, revision_number) VALUES ($1,'P1',$2,1) RETURNING id`, [TA, fam1])).id;
const p1v2 = (await one(`INSERT INTO nutrition_plans (tenant_id, title, plan_family_id, revision_number) VALUES ($1,'P1',$2,2) RETURNING id`, [TA, fam1])).id;
// nested içerik (V1 altına) — cascade doğrulaması için
const d1 = (await one(`INSERT INTO nutrition_plan_days (tenant_id, plan_id, plan_date) VALUES ($1,$2,'2027-01-01') RETURNING id`, [TA, p1v1])).id;
const m1 = (await one(`INSERT INTO nutrition_plan_meals (tenant_id, plan_id, plan_day_id, label) VALUES ($1,$2,$3,'Kahvaltı') RETURNING id`, [TA, p1v1, d1])).id;
await q(`INSERT INTO nutrition_plan_items (tenant_id, plan_id, meal_id, grams, food_name_snapshot) VALUES ($1,$2,$3,100,'Yulaf')`, [TA, p1v1, m1]);
// binding (direct insert; tenant_guard trigger clientA/TA tutarlı → geçer)
await q(`INSERT INTO nutrition_plan_clients (tenant_id, plan_family_id, client_id) VALUES ($1,$2,$3)`, [TA, fam1, clientA]);
ok("Case1 setup: binding var", (await cnt("nutrition_plan_clients", "tenant_id=$1 AND plan_family_id=$2", [TA, fam1])) === 1);

const r1 = parseJ((await one(`SELECT nutrition_plan_delete_revision($1,$2) AS r`, [TA, p1v1])).r);
ok("Case1: RPC family_removed=false (başka revizyon var)", r1.family_removed === false);
ok("Case1: hedef revizyon (V1) silindi", (await cnt("nutrition_plans", "id=$1", [p1v1])) === 0);
ok("Case1: diğer revizyon (V2) KORUNDU", (await cnt("nutrition_plans", "id=$1", [p1v2])) === 1);
ok("Case1: binding KORUNDU (family hâlâ bağlı)", (await cnt("nutrition_plan_clients", "tenant_id=$1 AND plan_family_id=$2", [TA, fam1])) === 1);
ok("Case1: V1 gün/öğün/item composite-FK cascade = 0",
  (await cnt("nutrition_plan_days", "plan_id=$1", [p1v1])) === 0 &&
  (await cnt("nutrition_plan_meals", "plan_id=$1", [p1v1])) === 0 &&
  (await cnt("nutrition_plan_items", "plan_id=$1", [p1v1])) === 0);
ok("Case1: GERÇEK client kaydı korunuyor", (await cnt("clients", "id=$1", [clientA])) === 1);

// ── Case 2: SON revizyon → binding temizlenir ──
console.log("\n[Case 2 — son revizyon silinir; yetim binding temizlenir]");
const r2 = parseJ((await one(`SELECT nutrition_plan_delete_revision($1,$2) AS r`, [TA, p1v2])).r);
ok("Case2: RPC family_removed=true (son revizyon)", r2.family_removed === true);
ok("Case2: plan tamamen silindi (family boş)", (await cnt("nutrition_plans", "tenant_id=$1 AND plan_family_id=$2", [TA, fam1])) === 0);
ok("Case2: nutrition_plan_clients binding SİLİNDİ (yetim yok)", (await cnt("nutrition_plan_clients", "tenant_id=$1 AND plan_family_id=$2", [TA, fam1])) === 0);
ok("Case2: GERÇEK client kaydı ASLA silinmez", (await cnt("clients", "id=$1", [clientA])) === 1);

// ── Case 3: yabancı tenant plan → 45014, hiçbir şey değişmez ──
console.log("\n[Case 3 — yabancı tenant plan → 45014; binding değişmez]");
const famB = await val(`SELECT gen_random_uuid()`);
const pB = (await one(`INSERT INTO nutrition_plans (tenant_id, title, plan_family_id, revision_number) VALUES ($1,'PB',$2,1) RETURNING id`, [TB, famB])).id;
await q(`INSERT INTO nutrition_plan_clients (tenant_id, plan_family_id, client_id) VALUES ($1,$2,$3)`, [TB, famB, clientB]);
// TA olarak TB planını silmeye çalış → tenant-scoped resolve NOT FOUND → 45014
{ const e = await tryErr(`SELECT nutrition_plan_delete_revision($1,$2)`, [TA, pB]);
  ok("Case3: cross-tenant delete → 45014", !!e && String((e.message || "") + (e.code || "")).match(/45014|not_found/i)); }
ok("Case3: TB planı KORUNDU", (await cnt("nutrition_plans", "id=$1", [pB])) === 1);
ok("Case3: TB binding KORUNDU", (await cnt("nutrition_plan_clients", "tenant_id=$1 AND plan_family_id=$2", [TB, famB])) === 1);

// ── Ek: UNBOUND (binding'siz) plan silme güvenli (binding yok → orphan yok) ──
console.log("\n[Ek — unbound plan silme (binding'siz) güvenli]");
const famU = await val(`SELECT gen_random_uuid()`);
const pU = (await one(`INSERT INTO nutrition_plans (tenant_id, title, plan_family_id, revision_number) VALUES ($1,'Unbound',$2,1) RETURNING id`, [TA, famU])).id;
const rU = parseJ((await one(`SELECT nutrition_plan_delete_revision($1,$2) AS r`, [TA, pU])).r);
ok("Ek: unbound plan silindi", (await cnt("nutrition_plans", "id=$1", [pU])) === 0);
ok("Ek: unbound family_removed=true (binding yoktu)", rU.family_removed === true);

console.log(`\n=== PLAN DELETE-REVISION HARNESS: ${pass} PASS / ${fail} FAIL ===`);
// PGlite worker'ını temiz kapat → Windows'ta libuv async-handle teardown yarışını (UV_HANDLE_CLOSING
// assertion) önler. Sonucu belirleyen fail sayacıdır; kapanış hatası testi etkilemez.
try { await db.close(); } catch {}
process.exit(fail === 0 ? 0 : 1);
