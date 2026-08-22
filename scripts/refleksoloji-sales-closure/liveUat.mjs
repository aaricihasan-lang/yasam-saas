/**
 * Refleksoloji satış-kapanış CANLI API UAT (yerel next start + gerçek Supabase).
 * Hedef tenant: alperen@outlook.com (disposable). Oluşturulan test verisi silinir.
 *
 * Kapsar: multi-organ round-trip, idempotency dedup, mass-assignment reddi,
 * malformed UUID → 400 / foreign UUID → 404, no-auth → 401,
 * organ usage + rename cascade.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.UAT_BASE || "http://localhost:3117";
const TEST_EMAIL = "alperen@outlook.com";
const MARK = "ZZUAT"; // temizlik için ayırıcı işaret

// .env.local'den servis anahtarı + url oku
function loadEnv() {
  const raw = readFileSync(resolve(__dirname, "../../.env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.error(`  ✗ ${name}`); }
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env eksik (.env.local).");
  const db = createClient(url, key, { auth: { persistSession: false } });

  // 1) alperen kullanıcısını bul
  const { data: user, error: uErr } = await db
    .from("users")
    .select("id, tenant_id, email, active, is_demo_account")
    .eq("email", TEST_EMAIL)
    .maybeSingle();
  if (uErr) throw uErr;
  if (!user) throw new Error(`Test hesabı bulunamadı: ${TEST_EMAIL}`);
  console.log(`Test kullanıcısı: ${user.id} tenant=${user.tenant_id} demo=${user.is_demo_account}`);
  const userId = user.id, tenantId = user.tenant_id;

  // 2) oturum tokeni mint et (yerel sunucu)
  const sRes = await fetch(`${BASE}/api/auth/session`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const sJson = await sRes.json().catch(() => ({}));
  if (!sRes.ok || !sJson.sessionToken) throw new Error(`session mint başarısız: ${sRes.status} ${JSON.stringify(sJson)}`);
  const token = sJson.sessionToken;
  const H = { "x-user-id": userId, "x-session-token": token, "Content-Type": "application/json" };

  const createdUids = [];

  try {
    // ─── AUTH: header yok → 401 ───
    {
      const r = await fetch(`${BASE}/api/refleksoloji/protocols`);
      ok(`auth: header yok → 401 (got ${r.status})`, r.status === 401);
    }

    // ─── MULTI-ORGAN round-trip ───
    const uid1 = `${MARK}-multi-${Date.now()}`;
    createdUids.push(uid1);
    {
      const r = await fetch(`${BASE}/api/refleksoloji/protocols`, {
        method: "POST", headers: H,
        body: JSON.stringify({
          source_uid: uid1,
          title: `${MARK} Multi Organ`,
          target_problem: "UAT",
          organs: "Karaciğer | Böbrek | Hipofiz",
          application_notes: "n",
          raw_json: { organs: ["Karaciğer", "Böbrek", "Hipofiz"] },
        }),
      });
      const j = await r.json();
      ok(`multi-organ POST ok (got ${r.status})`, r.ok && j.ok && j.protocol);
      const id = j.protocol?.id;
      ok("multi-organ: organs pipe string döner", j.protocol?.organs === "Karaciğer | Böbrek | Hipofiz");
      ok("multi-organ: tenant server-forced", j.protocol?.tenant_id === tenantId);
      // detay GET (valid uuid) → aynı organs
      const d = await fetch(`${BASE}/api/refleksoloji/protocols/${id}`, { headers: H });
      const dj = await d.json();
      ok(`detay GET 200 (got ${d.status})`, d.ok && dj.ok);
      ok("detay: organs 3 pipe segment", (dj.protocol?.organs || "").split(/[|,]+/).filter(Boolean).length === 3);
    }

    // ─── IDEMPOTENCY: aynı source_uid iki kez → tek satır ───
    {
      const r2 = await fetch(`${BASE}/api/refleksoloji/protocols`, {
        method: "POST", headers: H,
        body: JSON.stringify({ source_uid: uid1, title: `${MARK} Multi Organ`, organs: "Karaciğer | Böbrek | Hipofiz" }),
      });
      const j2 = await r2.json();
      ok(`idempotency: ikinci POST ok (got ${r2.status})`, r2.ok && j2.ok);
      ok("idempotency: deduped=true", j2.deduped === true);
      const { data: rows } = await db.from("reflexology_protocols")
        .select("id").eq("tenant_id", tenantId).eq("source_uid", uid1);
      ok(`idempotency: DB'de tek satır (got ${rows?.length})`, (rows?.length ?? 0) === 1);
    }

    // ─── MASS-ASSIGNMENT: forge tenant_id/id/created_at/origin_type reddedilir ───
    const uid2 = `${MARK}-forge-${Date.now()}`;
    createdUids.push(uid2);
    {
      const forgedId = "00000000-0000-4000-8000-000000000abc";
      const forgedTenant = "11111111-1111-4111-8111-111111111111";
      const r = await fetch(`${BASE}/api/refleksoloji/protocols`, {
        method: "POST", headers: H,
        body: JSON.stringify({
          source_uid: uid2, title: `${MARK} Forge`, organs: "Kalp",
          id: forgedId, tenant_id: forgedTenant, created_at: "1999-01-01T00:00:00Z",
          origin_type: "admin_transfer", origin_label: "Admin Kütüphanesi",
          transferred_at: "1999-01-01T00:00:00Z",
        }),
      });
      const j = await r.json();
      ok(`mass-assign POST ok (got ${r.status})`, r.ok && j.ok);
      const p = j.protocol;
      ok("mass-assign: forged tenant reddedildi", p?.tenant_id === tenantId);
      ok("mass-assign: forged id reddedildi", p?.id !== forgedId);
      ok("mass-assign: origin_type NULL (sahte köken yok)", p?.origin_type == null);
      ok("mass-assign: origin_label boş", p?.origin_label == null);
      ok("mass-assign: created_at 1999 değil", new Date(p?.created_at).getFullYear() >= 2025);
    }

    // ─── MALFORMED UUID → 400, foreign valid UUID → 404 ───
    {
      const bad = await fetch(`${BASE}/api/refleksoloji/protocols/abc`, { headers: H });
      ok(`malformed uuid → 400 (got ${bad.status})`, bad.status === 400);
      const bad2 = await fetch(`${BASE}/api/refleksoloji/protocols/not-a-uuid`, { headers: H });
      ok(`malformed uuid2 → 400 (got ${bad2.status})`, bad2.status === 400);
      const foreign = await fetch(`${BASE}/api/refleksoloji/protocols/123e4567-e89b-12d3-a456-426614174000`, { headers: H });
      ok(`foreign valid uuid → 404 (got ${foreign.status})`, foreign.status === 404);
    }

    // ─── ORGAN usage + rename cascade ───
    {
      const u = await fetch(`${BASE}/api/refleksoloji/protocols/organ?name=${encodeURIComponent("Böbrek")}`, { headers: H });
      const uj = await u.json();
      ok(`organ usage GET ok (got ${u.status})`, u.ok && uj.ok);
      ok(`organ usage: Böbrek ≥1 (got ${uj.count})`, (uj.count ?? 0) >= 1);

      const newOrgan = `Böbrek ${MARK}`;
      const rn = await fetch(`${BASE}/api/refleksoloji/protocols/organ`, {
        method: "POST", headers: H,
        body: JSON.stringify({ oldName: "Böbrek", newName: newOrgan }),
      });
      const rnj = await rn.json();
      ok(`rename cascade ok (got ${rn.status})`, rn.ok && rnj.ok);
      ok(`rename cascade: updated ≥1 (got ${rnj.updated})`, (rnj.updated ?? 0) >= 1);

      // uid1 protokolü artık yeni organ adını içermeli
      const { data: rows } = await db.from("reflexology_protocols")
        .select("organs").eq("tenant_id", tenantId).eq("source_uid", uid1).maybeSingle();
      ok(`rename cascade: protokolde yeni ad var`, (rows?.organs || "").includes(newOrgan));
      ok(`rename cascade: eski ad kalmadı`, !/(^|[|,]\s*)Böbrek(\s*[|,]|$)/.test(rows?.organs || ""));

      // Geri al (temizlik öncesi): yeni ad → Böbrek (idempotent değil ama veri tutarlılığı)
      await fetch(`${BASE}/api/refleksoloji/protocols/organ`, {
        method: "POST", headers: H,
        body: JSON.stringify({ oldName: newOrgan, newName: "Böbrek" }),
      });
    }
  } finally {
    // ─── CLEANUP: tüm UAT protokollerini sil ───
    let deleted = 0;
    for (const uid of createdUids) {
      const r = await fetch(`${BASE}/api/refleksoloji/protocols/by-uid/${encodeURIComponent(uid)}`, {
        method: "DELETE", headers: H,
      });
      const j = await r.json().catch(() => ({}));
      deleted += j.deleted ?? 0;
    }
    // güvenlik ağı: MARK içeren tüm satırları sil
    const { data: leftover } = await db.from("reflexology_protocols")
      .select("id, source_uid, title").eq("tenant_id", tenantId).ilike("source_uid", `${MARK}%`);
    if (leftover?.length) {
      await db.from("reflexology_protocols").delete().eq("tenant_id", tenantId).ilike("source_uid", `${MARK}%`);
    }
    const { data: after } = await db.from("reflexology_protocols")
      .select("id").eq("tenant_id", tenantId).ilike("source_uid", `${MARK}%`);
    ok(`cleanup: UAT verisi temizlendi (kalan ${after?.length ?? "?"})`, (after?.length ?? 0) === 0);
    console.log(`  (by-uid ile silinen: ${deleted}, leftover süpürülen: ${leftover?.length ?? 0})`);
  }

  console.log(`\nLive UAT: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) { console.error("FAILURES:\n" + fails.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  console.log("✓ Tüm canlı UAT testleri geçti.");
}

main().catch((e) => { console.error("UAT HATA:", e); process.exit(1); });
