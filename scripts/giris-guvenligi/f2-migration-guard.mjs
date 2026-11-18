#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F2-J — migration YENİDEN / SIRASIZ UYGULAMA KORUMASI üreticisi ve denetleyicisi.
 *
 * Sorun (17.11 ölçümü): F2 migration'ları aynı fonksiyonları `CREATE OR REPLACE` ile yeniden tanımlar. Eski bir dosya
 * zincirden sonra yeniden çalıştırılırsa Owner korumalı gövdeler sessizce eski (korumasız) sürüme döner.
 *
 * Çözüm: her F2 migration'ı kendi transaction'ının (BEGIN) hemen başında, HİÇBİR nesneye dokunmadan önce iki BAĞIMSIZ
 * kaynağı okur ve uyuşmazlıkta işlemi reddeder (fail-closed; transaction geri alınır, hiçbir şey değişmez):
 *   1) Kayıt: `public.auth_f2_schema_level()` — her doğrusal F2 migration'ı COMMIT'ten hemen önce kendi düzeyini yazar.
 *   2) Katalog parmak izleri: her aşamanın İLK kez oluşturduğu ve sonra yeniden tanımlanmayan bir nesne.
 * Reddetme kodları (SQLSTATE):
 *   YF201  YENİDEN UYGULAMA YASAK — daha yeni bir F2 aşaması mevcut (kayıt VEYA katalog).
 *   YF202  SIRA HATASI — önceki aşamalardan biri eksik.
 *   YF203  ŞEMA SAPMASI — kayıt ile katalog parmak izleri çelişiyor (insan incelemesi gerekli).
 * Aynı (en son) dosyanın yeniden çalıştırılmasına izin verilir: idempotent olduğu testle kanıtlanır (katalog farkı 0).
 * 000200 (service_role oturum INSERT kilidi) doğrusal zincirin dışındadır: yalnız 000100'ün varlığını şart koşar,
 * kayıt düzeyini değiştirmez ve tekrar çalıştırılması zararsızdır (yalnız REVOKE).
 *
 * Kullanım:
 *   node scripts/giris-guvenligi/f2-migration-guard.mjs --yaz      → blokları dosyalara yazar / günceller
 *   node scripts/giris-guvenligi/f2-migration-guard.mjs --denetle  → blokların güncel olduğunu doğrular (CI)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG = path.join(root, "supabase", "migrations");

/** Doğrusal F2 zinciri: düzey → parmak izi ifadesi (aşamanın ilk oluşturduğu, sonra yeniden tanımlanmayan nesne). */
export const F2_STAGES = [
  { level: 0, file: "20280103000000", fp: "to_regprocedure('public.auth_is_owner_admin(uuid)') IS NOT NULL" },
  { level: 100, file: "20280103000100", fp: "to_regclass('public.auth_mfa_challenges') IS NOT NULL" },
  { level: 300, file: "20280103000300", fp: "to_regclass('public.auth_trusted_devices') IS NOT NULL" },
  { level: 400, file: "20280103000400", fp: "to_regclass('public.auth_email_otps') IS NOT NULL" },
  { level: 500, file: "20280103000500", fp: "to_regclass('public.auth_recovery_codes') IS NOT NULL" },
  { level: 600, file: "20280103000600",
    fp: "EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'auth_owner_session_stale')" },
  { level: 700, file: "20280103000700", fp: "to_regclass('public.auth_audit_retention_policy') IS NOT NULL" },
  { level: 800, file: "20280103000800", fp: "to_regclass('public.auth_retention_holds') IS NOT NULL" },
  { level: 900, file: "20280103000900", fp: "to_regprocedure('public.user_sessions_user_id_immutable()') IS NOT NULL" },
  { level: 1000, file: "20280103001000", fp: "to_regclass('public.auth_session_device_proofs') IS NOT NULL" },
  { level: 1100, file: "20280103001100", fp: "to_regprocedure('public.users_admin_grant_guard()') IS NOT NULL" },
];
export const LOCK_FILE = "20280103000200";

const GUARD_BEGIN = "-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)";
const GUARD_END = "-- <<< F2 MİGRATION KORUMASI";
const REG_BEGIN = "-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)";
const REG_END = "-- <<< F2 ŞEMA DÜZEYİ KAYDI";

const fpValues = F2_STAGES.map((s) => `      (${s.level}, ${s.fp})`).join(",\n");

function linearGuard(level) {
  return `${GUARD_BEGIN}
DO $f2guard$
DECLARE
  v_me      constant integer := ${level};
  v_known   constant integer := ${F2_STAGES[F2_STAGES.length - 1].level};
  v_reg     integer;
  v_fp      integer := -1;
  v_missing text;
  r         record;
BEGIN
  -- 1) Kayıt (her doğrusal F2 migration'ı COMMIT'ten önce yazar).
  IF to_regprocedure('public.auth_f2_schema_level()') IS NOT NULL THEN
    EXECUTE 'SELECT public.auth_f2_schema_level()' INTO v_reg;
  END IF;
  -- 2) Katalog parmak izleri (kayıttan bağımsız ikinci kaynak).
  FOR r IN SELECT * FROM (VALUES
${fpValues}
    ) AS t(lvl, present) ORDER BY lvl LOOP
    IF r.present THEN
      v_fp := greatest(v_fp, r.lvl);
    ELSIF r.lvl < v_me THEN
      v_missing := concat_ws(',', v_missing, lpad(r.lvl::text, 6, '0'));
    END IF;
  END LOOP;
  IF coalesce(v_reg, -1) > v_me OR v_fp > v_me THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: % daha yeni bir F2 aşamasının üzerine YENİDEN UYGULANAMAZ (kayıt=%, katalog=%). Owner korumalı fonksiyonlar eski gövdeye dönerdi; hiçbir değişiklik yapılmadı.',
      lpad(v_me::text, 6, '0'), coalesce(lpad(v_reg::text, 6, '0'), 'yok'), lpad(greatest(v_fp, 0)::text, 6, '0')
      USING ERRCODE = 'YF201';
  END IF;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: SIRA HATASI — % uygulanmadan önce eksik aşama(lar): %. Hiçbir değişiklik yapılmadı.',
      lpad(v_me::text, 6, '0'), v_missing USING ERRCODE = 'YF202';
  END IF;
  IF (v_reg IS NULL AND v_fp >= 0) OR (v_reg IS NOT NULL AND v_reg <= v_known AND v_reg <> v_fp) THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: ŞEMA SAPMASI — kayıt (%) ile katalog parmak izi (%) çelişiyor; insan incelemesi gerekli. Hiçbir değişiklik yapılmadı.',
      coalesce(lpad(v_reg::text, 6, '0'), 'yok'), lpad(greatest(v_fp, 0)::text, 6, '0') USING ERRCODE = 'YF203';
  END IF;
END $f2guard$;
${GUARD_END}`;
}

function lockGuard() {
  return `${GUARD_BEGIN}
DO $f2guard$
DECLARE
  v_reg integer;
BEGIN
  -- 000200 doğrusal zincirin dışındadır (kod yayınından SONRA en son uygulanır); yalnız 000100 şarttır.
  IF to_regprocedure('public.auth_f2_schema_level()') IS NOT NULL THEN
    EXECUTE 'SELECT public.auth_f2_schema_level()' INTO v_reg;
  END IF;
  IF coalesce(v_reg, -1) < 100 OR to_regclass('public.auth_mfa_challenges') IS NULL THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: SIRA HATASI — 000200 için 000100 (MFA çekirdeği) gerekli (kayıt=%). Hiçbir değişiklik yapılmadı.',
      coalesce(lpad(v_reg::text, 6, '0'), 'yok') USING ERRCODE = 'YF202';
  END IF;
END $f2guard$;
${GUARD_END}`;
}

function registry(level) {
  return `${REG_BEGIN}
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT ${level} $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
${REG_END}`;
}

/** Dosya içeriğine blokları yerleştirir (BEGIN'in hemen ardına koruma, son COMMIT'in hemen önüne kayıt). İdempotent. */
export function render(text, kind, level) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const strip = (begin, end) => {
    const i = lines.indexOf(begin);
    if (i < 0) return;
    const j = lines.indexOf(end, i);
    if (j < 0) throw new Error(`blok sonu yok: ${end}`);
    lines.splice(i, j - i + 1);
  };
  strip(GUARD_BEGIN, GUARD_END);
  strip(REG_BEGIN, REG_END);
  const b = lines.findIndex((l) => /^BEGIN;\s*$/.test(l));
  let c = -1;
  for (let k = lines.length - 1; k >= 0; k--) if (/^COMMIT;\s*$/.test(lines[k])) { c = k; break; }
  if (b < 0 || c < 0 || c < b) throw new Error("BEGIN; / COMMIT; satırları bulunamadı");
  if (kind === "linear") lines.splice(c, 0, ...registry(level).split("\n"));
  lines.splice(b + 1, 0, ...(kind === "linear" ? linearGuard(level) : lockGuard()).split("\n"));
  return lines.join(eol);
}

export function targets() {
  const files = fs.readdirSync(MIG).filter((f) => /^20280103\d{6}_.*\.sql$/.test(f)).sort();
  const out = [];
  for (const f of files) {
    const v = f.slice(0, 14);
    if (v === LOCK_FILE) out.push({ f, kind: "lock", level: null });
    else {
      const s = F2_STAGES.find((x) => x.file === v);
      if (!s) throw new Error(`F2_STAGES listesinde olmayan F2 migration'ı: ${f}`);
      out.push({ f, kind: "linear", level: s.level });
    }
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const write = process.argv.includes("--yaz");
  let bad = 0;
  for (const t of targets()) {
    const p = path.join(MIG, t.f);
    const cur = fs.readFileSync(p, "utf8");
    const next = render(cur, t.kind, t.level);
    if (write) {
      if (next !== cur) fs.writeFileSync(p, next);
      console.log(`${next !== cur ? "yazıldı " : "güncel  "} ${t.f}`);
    } else if (next !== cur || !cur.includes(GUARD_BEGIN)) {
      bad++;
      console.log(`FAIL ${t.f}: koruma bloğu eksik veya güncel değil (--yaz ile yeniden üretin)`);
    } else console.log(`PASS ${t.f}`);
  }
  if (!write) console.log(`f2-migration-guard denetimi: ${targets().length - bad} PASS, ${bad} FAIL`);
  process.exit(bad ? 1 : 0);
}
