// PRODUCTION UYGULAMA KAPISI — tek migration dosyası; doğru proje + DOĞRULANMIŞ merkezi defter + PR bağlantısı + main'deki
// git blob SHA-256 + SQL yapısı + güncel production geçmişi + seri yürütme. Bu modül SQL ÇALIŞTIRMAZ: çalıştırıcı dışarıdan verilir.
//
// Tek işlem (korumaliSql):
//   BEGIN → standard_conforming_strings=on + lock_timeout → pg_advisory_xact_lock(sabit)  [eşzamanlı uygulayıcılar SIRAYA girer]
//   → kilit ALTINDA geçmiş yeniden okunur: sürüm doluysa RAISE YSM01 (hiçbir DDL çalışmaz)
//   → şema ön koşulları (`-- onkosul:` beyaz listeli ifadeler; sağlanmazsa RAISE YSM02)
//   → migration gövdesi → supabase_migrations.schema_migrations kaydı (Supabase CLI biçimi; statements = dosyanın tam metni,
//     created_by = "migration-numara pr#N sha256:<blob sha>") → COMMIT.
// ATOMİK OLMAYAN NOKTA: DB COMMIT'i ile defterdeki `uygula` olayı iki ayrı sistemdir → `uzlastir()` production kaydındaki
// imzayı VE kayıtlı metnin SHA-256'sını defterle karşılaştırıp `uygula`yı tamamlar.
// SINIR: gövde içinden dblink / pg_background gibi eklentilerle işlem dışı iş yapılabilir; kapı bunu SQL düzeyinde engelleyemez
// (bu eklentiler production'da kurulu değilse risk yok; kurulumları ayrı Owner kararıdır).
import fs from "node:fs";
import { blobIcerik, durum, ayristir, dogrulanmisOku, git, olayEkle, DefterHatasi, NAME_RE, DEFAULTS } from "./defter.mjs";

export const KILIT_ANAHTARI = 7_314_202_811; // tüm uygulayıcılar AYNI anahtar
export const IMZA_RE = /^migration-numara pr#(\d+) sha256:([0-9a-f]{64})$/;

// ─── SQL sözcük çözümleyici ────────────────────────────────────────────────────────────────────────────────────────────
// PostgreSQL kuralları (standard_conforming_strings = on, kapı bunu işlem içinde ZORLAR):
//   '…' içinde ters eğik çizgi kaçış DEĞİLDİR; yalnız hemen bitişik E'…' / e'…' (öncesi tanımlayıcı karakteri değilse) kaçış kullanır.
//   $etiket$ yalnız öncesi tanımlayıcı karakteri DEĞİLSE başlar (tanımlayıcılar harf/rakam/_/$ ve 0x80 üstü karakter içerebilir).
//   Dizge / yorum / dolar-tırnak DIŞINDA ters eğik çizgi geçerli SQL değildir → psql meta-komutu sayılır ve REDDEDİLİR.
const TANIMLAYICI = /[A-Za-z0-9_$\u0080-￿]/;
export function deyimler(sql) {
  const out = [];
  let i = 0, bas = 0, temiz = "";
  const n = sql.length;
  while (i < n) {
    const c = sql[i], d = sql[i + 1];
    if (c === "-" && d === "-") { const j = sql.indexOf("\n", i); i = j < 0 ? n : j; continue; }
    if (c === "/" && d === "*") {
      let derinlik = 1; i += 2;
      while (i < n && derinlik) { if (sql[i] === "/" && sql[i + 1] === "*") { derinlik++; i += 2; } else if (sql[i] === "*" && sql[i + 1] === "/") { derinlik--; i += 2; } else i++; }
      if (derinlik) throw new DefterHatasi("SQL_YAPI", "Kapanmamış blok yorumu");
      temiz += " "; continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      const kacisli = q === "'" && /[eE]/.test(sql[i - 1] ?? "") && !TANIMLAYICI.test(sql[i - 2] ?? " ");
      i++;
      while (i < n) {
        if (kacisli && sql[i] === "\\") { i += 2; continue; }
        if (sql[i] === q) { if (sql[i + 1] === q) { i += 2; continue; } break; }
        i++;
      }
      if (i >= n) throw new DefterHatasi("SQL_YAPI", "Kapanmamış dizge / tanımlayıcı");
      i++; temiz += q === "'" ? "''" : '"x"'; continue;
    }
    if (c === "$" && !TANIMLAYICI.test(sql[i - 1] ?? " ")) {
      const m = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(sql.slice(i));
      if (m) {
        const j = sql.indexOf(m[0], i + m[0].length);
        if (j < 0) throw new DefterHatasi("SQL_YAPI", `Kapanmamış dolar-tırnak ${m[0]}`);
        i = j + m[0].length; temiz += " $$ "; continue;
      }
    }
    if (c === "\\") throw new DefterHatasi("PSQL_META", "Dizge dışında ters eğik çizgi (psql meta-komutu: \\gexec, \\!, \\i …); kapı yalnız saf SQL kabul eder.");
    if (c === ";") { out.push({ metin: temiz.trim(), bas, son: i + 1 }); temiz = ""; bas = i + 1; i++; continue; }
    temiz += c; i++;
  }
  if (temiz.trim()) out.push({ metin: temiz.trim(), bas, son: n, noktaliVirgulsuz: true });
  return out;
}
const anahtar = (s) => s.replace(/\s+/g, " ").trim().toUpperCase();
const ISLEM_KONTROL = /^(BEGIN|START TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE TRANSACTION|COMMIT PREPARED|ROLLBACK PREPARED|SET TRANSACTION|SET SESSION CHARACTERISTICS|SET (SESSION |LOCAL )?STANDARD_CONFORMING_STRINGS)\b/;
const ISLEM_DISI = /^(VACUUM|CLUSTER\b.*|REINDEX .*CONCURRENTLY|CREATE (UNIQUE )?INDEX CONCURRENTLY|DROP INDEX CONCURRENTLY|ALTER SYSTEM|CREATE DATABASE|DROP DATABASE|CREATE TABLESPACE|DROP TABLESPACE|ALTER TYPE .* ADD VALUE|REFRESH MATERIALIZED VIEW CONCURRENTLY|ALTER TABLE .* DETACH PARTITION .* CONCURRENTLY)\b/;

/** SQL yapısı: ilk deyim BEGIN, son deyim COMMIT, aradaki hiçbir deyim işlem denetimi / işlem dışı komut değil. */
export function sqlYapisi(sql) {
  if (sql.includes("\r")) throw new DefterHatasi("CR", "Migration blob'unda CR var (beklenmeyen).");
  const d = deyimler(sql).filter((x) => x.metin);
  if (d.some((x) => x.noktaliVirgulsuz)) throw new DefterHatasi("SQL_YAPI", "Noktalı virgülle bitmeyen son deyim var (COMMIT sonrası artık?).");
  if (d.length < 2 || !/^(BEGIN|START TRANSACTION)( TRANSACTION| WORK)?$/.test(anahtar(d[0].metin)) || !/^COMMIT( TRANSACTION| WORK)?$/.test(anahtar(d.at(-1).metin))) throw new DefterHatasi("SQL_YAPI", "Migration tam olarak 'BEGIN;' ile başlamalı ve 'COMMIT;' ile bitmeli (öncesinde / sonrasında deyim olamaz).");
  for (const x of d.slice(1, -1)) {
    const k = anahtar(x.metin);
    if (ISLEM_KONTROL.test(k)) throw new DefterHatasi("SQL_ISLEM", `Gövdede işlem denetim deyimi var ('${k.slice(0, 40)}'): tek-işlem garantisini bozar. (BEGIN ATOMIC gövdeleri yerine $$ gövdesi kullanın.)`);
    if (ISLEM_DISI.test(k)) throw new DefterHatasi("ISLEM_DISI", `İşlem içinde çalışamayan komut ('${k.slice(0, 50)}'). Bu kapı tek-işlem garantisi veremez; Owner onaylı ayrı uygulama gerekir.`);
  }
  return { ic: sql.slice(d[0].son, d.at(-1).bas), deyimSayisi: d.length - 2 };
}
/** `-- onkosul:` satırları (dosya başındaki yorum bloğu). Yalnız BEYAZ LİSTE: to_reg*('ad') IS [NOT] NULL, AND / OR / NOT ile. */
const ONKOSUL_ATOM = /^(NOT\s+)?to_reg(class|type|procedure|proc|namespace|role)\('[A-Za-z0-9_."(), ]{1,200}'\)\s+IS\s+(NOT\s+)?NULL$/i;
export function onkosullar(sql) {
  const out = [];
  for (const l of sql.split("\n")) {
    if (!l.startsWith("--") && l.trim()) break;
    const m = /^--\s*onkosul:\s*(.+)$/.exec(l);
    if (!m) continue;
    const ifade = m[1].trim();
    const atomlar = ifade.split(/\s+(?:AND|OR)\s+/i);
    if (!atomlar.every((a) => ONKOSUL_ATOM.test(a.trim()))) throw new DefterHatasi("ONKOSUL", `Ön koşul yalnız "to_regclass('şema.ad') IS [NOT] NULL" biçiminde (AND / OR ile) olabilir: ${ifade}`);
    out.push(ifade);
  }
  return out;
}

/** Production geçmiş satırları: version|name|created_by|sha256(statements[1]). */
export function prodSatirlari(dosyaVeyaMetin) {
  const t = fs.existsSync(dosyaVeyaMetin) ? fs.readFileSync(dosyaVeyaMetin, "utf8") : dosyaVeyaMetin;
  return t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [v, ad = "", olusturan = "", icerikSha = ""] = l.split("|");
    return { surum: v.trim(), ad: ad.trim(), olusturan: olusturan.trim(), icerikSha: icerikSha.trim() };
  }).filter((x) => /^\d{14}$/.test(x.surum));
}
export const GECMIS_SQL = "SELECT version||'|'||coalesce(name,'')||'|'||coalesce(created_by,'')||'|'||coalesce(encode(sha256(convert_to(statements[1],'UTF8')),'hex'),'') AS s FROM supabase_migrations.schema_migrations ORDER BY version";

/**
 * Uygulama öncesi kapılar. `defterText` = DOĞRULANMIŞ defter metni (dogrulanmisOku). `prodGecmis` = GÜNCEL production geçmişi.
 * `rev` = uygulanacak commit; `anaRef`'ten (varsayılan origin/main) erişilebilir OLMALI (yalnız incelenip merge edilmiş SQL).
 */
export function hazirla({ root, surum, defterText, beklenenProje, gercekProje, prodGecmis, rev = "origin/main", anaRef = "origin/main" }) {
  if (!beklenenProje || gercekProje !== beklenenProje) throw new DefterHatasi("PROJE", `Hedef proje doğrulanamadı (beklenen ${beklenenProje}, bağlanılan ${gercekProje}). Uygulama yapılmadı.`);
  if (!Array.isArray(prodGecmis) || !prodGecmis.length) throw new DefterHatasi("PROD_OKUNMADI", "Güncel production migration geçmişi okunmadan uygulama yapılamaz.");
  if (!git(root, ["merge-base", "--is-ancestor", rev, anaRef], { allowFail: true }).ok) throw new DefterHatasi("MAIN_DEGIL", `${rev} ${anaRef} içinde değil: yalnız incelenip ana dala merge edilmiş SQL uygulanır.`);
  const st = durum(ayristir(defterText));
  const s = st.get(surum);
  if (!s || s.gecmis) throw new DefterHatasi("AYIRMA", `${surum} merkezi defterde ayrılmamış.`);
  if (s.durum === "iptal") throw new DefterHatasi("IPTAL", `${surum} iptal edilmiş.`);
  if (s.durum === "uygulandi") throw new DefterHatasi("UYGULANMIS", `${surum} defterde zaten uygulandı olarak kayıtlı.`);
  if (s.durum !== "pr" || !s.sha256 || !s.pr) throw new DefterHatasi("BAGLANMAMIS", `${surum} PR'a bağlanmamış (PR / içerik SHA-256 yok): önce 'bagla'.`);
  if (prodGecmis.some((x) => x.surum === surum)) throw new DefterHatasi("PROD_DOLU", `${surum} production geçmişinde zaten var (defter güncel değilse: uzlastir).`);
  // Production ↔ defter: production'daki her sürüm defterde 'gecmis' ya da 'uygulandi' olmalı. Defterin bilmediği ya da
  // 'ayrildi' / 'pr' / 'iptal' durumundaki bir sürüm production'daysa kapı DIŞINDAN uygulanmış (ya da uzlaştırma bekliyor) → DUR.
  const uyumsuz = prodGecmis.filter((x) => !st.has(x.surum) || !(st.get(x.surum).gecmis || st.get(x.surum).durum === "uygulandi"));
  if (uyumsuz.length) throw new DefterHatasi("UZLASMA", `Production'da defterle uyuşmayan sürüm(ler) var (${uyumsuz.slice(0, 5).map((x) => `${x.surum}|${x.ad}|${st.get(x.surum)?.durum ?? "defterde yok"}`).join(", ")}): önce 'uzlastir' + Owner incelemesi.`);
  const m = NAME_RE.exec(s.dosya ?? "");
  if (!m) throw new DefterHatasi("AD", `Ayırmadaki dosya adı geçersiz: ${s.dosya}`);
  const blob = blobIcerik(root, rev, s.dosya);
  if (!blob) throw new DefterHatasi("DOSYA_YOK", `${s.dosya} ${rev} içinde yok (ya da normal dosya değil).`);
  if (blob.sha256 !== s.sha256) throw new DefterHatasi("ICERIK", `${s.dosya} içeriği PR'a bağlanan sürümden farklı (${blob.sha256.slice(0, 12)} ≠ ${s.sha256.slice(0, 12)}).`);
  const sql = blob.buf.toString("utf8");
  const yapi = sqlYapisi(sql);
  return { surum, ad: m[2], dosya: s.dosya, pr: s.pr, sha256: blob.sha256, sql, ic: yapi.ic, onkosul: onkosullar(sql) };
}

export function korumaliSql(p) {
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const imza = `migration-numara pr#${p.pr} sha256:${p.sha256}`;
  const onk = p.onkosul.map((e, i) => `DO $onkosul${i}$ BEGIN IF NOT (${e}) THEN RAISE EXCEPTION 'ONKOSUL_SAGLANMADI: %', ${lit(e)} USING ERRCODE = 'YSM02'; END IF; END $onkosul${i}$;`).join("\n");
  return `BEGIN;
SET LOCAL standard_conforming_strings = on;
SET LOCAL lock_timeout = '15s';
SELECT pg_advisory_xact_lock(${KILIT_ANAHTARI});
DO $kapi$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = ${lit(p.surum)}) THEN
    RAISE EXCEPTION 'MIGRATION_SURUM_DOLU: % production geçmişinde zaten var; uygulama yapılmadı', ${lit(p.surum)} USING ERRCODE = 'YSM01';
  END IF;
END $kapi$;
${onk}
${p.ic}
INSERT INTO supabase_migrations.schema_migrations(version, name, statements, created_by) VALUES (${lit(p.surum)}, ${lit(p.ad)}, ARRAY[${lit(p.sql)}]::text[], ${lit(imza)});
COMMIT;
`;
}

/** Uygula: doğrulanmış defter → hazırla → korumalı SQL'i çalıştır → deftere 'uygula'. calistir() hata fırlatırsa defter YAZILMAZ. */
export async function uygula({ root, surum, cfg = DEFAULTS, beklenenProje, gercekProje, prodGecmis, calistir, rev = "origin/main", anaRef = "origin/main", defterText = null, capa = null }) {
  const text = defterText ?? dogrulanmisOku(root, cfg, { capa }).text;
  const p = hazirla({ root, surum, defterText: text, beklenenProje, gercekProje, prodGecmis, rev, anaRef });
  await calistir(korumaliSql(p));
  return { ...p, defter: olayEkle(root, { olay: "uygula", surum, sha256: p.sha256, proje: beklenenProje, cfg, capa }) };
}

/**
 * Uzlaştırma (yeniden başlatma sonrası): production geçmişi ↔ DOĞRULANMIŞ defter.
 *  – defterde 'pr' olup production'da kapı imzası (aynı PR + SHA) VE kayıtlı metnin SHA-256'sı = bağlı SHA → 'uygula' tamamlanır;
 *  – diğer her uyumsuzluk → RAPOR (otomatik düzeltme YOK; Owner kararı).
 * Not: imza ve metin DB'ye yazma yetkisi olan biri tarafından taklit edilebilir; uzlaştırma kanıt değil tutarlılık denetimidir.
 */
/**
 * SAPMA DENETİMİ (salt-okunur; hiçbir şey yazmaz): production geçmişi ↔ DOĞRULANMIŞ defter.
 *  – kapiDisi: production'da olup defterde 'gecmis' / 'uygulandi' olmayan sürüm (kapı DIŞINDAN uygulanmış: eski tek seferlik
 *    uygulayıcı, `supabase db push`, SQL editörü… ya da uzlaştırma bekleyen kapılı uygulama);
 *  – kayip: defterde 'uygulandi' olup production geçmişinde olmayan sürüm (geçmiş kaydı silinmiş / başka proje).
 * DB-03 bu yolları ENGELLEYEMEZ (tek Owner kimliği DB'ye tam erişimli); bu denetim onları GÖRÜNÜR kılar.
 */
export function sapmaDenetimi({ prodGecmis, defterText }) {
  const st = durum(ayristir(defterText));
  const prod = new Set(prodGecmis.map((x) => x.surum));
  const kapiDisi = prodGecmis.filter((x) => { const s = st.get(x.surum); return !s || !(s.gecmis || s.durum === "uygulandi"); }).map((x) => `${x.surum}|${x.ad}|${st.get(x.surum)?.durum ?? "defterde yok"}`);
  const kayip = [...st.values()].filter((s) => !s.gecmis && s.durum === "uygulandi" && !prod.has(s.surum)).map((s) => `${s.surum}|${s.dosya}`);
  return { kapiDisi, kayip, prod: prodGecmis.length, defter: st.size };
}

export function uzlastir({ root, cfg = DEFAULTS, prodGecmis, beklenenProje, capa = null }) {
  const st = durum(ayristir(dogrulanmisOku(root, cfg, { capa }).text));
  const tamamlanan = [], sorun = [];
  for (const x of prodGecmis) {
    const s = st.get(x.surum);
    if (!s) { sorun.push(`${x.surum}|${x.ad}: defterde yok (kapı dışı uygulama)`); continue; }
    if (s.gecmis || s.durum === "uygulandi") continue;
    const imza = IMZA_RE.exec(x.olusturan ?? "");
    if (s.durum === "pr" && imza && imza[2] === s.sha256 && Number(imza[1]) === s.pr && x.icerikSha === s.sha256) {
      olayEkle(root, { olay: "uygula", surum: x.surum, sha256: s.sha256, proje: beklenenProje, uzlastirma: true, cfg, capa });
      tamamlanan.push(x.surum);
    } else sorun.push(`${x.surum}|${x.ad}: production'da var ama defter durumu '${s.durum}' / imza ya da kayıtlı içerik uyuşmuyor`);
  }
  return { tamamlanan, sorun };
}
