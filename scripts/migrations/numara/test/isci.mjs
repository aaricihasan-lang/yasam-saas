// Eşzamanlılık testi işçisi (ayrı süreç = ayrı oturum): verilen anda (engel) işlem yapar, sonucu JSON yazar.
// Kullanım: node isci.mjs <klon> <islem: ayir|iptal> <modul|surum> <ad|neden> <baslangicEpochMs> [dal] [ekSurumlerVirgullu]
import { ayir, git, olayEkle } from "../defter.mjs";

const [klon, islem, a, b, baslangic, dal, ek] = process.argv.slice(2);
const bekle = Number(baslangic) - Date.now();
if (bekle > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, bekle);
const t0 = Date.now();
try {
  if (islem === "iptal") {
    const r = olayEkle(klon, { olay: "iptal", surum: a, neden: b });
    process.stdout.write(JSON.stringify({ ok: true, iptal: a, deneme: r.deneme, ms: Date.now() - t0 }));
  } else {
    git(klon, ["fetch", "--quiet", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main"], { allowFail: true });
    const r = ayir(klon, { modul: a, ad: b, dal: dal || `work/${b}`, refs: ["origin/main"], ek: ek ? ek.split(",") : [] });
    process.stdout.write(JSON.stringify({ ok: true, ...r, ms: Date.now() - t0 }));
  }
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, kod: e.kod ?? "?", hata: String(e.message).slice(0, 200), ms: Date.now() - t0 }));
}
