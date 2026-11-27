#!/usr/bin/env node
// TEK GÜVENLİ UYGULAMA YOLU — bir migration'ı production'a (ya da izole test veritabanına) kapıdan geçirerek uygular.
//
//   node scripts/migrations/numara/uygula-prod.mjs --surum S --proje <supabase-ref> (--conn-mjs <yol> | --dsn <postgres-url>) [--rev origin/main] [--uygula]
//   node scripts/migrations/numara/uygula-prod.mjs uzlastir --proje <ref> (--conn-mjs <yol> | --dsn <url>)
//   node scripts/migrations/numara/uygula-prod.mjs denetle  --proje <ref> (--conn-mjs <yol> | --dsn <url>)   [SALT-OKUNUR sapma raporu]
//
// SQL yalnız ana daldan (varsayılan origin/main; --rev o dala ait olmalı) ve DOĞRULANMIŞ defterle uygulanır.
// Varsayılan KURU ÇALIŞTIRMA: tüm kapılar denetlenir, uygulanacak korumalı SQL'in özeti yazılır, HİÇBİR şey çalıştırılmaz.
// `--uygula` verilmedikçe veritabanına yazılmaz. Toplu `supabase db push` YOK; her çağrı TEK sürüm.
// Bağlantı:
//   --conn-mjs  production yardımcısı (owner arşivi conn.mjs: target() + psql(); parola yazdırılmaz). Proje kimliği oradan okunur.
//   --dsn       yalnız yerel / izole test (host localhost / 127.0.0.1 değilse RED).
import { depoKoku, DefterHatasi, dogrulanmisOku, git, yapilandirma } from "./defter.mjs";
import { GECMIS_SQL, hazirla, korumaliSql, prodSatirlari, sapmaDenetimi, uygula, uzlastir } from "./prod-kapi.mjs";

const argv = process.argv.slice(2);
const altKomut = ["uzlastir", "denetle"].includes(argv[0]) ? argv[0] : "uygula";
const opt = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const root = depoKoku();
const cfg = yapilandirma(root);

async function baglanti() {
  if (opt("conn-mjs")) {
    const { target, psql } = await import(new URL(`file:///${opt("conn-mjs").replace(/\\/g, "/")}`).href);
    const t = target();
    return {
      proje: t.ref,
      gecmis: () => {
        const r = psql(t, GECMIS_SQL + ";", { ro: true });
        if (r.code !== 0) throw new DefterHatasi("PROD_OKUNMADI", `Production geçmişi okunamadı: ${r.err.slice(0, 200)}`);
        return prodSatirlari(r.out);
      },
      calistir: async (sql) => {
        const r = psql(t, sql, { timeoutMs: 400000 });
        if (r.code !== 0) throw new DefterHatasi("UYGULAMA_BELIRSIZ", `psql hatası / zaman aşımı: işlem geri alınmış OLABİLİR ya da COMMIT olmuş olabilir. Yeniden deneme YOK; önce 'uzlastir' ile production geçmişini kontrol edin. ${r.err.slice(0, 600)}`);
      },
      kapat: async () => {},
    };
  }
  if (opt("dsn")) {
    const url = new URL(opt("dsn"));
    if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new DefterHatasi("DSN", "--dsn yalnız yerel / izole test veritabanı için kullanılabilir (production: --conn-mjs).");
    const pg = (await import("pg")).default;
    const c = new pg.Client({ connectionString: opt("dsn") });
    await c.connect();
    return {
      proje: opt("test-proje-kimligi") ?? "yerel-test",
      gecmis: async () => prodSatirlari((await c.query(GECMIS_SQL)).rows.map((r) => r.s).join("\n")),
      calistir: async (sql) => {
        try {
          await c.query(sql);
        } catch (e) {
          await c.query("ROLLBACK").catch(() => {});
          throw Object.assign(new DefterHatasi("UYGULAMA", `Uygulama hatası (işlem geri alındı): ${e.message}`), { pgKod: e.code });
        }
      },
      kapat: () => c.end(),
    };
  }
  throw new DefterHatasi("GIRDI", "--conn-mjs <yol> (production) ya da --dsn <url> (izole test) gerekli.");
}

let b = null;
try {
  const beklenen = opt("proje");
  if (!beklenen) throw new DefterHatasi("GIRDI", "--proje <beklenen Supabase proje kimliği> zorunlu.");
  b = await baglanti();
  const prodGecmis = await b.gecmis(); // GÜNCEL geçmiş — her çağrıda yeniden okunur
  if (altKomut === "denetle") {
    if (b.proje !== beklenen) throw new DefterHatasi("PROJE", `Bağlanılan proje ${b.proje}, beklenen ${beklenen}.`);
    const r = sapmaDenetimi({ prodGecmis, defterText: dogrulanmisOku(root, cfg, { capa: cfg.capa }).text });
    console.log(`SAPMA DENETİMİ (salt-okunur): production ${r.prod} sürüm, defter ${r.defter} sürüm; kapı dışı ${r.kapiDisi.length}, kayıp ${r.kayip.length}`);
    for (const x of r.kapiDisi) console.log(`  KAPI DIŞI ${x}`);
    for (const x of r.kayip) console.log(`  KAYIP ${x}`);
    process.exitCode = r.kapiDisi.length || r.kayip.length ? 3 : 0;
  } else if (altKomut === "uzlastir") {
    if (b.proje !== beklenen) throw new DefterHatasi("PROJE", `Bağlanılan proje ${b.proje}, beklenen ${beklenen}.`);
    const r = uzlastir({ root, cfg, prodGecmis, beklenenProje: beklenen, capa: cfg.capa });
    console.log(`UZLAŞTIRMA: tamamlanan ${r.tamamlanan.length} (${r.tamamlanan.join(", ") || "-"}); sorun ${r.sorun.length}`);
    for (const s of r.sorun) console.log(`  SORUN ${s}`);
    process.exitCode = r.sorun.length ? 3 : 0;
  } else {
    const surum = opt("surum");
    const anaRef = opt("ana-ref", "origin/main");
    const rev = opt("rev", anaRef);
    if (anaRef === "origin/main") git(root, ["fetch", "--quiet", "--no-tags", cfg.remote, "+refs/heads/main:refs/remotes/origin/main"]);
    if (!argv.includes("--uygula")) {
      const p = hazirla({ root, surum, defterText: dogrulanmisOku(root, cfg, { capa: cfg.capa }).text, beklenenProje: beklenen, gercekProje: b.proje, prodGecmis, rev, anaRef });
      const sql = korumaliSql(p);
      console.log(`KURU ÇALIŞTIRMA PASS: ${p.dosya} (PR #${p.pr}, SHA-256 ${p.sha256.slice(0, 16)}…), proje ${b.proje}, production geçmişi ${prodGecmis.length} kayıt, ön koşul ${p.onkosul.length}; korumalı SQL ${sql.length} bayt. Uygulamak için --uygula.`);
    } else {
      const r = await uygula({ root, surum, cfg, beklenenProje: beklenen, gercekProje: b.proje, prodGecmis, calistir: b.calistir, rev, anaRef, capa: cfg.capa });
      console.log(`UYGULANDI: ${r.dosya} → ${b.proje}; geçmiş kaydı aynı işlemde; defter 'uygula' yazıldı.`);
    }
  }
} catch (e) {
  if (e instanceof DefterHatasi) {
    console.error(`HATA [${e.kod}]${e.pgKod ? ` (pg ${e.pgKod})` : ""}: ${e.message}`);
    if (["AG", "CEKISME", "UYGULAMA_BELIRSIZ"].includes(e.kod)) console.error("Not: veritabanı işlemi başarılıysa defter güncellenememiş olabilir → 'uzlastir' alt komutunu çalıştırın.");
    process.exitCode = 2;
  } else throw e;
} finally {
  await b?.kapat?.();
}
