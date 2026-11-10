#!/usr/bin/env node
/**
 * Akıllı CI F3 — GÖLGE MOD değişiklik etki analizi. YALNIZ GÖZLEM: hiçbir testi atlamaz, seçmez, CI kapısına girmez.
 *
 *   node scripts/ci/golge-analiz.mjs --cikti <json> [--olay pull_request|push|workflow_dispatch]
 *        [--pr-base <sha> --pr-head <sha>] [--push-before <sha> --push-after <sha>] [--head <ref>]
 *   (CI'da değerler GOLGE_* ortam değişkenlerinden gelir; bkz. .github/workflows/ci.yml `golge-analiz`.)
 *
 * Karşılaştırma tabanı:
 *   pull_request → test edilen commit (HEAD) GitHub'ın birleştirme commit'iyse ebeveynleri (taban ucu, PR ucu); değilse
 *                  verilen pr-base / pr-head. Fark = merge-base(taban, PR ucu) … PR ucu (GitHub PR farkıyla aynı).
 *   push         → before … after (sıfır / bulunamayan before → FULL).
 *   diğer olaylar (manuel çalıştırma vb.) → taban yok → FULL.
 * Karşılaştırma güvenilir değilse, analiz hata verirse, bilinmeyen / ortak / riskli dosya varsa → FULL FALLBACK.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agacOku, commitVar, git, grafKur, kullaniyorMu } from "./golge-graf.mjs";
import { ALTYAPI, BELGE, HER_ZAMAN_ISLER, KURAL_SURUMU, MODULLER, ORTAK_MODUL_ESIGI, ORTAK_TEST_ESIGI } from "./golge-kurallar.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SEMA = "golge-v1";
const SIFIR = /^0+$/;
const LISTE = "scripts/ci/regression-tests.json";
const SURELER = "scripts/ci/regression-durations.json";

export const kuralOzeti = () => crypto.createHash("sha256").update(fs.readFileSync(path.join(HERE, "golge-kurallar.mjs"))).digest("hex").slice(0, 16);

export function altyapiMi(p) { for (const [re, neden] of ALTYAPI) if (re.test(p)) return neden; return null; }
export function belgeMi(p) { return BELGE.some((re) => re.test(p)); }
export function modulleri(p) { return MODULLER.filter((m) => m.desen.some((re) => re.test(p))).map((m) => m.id); }
const modul = (id) => MODULLER.find((m) => m.id === id);

/** package.json betiğinden harness yollarını çıkarır (astro-pro / horary işlerinin kökleri). */
function betikKokleri(agac, ad) {
  try {
    const cmd = JSON.parse(agac.read("package.json")).scripts?.[ad] ?? "";
    return [...cmd.matchAll(/(scripts\/[A-Za-z0-9_\-./]+\.(?:ts|mjs|js|cjs))/g)].map((m) => m[1]);
  } catch { return []; }
}
function isKokleri(agac) {
  const pro = [...agac.files].filter((f) => /^scripts\/astrology\/pro-[^/]+\.harness\.ts$/.test(f));
  return {
    "astro-pro": [...pro, ...betikKokleri(agac, "test:astrology:pro")],
    "horary-western": ["test:astrology:horary-western", "test:astrology:horary-pg", "test:astrology:horary-backup"].flatMap((b) => betikKokleri(agac, b)),
  };
}

/** Olaya göre karşılaştırma tabanı. { guvenilir, base, head, mergeBase, tested, notlar[], neden? } */
export function tabanBelirle(cwd, o) {
  const notlar = [];
  const tested = (() => { try { return git(cwd, ["rev-parse", o.head ?? "HEAD"]).trim(); } catch { return null; } })();
  if (!tested) return { guvenilir: false, neden: "test edilen commit çözülemedi", notlar };
  if (o.olay === "pull_request") {
    let base = o.prBase;
    let head = o.prHead;
    const ebeveyn = git(cwd, ["rev-list", "--parents", "-n", "1", tested]).trim().split(" ").slice(1);
    if (ebeveyn.length === 2) {
      if (head && ebeveyn[1] !== head) notlar.push(`olaydaki PR ucu (${head.slice(0, 8)}) ≠ test edilen birleştirmenin PR ebeveyni (${ebeveyn[1].slice(0, 8)}); test edilen birleştirme esas alındı`);
      [base, head] = ebeveyn;
    }
    if (!commitVar(cwd, base) || !commitVar(cwd, head)) return { guvenilir: false, tested, neden: `PR tabanı / ucu depoda yok (base=${String(base).slice(0, 12)}, head=${String(head).slice(0, 12)}; eksik git geçmişi?)`, notlar };
    let mb;
    try { mb = git(cwd, ["merge-base", base, head]).trim(); } catch { mb = ""; }
    if (!mb) return { guvenilir: false, tested, base, head, neden: "merge-base bulunamadı (eksik / sığ git geçmişi)", notlar };
    return { guvenilir: true, tested, base, head, mergeBase: mb, farkAlt: mb, farkUst: head, grafUst: tested, notlar };
  }
  if (o.olay === "push") {
    const { pushBefore: b, pushAfter: a } = o;
    if (!b || SIFIR.test(b)) return { guvenilir: false, tested, neden: "push öncesi SHA yok (yeni dal / ilk push)", notlar };
    if (!commitVar(cwd, b) || !commitVar(cwd, a)) return { guvenilir: false, tested, neden: `push SHA'ları depoda yok (before=${String(b).slice(0, 12)}; force push veya eksik geçmiş?)`, notlar };
    if (a !== tested) notlar.push(`push after (${a.slice(0, 8)}) ≠ test edilen commit (${tested.slice(0, 8)})`);
    return { guvenilir: true, tested, base: b, head: a, mergeBase: b, farkAlt: b, farkUst: a, grafUst: a, notlar };
  }
  return { guvenilir: false, tested, neden: `"${o.olay ?? "bilinmeyen"}" olayında karşılaştırma tabanı yok (manuel / tanımsız çalıştırma)`, notlar };
}

/** git diff --name-status -z -M çıktısı → [{durum, yol, eskiYol?}] */
export function farklar(cwd, alt, ust) {
  const t = git(cwd, ["diff", "--no-color", "--no-ext-diff", "--name-status", "-z", "-M50%", alt, ust]).split("\0");
  const out = [];
  for (let i = 0; i < t.length - 1;) {
    const st = t[i++];
    if (!st) continue;
    if (st[0] === "R" || st[0] === "C") { const eski = t[i++]; const yeni = t[i++]; out.push({ durum: st[0], benzerlik: Number(st.slice(1)) || null, eskiYol: eski, yol: yeni }); }
    else out.push({ durum: st[0], yol: t[i++] });
  }
  return out.sort((a, b) => (a.yol < b.yol ? -1 : a.yol > b.yol ? 1 : 0));
}

const listeOku = (agac) => { try { return JSON.parse(agac.read(LISTE)).tests.map((t) => t.file); } catch { return null; } };

/** Ana karar. Hata → FULL (asla daraltılmış öneri üretmez). */
export function golgeAnaliz(o) {
  const cwd = o.cwd;
  const sonuc = {
    sema: SEMA, kuralSurumu: KURAL_SURUMU, kuralOzeti: o.kuralOzeti ?? kuralOzeti(), olay: o.olay ?? null,
    sha: { analiz: null, base: null, head: null, mergeBase: null }, karsilastirmaGuvenilir: false, notlar: [],
    degisiklikler: [], tasinanlar: [], dosyaModul: {}, modulTestleri: {}, ortakBagimliliklar: [], riskliDegisiklikler: [],
    siniflandirilamayan: [], kapsamBosluklari: [], genisTestler: [], sinif: "E", fullFallback: true, gerekceler: [],
    oneri: { isler: [], regresyonTestleri: [], regresyonTestSayisi: 0, tumIsler: true },
    tasarrufTahmini: null, politika: "F3 gölge mod: öneri yalnız bilgi amaçlıdır; F2'nin bütün işleri ve regresyon listesinin TAMAMI çalışır.",
    hata: null,
  };
  try {
    const t = tabanBelirle(cwd, o);
    sonuc.sha = { analiz: t.tested ?? null, base: t.base ?? null, head: t.head ?? null, mergeBase: t.mergeBase ?? null };
    sonuc.notlar.push(...t.notlar);
    const ustAgac = agacOku(cwd, t.grafUst ?? t.tested);
    const ustListe = listeOku(ustAgac);
    if (!ustListe) throw new Error(`${LISTE} okunamadı`);
    const tumIsler = ["typescript", "build", "guvenlik", "regresyon", "astro-pro", "horary-western", "ci-kapisi"];
    const full = (gerekce) => { sonuc.fullFallback = true; sonuc.gerekceler.push(gerekce); };
    const sureler = (() => { try { return JSON.parse(ustAgac.read(SURELER)).sureler ?? {}; } catch { return {}; } })();
    const sn = (ts) => Math.round(ts.reduce((a, f) => a + (sureler[f] ?? 2), 0));
    const tamOneri = () => { sonuc.oneri = { isler: tumIsler, regresyonTestleri: [...ustListe].sort(), regresyonTestSayisi: ustListe.length, tumIsler: true }; };

    if (!t.guvenilir) { sonuc.sinif = "E"; full(`Karşılaştırma güvenilir değil: ${t.neden}`); tamOneri(); return tamamla(sonuc, ustListe, sn); }
    sonuc.karsilastirmaGuvenilir = true;
    sonuc.fullFallback = false; // yalnız aşağıdaki somut gerekçelerle FULL'e döner
    const degisen = farklar(cwd, t.farkAlt, t.farkUst);
    if (degisen.length === 0) { sonuc.sinif = "E"; full("Değişen dosya bulunamadı (boş fark); etki daraltılamaz"); tamOneri(); return tamamla(sonuc, ustListe, sn); }

    const altAgac = agacOku(cwd, t.farkAlt);
    const altListe = listeOku(altAgac) ?? [];
    const gUst = grafKur(ustAgac);
    const gAlt = grafKur(altAgac);
    const testler = [...new Set([...ustListe, ...altListe])].sort();
    const kap = new Map(testler.map((tf) => [tf, { ust: ustListe.includes(tf) ? gUst.kapanis(tf) : null, alt: altListe.includes(tf) ? gAlt.kapanis(tf) : null }]));
    const genis = testler.filter((tf) => kap.get(tf).ust?.genis || kap.get(tf).alt?.genis);
    sonuc.genisTestler = genis;
    const testModul = (tf) => modulleri(tf);
    const isKap = { ust: isKokleri(ustAgac), alt: isKokleri(altAgac) };
    const isKapanis = Object.fromEntries(Object.keys(isKap.ust).map((is) => [is, [...isKap.ust[is].map((r) => gUst.kapanis(r)), ...isKap.alt[is].map((r) => gAlt.kapanis(r))]]));

    const secilen = new Set();
    const onerIs = new Set(HER_ZAMAN_ISLER);
    const etkilenenModul = new Set();
    let hepsiBelge = true;

    const yolDegerlendir = (p, d) => {
      const kayit = { yol: p, kategori: null, moduller: modulleri(p), kullananTestler: [], gerekce: null };
      kayit.moduller.forEach((m) => etkilenenModul.add(m));
      sonuc.dosyaModul[p] = kayit.moduller;
      const alt = altyapiMi(p);
      const kullanan = testler.filter((tf) => (kap.get(tf).ust && kullaniyorMu(kap.get(tf).ust, p)) || (kap.get(tf).alt && kullaniyorMu(kap.get(tf).alt, p)) || tf === p);
      kayit.kullananTestler = kullanan;
      const testMi = testler.includes(p);
      if (alt) { kayit.kategori = "A"; kayit.gerekce = `ortak altyapı: ${alt}`; hepsiBelge = false; sonuc.riskliDegisiklikler.push({ yol: p, neden: alt }); full(`${p} → ${alt}`); return kayit; }
      if (belgeMi(p) && kullanan.length === 0) { kayit.kategori = "D"; kayit.gerekce = "yalnız belge (hiçbir test bu dosyayı anmıyor)"; return kayit; }
      hepsiBelge = false;
      const modSet = new Set(kullanan.flatMap(testModul));
      if (kullanan.length >= ORTAK_TEST_ESIGI || modSet.size >= ORTAK_MODUL_ESIGI) {
        kayit.kategori = "A"; kayit.gerekce = `ortak bağımlılık (gerçek import grafiği): ${kullanan.length} test, ${modSet.size} modül`;
        sonuc.ortakBagimliliklar.push({ yol: p, testSayisi: kullanan.length, modulSayisi: modSet.size, moduller: [...modSet].sort() });
        full(`${p} → ${kayit.gerekce}`);
        return kayit;
      }
      if (kayit.moduller.length === 0 && kullanan.length === 0 && !testMi) {
        kayit.kategori = "E"; kayit.gerekce = "sınıflandırılamayan dosya (modül kuralı yok, hiçbir test kullanmıyor)";
        sonuc.siniflandirilamayan.push(p); full(`${p} → sınıflandırılamadı`);
        return kayit;
      }
      if (kayit.moduller.length > 1) { kayit.kategori = "C"; }
      else kayit.kategori = "B";
      kayit.gerekce = kullanan.length ? `${kullanan.length} test bu dosyayı kullanıyor (import grafiği)` : (testMi ? "test dosyasının kendisi" : "modül dosyası; doğrudan kullanan regresyon testi yok");
      kullanan.forEach((x) => secilen.add(x));
      for (const [is, ks] of Object.entries(isKapanis)) if (ks.some((k) => kullaniyorMu(k, p))) onerIs.add(is);
      if (kayit.moduller.includes("atlas")) { onerIs.add("astro-pro"); onerIs.add("horary-western"); }
      return kayit;
    };

    for (const d of degisen) {
      const k = yolDegerlendir(d.yol, d);
      const kayit = { durum: d.durum, ...k };
      if (d.eskiYol) {
        const e = yolDegerlendir(d.eskiYol, d);
        kayit.eskiYol = d.eskiYol;
        kayit.eskiYolKategori = e.kategori;
        kayit.eskiYolModuller = e.moduller;
        kayit.eskiYolKullananTestler = e.kullananTestler;
        const tasima = { eskiYol: d.eskiYol, yol: d.yol, durum: d.durum, benzerlik: d.benzerlik, modullerArasi: JSON.stringify(e.moduller) !== JSON.stringify(k.moduller) };
        sonuc.tasinanlar.push(tasima);
        if (tasima.modullerArasi) sonuc.notlar.push(`modüller arası taşıma: ${d.eskiYol} (${e.moduller.join(",") || "modülsüz"}) → ${d.yol} (${k.moduller.join(",") || "modülsüz"})`);
      }
      if (d.durum === "D" && k.kategori !== "D" && k.kategori !== "A" && k.kullananTestler.length === 0 && k.moduller.length === 0) {
        full(`${d.yol} silindi; etkisi belirlenemedi`);
      }
      sonuc.degisiklikler.push(kayit);
    }

    for (const m of [...etkilenenModul].sort()) {
      const mm = modul(m);
      const tst = ustListe.filter((tf) => modulleri(tf).includes(m));
      sonuc.modulTestleri[m] = tst;
      if (mm?.korunan) sonuc.kapsamBosluklari.push({ modul: m, ad: mm.ad, aciklama: `KAPSAM BOŞLUĞU: ${mm.ad} korunan alan — bu modülün kendi testleri regresyon koşucusunda çalıştırılmıyor (Owner kararı); yalnız tsc / build / güvenlik${m === "atlas" ? " / astro-pro / horary-western" : ""} ve dolaylı kullanan testler kapsıyor.` });
      else tst.forEach((x) => secilen.add(x));
    }

    if (sonuc.fullFallback) { sonuc.sinif = sonuc.riskliDegisiklikler.length || sonuc.ortakBagimliliklar.length ? "A" : "E"; tamOneri(); return tamamla(sonuc, ustListe, sn); }
    if (hepsiBelge) {
      sonuc.sinif = "D"; sonuc.fullFallback = false; sonuc.gerekceler.push("Yalnız belge değişikliği (hiçbir test belgeyi anmıyor). Test atlama yetkisi YOK; yalnız işaretlenir.");
      sonuc.oneri = { isler: [...HER_ZAMAN_ISLER].sort(), regresyonTestleri: [], regresyonTestSayisi: 0, tumIsler: false };
      return tamamla(sonuc, ustListe, sn);
    }
    genis.filter((g) => ustListe.includes(g)).forEach((g) => secilen.add(g));
    const sec = [...secilen].filter((x) => ustListe.includes(x)).sort();
    const modulSayisi = etkilenenModul.size;
    sonuc.sinif = modulSayisi > 1 || sonuc.degisiklikler.some((x) => x.kategori === "C") ? "C" : "B";
    sonuc.fullFallback = false;
    sonuc.gerekceler.push(`${sonuc.sinif === "B" ? "Tek modül" : "Birden fazla modül"} (${[...etkilenenModul].sort().join(", ") || "modülsüz"}); öneri = import grafiğinde değişen dosyaları kullanan testler + modül testleri + ${genis.length} geniş (statik daraltılamayan) test.`);
    sonuc.oneri = { isler: [...onerIs].sort(), regresyonTestleri: sec, regresyonTestSayisi: sec.length, tumIsler: false };
    return tamamla(sonuc, ustListe, sn);
  } catch (e) {
    sonuc.hata = String(e?.message ?? e).slice(0, 500);
    sonuc.fullFallback = true; sonuc.sinif = "E";
    sonuc.gerekceler.push(`Gölge analizi hata verdi → FULL FALLBACK (${sonuc.hata})`);
    sonuc.oneri = { isler: ["typescript", "build", "guvenlik", "regresyon", "astro-pro", "horary-western", "ci-kapisi"], regresyonTestleri: null, regresyonTestSayisi: null, tumIsler: true };
    return sonuc;
  }
}

function tamamla(sonuc, liste, sn) {
  const oneriSn = sonuc.oneri.tumIsler ? sn(liste) : sn(sonuc.oneri.regresyonTestleri);
  sonuc.tasarrufTahmini = {
    tur: "TEORİK (F4 için tahmin; F3'te gerçekleşen tasarruf YOK)",
    listeTestSayisi: liste.length, onerilenTestSayisi: sonuc.oneri.regresyonTestSayisi,
    regresyonSnTum: sn(liste), regresyonSnOneri: oneriSn,
    atlanabilecekTestSayisi: liste.length - (sonuc.oneri.regresyonTestSayisi ?? liste.length),
    atlanabilecekIsler: ["typescript", "build", "guvenlik", "regresyon", "astro-pro", "horary-western", "ci-kapisi"].filter((i) => !sonuc.oneri.isler.includes(i) && !(i === "regresyon" && sonuc.oneri.regresyonTestSayisi)),
  };
  sonuc.gerekceler = [...new Set(sonuc.gerekceler)];
  return sonuc;
}

const md = (s) => String(s).replace(/[|`<>\r\n\\]/g, (c) => ({ "|": "\\|", "`": "'", "<": "&lt;", ">": "&gt;", "\r": " ", "\n": " ", "\\": "\\\\" }[c]));

export function ozetMd(s) {
  const modl = [...new Set(Object.values(s.dosyaModul).flat())].sort();
  const satir = [
    `## Gölge analiz (F3) — ${s.fullFallback ? "FULL FALLBACK" : `sınıf ${s.sinif}`}`,
    `> F3 yalnız gözlemdir: **hiçbir test atlanmadı**; F2'nin bütün işleri ve regresyon listesinin tamamı çalışır.`,
    "",
    `- **Karşılaştırma:** ${s.olay ?? "?"} · taban \`${(s.sha.mergeBase ?? "—").slice(0, 8)}\` → uç \`${(s.sha.head ?? "—").slice(0, 8)}\` · test edilen \`${(s.sha.analiz ?? "—").slice(0, 8)}\` · ${s.karsilastirmaGuvenilir ? "güvenilir" : "**güvenilir değil**"}`,
    `- **Değişen dosya:** ${s.degisiklikler.length}${s.tasinanlar.length ? ` (taşınan/yeniden adlandırılan ${s.tasinanlar.length})` : ""} · **modüller:** ${modl.length ? modl.join(", ") : "—"}`,
    `- **Öneri:** ${s.oneri.tumIsler ? "TÜM işler + regresyonun tamamı" : `işler: ${s.oneri.isler.join(", ")} · regresyon: ${s.oneri.regresyonTestSayisi} / ${s.tasarrufTahmini?.listeTestSayisi ?? "?"} test`}`,
    `- **Neden:** ${s.gerekceler.slice(0, 6).map(md).join(" · ") || "—"}${s.gerekceler.length > 6 ? ` (+${s.gerekceler.length - 6})` : ""}`,
  ];
  if (s.hata) satir.push(`- **⚠️ Analiz hatası:** ${md(s.hata)}`);
  if (s.riskliDegisiklikler.length) satir.push(`- **Riskli / ortak altyapı:** ${s.riskliDegisiklikler.slice(0, 8).map((r) => `${md(r.yol)} (${md(r.neden)})`).join(", ")}`);
  if (s.ortakBagimliliklar.length) satir.push(`- **Ortak bağımlılık:** ${s.ortakBagimliliklar.slice(0, 8).map((r) => `${md(r.yol)} (${r.testSayisi} test / ${r.modulSayisi} modül)`).join(", ")}`);
  if (s.siniflandirilamayan.length) satir.push(`- **Sınıflandırılamayan:** ${s.siniflandirilamayan.slice(0, 8).map(md).join(", ")}`);
  for (const b of s.kapsamBosluklari) satir.push(`- **${md(b.aciklama)}**`);
  for (const n of s.notlar.slice(0, 5)) satir.push(`- Not: ${md(n)}`);
  if (s.tasarrufTahmini) satir.push(`- **Teorik F4 tahmini:** regresyon ≈${s.tasarrufTahmini.regresyonSnOneri} / ${s.tasarrufTahmini.regresyonSnTum} sn (gerçekleşmiş tasarruf DEĞİL)`);
  satir.push(`- Kural: ${s.kuralSurumu} · ${s.kuralOzeti}`);
  return satir.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const e = process.env;
  const s = golgeAnaliz({
    cwd: arg("--cwd") ?? process.cwd(),
    olay: arg("--olay") ?? e.GOLGE_OLAY ?? null,
    prBase: arg("--pr-base") ?? e.GOLGE_PR_BASE ?? null,
    prHead: arg("--pr-head") ?? e.GOLGE_PR_HEAD ?? null,
    pushBefore: arg("--push-before") ?? e.GOLGE_PUSH_BEFORE ?? null,
    pushAfter: arg("--push-after") ?? e.GOLGE_PUSH_AFTER ?? null,
    head: arg("--head") ?? null,
  });
  const cikti = arg("--cikti");
  if (cikti) { fs.mkdirSync(path.dirname(path.resolve(cikti)), { recursive: true }); fs.writeFileSync(cikti, JSON.stringify(s, null, 1)); }
  const ozet = ozetMd(s);
  console.log(ozet);
  if (e.GITHUB_STEP_SUMMARY) fs.appendFileSync(e.GITHUB_STEP_SUMMARY, ozet + "\n");
  if (s.hata) { console.log(`::error::Gölge analizi hata verdi (FULL FALLBACK üretildi, testler etkilenmez): ${s.hata}`); process.exit(1); }
}
