// PRODUCTION UYGULAMA KAPISI — tek migration dosyası; doğru proje + merkezi ayırma + PR bağlantısı + git blob SHA-256 +
// SQL yapısı + güncel production geçmişi + seri yürütme. Bu modül SQL ÇALIŞTIRMAZ: çalıştırıcı (`calistir(sql)`) dışarıdan verilir.
//
// Tek işlem (korumaliSql):
//   BEGIN → lock_timeout → pg_advisory_xact_lock(sabit)  [aynı veritabanına eşzamanlı iki uygulayıcı SIRAYA girer]
//   → kilit ALTINDA geçmiş yeniden okunur: sürüm doluysa RAISE YSM01 (hiçbir DDL çalışmaz)
//   → şema ön koşulları (`-- onkosul: <boolean SQL>` satırları; biri sağlanmazsa RAISE YSM02)
//   → migration gövdesi → supabase_migrations.schema_migrations kaydı (Supabase CLI biçimi) → COMMIT.
//   DDL ve geçmiş kaydı birlikte kalır ya da birlikte geri alınır (PostgreSQL işlemsel DDL).
// ATOMİK OLMAYAN NOKTA: veritabanı COMMIT'i ile merkezi defterdeki `uygula` olayı iki ayrı sistemdir. Defter yazımı başarısız
// olursa production uygulanmıştır, defter `pr` der → `uzlastir()` production geçmişindeki imzayı (created_by içindeki SHA-256)
// görüp `uygula` olayını tamamlar. Numara zaten ayrılmış olduğundan başka işe verilemez (yalnız durum gecikmesi).
import fs from "node:fs";
import { blobIcerik, durum, ayristir, okuUzak, olayEkle, DefterHatasi, NAME_RE, DEFAULTS } from "./defter.mjs";

export const KILIT_ANAHTARI = 7_314_202_811; // tüm uygulayıcılar AYNI anahtar
export const IMZA_RE = /migration-numara pr#(\d+) sha256:([0-9a-f]{64})/;

// ─── SQL sözcük çözümleyici: yorum / dizge / tanımlayıcı / dolar-tırnak gövdeleri ayıklanır, deyimler konumlarıyla çıkarılır ──
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
      const q = c; i++;
      while (i < n) { if (sql[i] === q) { if (sql[i + 1] === q) { i += 2; continue; } break; } if (q === "'" && sql[i] === "\\" && /[eE]$/.test(temiz.trimEnd())) { i += 2; continue; } i++; }
      if (i >= n) throw new DefterHatasi("SQL_YAPI", "Kapanmamış dizge / tanımlayıcı");
      i++; temiz += q === "'" ? "''" : '"x"'; continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m && !/[A-Za-z0-9_]$/.test(temiz)) {
        const etiket = m[0];
        const j = sql.indexOf(etiket, i + etiket.length);
        if (j < 0) throw new DefterHatasi("SQL_YAPI", `Kapanmamış dolar-tırnak ${etiket}`);
        i = j + etiket.length; temiz += " $$ "; continue;
      }
    }
    if (c === "\\" && (i === 0 || sql[i - 1] === "\n" || /^\s*$/.test(sql.slice(sql.lastIndexOf("\n", i - 1) + 1, i)))) throw new DefterHatasi("PSQL_META", "psql meta-komutu (\\…) içeriyor; kapı yalnız saf SQL kabul eder.");
    if (c === ";") { out.push({ metin: temiz.trim(), bas, son: i + 1 }); temiz = ""; bas = i + 1; i++; continue; }
    temiz += c; i++;
  }
  if (temiz.trim()) out.push({ metin: temiz.trim(), bas, son: n, noktaliVirgulsuz: true });
  return out;
}
const anahtar = (s) => s.replace(/\s+/g, " ").trim().toUpperCase();
const ISLEM_KONTROL = /^(BEGIN|START TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE TRANSACTION|COMMIT PREPARED|ROLLBACK PREPARED|SET TRANSACTION|SET SESSION CHARACTERISTICS)\b/;
const ISLEM_DISI = /^(VACUUM|CLUSTER\b.*|REINDEX .*CONCURRENTLY|CREATE (UNIQUE )?INDEX CONCURRENTLY|DROP INDEX CONCURRENTLY|ALTER SYSTEM|CREATE DATABASE|DROP DATABASE|CREATE TABLESPACE|DROP TABLESPACE|ALTER TYPE .* ADD VALUE|REFRESH MATERIALIZED VIEW CONCURRENTLY|DETACH PARTITION .*CONCURRENTLY|ALTER TABLE .* DETACH PARTITION .* CONCURRENTLY)\b/;

/** SQL yapısı: ilk deyim BEGIN, son deyim COMMIT, aradaki hiçbir deyim işlem denetimi / işlem dışı komut değil. */
export function sqlYapisi(sql) {
  if (sql.includes("\r")) throw new DefterHatasi("CR", "Migration blob'unda CR var (beklenmeyen).");
  const d = deyimler(sql).filter((x) => x.metin);
  if (d.some((x) => x.noktaliVirgulsuz)) throw new DefterHatasi("SQL_YAPI", "Noktalı virgülle bitmeyen son deyim var (COMMIT sonrası artık?).");
  if (d.length < 2 || !/^(BEGIN|START TRANSACTION)( TRANSACTION| WORK)?$/.test(anahtar(d[0].metin)) || !/^(COMMIT|END)( TRANSACTION| WORK)?$/.test(anahtar(d.at(-1).metin))) throw new DefterHatasi("SQL_YAPI", "Migration tam olarak 'BEGIN;' ile başlamalı ve 'COMMIT;' ile bitmeli (öncesinde / sonrasında deyim olamaz).");
  for (const x of d.slice(1, -1)) {
    const k = anahtar(x.metin);
    if (ISLEM_KONTROL.test(k)) throw new DefterHatasi("SQL_ISLEM", `Gövdede işlem denetim deyimi var ('${k.slice(0, 40)}'): tek-işlem garantisini bozar.`);
    if (ISLEM_DISI.test(k)) throw new DefterHatasi("ISLEM_DISI", `İşlem içinde çalışamayan komut ('${k.slice(0, 50)}'). Bu kapı tek-işlem garantisi veremez; Owner onaylı ayrı uygulama gerekir.`);
  }
  return { ic: sql.slice(d[0].son, d.at(-1).bas), deyimSayisi: d.length - 2 };
}
/** `-- onkosul: <boolean SQL>` satırları (yalnız dosya başındaki yorum bloğunda). */
export function onkosullar(sql) {
  const ust = sql.split("\n");
  const out = [];
  for (const l of ust) {
    if (!l.startsWith("--") && l.trim()) break;
    const m = /^--\s*onkosul:\s*(.+)$/.exec(l);
    if (m) {
      const ifade = m[1].trim();
      if (/;|\$\$|--|\/\*/.test(ifade)) throw new DefterHatasi("ONKOSUL", `Ön koşul tek bir boolean ifade olmalı: ${ifade}`);
      out.push(ifade);
    }
  }
  return out;
}

export function prodSatirlari(dosyaVeyaMetin) {
  const t = fs.existsSync(dosyaVeyaMetin) ? fs.readFileSync(dosyaVeyaMetin, "utf8") : dosyaVeyaMetin;
  return t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [v, ad = "", olusturan = ""] = l.split("|");
    return { surum: v.trim(), ad: ad.trim(), olusturan: olusturan.trim() };
  }).filter((x) => /^\d{14}$/.test(x.surum));
}

/**
 * Uygulama öncesi kapılar. `prodGecmis` = GÜNCEL production geçmişi (çalıştırıcıdan salt-okunur okunmuş; okunmadan uygulama YOK).
 * `rev` = PR'a bağlanan commit (blob bu commit'ten okunur).
 */
export function hazirla({ root, surum, defterText, beklenenProje, gercekProje, prodGecmis, rev = "HEAD" }) {
  if (!beklenenProje || gercekProje !== beklenenProje) throw new DefterHatasi("PROJE", `Hedef proje doğrulanamadı (beklenen ${beklenenProje}, bağlanılan ${gercekProje}). Uygulama yapılmadı.`);
  if (!Array.isArray(prodGecmis) || !prodGecmis.length) throw new DefterHatasi("PROD_OKUNMADI", "Güncel production migration geçmişi okunmadan uygulama yapılamaz.");
  const st = durum(ayristir(defterText));
  const s = st.get(surum);
  if (!s || s.gecmis) throw new DefterHatasi("AYIRMA", `${surum} merkezi defterde ayrılmamış.`);
  if (s.durum === "iptal") throw new DefterHatasi("IPTAL", `${surum} iptal edilmiş.`);
  if (s.durum === "uygulandi") throw new DefterHatasi("UYGULANMIS", `${surum} defterde zaten uygulandı olarak kayıtlı.`);
  if (s.durum !== "pr" || !s.sha256 || !s.pr) throw new DefterHatasi("BAGLANMAMIS", `${surum} PR'a bağlanmamış (PR / içerik SHA-256 yok): önce 'bagla'.`);
  // Production geçmişi ↔ defter: defterin bilmediği bir sürüm production'da varsa, birisi kapı DIŞINDAN uygulamıştır → DUR.
  const bilinmeyen = prodGecmis.filter((x) => !st.has(x.surum));
  if (bilinmeyen.length) throw new DefterHatasi("UZLASMA", `Production'da merkezi defterin bilmediği sürüm(ler) var (${bilinmeyen.slice(0, 5).map((x) => `${x.surum}|${x.ad}`).join(", ")}): kapı dışı uygulama. Önce uzlaştırın.`);
  if (prodGecmis.some((x) => x.surum === surum)) throw new DefterHatasi("PROD_DOLU", `${surum} production geçmişinde zaten var.`);
  const m = NAME_RE.exec(s.dosya ?? "");
  if (!m) throw new DefterHatasi("AD", `Ayırmadaki dosya adı geçersiz: ${s.dosya}`);
  const blob = blobIcerik(root, rev, s.dosya);
  if (!blob) throw new DefterHatasi("DOSYA_YOK", `${s.dosya} ${rev} içinde yok.`);
  if (blob.sha256 !== s.sha256) throw new DefterHatasi("ICERIK", `${s.dosya} içeriği PR'a bağlanan sürümden farklı (${blob.sha256.slice(0, 12)} ≠ ${s.sha256.slice(0, 12)}).`);
  const sql = blob.buf.toString("utf8");
  const yapi = sqlYapisi(sql);
  return { surum, ad: m[2], dosya: s.dosya, pr: s.pr, sha256: blob.sha256, ic: yapi.ic, onkosul: onkosullar(sql) };
}

export function korumaliSql(p) {
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const imza = `migration-numara pr#${p.pr} sha256:${p.sha256}`;
  const onk = p.onkosul.map((e, i) => `DO $onkosul${i}$ BEGIN IF NOT (${e}) THEN RAISE EXCEPTION 'ONKOSUL_SAGLANMADI: %', ${lit(e)} USING ERRCODE = 'YSM02'; END IF; END $onkosul${i}$;`).join("\n");
  return `BEGIN;
SET LOCAL lock_timeout = '15s';
SELECT pg_advisory_xact_lock(${KILIT_ANAHTARI});
DO $kapi$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = ${lit(p.surum)}) THEN
    RAISE EXCEPTION 'MIGRATION_SURUM_DOLU: % production geçmişinde zaten var; uygulama yapılmadı', ${lit(p.surum)} USING ERRCODE = 'YSM01';
  END IF;
END $kapi$;
${onk}
${p.ic}
INSERT INTO supabase_migrations.schema_migrations(version, name, statements, created_by) VALUES (${lit(p.surum)}, ${lit(p.ad)}, ARRAY[]::text[], ${lit(imza)});
COMMIT;
`;
}

/** Uygula: hazırla → korumalı SQL'i çalıştır → deftere 'uygula'. calistir() hata fırlatırsa defter YAZILMAZ. */
export async function uygula({ root, surum, cfg = DEFAULTS, beklenenProje, gercekProje, prodGecmis, calistir, rev = "HEAD", defterText = null, capa = null }) {
  const text = defterText ?? okuUzak(root, cfg).text;
  const p = hazirla({ root, surum, defterText: text, beklenenProje, gercekProje, prodGecmis, rev });
  await calistir(korumaliSql(p));
  return { ...p, defter: olayEkle(root, { olay: "uygula", surum, sha256: p.sha256, proje: beklenenProje, cfg, capa }) };
}

/**
 * Uzlaştırma (yeniden başlatma sonrası): production geçmişi ↔ defter.
 *  – defterde 'pr' olup production'da KAPI İMZASIYLA (aynı SHA) bulunan → 'uygula' olayı tamamlanır;
 *  – production'da olup defterde hiç olmayan / imzası uyuşmayan → RAPOR (otomatik düzeltme YOK; Owner kararı).
 */
export function uzlastir({ root, cfg = DEFAULTS, prodGecmis, beklenenProje, capa = null }) {
  const st = durum(ayristir(okuUzak(root, cfg).text));
  const tamamlanan = [], sorun = [];
  for (const x of prodGecmis) {
    const s = st.get(x.surum);
    if (!s) { sorun.push(`${x.surum}|${x.ad}: defterde yok (kapı dışı uygulama)`); continue; }
    if (s.gecmis || s.durum === "uygulandi") continue;
    const imza = IMZA_RE.exec(x.olusturan ?? "");
    if (s.durum === "pr" && imza && imza[2] === s.sha256 && Number(imza[1]) === s.pr) {
      olayEkle(root, { olay: "uygula", surum: x.surum, sha256: s.sha256, proje: beklenenProje, uzlastirma: true, cfg, capa });
      tamamlanan.push(x.surum);
    } else sorun.push(`${x.surum}|${x.ad}: production'da var ama defter durumu '${s.durum}' / imza uyuşmuyor`);
  }
  return { tamamlanan, sorun };
}
