// MERKEZİ MIGRATION NUMARASI DEFTERİ — çekirdek (Ağ yalnız `git fetch` / `git push`; DB YOK; sır YOK).
//
// Defter, uzak depoda AYRI bir dalda (varsayılan `refs/heads/migration-rezervasyon`) tutulan, YALNIZ EKLENEN bir JSONL
// dosyasıdır (`rezervasyonlar.jsonl`). Her satır bir OLAYDIR (ayir / bagla / uygula / iptal / gecmis); durum olaylardan türetilir,
// hiçbir satır silinmez ya da değiştirilmez.
//
// ATOMİKLİK (karşılaştır-ve-değiştir): yazma şu adımlardır —
//   1) uzak dalın GÜNCEL ucu işleme özgü geçici bir ref'e çekilir (aynı depoyu paylaşan eşzamanlı oturumlar birbirini ezmez),
//   2) yeni satır o ucun içeriğine eklenir, `commit-tree -p <uç>` ile ÇALIŞMA AĞACINA / INDEX'E DOKUNMADAN commit üretilir,
//   3) `git push <uzak> <commit>:<dal>` — FORCE YOK. Sunucu yalnız ileri-sarma (fast-forward) kabul eder: arada başka bir oturum
//      yazdıysa uç değişmiştir, bizim commit'in ebeveyni artık uç değildir → push REDDEDİLİR. Kaybeden işlem ucu yeniden okur,
//      numarayı yeniden hesaplar ve tekrar dener. Böylece aynı numara iki işlem tarafından kesinlikle kaydedilemez: bir numara
//      ancak defterin o anki TAM içeriği görülerek seçilir ve o içerik değişmemişse yazılabilir.
//   Bağlantı yazma sırasında koparsa sonuç belirsizdir → uç yeniden okunur; işlem kimliğimiz defterdeyse BAŞARI, değilse yeniden
//   denenir (çift kayıt oluşmaz: aynı işlem kimliği ikinci kez yazılmaz).
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULTS = Object.freeze({ remote: "origin", ref: "refs/heads/migration-rezervasyon", file: "rezervasyonlar.jsonl" });
export const NAME_RE = /^(\d{14})_([a-z0-9_]+)(\.POSTDEPLOY)?\.sql$/;
export const SLUG_RE = /^[a-z0-9][a-z0-9_]{2,80}$/;
export const MODUL_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const OLAYLAR = new Set(["gecmis", "ayir", "bagla", "uygula", "iptal"]);

export class DefterHatasi extends Error {
  constructor(kod, mesaj) {
    super(mesaj);
    this.kod = kod;
  }
}

// ─── Git yardımcıları ──────────────────────────────────────────────────────────────────────────────────────────────────
export function git(cwd, args, { input, allowFail = false, env } = {}) {
  const r = spawnSync("git", args, { cwd, input, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !allowFail) throw new DefterHatasi("GIT", `git ${args[0]} başarısız: ${(r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" | ")}`);
  return { ok: r.status === 0, out: (r.stdout || "").replace(/\r\n/g, "\n"), err: (r.stderr || "").replace(/\r\n/g, "\n") };
}

/** Uzak defter ucunu işleme özgü geçici ref'e çeker. Dönüş: { tip: sha|null, text } (dal yoksa tip null). */
export function okuUzak(cwd, cfg = DEFAULTS, { deneme = Number(process.env.MIGRATION_NUMARA_OKUMA_DENEME) || 6 } = {}) {
  const tmp = `refs/migration-numara/okuma-${process.pid}-${crypto.randomUUID()}`;
  let f = null;
  // Geçici yerel / ağ hataları (yük altında eşzamanlı git süreçleri, kısa kopmalar) birkaç kez yeniden denenir; kalıcıysa AG.
  for (let n = 1; n <= deneme; n++) {
    f = git(cwd, ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", cfg.remote, `+${cfg.ref}:${tmp}`], { allowFail: true });
    if (f.ok) break;
    if (n < deneme) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * n + Math.floor(Math.random() * 200));
  }
  if (!f.ok) {
    // Dalın HİÇ olmaması ile ağ hatasını ayır: ls-remote başarılı ve boşsa dal yoktur.
    const ls = git(cwd, ["ls-remote", cfg.remote, cfg.ref], { allowFail: true });
    if (ls.ok && ls.out.trim() === "") return { tip: null, text: "" };
    throw new DefterHatasi("AG", `Merkezi defter okunamadı (${cfg.remote} ${cfg.ref}): ${f.err.trim().split("\n").at(-1) ?? ""}`);
  }
  try {
    const tip = git(cwd, ["rev-parse", tmp]).out.trim();
    const show = git(cwd, ["show", `${tip}:${cfg.file}`], { allowFail: true });
    return { tip, text: show.ok ? show.out : "" };
  } finally {
    git(cwd, ["update-ref", "-d", tmp], { allowFail: true });
  }
}

// ─── Defter ayrıştırma + durum ─────────────────────────────────────────────────────────────────────────────────────────
export function ayristir(text) {
  const olaylar = [];
  const satirlar = text.split("\n").filter((l) => l.trim() !== "");
  satirlar.forEach((l, i) => {
    let o;
    try {
      o = JSON.parse(l);
    } catch {
      throw new DefterHatasi("BOZUK", `Defter satırı ${i + 1} geçerli JSON değil`);
    }
    if (!o || !OLAYLAR.has(o.olay) || !/^\d{14}$/.test(String(o.surum))) throw new DefterHatasi("BOZUK", `Defter satırı ${i + 1} geçersiz (olay/sürüm)`);
    olaylar.push(o);
  });
  return olaylar;
}

/** Olaylardan sürüm başına durum. Kurallar (doğrulama da burada): bir sürüm YALNIZ BİR kez `ayir`/`gecmis` alır. */
export function durum(olaylar) {
  const m = new Map();
  for (const o of olaylar) {
    const cur = m.get(o.surum);
    if (o.olay === "ayir" || o.olay === "gecmis") {
      if (cur) throw new DefterHatasi("CIFT", `Defter tutarsız: ${o.surum} iki kez ayrılmış`);
      m.set(o.surum, { surum: o.surum, dosya: o.dosya ?? null, dosyalar: o.dosyalar ?? null, prod: o.prod === true, modul: o.modul ?? null, dal: o.dal ?? null, pr: o.pr ?? null, zaman: o.zaman, kimlik: o.kimlik ?? null, islem: o.islem ?? null, sha256: o.sha256 ?? null, durum: o.olay === "gecmis" ? "uygulandi" : "ayrildi", gecmis: o.olay === "gecmis", olaylar: [o] });
      continue;
    }
    if (!cur) throw new DefterHatasi("SAHIPSIZ", `Defter tutarsız: ${o.surum} için ayırma olmadan '${o.olay}'`);
    if (cur.durum === "iptal") throw new DefterHatasi("IPTAL_SONRASI", `Defter tutarsız: iptal edilmiş ${o.surum} için '${o.olay}'`);
    cur.olaylar.push(o);
    if (o.olay === "bagla") {
      if (o.dal) cur.dal = o.dal;
      if (o.pr) cur.pr = o.pr;
      if (o.sha256) cur.sha256 = o.sha256;
      if (cur.durum === "ayrildi") cur.durum = "pr";
    } else if (o.olay === "uygula") {
      cur.durum = "uygulandi";
      if (o.sha256) cur.sha256 = o.sha256;
    } else if (o.olay === "iptal") {
      if (cur.durum === "uygulandi") throw new DefterHatasi("UYGULANMIS_IPTAL", `Defter tutarsız: uygulanmış ${o.surum} iptal edilemez`);
      cur.durum = "iptal";
    }
  }
  return m;
}

// ─── Numara hesaplama ──────────────────────────────────────────────────────────────────────────────────────────────────
/** YYYYMMDDHHMMSS geçerli mi (takvim + saat)? */
export function gecerliSurum(v) {
  if (!/^\d{14}$/.test(v)) return false;
  const [y, mo, d, h, mi, s] = [v.slice(0, 4), v.slice(4, 6), v.slice(6, 8), v.slice(8, 10), v.slice(10, 12), v.slice(12, 14)].map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && dt.getUTCHours() === h && dt.getUTCMinutes() === mi && dt.getUTCSeconds() === s;
}
/** Bilinen en büyük sürümden sonraki ilk geçerli sürüm: aynı gün içinde +100 (HHMM00 ızgarası), gün dolarsa ertesi gün 000000. */
export function sonraki(enBuyuk) {
  if (!enBuyuk) throw new DefterHatasi("BOS", "Bilinen sürüm yok");
  const y = Number(enBuyuk.slice(0, 4)), mo = Number(enBuyuk.slice(4, 6)), d = Number(enBuyuk.slice(6, 8));
  const hms = Number(enBuyuk.slice(8, 14));
  let sec = Math.floor(hms / 10000) * 3600 + Math.floor((hms % 10000) / 100) * 60 + (hms % 100);
  sec = Math.floor(sec / 60) * 60 + 60; // bir sonraki tam dakika (…0100 adımı)
  if (sec >= 86400) {
    const n = new Date(Date.UTC(y, mo - 1, d + 1));
    return `${n.getUTCFullYear()}${String(n.getUTCMonth() + 1).padStart(2, "0")}${String(n.getUTCDate()).padStart(2, "0")}000000`;
  }
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60);
  return `${enBuyuk.slice(0, 8)}${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}00`;
}

/** Bilinen sürümler: defter (her durum, iptal DAHİL) + depodaki tüm migration dosyaları (verilen ref'lerde) + ek liste (ör. prod). */
export function bilinenSurumler(cwd, olaylar, { refs = [], ek = [] } = {}) {
  const s = new Set(olaylar.map((o) => o.surum));
  for (const ref of refs) {
    const r = git(cwd, ["ls-tree", "--name-only", `${ref}:supabase/migrations`], { allowFail: true });
    if (!r.ok) continue;
    for (const f of r.out.split("\n")) {
      const m = NAME_RE.exec(f.trim());
      if (m) s.add(m[1]);
    }
  }
  for (const v of ek) if (/^\d{14}$/.test(v)) s.add(v);
  return s;
}

export function kimlik(cwd) {
  const ad = git(cwd, ["config", "user.name"], { allowFail: true }).out.trim() || "bilinmiyor";
  return `${ad}@${os.hostname()}`;
}

// ─── Yazma (CAS) ───────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Defterin uzak ucuna `uret(mevcutOlaylar, tip)` ile üretilen satırları EKLER. `uret` her denemede GÜNCEL içerikle yeniden
 * çağrılır (ör. numara yeniden hesaplanır); null dönerse yazma yapılmaz (ör. idempotent: zaten var). Force push YOK.
 */
export function ekle(cwd, uret, { cfg = DEFAULTS, denemeMax = Number(process.env.MIGRATION_NUMARA_DENEME) || 200, bekle = (n) => 20 + Math.floor(Math.random() * 60 * Math.min(n, 10)), islem = crypto.randomUUID(), log = () => {} } = {}) {
  // Canlılık: her turda yarışanlardan biri MUTLAKA kazanır (sunucu bir ileri-sarmayı kabul eder) → N eşzamanlı talep en çok ~N
  // turda biter; rastgele bekleme çakışmayı dağıtır. Sınır yalnız ağ arızasında sonsuz döngüyü önler.
  for (let n = 1; n <= denemeMax; n++) {
    let okunan;
    try {
      okunan = okuUzak(cwd, cfg);
    } catch (e) {
      // İlk okumada kalıcı ağ hatası → hemen bildir (hiçbir şey yazılmadı). Sonraki turlarda geçici say ve yeniden dene.
      if (n === 1 || !(e instanceof DefterHatasi) || e.kod !== "AG") throw e;
      log(`deneme ${n}: defter okunamadı → yeniden`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, bekle(n));
      continue;
    }
    const { tip, text } = okunan;
    const olaylar = ayristir(text);
    // Belirsiz önceki deneme (bağlantı koptu) bu işlem kimliğiyle zaten yazılmışsa: başarı.
    const yazilmis = olaylar.filter((o) => o.islem === islem);
    if (yazilmis.length) return { tamam: true, olaylar: yazilmis, deneme: n, yeniden: true };
    durum(olaylar); // tutarsız defterin üzerine yazılmaz
    const yeni = uret(olaylar, tip);
    if (!yeni) return { tamam: true, olaylar: [], deneme: n, yazilmadi: true };
    const satir = yeni.map((o) => JSON.stringify({ ...o, islem })).join("\n") + "\n";
    const icerik = (text && !text.endsWith("\n") ? text + "\n" : text) + satir;
    // Doğrulama: yeni içerik tutarlı olmalı (aynı sürüm iki kez ayrılamaz vb.).
    durum(ayristir(icerik));
    const blob = git(cwd, ["hash-object", "-w", "--stdin"], { input: icerik }).out.trim();
    const agacSatirlari = [];
    if (tip) {
      for (const l of git(cwd, ["ls-tree", tip]).out.split("\n").filter(Boolean)) if (!l.endsWith(`\t${cfg.file}`)) agacSatirlari.push(l);
    }
    agacSatirlari.push(`100644 blob ${blob}\t${cfg.file}`);
    const tree = git(cwd, ["mktree"], { input: agacSatirlari.join("\n") + "\n" }).out.trim();
    const mesaj = `migration-numara: ${yeni.map((o) => `${o.olay} ${o.surum}`).join(", ")}`;
    const commit = git(cwd, ["commit-tree", tree, ...(tip ? ["-p", tip] : []), "-m", mesaj], { env: { GIT_AUTHOR_NAME: "migration-numara", GIT_AUTHOR_EMAIL: "migration-numara@yerel", GIT_COMMITTER_NAME: "migration-numara", GIT_COMMITTER_EMAIL: "migration-numara@yerel" } }).out.trim();
    const p = git(cwd, ["push", "--quiet", "--porcelain", cfg.remote, `${commit}:${cfg.ref}`], { allowFail: true });
    if (p.ok) return { tamam: true, olaylar: yeni.map((o) => ({ ...o, islem })), deneme: n, commit };
    const red = /rejected|non-fast-forward|fetch first|stale info|failed to update ref|cannot lock ref|already exists/i.test(p.out + p.err);
    log(`deneme ${n}: ${red ? "uç değişmiş (rakip yazdı) → yeniden" : "push hatası → durum yeniden okunacak"}`);
    // Ağ / belirsiz hata: bir sonraki turda uç yeniden okunur; işlem kimliği varsa başarı sayılır (yukarıda).
    const ms = bekle(n);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  }
  throw new DefterHatasi("CEKISME", `Merkezi defter ${denemeMax} denemede güncellenemedi (yoğun eşzamanlı talep ya da ağ sorunu). Hiçbir numara ayrılmadı; tekrar deneyin.`);
}

// ─── Üst düzey işlemler ────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Yeni numara ayırır. İdempotent: aynı (modül, ad, dal) için etkin (iptal edilmemiş) ayırma varsa YENİ numara verilmez, o döner.
 * `surum` verilirse yalnız o numara denenir (boş + bilinenlerin hepsinden büyük olmalı; iptal edilmişse RED).
 */
export function ayir(cwd, { modul, ad, dal, pr = null, surum = null, refs = ["origin/main"], ek = [], cfg = DEFAULTS, log } = {}) {
  if (!MODUL_RE.test(modul ?? "")) throw new DefterHatasi("GIRDI", "Modül adı geçersiz (küçük harf, rakam, tire; ör. atlas, uye-yonetimi)");
  if (!SLUG_RE.test(ad ?? "")) throw new DefterHatasi("GIRDI", "Migration adı geçersiz (küçük harf, rakam, alt çizgi; ör. astro_analysis_result_parts)");
  let sonuc = null;
  const r = ekle(
    cwd,
    (olaylar) => {
      const st = durum(olaylar);
      const etkin = [...st.values()].find((x) => !x.gecmis && x.durum !== "iptal" && x.modul === modul && x.dosya === `${x.surum}_${ad}.sql` && x.dal === dal);
      if (etkin) {
        sonuc = { surum: etkin.surum, dosya: etkin.dosya, mevcut: true };
        return null;
      }
      const bilinen = bilinenSurumler(cwd, olaylar, { refs, ek });
      const enBuyuk = [...bilinen].sort().at(-1);
      let v;
      if (surum) {
        if (!gecerliSurum(surum)) throw new DefterHatasi("GIRDI", `Geçersiz sürüm: ${surum}`);
        const s = st.get(surum);
        if (s?.durum === "iptal") throw new DefterHatasi("IPTAL", `${surum} iptal edilmiş bir numaradır; yeniden kullanılamaz.`);
        if (bilinen.has(surum)) throw new DefterHatasi("DOLU", `${surum} zaten kullanılıyor (defter / depo / production).`);
        if (enBuyuk && surum <= enBuyuk) throw new DefterHatasi("SIRA", `${surum} bilinen en büyük sürümden (${enBuyuk}) büyük olmalı.`);
        v = surum;
      } else v = sonraki(enBuyuk);
      sonuc = { surum: v, dosya: `${v}_${ad}.sql`, mevcut: false };
      return [{ v: 1, olay: "ayir", surum: v, dosya: `${v}_${ad}.sql`, modul, dal: dal ?? null, pr, zaman: new Date().toISOString(), kimlik: kimlik(cwd) }];
    },
    { cfg, log },
  );
  return { ...sonuc, deneme: r.deneme, commit: r.commit ?? null };
}

/** Ayrılmış sürüme durum olayı ekler (bagla / uygula / iptal). Sürüm etkin değilse ya da dosya uyuşmuyorsa RED. */
export function olayEkle(cwd, { olay, surum, dosya = null, dal = null, pr = null, sha256 = null, neden = null, cfg = DEFAULTS, log } = {}) {
  if (!["bagla", "uygula", "iptal"].includes(olay)) throw new DefterHatasi("GIRDI", `Bilinmeyen olay: ${olay}`);
  return ekle(
    cwd,
    (olaylar) => {
      const s = durum(olaylar).get(surum);
      if (!s) throw new DefterHatasi("YOK", `${surum} merkezi defterde ayrılmamış.`);
      if (s.durum === "iptal") throw new DefterHatasi("IPTAL", `${surum} iptal edilmiş.`);
      if (dosya && s.dosya !== dosya) throw new DefterHatasi("DOSYA", `${surum} '${s.dosya}' için ayrılmış; '${dosya}' bu numarayı kullanamaz.`);
      if (olay === "iptal" && s.durum === "uygulandi") throw new DefterHatasi("UYGULANMIS", `${surum} production'a uygulanmış; iptal edilemez.`);
      return [{ v: 1, olay, surum, dosya: s.dosya, dal, pr, sha256, neden, zaman: new Date().toISOString(), kimlik: kimlik(cwd) }];
    },
    { cfg, log },
  );
}

/** Defter dalının TÜM geçmişini doğrular: her commit yalnız satır EKLER (önek korunur) ve her ara durum tutarlıdır. */
export function gecmisiDogrula(cwd, tip, cfg = DEFAULTS) {
  const commits = git(cwd, ["rev-list", "--reverse", "--topo-order", tip]).out.split("\n").filter(Boolean);
  let onceki = "";
  for (const c of commits) {
    const parents = git(cwd, ["rev-list", "--parents", "-n", "1", c]).out.trim().split(" ").slice(1);
    if (parents.length > 1) throw new DefterHatasi("BIRLESTIRME", `Defter geçmişinde birleştirme commit'i var (${c.slice(0, 9)}); yalnız doğrusal ekleme kabul edilir.`);
    const t = git(cwd, ["show", `${c}:${cfg.file}`], { allowFail: true }).out;
    if (!t.startsWith(onceki)) throw new DefterHatasi("SILME", `Defter geçmişinde satır silinmiş/değiştirilmiş (${c.slice(0, 9)}).`);
    durum(ayristir(t));
    onceki = t;
  }
  return { commit: commits.length, olay: ayristir(onceki).length };
}

export function sha256Dosya(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/** Bir commit'teki migration blob'unun HAM içeriği ve SHA-256'sı (satır sonu dönüşümü YOK; Windows CRLF çalışma kopyasından bağımsız). */
export function blobIcerik(cwd, rev, dosya) {
  const r = spawnSync("git", ["show", `${rev}:supabase/migrations/${dosya}`], { cwd, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return { buf: r.stdout, sha256: crypto.createHash("sha256").update(r.stdout).digest("hex") };
}

export function depoKoku(cwd = process.cwd()) {
  return git(cwd, ["rev-parse", "--show-toplevel"]).out.trim();
}

export function yapilandirma(root) {
  const p = path.join(root, "scripts", "migrations", "numara", "yapilandirma.json");
  return { ...DEFAULTS, zorunlu: false, ...(fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {}) };
}
