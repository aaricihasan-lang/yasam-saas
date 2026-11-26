#!/usr/bin/env node
// MERKEZİ MIGRATION NUMARASI — komut satırı. Kullanım (npm run migration:numara -- <komut> …):
//
//   yeni    --modul <ad> --ad <migration_adi> [--pr N] [--prod-gecmis <dosya>]
//           Merkezi numarayı AYIRIR, ardından supabase/migrations/<sürüm>_<ad>.sql şablonunu oluşturur. Ayırma başarısızsa
//           HİÇBİR dosya yazılmaz. Aynı (modül, ad, dal) için etkin ayırma varsa yeni numara verilmez, mevcut döner.
//   ayir    --modul <ad> --ad <migration_adi> [--surum S] [--pr N]   (yalnız numara; dosya yazmaz)
//   bagla   --surum S [--pr N]            dosyanın SHA-256'sı ve dal/PR bilgisi deftere işlenir (PR'a eklendi)
//   uygula  --surum S                     production'a uygulandı (prod uygulama kapısı çağırır)
//   iptal   --surum S --neden "…"         numara iptal edilir; bir daha VERİLMEZ
//   liste   [--hepsi]                     etkin ayırmalar (dosyası henüz olmayanlar işaretli)
//   dogrula                               defter dalının tüm geçmişi: yalnız ekleme + tutarlılık
//   tohumla [--prod-gecmis <dosya>]       ilk kurulum: main'deki tüm migration'ları (+ verilirse production geçmişi) "gecmis" olarak
//                                         işler. Uzak dalı OLUŞTURUR → yalnız Owner onayıyla etkinleştirmede çalıştırılır.
// Ortak: --uzak <ad> (varsayılan origin), --dal-ref <ref> (varsayılan refs/heads/migration-rezervasyon).
import fs from "node:fs";
import path from "node:path";
import { ayir, ayristir, blobIcerik, DefterHatasi, depoKoku, durum, ekle, gecmisiDogrula, git, kimlik, NAME_RE, okuUzak, olayEkle, yapilandirma } from "./defter.mjs";

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
const dal = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).out.trim();
const prodListesi = () => {
  const f = opt("prod-gecmis");
  if (!f) return [];
  return fs.readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.trim().split(/[\s|,]/)[0]).filter((v) => /^\d{14}$/.test(v));
};
const tazeMain = () => {
  // Ana dal güncel okunur (eski dal üzerinden ayırma: numara yine GÜNCEL defter + güncel main ile hesaplanır).
  git(root, ["fetch", "--quiet", "--no-tags", cfg.remote, "+refs/heads/main:refs/remotes/origin/main"], { allowFail: true });
  return ["origin/main", "HEAD"];
};
const log = (m) => console.error(`  · ${m}`);
const sablon = (v, ad, modul) => `-- ${v}_${ad}.sql — modül: ${modul}
-- Numara merkezi defterden ayrıldı (npm run migration:numara -- yeni). Dosya adını / sürümü ELLE DEĞİŞTİRMEYİN.
-- Production'a yalnız prod uygulama kapısıyla (tek dosya, geçmiş kaydı aynı işlemde) uygulanır; toplu \`supabase db push\` YOK.

BEGIN;

-- TODO: değişiklikler

COMMIT;
`;

try {
  switch (komut) {
    case "yeni":
    case "ayir": {
      const modul = opt("modul"), ad = opt("ad");
      const r = ayir(root, { modul, ad, dal, pr: opt("pr") ? Number(opt("pr")) : null, surum: komut === "ayir" ? opt("surum") : null, refs: tazeMain(), ek: prodListesi(), cfg, log });
      const hedef = path.join(root, "supabase", "migrations", r.dosya);
      console.log(`${r.mevcut ? "MEVCUT AYIRMA" : "AYRILDI"}: ${r.surum} → ${r.dosya}${r.mevcut ? "" : ` (deneme ${r.deneme})`}`);
      if (komut === "yeni") {
        if (fs.existsSync(hedef)) console.log(`Dosya zaten var: supabase/migrations/${r.dosya} (değiştirilmedi)`);
        else {
          fs.writeFileSync(hedef, sablon(r.surum, ad, modul));
          console.log(`OLUŞTURULDU: supabase/migrations/${r.dosya}`);
        }
        console.log(`Sonraki adım: SQL'i yazın, commit edin; PR açılınca: npm run migration:numara -- bagla --surum ${r.surum} --pr <no>`);
      }
      break;
    }
    case "bagla": {
      const surum = opt("surum");
      const st = durum(ayristir(okuUzak(root, cfg).text)).get(surum);
      if (!st) throw new DefterHatasi("YOK", `${surum} merkezi defterde ayrılmamış.`);
      // İçerik özeti COMMIT'teki blob'dan (CRLF/LF çalışma kopyası farkı özetleri bozmaz) → önce commit edilmiş olmalı.
      const blob = blobIcerik(root, "HEAD", st.dosya);
      if (!blob) throw new DefterHatasi("DOSYA_YOK", `${st.dosya} HEAD commit'inde yok; önce commit edin.`);
      olayEkle(root, { olay: "bagla", surum, dosya: st.dosya, dal, pr: opt("pr") ? Number(opt("pr")) : null, sha256: blob.sha256, cfg, log });
      console.log(`BAĞLANDI: ${surum} ${st.dosya} dal=${dal}${opt("pr") ? ` PR #${opt("pr")}` : ""}`);
      break;
    }
    case "uygula":
    case "iptal": {
      const surum = opt("surum");
      if (komut === "iptal" && !opt("neden")) throw new DefterHatasi("GIRDI", "İptal için --neden zorunludur.");
      olayEkle(root, { olay: komut, surum, sha256: opt("sha256"), neden: opt("neden"), dal, cfg, log });
      console.log(`${komut === "uygula" ? "UYGULANDI" : "İPTAL"}: ${surum}`);
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
      const r = gecmisiDogrula(root, "refs/migration-numara/dogrula", cfg);
      git(root, ["update-ref", "-d", "refs/migration-numara/dogrula"], { allowFail: true });
      console.log(`DEFTER GEÇERLİ: ${r.commit} commit, ${r.olay} olay; yalnız ekleme, tutarlı.`);
      break;
    }
    case "tohumla": {
      const prod = prodListesi();
      const ref = opt("kaynak", "origin/main");
      const dosyalar = git(root, ["ls-tree", "--name-only", `${ref}:supabase/migrations`]).out.split("\n").map((f) => f.trim()).filter((f) => NAME_RE.test(f));
      const grup = new Map();
      for (const f of dosyalar) {
        const v = NAME_RE.exec(f)[1];
        grup.set(v, [...(grup.get(v) ?? []), f]);
      }
      for (const v of prod) if (!grup.has(v)) grup.set(v, []);
      const r = ekle(
        root,
        (olaylar) => {
          const var_ = new Set(olaylar.map((o) => o.surum));
          const yeni = [...grup.keys()].filter((v) => !var_.has(v)).sort();
          if (!yeni.length) return null;
          const z = new Date().toISOString();
          return yeni.map((v) => ({ v: 1, olay: "gecmis", surum: v, dosyalar: grup.get(v), kaynak: grup.get(v).length ? ref : "production", prod: prod.includes(v), zaman: z, kimlik: kimlik(root) }));
        },
        { cfg, log },
      );
      console.log(r.yazilmadi ? "Tohum güncel: eklenecek geçmiş sürüm yok." : `TOHUMLANDI: ${r.olaylar.length} geçmiş sürüm (${ref}${prod.length ? ` + production ${prod.length}` : ""}).`);
      break;
    }
    default:
      console.log("Kullanım: npm run migration:numara -- <yeni|ayir|bagla|uygula|iptal|liste|dogrula|tohumla> [seçenekler]\nAyrıntı: docs/migrations/merkezi-numara.md");
      process.exit(komut ? 1 : 0);
  }
} catch (e) {
  if (e instanceof DefterHatasi) {
    console.error(`HATA [${e.kod}]: ${e.message}`);
    process.exit(2);
  }
  throw e;
}
