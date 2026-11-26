// PRODUCTION UYGULAMA KAPISI — tek migration dosyası, merkezi ayırma + güncel geçmiş + içerik bütünlüğü + seri yürütme.
//
// Bu modül SQL ÇALIŞTIRMAZ: `calistir(sql)` (ör. owner'ın conn.mjs psql'i ya da test için pg istemcisi) dışarıdan verilir.
// Akış:
//   1) hazirla(): proje kimliği, merkezi defterde ayırma (etkin, dosya adı birebir, PR'a bağlanmış SHA-256 = commit blob'u),
//      SQL biçimi (tek BEGIN…COMMIT; işlem içinde çalışamayan komut YOK).
//   2) korumaliSql(): TEK İŞLEM —
//        pg_advisory_xact_lock(sabit) → aynı veritabanında eşzamanlı iki uygulama SIRAYA girer (ikincisi birincinin COMMIT'ini bekler);
//        kilit ALTINDA geçmiş yeniden okunur: sürüm doluysa RAISE (YSM01) → hiçbir DDL çalışmaz;
//        migration gövdesi + supabase_migrations.schema_migrations kaydı AYNI işlemde → DDL ve geçmiş birlikte kalır ya da birlikte
//        geri alınır (PostgreSQL işlemsel DDL).
//   3) Merkezi deftere `uygula` olayı COMMIT'ten SONRA yazılır. Bu iki sistem (veritabanı ↔ git) arasında ATOMİK DEĞİLDİR:
//      defter yazımı başarısız olursa production uygulanmıştır ama defter "pr" der → `uygulaDefter()` yeniden çalıştırılır;
//      güvenlik açısından zararsızdır (numara zaten ayrılmış; başka işe verilemez).
import { blobIcerik, durum, ayristir, okuUzak, olayEkle, DefterHatasi, NAME_RE, DEFAULTS } from "./defter.mjs";

export const KILIT_ANAHTARI = 7_314_202_811; // yasam-migration-uygulama (bigint; tüm uygulayıcılar AYNI anahtarı kullanır)
export const ISLEM_DISI = /\b(CREATE|DROP|REINDEX)\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY\b|\bVACUUM\b|\bALTER\s+SYSTEM\b|\bCREATE\s+DATABASE\b|\bALTER\s+TYPE\b[^;]*\bADD\s+VALUE\b/i;

export function hazirla({ root, surum, defterText, beklenenProje, gercekProje, rev = "HEAD" }) {
  if (!beklenenProje || gercekProje !== beklenenProje) throw new DefterHatasi("PROJE", `Hedef proje doğrulanamadı (beklenen ${beklenenProje}, bağlanılan ${gercekProje}). Uygulama yapılmadı.`);
  const st = durum(ayristir(defterText)).get(surum);
  if (!st || st.gecmis) throw new DefterHatasi("AYIRMA", `${surum} merkezi defterde ayrılmamış.`);
  if (st.durum === "iptal") throw new DefterHatasi("IPTAL", `${surum} iptal edilmiş.`);
  if (st.durum === "uygulandi") throw new DefterHatasi("UYGULANMIS", `${surum} defterde zaten uygulandı olarak kayıtlı.`);
  if (!st.sha256) throw new DefterHatasi("BAGLANMAMIS", `${surum} PR'a bağlanmamış (içerik SHA-256 yok): önce 'bagla'.`);
  const m = NAME_RE.exec(st.dosya ?? "");
  if (!m) throw new DefterHatasi("AD", `Ayırmadaki dosya adı geçersiz: ${st.dosya}`);
  const blob = blobIcerik(root, rev, st.dosya);
  if (!blob) throw new DefterHatasi("DOSYA_YOK", `${st.dosya} ${rev} içinde yok.`);
  if (blob.sha256 !== st.sha256) throw new DefterHatasi("ICERIK", `${st.dosya} içeriği PR'a bağlanan sürümden farklı (${blob.sha256.slice(0, 12)} ≠ ${st.sha256.slice(0, 12)}).`);
  const sql = blob.buf.toString("utf8");
  if (sql.includes("\r")) throw new DefterHatasi("CR", "Migration blob'unda CR var (beklenmeyen).");
  const govde = sql.replace(/^--.*$/gm, "");
  if (ISLEM_DISI.test(govde)) throw new DefterHatasi("ISLEM_DISI", "Migration işlem içinde çalışamayan komut içeriyor (CONCURRENTLY / VACUUM / ALTER TYPE … ADD VALUE …). Bu kapı tek-işlem garantisi veremez; ayrı ve elle planlanmış uygulama gerekir.");
  const b = [...sql.matchAll(/^BEGIN;[ \t]*$/gm)], c = [...sql.matchAll(/^COMMIT;[ \t]*$/gm)];
  if (b.length !== 1 || c.length !== 1 || b[0].index > c[0].index) throw new DefterHatasi("YAPI", "Migration tam olarak bir 'BEGIN;' … 'COMMIT;' bloğu içermeli.");
  return { surum, ad: m[2], dosya: st.dosya, sha256: blob.sha256, ic: sql.slice(b[0].index + "BEGIN;".length, c[0].index), on: sql.slice(0, b[0].index), son: sql.slice(c[0].index + "COMMIT;".length) };
}

export function korumaliSql(p, { createdBy }) {
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
  if (p.son.replace(/^--.*$/gm, "").trim()) throw new DefterHatasi("YAPI", "COMMIT sonrasında komut var.");
  if (p.on.replace(/^--.*$/gm, "").trim()) throw new DefterHatasi("YAPI", "BEGIN öncesinde komut var.");
  return `BEGIN;
SET LOCAL lock_timeout = '15s';
SELECT pg_advisory_xact_lock(${KILIT_ANAHTARI});
DO $kapi$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = ${lit(p.surum)}) THEN
    RAISE EXCEPTION 'MIGRATION_SURUM_DOLU: % production geçmişinde zaten var; uygulama yapılmadı', ${lit(p.surum)} USING ERRCODE = 'YSM01';
  END IF;
END $kapi$;
${p.ic}
INSERT INTO supabase_migrations.schema_migrations(version, name, statements, created_by) VALUES (${lit(p.surum)}, ${lit(p.ad)}, ARRAY[]::text[], ${lit(createdBy)});
COMMIT;
`;
}

/** Uygula: hazırla → korumalı SQL'i çalıştır → deftere 'uygula'. calistir(sql) hata fırlatırsa defter YAZILMAZ. */
export async function uygula({ root, surum, cfg = DEFAULTS, beklenenProje, gercekProje, calistir, createdBy, defterText = null, rev = "HEAD" }) {
  const text = defterText ?? okuUzak(root, cfg).text;
  const p = hazirla({ root, surum, defterText: text, beklenenProje, gercekProje, rev });
  await calistir(korumaliSql(p, { createdBy }));
  return { ...p, defter: uygulaDefter({ root, surum, sha256: p.sha256, cfg }) };
}

export function uygulaDefter({ root, surum, sha256, cfg = DEFAULTS }) {
  return olayEkle(root, { olay: "uygula", surum, sha256, cfg });
}
