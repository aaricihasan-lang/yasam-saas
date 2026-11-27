#!/usr/bin/env node
// MERKEZİ MIGRATION NUMARASI — komut satırı. Kullanım (npm run migration:numara -- <komut> …):
//
//   yeni    --modul <ad> --ad <migration_adi>      Numarayı merkezi defterden AYIRIR, ardından dosya şablonunu oluşturur.
//                                                  Ayırma başarısızsa HİÇBİR dosya yazılmaz. Aynı (modül, ad, dal) için etkin
//                                                  ayırma varsa yeni numara verilmez, mevcut döner (yarıda kalan işi sürdürür).
//   ayir    --modul <ad> --ad <migration_adi> [--surum S]   Yalnız numara (dosya yazmaz).
//   bagla   --surum S --pr N [--devir --neden "…"] PR'a bağla: HEAD commit'indeki dosyanın git blob SHA-256'sı + PR + dal + depo.
//                                                  SQL her değiştiğinde (commit sonrası) yeniden çalıştırılır. Başka PR/dala devir
//                                                  yalnız --devir + --neden ile ve geçmişte görünür biçimde.
//   iptal   --surum S --neden "…"                  Numara iptal edilir; bir daha VERİLMEZ (uygulanmışsa iptal edilemez).
//   liste   [--hepsi]                              Etkin ayırmalar (dosyası bu kopyada olmayanlar işaretli).
//   dogrula                                        Defter dalının TÜM geçmişi: doğrusal, yalnız ekleme, geçerli durum geçişleri.
//   tohumla --prod-gecmis <dosya> [--kaynak origin/main] [--rapor <dosya>]
//                                                  İlk kurulum: main'deki tüm migration'lar + production geçmişi (version|name)
//                                                  "gecmis" olur. Uzak dalı OLUŞTURUR → yalnız Owner onaylı etkinleştirmede.
// `uygula` olayı bu komutla YAZILMAZ: yalnız production uygulama kapısı (uygula-prod.mjs) yazar.
import fs from "node:fs";
import path from "node:path";
import { ayir, ayristir, blobIcerik, DefterHatasi, depoKimligi, depoKoku, durum, ekle, aralikDogrula, git, kimlik, NAME_RE, okuUzak, olayEkle, yapilandirma } from "./defter.mjs";

const argv = process.argv.slice(2);
const komut = argv[0];
const opt = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const bayrak = (k) => argv.includes(`--${k}`);
const root = depoKoku();
const base = yapilandirma(root);
const cfg = { ...base, remote: opt("uzak", base.remote), ref: opt("dal-ref", base.ref) };
const capa = base.capa ?? null;
const dal = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).out.trim();
const log = (m) => console.error(`  · ${m}`);
export function prodSatirlari(dosya) {
  return fs.readFileSync(dosya, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [v, ad = ""] = l.split("|");
    return { surum: v.trim(), ad: ad.trim() };
  }).filter((x) => /^\d{14}$/.test(x.surum));
}
const prodListesi = () => (opt("prod-gecmis") ? prodSatirlari(opt("prod-gecmis")).map((x) => x.surum) : []);
const tazeMain = () => {
  git(root, ["fetch", "--quiet", "--no-tags", cfg.remote, "+refs/heads/main:refs/remotes/origin/main"], { allowFail: true });
  return ["origin/main", "HEAD"];
};
const sablon = (v, ad, modul) => `-- ${v}_${ad}.sql — modül: ${modul}
-- Numara merkezi defterden ayrıldı (npm run migration:numara -- yeni). Dosya adını / sürümü ELLE DEĞİŞTİRMEYİN.
-- SQL bitince commit edin ve PR'a bağlayın: npm run migration:numara -- bagla --surum ${v} --pr <PR no>
-- (SQL her değiştiğinde commit + bagla tekrarlanır). Production'a yalnız uygulama kapısıyla (uygula-prod.mjs) uygulanır.
-- İsteğe bağlı şema ön koşulu (işlem içinde, gövdeden önce denetlenir; sağlanmazsa hiçbir şey uygulanmaz):
-- onkosul: to_regclass('public.ornek_tablo') IS NOT NULL

BEGIN;

-- değişiklikler

COMMIT;
`;

try {
  switch (komut) {
    case "yeni":
    case "ayir": {
      const modul = opt("modul"), ad = opt("ad");
      const r = ayir(root, { modul, ad, dal, surum: komut === "ayir" ? opt("surum") : null, refs: tazeMain(), ek: prodListesi(), cfg, log, capa });
      const hedef = path.join(root, "supabase", "migrations", r.dosya);
      console.log(`${r.mevcut ? "MEVCUT AYIRMA" : "AYRILDI"}: ${r.surum} → ${r.dosya}${r.mevcut ? ` (durum: ${r.durum})` : ` (deneme ${r.deneme})`}`);
      if (komut === "yeni") {
        if (fs.existsSync(hedef)) console.log(`Dosya zaten var: supabase/migrations/${r.dosya} (değiştirilmedi)`);
        else {
          fs.writeFileSync(hedef, sablon(r.surum, ad, modul));
          console.log(`OLUŞTURULDU: supabase/migrations/${r.dosya}`);
        }
        console.log(`Sonraki adım: SQL'i yazın → commit → PR açın → npm run migration:numara -- bagla --surum ${r.surum} --pr <PR no>`);
      }
      break;
    }
    case "bagla": {
      const surum = opt("surum");
      const pr = Number(opt("pr"));
      if (!Number.isInteger(pr) || pr <= 0) throw new DefterHatasi("GIRDI", "--pr <PR numarası> zorunludur (CI, GitHub'ın PR numarasıyla karşılaştırır).");
      const st = durum(ayristir(okuUzak(root, cfg).text)).get(surum);
      if (!st || st.gecmis) throw new DefterHatasi("YOK", `${surum} merkezi defterde ayrılmamış.`);
      const blob = blobIcerik(root, "HEAD", st.dosya);
      if (!blob) throw new DefterHatasi("DOSYA_YOK", `${st.dosya} HEAD commit'inde yok; önce SQL'i commit edin.`);
      const depo = depoKimligi(root, cfg.remote);
      if (!depo) throw new DefterHatasi("DEPO", `Depo kimliği ${cfg.remote} adresinden çıkarılamadı.`);
      const commit = git(root, ["rev-parse", "HEAD"]).out.trim();
      olayEkle(root, { olay: "bagla", surum, pr, dal, depo, sha256: blob.sha256, commit, devir: bayrak("devir") ? true : null, neden: opt("neden"), cfg, log, capa });
      console.log(`BAĞLANDI: ${surum} ${st.dosya} → PR #${pr} (${depo} / ${dal}); içerik SHA-256 ${blob.sha256.slice(0, 16)}… (commit ${commit.slice(0, 9)})`);
      break;
    }
    case "iptal": {
      const surum = opt("surum");
      if (!opt("neden")) throw new DefterHatasi("GIRDI", "İptal için --neden zorunludur.");
      olayEkle(root, { olay: "iptal", surum, neden: opt("neden"), dal, cfg, log, capa });
      console.log(`İPTAL: ${surum} (numara bir daha verilmez)`);
      break;
    }
    case "liste": {
      const st = durum(ayristir(okuUzak(root, cfg).text));
      const satir = [...st.values()].filter((x) => bayrak("hepsi") || !x.gecmis).sort((a, b) => a.surum.localeCompare(b.surum));
      for (const x of satir) {
        const dosyaVar = x.dosya && fs.existsSync(path.join(root, "supabase", "migrations", x.dosya));
        console.log(`${x.surum}  ${x.durum.padEnd(9)} ${(x.modul ?? "-").padEnd(14)} ${x.dosya ?? (x.dosyalar ?? []).join(",")}${x.gecmis ? "" : dosyaVar ? "" : "  [dosya bu kopyada yok]"}  ${x.dal ?? ""}${x.pr ? ` #${x.pr}` : ""}`);
      }
      console.log(`${satir.length} kayıt`);
      break;
    }
    case "dogrula": {
      const { tip } = okuUzak(root, cfg);
      if (!tip) throw new DefterHatasi("YOK", "Merkezi defter dalı yok (sistem etkinleştirilmemiş).");
      git(root, ["fetch", "--quiet", "--no-tags", cfg.remote, `+${cfg.ref}:refs/migration-numara/dogrula`]);
      const r = aralikDogrula(root, null, "refs/migration-numara/dogrula", cfg);
      if (capa && !git(root, ["merge-base", "--is-ancestor", capa, "refs/migration-numara/dogrula"], { allowFail: true }).ok) throw new DefterHatasi("CAPA", `Defter çapa commit'ini (${capa.slice(0, 9)}) içermiyor.`);
      git(root, ["update-ref", "-d", "refs/migration-numara/dogrula"], { allowFail: true });
      console.log(`DEFTER GEÇERLİ: ${r.commit} commit, ${r.olay} olay; doğrusal, yalnız ekleme, geçerli geçişler${capa ? `, çapa ${capa.slice(0, 9)} içeriliyor` : ""}.`);
      break;
    }
    case "tohumla": {
      if (!opt("prod-gecmis")) throw new DefterHatasi("GIRDI", "--prod-gecmis <dosya> zorunlu (production migration geçmişi, satır başına 'version|name'; salt-okunur alınır).");
      const prod = prodSatirlari(opt("prod-gecmis"));
      const ref = opt("kaynak", "origin/main");
      const dosyalar = git(root, ["ls-tree", "--name-only", `${ref}:supabase/migrations`]).out.split("\n").map((f) => f.trim()).filter((f) => NAME_RE.test(f));
      const grup = new Map();
      for (const f of dosyalar) grup.set(NAME_RE.exec(f)[1], [...(grup.get(NAME_RE.exec(f)[1]) ?? []), f]);
      const prodAd = new Map(prod.map((x) => [x.surum, x.ad]));
      for (const x of prod) if (!grup.has(x.surum)) grup.set(x.surum, []);
      // Rapor: tarihsel çakışmalar GİZLENMEZ.
      const rapor = {
        main_dosya: dosyalar.length,
        main_surum: [...new Set(dosyalar.map((f) => NAME_RE.exec(f)[1]))].length,
        prod_surum: prod.length,
        ayni_surum_birden_cok_dosya: [...grup.entries()].filter(([, l]) => l.length > 1).map(([v, l]) => ({ surum: v, dosyalar: l })),
        prodda_var_mainde_yok: prod.filter((x) => !dosyalar.some((f) => f.startsWith(x.surum + "_"))).map((x) => `${x.surum}|${x.ad}`),
        mainde_var_prodda_yok: [...new Set(dosyalar.map((f) => NAME_RE.exec(f)[1]))].filter((v) => !prodAd.has(v)),
        ad_uyusmazligi: prod.filter((x) => grup.get(x.surum)?.length && !grup.get(x.surum).some((f) => NAME_RE.exec(f)[2] === x.ad)).map((x) => ({ surum: x.surum, prod: x.ad, main: grup.get(x.surum) })),
        en_buyuk: [...grup.keys()].sort().at(-1),
      };
      rapor.ilk_yeni_numara = (await import("./defter.mjs")).sonraki(rapor.en_buyuk);
      if (opt("rapor")) fs.writeFileSync(opt("rapor"), JSON.stringify(rapor, null, 1));
      const r = ekle(
        root,
        (olaylar) => {
          const var_ = new Set(olaylar.map((o) => o.surum));
          const yeni = [...grup.keys()].filter((v) => !var_.has(v)).sort();
          if (!yeni.length) return null;
          const z = new Date().toISOString();
          return yeni.map((v) => ({ v: 2, olay: "gecmis", surum: v, dosyalar: grup.get(v), kaynak: grup.get(v).length ? ref : "production", prod: prodAd.has(v), prodAd: prodAd.get(v) ?? null, zaman: z, kimlik: kimlik(root) }));
        },
        { cfg, log, bosIzinli: true, capa },
      );
      console.log(r.yazilmadi ? "Tohum güncel: eklenecek geçmiş sürüm yok." : `TOHUMLANDI: ${r.olaylar.length} geçmiş sürüm (${ref} ${rapor.main_dosya} dosya / ${rapor.main_surum} sürüm + production ${rapor.prod_surum}); ilk yeni numara ${rapor.ilk_yeni_numara}`);
      console.log(`  aynı sürüm birden çok dosya: ${rapor.ayni_surum_birden_cok_dosya.length} · production'da var main'de yok: ${rapor.prodda_var_mainde_yok.length} · main'de var production'da yok: ${rapor.mainde_var_prodda_yok.length} · ad uyuşmazlığı: ${rapor.ad_uyusmazligi.length}`);
      break;
    }
    default:
      console.log("Kullanım: npm run migration:numara -- <yeni|ayir|bagla|iptal|liste|dogrula|tohumla> [seçenekler]\nAyrıntı: docs/migrations/merkezi-numara.md");
      process.exit(komut ? 1 : 0);
  }
} catch (e) {
  if (e instanceof DefterHatasi) {
    console.error(`HATA [${e.kod}]: ${e.message}`);
    process.exit(2);
  }
  throw e;
}
