/**
 * Akıllı CI F2 — regresyon parçalama ve CI kapısı doğrulaması (yan etkisiz, saf fonksiyonlar).
 *
 * - parcaPlani: regression-tests.json listesinin TAMAMINI n parçaya böler. Her test TAM BİR parçaya düşer (seçim / atlama
 *   yoktur). Dengeleme ölçülmüş sürelerle (regression-durations.json) en uzun-önce açgözlü atama; eşitlikte dosya adı →
 *   aynı girdi her zaman aynı planı verir. Süresi bilinmeyen test VARSAYILAN ağırlıkla yine plana girer.
 * - kapiDegerlendir: CI kapısının tek karar noktası. Zorunlu işlerin HEPSİ "success" değilse (failure / cancelled /
 *   skipped / eksik) veya parça sonuçları listeyi tam bir kez ve PASS olarak kapsamıyorsa kapı PASS VERMEZ.
 *
 * Kullananlar: scripts/ci/run-regression.mjs (--parca), scripts/ci/ci-gate.mjs, scripts/ci/ci-paralel.harness.mjs.
 */

export const VARSAYILAN_AGIRLIK_SN = 2;

/** CI kapısının beklediği zorunlu işler (.github/workflows/ci.yml `ci-kapisi.needs` ile birebir). */
export const ZORUNLU_ISLER = ["typescript", "build", "guvenlik", "regresyon", "astro-pro", "horary-western", "astro-regresyon"];

/** F3 gölge mod gözlem işleri: kapıya BAĞLI DEĞİL; hiçbir zorunlu iş bunlara `needs` ile bağlanamaz (ci-paralel harness denetler). */
export const GOZLEM_ISLERI = ["golge-analiz", "golge-rapor"];

/** "k/n" → { k, n }; geçersizse hata. */
export function parcaCoz(s) {
  const m = /^(\d+)\/(\d+)$/.exec(String(s ?? "").trim());
  if (!m) throw new Error(`geçersiz parça "${s}" (beklenen k/n)`);
  const k = Number(m[1]);
  const n = Number(m[2]);
  if (n < 1 || k < 1 || k > n) throw new Error(`geçersiz parça "${s}" (1 ≤ k ≤ n)`);
  return { k, n };
}

/** Listeyi n parçaya böler → [[dosya, …], …] (parça 1 = indeks 0). Her dosya tam bir kez. */
export function parcaPlani(files, n, sureler = {}) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`parça sayısı geçersiz: ${n}`);
  if (n > files.length) throw new Error(`parça sayısı (${n}) test sayısından (${files.length}) büyük`);
  const dup = files.find((f, i) => files.indexOf(f) !== i);
  if (dup) throw new Error(`listede tekrar eden test: ${dup}`);
  const w = (f) => (Number.isFinite(sureler[f]) && sureler[f] > 0 ? sureler[f] : VARSAYILAN_AGIRLIK_SN);
  const sirali = [...files].sort((a, b) => w(b) - w(a) || (a < b ? -1 : a > b ? 1 : 0));
  const parcalar = Array.from({ length: n }, () => ({ yuk: 0, files: [] }));
  for (const f of sirali) {
    let hedef = 0;
    for (let i = 1; i < n; i++) if (parcalar[i].yuk < parcalar[hedef].yuk) hedef = i;
    parcalar[hedef].files.push(f);
    parcalar[hedef].yuk += w(f);
  }
  // Parça içinde listenin özgün sırası korunur (testler önceki gibi seri ve aynı göreli sırada koşar).
  const sira = new Map(files.map((f, i) => [f, i]));
  return parcalar.map((p) => p.files.sort((a, b) => sira.get(a) - sira.get(b)));
}

/**
 * CI kapısı kararı.
 * @param {object} p
 * @param {Record<string, {result: string}>} p.needs  GitHub `toJSON(needs)`
 * @param {string[]} p.liste                          regression-tests.json dosya listesi
 * @param {number} p.parcaSayisi                      beklenen parça sayısı
 * @param {Array<{ad: string, veri?: any, hata?: string}>} p.sonuclar  parça sonuç dosyaları
 * @returns {{ ok: boolean, kontroller: Array<{ok: boolean, ad: string, detay: string}> }}
 */
export function kapiDegerlendir({ needs, liste, parcaSayisi, sonuclar }) {
  const kontroller = [];
  const k = (ok, ad, detay = "") => kontroller.push({ ok: !!ok, ad, detay });

  // 1) Zorunlu işler: her biri mevcut ve tam olarak "success".
  const nd = needs && typeof needs === "object" ? needs : {};
  for (const is of ZORUNLU_ISLER) {
    const r = nd[is]?.result;
    k(r === "success", `zorunlu iş ${is}`, r === undefined ? "sonuç YOK (iş kapıya bağlı değil)" : `sonuç: ${r}`);
  }

  // 2) Regresyon parça sonuçları: n adet, okunabilir, farklı parçalar, aynı liste.
  const okunan = [];
  for (const s of sonuclar ?? []) {
    if (s.hata || !s.veri) { k(false, `parça sonucu ${s.ad}`, `okunamadı: ${s.hata ?? "boş"}`); continue; }
    okunan.push(s);
  }
  k(okunan.length === parcaSayisi, "parça sonuç sayısı", `${okunan.length} / beklenen ${parcaSayisi}`);
  const parcaNo = new Map();
  for (const s of okunan) {
    const v = s.veri;
    let pc = null;
    try { pc = parcaCoz(v.parca); } catch { /* aşağıda */ }
    if (!pc || pc.n !== parcaSayisi) { k(false, `parça kimliği ${s.ad}`, `parca=${v.parca}`); continue; }
    if (parcaNo.has(pc.k)) k(false, `parça ${pc.k} tekrarı`, `${parcaNo.get(pc.k)} ve ${s.ad}`);
    parcaNo.set(pc.k, s.ad);
    if (v.filtre) k(false, `parça ${pc.k} filtre`, `--only kullanılmış: ${v.filtre}`);
    if (v.listeUzunlugu !== liste.length) k(false, `parça ${pc.k} liste`, `parça ${v.listeUzunlugu} test gördü, kapı ${liste.length}`);
  }
  for (let i = 1; i <= parcaSayisi; i++) k(parcaNo.has(i), `parça ${i}/${parcaSayisi} sonucu mevcut`);

  // 3) Kapsam: her test tam bir kez, hepsi PASS; bilinmeyen test yok.
  const sayac = new Map();
  const basarisiz = [];
  for (const s of okunan) for (const t of s.veri.tests ?? []) {
    sayac.set(t.file, (sayac.get(t.file) ?? 0) + 1);
    if (t.ok !== true) basarisiz.push(`${t.file} (${t.neden ?? "?"})`);
  }
  const listeSet = new Set(liste);
  const eksik = liste.filter((f) => !sayac.has(f));
  const tekrar = [...sayac].filter(([, c]) => c > 1).map(([f, c]) => `${f}×${c}`);
  const bilinmeyen = [...sayac.keys()].filter((f) => !listeSet.has(f));
  k(eksik.length === 0, "her test kapsandı", eksik.length ? `eksik ${eksik.length}: ${eksik.slice(0, 5).join(", ")}` : `${liste.length}/${liste.length}`);
  k(tekrar.length === 0, "hiçbir test iki kez koşmadı", tekrar.slice(0, 5).join(", "));
  k(bilinmeyen.length === 0, "listede olmayan test yok", bilinmeyen.slice(0, 5).join(", "));
  k(basarisiz.length === 0, "bütün regresyon testleri PASS", basarisiz.length ? `${basarisiz.length} başarısız: ${basarisiz.slice(0, 5).join("; ")}` : "");

  // 4) Yalıtım: parçalar ayrı makinelerde koştu (aynı makinede port / geçici dizin / süreç paylaşımı olamaz).
  const hostlar = okunan.map((s) => s.veri.makine).filter(Boolean);
  k(hostlar.length === okunan.length && new Set(hostlar).size === hostlar.length, "parçalar ayrı makinelerde koştu", hostlar.join(", "));

  return { ok: kontroller.length > 0 && kontroller.every((x) => x.ok), kontroller };
}
