// Eşzamanlılık testi işçisi: verilen anda (engel) merkezi numara ister, sonucu JSON yazar. Ayrı süreç = ayrı "Claude oturumu".
// Kullanım: node isci.mjs <klon> <modul> <ad> <baslangicEpochMs> [dal]
import { ayir, git } from "../defter.mjs";

const [klon, modul, ad, baslangic, dal] = process.argv.slice(2);
const bekle = Number(baslangic) - Date.now();
if (bekle > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, bekle);
const t0 = Date.now();
try {
  git(klon, ["fetch", "--quiet", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main"], { allowFail: true });
  const r = ayir(klon, { modul, ad, dal: dal || `work/${ad}`, refs: ["origin/main"] });
  process.stdout.write(JSON.stringify({ ok: true, ...r, ms: Date.now() - t0 }));
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, kod: e.kod ?? "?", hata: String(e.message).slice(0, 200), ms: Date.now() - t0 }));
}
