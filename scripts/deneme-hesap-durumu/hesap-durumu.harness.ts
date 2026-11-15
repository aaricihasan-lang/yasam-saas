/**
 * ADMIN · DENEME ÜYELERİ — HESAP durumu ile DENEME durumunun ayrı gösterimi harness'ı.
 * Gerçek PostgreSQL (embedded) + gerçek migration zinciri (TRIAL7 → 4a → 4b) + gerçek admin_trial_list RPC'si +
 * gerçek GET /api/admin/trials route handler'ı (test-only PostgREST şimi). Production'a / ağa SIFIR temas;
 * tüm hesaplar sentetik (ZZ_DHD_*).
 *
 *   G  gösterim kuralı (saf): Hesap Aktif / Pasif / Arşivde ayrı; `active` yoksa rozet yok; pasif ≠ "Aktif"
 *   L  liste ucu: her satırda active + archived_at; deneme fazları, sayaçlar ve filtreler RPC ile BİREBİR
 *      (aktif / pasif / arşivde hesap × devam eden deneme, başlamamış, süresi dolmuş, durdurulmuş, incelemede)
 *   Y  salt-okunur: liste çağrısı kullanıcı / deneme / audit satırlarını değiştirmez
 *   F  4a öncesi şema (archived_at yok, 42703): uç yine 200; arşivdeki hesap en kötü "Pasif", asla "Aktif"
 *   S  ekran kaynağı: iki ayrı rozet ("Hesap: …" ve "Deneme: …"); tek başına faz etiketi kalmadı
 *
 * Çalıştır: npx tsx scripts/deneme-hesap-durumu/hesap-durumu.harness.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";
import {
  ACCOUNT_STATE_LABEL,
  TRIAL_PHASE_LABEL,
  trialAccountNote,
  trialAccountState,
} from "../../lib/admin/trialAccountStatus";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 600)}`}`);
  }
}

const CHAIN = [
  "20271009100000_admin_purge_archived_expert.sql",
  "20271230000000_astrology_technique_grants.sql",
  "20280101000000_trial7_self_trial.sql",
  "20280101000100_trial7_claims_retention.sql",
  "20280101000200_trial7_admin_trial_approval.sql",
  "20280101000300_admin_legacy_package_repair.sql",
  "20280101000400_admin_owner_notifications.sql",
  "20280101000500_admin_list_members_v2.sql",
  "20280101000600_admin_member_archive_state.sql",
  "20280101000710_admin_trial_convert_passive_guard_4b.sql",
];
const OWNER = "00000000-0000-4000-8000-00000000d4d1";
const TOK = "zz-dhd-owner-token-000001";
const H = 3_600_000;
const D = 86_400_000;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const a = srv.address();
      const p = typeof a === "object" && a ? a.port : 0;
      srv.close(() => (p ? resolve(p) : reject(new Error("boş port alınamadı"))));
    });
  });
}

type Row = { id: string; full_name: string; phase: string; active?: boolean; archived_at?: string | null };
type List = { ok: boolean; rows: Row[]; counts: Record<string, number>; total: number };

function sectionG(): void {
  console.log("\n[G] Gösterim kuralı (saf)");
  ok(trialAccountState({ active: true }) === "active", "active=true → Hesap: Aktif");
  ok(trialAccountState({ active: false, archived_at: null }) === "passive", "active=false, arşiv yok → Hesap: Pasif");
  ok(trialAccountState({ active: false, archived_at: "2026-11-10T10:00:00Z" }) === "archived", "archived_at dolu → Hesap: Arşivde");
  ok(trialAccountState({ active: false }) === "passive", "archived_at alanı hiç yok (4a öncesi) → Pasif (Aktif DEĞİL)");
  ok(trialAccountState({}) === null && trialAccountState({ active: "true" }) === null, "active gelmediyse / boolean değilse rozet yok (tahmin edilmez)");
  ok(ACCOUNT_STATE_LABEL.passive === "Pasif" && TRIAL_PHASE_LABEL.active === "Devam ediyor",
    "pasif hesap + devam eden deneme: \"Hesap: Pasif\" + \"Deneme: Devam ediyor\" (tek \"Aktif\" yok)");
  ok(TRIAL_PHASE_LABEL.not_started === "Başlamamış" && TRIAL_PHASE_LABEL.expired === "Süresi dolmuş" && TRIAL_PHASE_LABEL.suspended === "Durdurulmuş"
    && TRIAL_PHASE_LABEL.review === "İncelemede", "deneme fazı etiketleri korunur");
  ok(!Object.values(TRIAL_PHASE_LABEL).includes("Aktif"), "deneme fazı etiketlerinde hesap durumuyla karışan \"Aktif\" kelimesi yok");
  ok(trialAccountNote("active", "active") === null && trialAccountNote(null, "active") === null, "aktif hesapta açıklama notu yok");
  ok(/Hesap pasif/.test(trialAccountNote("passive", "active") ?? "") && /işlemeye devam/.test(trialAccountNote("passive", "active") ?? ""),
    "pasif hesap + devam eden deneme: not süre işlemesini açıklar");
  ok(/Hesap arşivde/.test(trialAccountNote("archived", "expired") ?? ""), "arşivdeki hesapta not görünür");
}

function sectionS(): void {
  console.log("\n[S] Ekran kaynağı");
  const src = readFileSync(path.join(process.cwd(), "app", "admin", "deneme-uyeleri", "page.tsx"), "utf8");
  ok(/Hesap: \{ACCOUNT_STATE_LABEL\[account\]\}/.test(src), "kartta \"Hesap: …\" rozeti var");
  ok(/Deneme: \{TRIAL_PHASE_LABEL\[r\.phase\]\}/.test(src), "kartta \"Deneme: …\" rozeti var");
  ok(!/\{PHASE_LABEL\[r\.phase\]\}/.test(src), "eski tek faz rozeti (yalnız \"Aktif\") kaldırıldı");
  ok(/trialAccountState\(r\)/.test(src) && /data-account-note/.test(src), "hesap durumu satır verisinden türetilir; pasif / arşiv notu çizilir");
  ok(/\{ key: "active", label: "Devam eden" \}/.test(src), "filtre sekmesi deneme fazını adlandırır (\"Devam eden\"); filtre anahtarları aynı");
}

async function main(): Promise<void> {
  sectionG();
  sectionS();

  const port = await freePort();
  const db = await startTestDb(port, `deneme-hesap-durumu-${port}`);
  const { su, pool } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    for (const f of CHAIN) await su.query(readMig(f));
    const tenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZDHD',$2,'active')`, [id, `zzdhd-${id.slice(0, 12)}`]);
      return id;
    };
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id, created_at)
       values ($1,'ZZ_DHD Owner','zz.dhd.owner@example.test','admin',true,'approved',true,'owner',$2, now() - interval '400 days')`,
      [OWNER, await tenant()],
    );
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [OWNER, TOK]);

    const NOW = Date.now();
    const mk = async (key: string, o: { active?: boolean; archived?: boolean; ts: string; t0: number | null; te: number | null }) => {
      const id = randomUUID();
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, package_type, plan, trial_kind, trial_status,
            trial_started_at, trial_ends_at, archived_at, module_permissions, tenant_id, created_at)
         values ($1,$2,$3,'expert',$4,'approved', now() - interval '10 days','trial','trial','self_7d',$5,$6,$7,$8,'{"clients":true}'::jsonb,$9, now() - interval '12 days')`,
        [id, `ZZ_DHD ${key}`, `zz.dhd.${key}@example.test`, o.active !== false, o.ts,
          o.t0 === null ? null : new Date(o.t0), o.te === null ? null : new Date(o.te), o.archived ? new Date(NOW - D) : null, await tenant()],
      );
      return id;
    };
    const run = (t0: number, te: number) => ({ ts: "active", t0, te });
    const ids = {
      activeRun: await mk("aktif-devam", { ...run(NOW - 2 * D, NOW + 5 * D) }),
      passiveRun: await mk("pasif-devam", { active: false, ...run(NOW - 2 * D, NOW + 5 * D) }),
      archivedRun: await mk("arsiv-devam", { active: false, archived: true, ...run(NOW - 3 * D, NOW + 4 * D) }),
      notStarted: await mk("baslamamis", { ts: "not_started", t0: null, te: null }),
      passiveNotStarted: await mk("pasif-baslamamis", { active: false, ts: "not_started", t0: null, te: null }),
      expired: await mk("bitmis", { ...run(NOW - 9 * D, NOW - 2 * D) }),
      passiveExpired: await mk("pasif-bitmis", { active: false, ...run(NOW - 10 * D, NOW - 3 * D) }),
      suspended: await mk("durdurulmus", { ts: "suspended", t0: NOW - 3 * D, te: NOW + 4 * D }),
      review: await mk("incelemede", { ts: "review", t0: NOW - H, te: NOW + 7 * D - H }),
    };
    const expect: Record<keyof typeof ids, { account: "active" | "passive" | "archived"; phase: string }> = {
      activeRun: { account: "active", phase: "active" },
      passiveRun: { account: "passive", phase: "active" },
      archivedRun: { account: "archived", phase: "active" },
      notStarted: { account: "active", phase: "not_started" },
      passiveNotStarted: { account: "passive", phase: "not_started" },
      expired: { account: "active", phase: "expired" },
      passiveExpired: { account: "passive", phase: "expired" },
      suspended: { account: "active", phase: "suspended" },
      review: { account: "active", phase: "review" },
    };

    shim = await startPgrestShim(pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    const listRoute = await import("../../app/api/admin/trials/route");
    const get = async (status = "all", q = "ZZ_DHD"): Promise<{ status: number; json: List }> => {
      const req = new NextRequest(`http://localhost/api/admin/trials?status=${status}&q=${encodeURIComponent(q)}`, {
        headers: { "x-admin-id": OWNER, "x-session-token": TOK },
      });
      const res = await listRoute.GET(req);
      return { status: res.status, json: (await res.json()) as List };
    };
    const rpc = async (status: string) =>
      (await su.query(`select public.admin_trial_list($1,$2,'ZZ_DHD',50,0) j`, [OWNER, status])).rows[0].j as List;
    const snap = async () => (await su.query(`select
        (select md5(string_agg(u::text, '|' order by id)) from public.users u) u,
        (select md5(coalesce(string_agg(t::text, '|' order by user_id), '')) from public.trial_profiles t) t,
        (select count(*)::int from public.admin_audit_log) a,
        (select count(*)::int from public.trial_admin_events) e`)).rows[0];

    // ── L) Liste ucu ───────────────────────────────────────────────────────────
    console.log("\n[L] Liste ucu: hesap durumu + deneme fazı ayrı");
    const s0 = await snap();
    const all = await get();
    ok(all.status === 200 && all.json.ok === true && all.json.rows.length === Object.keys(ids).length, "GET status=all 200; 9 sentetik satır", { s: all.status, n: all.json.rows?.length });
    const byId = new Map(all.json.rows.map((r) => [r.id, r]));
    for (const [k, id] of Object.entries(ids) as [keyof typeof ids, string][]) {
      const r = byId.get(id);
      const e = expect[k];
      const acc = r ? trialAccountState(r) : null;
      ok(!!r && r.phase === e.phase && acc === e.account,
        `${k}: Hesap: ${ACCOUNT_STATE_LABEL[e.account]} · Deneme: ${TRIAL_PHASE_LABEL[e.phase as keyof typeof TRIAL_PHASE_LABEL]}`,
        { phase: r?.phase, active: r?.active, archived_at: r?.archived_at, acc });
    }
    const pr = byId.get(ids.passiveRun);
    ok(!!pr && pr.active === false && pr.archived_at === null && pr.phase === "active",
      "kusurun vakası: pasif hesap + süren deneme → faz 'active' gelir; ekran artık hesap durumunu AYRI (Pasif) gösterir", pr);
    const ar = byId.get(ids.archivedRun);
    ok(!!ar && typeof ar.archived_at === "string" && ar.active === false, "arşivdeki hesapta archived_at dolu döner", ar);

    const rpcAll = await rpc("all");
    ok(JSON.stringify(all.json.counts) === JSON.stringify(rpcAll.counts) && all.json.total === rpcAll.total,
      "sayaçlar ve toplam RPC ile birebir (deneme durumu hesaplaması değişmedi)", { route: all.json.counts, rpc: rpcAll.counts });
    const strip = (rows: Row[]) => rows.map(({ archived_at, ...rest }) => { void archived_at; return rest; });
    ok(JSON.stringify(strip(all.json.rows)) === JSON.stringify(rpcAll.rows),
      "satırlar (sıra dahil) RPC çıktısıyla aynı; yalnız archived_at eklendi");
    for (const st of ["active", "not_started", "expired", "review", "suspended"]) {
      const r = await get(st);
      const raw = await rpc(st);
      ok(r.status === 200 && r.json.rows.map((x) => x.id).join() === raw.rows.map((x) => x.id).join() && r.json.rows.every((x) => x.phase === st),
        `filtre ${st}: aynı satırlar (${raw.rows.length}); hesap durumu filtreyi etkilemez`, { route: r.json.rows.length, rpc: raw.rows.length });
    }
    const act = await get("active");
    ok(act.json.rows.length === 3 && new Set(act.json.rows.map((x) => trialAccountState(x))).size === 3,
      "\"Devam eden\" filtresinde aktif + pasif + arşivde hesap ayrı ayrı görünür");
    const empty = await get("all", "zz-hic-yok-xyz");
    ok(empty.status === 200 && empty.json.rows.length === 0, "boş sonuç: ek sorgu yapılmadan 200");

    // ── Y) Salt-okunur ─────────────────────────────────────────────────────────
    console.log("\n[Y] Salt-okunur");
    const s1 = await snap();
    ok(JSON.stringify(s0) === JSON.stringify(s1), "liste çağrıları users / trial_profiles / audit / deneme olaylarını DEĞİŞTİRMEDİ", { s0, s1 });

    // ── F) 4a öncesi şema ──────────────────────────────────────────────────────
    console.log("\n[F] archived_at kolonu yok (42703) → güvenli geri dönüş");
    await su.query(`alter table public.users rename column archived_at to zz_archived_at`);
    try {
      const f = await get();
      const fr = new Map(f.json.rows.map((r) => [r.id, r]));
      ok(f.status === 200 && f.json.rows.length === Object.keys(ids).length, "kolon yokken uç yine 200 ve tüm satırlar", f.status);
      ok(f.json.rows.every((r) => !("archived_at" in r)), "archived_at eklenmez (uydurulmaz)");
      const fa = fr.get(ids.archivedRun);
      ok(!!fa && trialAccountState(fa) === "passive", "arşivdeki hesap bu durumda \"Pasif\" görünür — asla \"Aktif\" değil", fa);
      ok(trialAccountState(fr.get(ids.activeRun) ?? {}) === "active" && trialAccountState(fr.get(ids.passiveRun) ?? {}) === "passive",
        "aktif / pasif ayrımı korunur");
    } finally {
      await su.query(`alter table public.users rename column zz_archived_at to archived_at`);
    }

    // Negatif kontrol: harness kusuru yakalayabiliyor mu? Eski kural (yalnız faz etiketi) pasif hesapta "Aktif" yazardı.
    const OLD_PHASE_LABEL: Record<string, string> = { active: "Aktif" };
    ok(OLD_PHASE_LABEL[pr?.phase ?? ""] === "Aktif" && trialAccountState(pr ?? {}) === "passive",
      "negatif kontrol: eski tek rozet bu pasif hesapta \"Aktif\" gösterirdi; yeni hesap rozeti \"Pasif\"");
  } finally {
    if (shim) await shim.close().catch(() => undefined);
    await db.stop();
  }
}

main()
  .then(() => {
    console.log(`\nDENEME ÜYELERİ · HESAP DURUMU: PASS ${pass} · FAIL ${fail}`);
    if (fail) {
      console.log("Başarısız:", failures);
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error("HARNESS HATASI:", e);
    process.exit(1);
  });
