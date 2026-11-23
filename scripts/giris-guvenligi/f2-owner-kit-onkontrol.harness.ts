/**
 * GİRİŞ GÜVENLİĞİ F2 — yayın ön kontrolü (scripts/giris-guvenligi/f2-owner-kit-onkontrol.sql) testi. GERÇEK PostgreSQL;
 * production'a SIFIR temas. Betik READ ONLY işlemde çalıştırılır (yazmaya kalkışsaydı hata verirdi).
 *   F2 öncesi (mfa_required sütunu yok) → GO · kitsiz zorunlu Owner yok → GO · kitli zorunlu Owner → GO ·
 *   kitsiz zorunlu Owner (F2-N geri alınmış durumda) → NO-GO · Owner sayısı 1 değil → NO-GO.
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2-owner-kit-onkontrol.harness.ts
 */
import fs from "node:fs";
import path from "node:path";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 240)}` : ""}`); }
}

async function main() {
  const { startF2cDb, U } = await import("./testDb");
  const SQL = fs.readFileSync(path.join(process.cwd(), "scripts/giris-guvenligi/f2-owner-kit-onkontrol.sql"), "utf8");
  const RB = fs.readFileSync(path.join(process.cwd(), "scripts/giris-guvenligi/f2n-rollback.sql"), "utf8");
  const db = await startF2cDb({ withF2n: true, ownerKit: false });
  const { admin } = db;
  const run = async (readOnly = true): Promise<string> => {
    await admin.query(readOnly ? "BEGIN READ ONLY" : "SAVEPOINT oc");
    try { return String((await admin.query(SQL)).rows[0].sonuc); }
    finally { await admin.query(readOnly ? "ROLLBACK" : "ROLLBACK TO SAVEPOINT oc"); }
  };
  const setReq = (v: boolean) => admin.query(`BEGIN; SELECT set_config('yasam.mfa_policy','on',true); UPDATE public.users SET mfa_required = ${v} WHERE id = '${U.owner}'; COMMIT;`);
  try {
    let r = await run();
    ok(/^owner_kit\|TAMAM\|.*\|GO\|owner_sayisi=1$/.test(r), "zorunluluk kapalı Owner → TAMAM / GO (salt-okunur işlemde)", r);
    await admin.query(`SELECT count(*) FROM public.auth_owner_offline_kit_issue()`);
    await setReq(true);
    r = await run();
    ok(/\|TAMAM\|.*\|GO\|/.test(r), "kitli zorunlu Owner → GO", r);
    // Kitsiz zorunlu Owner: yalnız F2-N KORUMASI YOKKEN oluşabilir (geri alınmış / eski veri) → NO-GO.
    await admin.query(RB);
    await admin.query(`UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'test' WHERE user_id = '${U.owner}' AND kind = 'owner_offline'`);
    r = await run();
    ok(/^owner_kit\|DUR\|kitsiz zorunlu Owner sayısı=1 .*\|NO-GO\|owner_sayisi=1$/.test(r), "kitsiz zorunlu Owner → DUR / NO-GO", r);
    await setReq(false);
    // İkinci Owner: F2-K yetki koruması doğrudan yükseltmeyi engeller → işlem içinde DB sahibi olarak geçici kapatılır, işlem GERİ ALINIR.
    await admin.query("BEGIN");
    await admin.query(`ALTER TABLE public.users DISABLE TRIGGER trg_users_admin_grant_guard`);
    await admin.query(`UPDATE public.users SET is_super_admin = true, active = true WHERE id = '00000000-0000-0000-0000-00000000a002'`);
    r = await run(false);
    await admin.query("ROLLBACK");
    ok(/\|DUR\|Owner sayısı 1 değil.*\|NO-GO\|owner_sayisi=2$/.test(r), "Owner sayısı 2 → DUR / NO-GO", r);
    // F2 öncesi production: mfa_required sütunu yok (işlem içinde geçici olarak kaldırılır ve geri alınır).
    await admin.query("BEGIN");
    await admin.query(`ALTER TABLE public.users RENAME COLUMN mfa_required TO mfa_required_gecici`);
    r = await run(false);
    await admin.query("ROLLBACK");
    ok(/^owner_kit\|F2 ÖNCESİ\|.*\|GO\|owner_sayisi=1$/.test(r), "F2 öncesi (sütun yok) → GO", r);
    // Salt-okunurluk: betik yazma içermez (READ ONLY'de çalıştı) + metin denetimi.
    ok(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/i.test(SQL.replace(/^--.*$/gm, "")), "betikte yazma / DDL komutu yok");
  } finally {
    await db.close();
  }
  console.log(`\nf2-owner-kit-onkontrol: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); fail++; console.log(`\nf2-owner-kit-onkontrol: ${pass} PASS / ${fail} FAIL (beklenmeyen hata)`); process.exit(1); });
