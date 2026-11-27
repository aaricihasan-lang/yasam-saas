// MERKEZİ MIGRATION NUMARASI DEFTERİ — çekirdek (Ağ yalnız `git fetch` / `git push`; DB YOK; sır YOK).
//
// Defter: uzak depoda AYRI dal (varsayılan `refs/heads/migration-rezervasyon`), tek dosya `rezervasyonlar.jsonl`, YALNIZ EKLEME.
// Her satır bir OLAY: gecmis | ayir | bagla | uygula | iptal. Durum olaylardan türetilir; satır silinmez / değiştirilmez.
//
// ATOMİKLİK (karşılaştır-ve-değiştir): 1) uzak uç işleme özgü geçici ref'e çekilir; 2) uç bu makinede daha önce doğrulanan
// uçtan ileri mi (geçmiş yeniden yazılmamış mı, dal silinmemiş mi) ve yeni commit'ler yalnız ekleme + geçerli durum geçişi mi
// denetlenir (bozuksa TAHSİS DURUR); 3) satır, O TAM içeriğe göre üretilir, `commit-tree -p <uç>` ile commit yapılır (çalışma
// ağacı / index'e dokunulmaz); 4) FORCE'SUZ push. Sunucu yalnız ileri-sarmayı kabul eder: arada başka bir yazım olduysa push
// reddedilir → yeniden oku, yeniden hesapla. Belirsiz sonuç (bağlantı push sırasında koptu) işlem kimliğiyle çözülür.
//
// YETKİ SINIRI (açıkça): deftere yazabilen = depoya push yetkisi olan kimlik. Defter olayları imzalı değildir; araç ve CI,
// her olayın BİÇİMİNİ ve DURUM GEÇİŞİNİ doğrular, ama "bu satırı kim yazdı" kriptografik olarak kanıtlanmaz. Bu yüzden dal için
// GitHub kural seti (silme + force push yasağı) etkinleştirmenin ön koşuludur; PR sahipliği CI'da GitHub olay verisiyle
// (değiştirilemez PR numarası / dal / depo) karşılaştırılır.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULTS = Object.freeze({ remote: "origin", ref: "refs/heads/migration-rezervasyon", file: "rezervasyonlar.jsonl" });
export const NAME_RE = /^(\d{14})_([a-z0-9_]+)(\.POSTDEPLOY)?\.sql$/;
export const SLUG_RE = /^[a-z0-9][a-z0-9_]{2,80}$/;
export const MODUL_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const SHA256_RE = /^[0-9a-f]{64}$/;
export const DEPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const OLAYLAR = new Set(["gecmis", "ayir", "bagla", "uygula", "iptal"]);

export class DefterHatasi extends Error {
  constructor(kod, mesaj) {
    super(mesaj);
    this.kod = kod;
  }
}
const uyu = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// ─── Git ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function git(cwd, args, { input, allowFail = false, env } = {}) {
  const r = spawnSync("git", args, { cwd, input, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !allowFail) throw new DefterHatasi("GIT", `git ${args[0]} başarısız: ${(r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" | ")}`);
  return { ok: r.status === 0, out: (r.stdout || "").replace(/\r\n/g, "\n"), err: (r.stderr || "").replace(/\r\n/g, "\n") };
}
const ham = (cwd, args) => spawnSync("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });

/** Uzak defter ucu (geçici ref; yük altında geçici hatalar yeniden denenir). Dönüş: { tip: sha|null, text }. tip=null → dal YOK. */
export function okuUzak(cwd, cfg = DEFAULTS, { deneme = Number(process.env.MIGRATION_NUMARA_OKUMA_DENEME) || 6 } = {}) {
  const tmp = `refs/migration-numara/okuma-${process.pid}-${crypto.randomUUID()}`;
  let f = null;
  for (let n = 1; n <= deneme; n++) {
    f = git(cwd, ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", cfg.remote, `+${cfg.ref}:${tmp}`], { allowFail: true });
    if (f.ok) break;
    if (n < deneme) uyu(100 * n + Math.floor(Math.random() * 200));
  }
  if (!f.ok) {
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

// ─── Ayrıştırma + durum makinesi (her olay biçim + geçiş kurallarıyla doğrulanır) ───────────────────────────────────────
export function ayristir(text) {
  const olaylar = [];
  text.split("\n").forEach((l, i) => {
    if (l.trim() === "") return;
    let o;
    try {
      o = JSON.parse(l);
    } catch {
      throw new DefterHatasi("BOZUK", `Defter satırı ${i + 1} geçerli JSON değil`);
    }
    if (!o || typeof o !== "object" || !OLAYLAR.has(o.olay) || typeof o.surum !== "string" || !/^\d{14}$/.test(o.surum)) throw new DefterHatasi("BOZUK", `Defter satırı ${i + 1} geçersiz (olay/sürüm)`);
    olaylar.push(o);
  });
  return olaylar;
}

const tamsayiPr = (v) => Number.isInteger(v) && v > 0 && v < 1e9;
/** Olaylardan sürüm başına durum. Geçersiz biçim ya da geçersiz durum geçişi → DefterHatasi (defter TUTARSIZ → tahsis durur). */
export function durum(olaylar) {
  const m = new Map();
  const hata = (o, m2) => {
    throw new DefterHatasi("GECIS", `Defter tutarsız (${o.surum} '${o.olay}'): ${m2}`);
  };
  for (const o of olaylar) {
    const cur = m.get(o.surum);
    if (o.olay === "gecmis") {
      if (cur) throw new DefterHatasi("CIFT", `Defter tutarsız: ${o.surum} iki kez işlenmiş`);
      if (!Array.isArray(o.dosyalar)) hata(o, "dosyalar listesi yok");
      m.set(o.surum, { surum: o.surum, gecmis: true, durum: "uygulandi", dosya: null, dosyalar: o.dosyalar, prod: o.prod === true, prodAd: o.prodAd ?? null, olaylar: [o] });
      continue;
    }
    if (o.olay === "ayir") {
      if (cur) throw new DefterHatasi("CIFT", `Defter tutarsız: ${o.surum} iki kez ayrılmış`);
      const nm = NAME_RE.exec(String(o.dosya ?? ""));
      if (!nm || nm[1] !== o.surum) hata(o, "dosya adı sürümle uyuşmuyor");
      if (!MODUL_RE.test(String(o.modul ?? ""))) hata(o, "modül geçersiz");
      m.set(o.surum, { surum: o.surum, gecmis: false, durum: "ayrildi", dosya: o.dosya, modul: o.modul, dal: o.dal ?? null, ayiranDal: o.dal ?? null, pr: null, depo: null, sha256: null, commit: null, zaman: o.zaman, kimlik: o.kimlik ?? null, islem: o.islem ?? null, olaylar: [o] });
      continue;
    }
    if (!cur) throw new DefterHatasi("SAHIPSIZ", `Defter tutarsız: ${o.surum} için ayırma olmadan '${o.olay}'`);
    if (cur.gecmis) hata(o, "geçmiş (tohum) sürümüne olay eklenemez");
    if (cur.durum === "iptal") throw new DefterHatasi("IPTAL_SONRASI", `Defter tutarsız: iptal edilmiş ${o.surum} için '${o.olay}'`);
    if (cur.durum === "uygulandi") throw new DefterHatasi("UYGULANMIS_SONRASI", `Defter tutarsız: uygulanmış ${o.surum} için '${o.olay}'`);
    if (o.olay === "bagla") {
      if (o.dosya !== cur.dosya) hata(o, "dosya adı ayırmadakinden farklı");
      if (!tamsayiPr(o.pr)) hata(o, "PR numarası geçersiz");
      if (!SHA256_RE.test(String(o.sha256 ?? ""))) hata(o, "SHA-256 geçersiz");
      if (!DEPO_RE.test(String(o.depo ?? ""))) hata(o, "depo kimliği geçersiz");
      if (typeof o.dal !== "string" || !o.dal) hata(o, "dal yok");
      // Sahiplik: ilk bağlamadan sonra PR / dal / depo DEĞİŞEMEZ — yalnız açık devir (devir:true + neden) ile; devir geçmişte görünür.
      if (cur.pr !== null && (o.pr !== cur.pr || o.dal !== cur.dal || o.depo !== cur.depo) && !(o.devir === true && typeof o.neden === "string" && o.neden.trim().length >= 5)) hata(o, `sahiplik değişikliği (PR #${cur.pr} ${cur.dal} → PR #${o.pr} ${o.dal}) yalnız açık devirle yapılabilir`);
      Object.assign(cur, { pr: o.pr, dal: o.dal, depo: o.depo, sha256: o.sha256, commit: o.commit ?? null, durum: "pr" });
    } else if (o.olay === "uygula") {
      if (cur.durum !== "pr") hata(o, "PR'a bağlanmadan uygulanamaz");
      if (o.sha256 !== cur.sha256) hata(o, "uygulanan içerik PR'a bağlanan içerikle aynı değil");
      if (typeof o.proje !== "string" || !o.proje) hata(o, "proje kimliği yok");
      cur.durum = "uygulandi";
      cur.proje = o.proje;
    } else if (o.olay === "iptal") {
      if (typeof o.neden !== "string" || o.neden.trim().length < 3) hata(o, "iptal nedeni zorunlu");
      cur.durum = "iptal";
    }
    cur.olaylar.push(o);
  }
  return m;
}

// ─── Doğrulanmış uç önbelleği + geçmiş doğrulaması ─────────────────────────────────────────────────────────────────────
export const onbellekRef = (cfg) => `refs/migration-numara/dogrulanmis/${crypto.createHash("sha1").update(`${cfg.remote}|${cfg.ref}`).digest("hex").slice(0, 16)}`;

/** `from` (doğrulanmış, null=boş) → `to` arasındaki her commit: tek ebeveyn, doğrusal, yalnız EKLEME, her ara durum geçerli. */
export function aralikDogrula(cwd, from, to, cfg = DEFAULTS) {
  const commits = git(cwd, ["rev-list", "--reverse", "--topo-order", from ? `${from}..${to}` : to]).out.split("\n").filter(Boolean);
  let onceki = from ? git(cwd, ["show", `${from}:${cfg.file}`], { allowFail: true }).out : "";
  let ebeveyn = from;
  for (const c of commits) {
    const parents = git(cwd, ["rev-list", "--parents", "-n", "1", c]).out.trim().split(" ").slice(1);
    if (parents.length > 1) throw new DefterHatasi("BIRLESTIRME", `Defter geçmişinde birleştirme commit'i var (${c.slice(0, 9)}).`);
    if ((parents[0] ?? null) !== ebeveyn) throw new DefterHatasi("DOGRUSAL_DEGIL", `Defter geçmişi doğrusal değil (${c.slice(0, 9)}).`);
    const t = git(cwd, ["show", `${c}:${cfg.file}`], { allowFail: true }).out;
    if (!t.startsWith(onceki)) throw new DefterHatasi("SILME", `Defter geçmişinde satır silinmiş/değiştirilmiş (${c.slice(0, 9)}).`);
    durum(ayristir(t));
    onceki = t;
    ebeveyn = c;
  }
  return { commit: commits.length, olay: ayristir(onceki).length };
}
export function gecmisiDogrula(cwd, tip, cfg = DEFAULTS) {
  return aralikDogrula(cwd, null, tip, cfg);
}

/**
 * Okunan ucu bu makinedeki son doğrulanmış uçla karşılaştırır. Dal silinmiş ya da geçmiş yeniden yazılmışsa DURUR (boş defterle
 * baştan başlayıp numaraları yeniden dağıtmak gibi felaketleri önler). Yeni commit'leri artımlı doğrular, önbelleği ilerletir.
 * `capa`: depoda (main) sabitlenmiş güvenilir defter commit'i — uç onu içermiyorsa geçmiş yeniden yazılmıştır.
 */
export function ucuDogrula(cwd, tip, cfg = DEFAULTS, { capa = null } = {}) {
  const ref = onbellekRef(cfg);
  const once = git(cwd, ["rev-parse", "--verify", "--quiet", ref], { allowFail: true }).out.trim() || null;
  if (!tip) {
    if (once || capa) throw new DefterHatasi("DEFTER_SILINDI", `Merkezi defter dalı uzakta YOK ama ${once ? `bu makine ${once.slice(0, 9)} ucunu doğruladı` : "depoda çapa commit'i var"}: dal silinmiş. Tahsis DURDURULDU (Owner'a bildirin).`);
    return null;
  }
  if (capa) {
    if (!git(cwd, ["cat-file", "-e", `${capa}^{commit}`], { allowFail: true }).ok) git(cwd, ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", cfg.remote, capa], { allowFail: true });
    if (!git(cwd, ["merge-base", "--is-ancestor", capa, tip], { allowFail: true }).ok) throw new DefterHatasi("CAPA", `Defter ucu güvenilir çapa commit'ini (${capa.slice(0, 9)}) içermiyor: geçmiş yeniden yazılmış. Tahsis DURDURULDU.`);
  }
  if (once && once !== tip) {
    const ileri = git(cwd, ["merge-base", "--is-ancestor", once, tip], { allowFail: true }).ok;
    if (!ileri) {
      // Okunan uç, önbellekteki ucun ATASI: aynı klasördeki başka bir süreç önbelleği daha yeni bir uca taşımış olabilir (eski
      // okuma) — ya da uzak defter GERİ SARILMIŞTIR. Ayırt etmek için çağıran yeniden okur (ESKI_UC); ısrar ederse geri sarmadır.
      if (git(cwd, ["merge-base", "--is-ancestor", tip, once], { allowFail: true }).ok) throw new DefterHatasi("ESKI_UC", `Okunan defter ucu (${tip.slice(0, 9)}) bu makinenin doğruladığı uçtan (${once.slice(0, 9)}) geride.`);
      throw new DefterHatasi("YENIDEN_YAZILDI", `Defter geçmişi yeniden yazılmış (bu makinenin doğruladığı ${once.slice(0, 9)} yeni uçta yok). Tahsis DURDURULDU.`);
    }
    aralikDogrula(cwd, once, tip, cfg);
  } else if (!once) aralikDogrula(cwd, null, tip, cfg);
  onbellekIlerlet(cwd, cfg, tip);
  return tip;
}
/** Doğrulanmış uç önbelleğini yalnız İLERİ taşır (karşılaştır-ve-değiştir; aynı klasördeki eşzamanlı süreçler geri almaz). */
export function onbellekIlerlet(cwd, cfg, yeni) {
  const ref = onbellekRef(cfg);
  for (let n = 0; n < 8; n++) {
    const cur = git(cwd, ["rev-parse", "--verify", "--quiet", ref], { allowFail: true }).out.trim();
    if (cur === yeni) return;
    if (cur && git(cwd, ["merge-base", "--is-ancestor", yeni, cur], { allowFail: true }).ok) return; // önbellek zaten ileride
    if (git(cwd, ["update-ref", ref, yeni, cur || "0000000000000000000000000000000000000000"], { allowFail: true }).ok) return;
  }
}

/** Uzak ucu çeker ve AYNI uç üzerinde tüm geçmişi (+ çapa) doğrular; metin o doğrulanmış commit'ten okunur (okuma/doğrulama arası yarış yok). */
export function dogrulanmisOku(cwd, cfg = DEFAULTS, { capa = null } = {}) {
  const { tip, text } = okuUzak(cwd, cfg);
  if (!tip) {
    if (capa) throw new DefterHatasi("DEFTER_SILINDI", "Merkezi defter dalı yok ama depoda çapa commit'i var: dal silinmiş.");
    return { tip: null, text: "" };
  }
  aralikDogrula(cwd, null, tip, cfg);
  if (capa) {
    if (!git(cwd, ["cat-file", "-e", `${capa}^{commit}`], { allowFail: true }).ok) git(cwd, ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", cfg.remote, capa], { allowFail: true });
    if (!git(cwd, ["merge-base", "--is-ancestor", capa, tip], { allowFail: true }).ok) throw new DefterHatasi("CAPA", `Defter ucu güvenilir çapa commit'ini (${capa.slice(0, 9)}) içermiyor: geçmiş yeniden yazılmış.`);
  }
  return { tip, text };
}

// ─── Numara hesaplama ──────────────────────────────────────────────────────────────────────────────────────────────────
export function gecerliSurum(v) {
  if (!/^\d{14}$/.test(v)) return false;
  const [y, mo, d, h, mi, s] = [v.slice(0, 4), v.slice(4, 6), v.slice(6, 8), v.slice(8, 10), v.slice(10, 12), v.slice(12, 14)].map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && dt.getUTCHours() === h && dt.getUTCMinutes() === mi && dt.getUTCSeconds() === s;
}
/** Bilinen en büyük sürümden sonraki ilk geçerli sürüm: bir sonraki tam dakika (…0100 adımı); gün dolarsa ertesi gün 000000. */
export function sonraki(enBuyuk) {
  if (!enBuyuk) throw new DefterHatasi("BOS", "Bilinen sürüm yok");
  const y = Number(enBuyuk.slice(0, 4)), mo = Number(enBuyuk.slice(4, 6)), d = Number(enBuyuk.slice(6, 8));
  const hms = Number(enBuyuk.slice(8, 14));
  let sec = Math.floor(hms / 10000) * 3600 + Math.floor((hms % 10000) / 100) * 60 + (hms % 100);
  sec = Math.floor(sec / 60) * 60 + 60;
  if (sec >= 86400) {
    const n = new Date(Date.UTC(y, mo - 1, d + 1));
    return `${n.getUTCFullYear()}${String(n.getUTCMonth() + 1).padStart(2, "0")}${String(n.getUTCDate()).padStart(2, "0")}000000`;
  }
  return `${enBuyuk.slice(0, 8)}${String(Math.floor(sec / 3600)).padStart(2, "0")}${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}00`;
}
/** Bilinen sürümler: defter (iptal DAHİL) + verilen ref'lerdeki migration dosyaları + ek liste (ör. production). */
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
/** Takma ad: kişisel ad / bilgisayar adı deftere YAZILMAZ; yalnız (user.name@makine) özetinin ilk 12 hanesi (aynı oturumu tanımaya yeter). */
export function kimlik(cwd) {
  const ham = `${git(cwd, ["config", "user.name"], { allowFail: true }).out.trim() || "bilinmiyor"}@${os.hostname()}`;
  return `oturum-${crypto.createHash("sha256").update(ham).digest("hex").slice(0, 12)}`;
}
/** origin URL'sinden "sahip/depo" (https / ssh / yerel yol). */
export function depoKimligi(cwd, remote = "origin") {
  const url = git(cwd, ["remote", "get-url", remote], { allowFail: true }).out.trim();
  const m = /[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(\.git)?\/?$/.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

// ─── Yazma (CAS) ───────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Uzak defterin ucuna `uret(olaylar, tip)` satırlarını EKLER (her denemede GÜNCEL içerikle yeniden çağrılır; null → yazma yok).
 * Force push YOK. `bosIzinli`: yalnız tohumlama boş/olmayan defterle başlayabilir; diğer işlemler tohumsuz defterde DURUR.
 */
export function ekle(cwd, uret, { cfg = DEFAULTS, denemeMax = Number(process.env.MIGRATION_NUMARA_DENEME) || 200, bekle = (n) => 20 + Math.floor(Math.random() * 60 * Math.min(n, 10)), islem = crypto.randomUUID(), log = () => {}, bosIzinli = false, capa = null } = {}) {
  let eskiUc = 0;
  for (let n = 1; n <= denemeMax; n++) {
    let okunan;
    try {
      okunan = okuUzak(cwd, cfg);
    } catch (e) {
      if (n === 1 || !(e instanceof DefterHatasi) || e.kod !== "AG") throw e;
      log(`deneme ${n}: defter okunamadı → yeniden`);
      uyu(bekle(n));
      continue;
    }
    const { tip, text } = okunan;
    try {
      ucuDogrula(cwd, tip, cfg, { capa }); // silinmiş / yeniden yazılmış / bozuk defter → DURUR
    } catch (e) {
      if (!(e instanceof DefterHatasi) || e.kod !== "ESKI_UC") throw e;
      if (++eskiUc > 8) throw new DefterHatasi("YENIDEN_YAZILDI", `Uzak defter, bu makinenin doğruladığı uçtan sürekli geride: geçmiş GERİ SARILMIŞ. Tahsis DURDURULDU. (${e.message})`);
      log(`deneme ${n}: eski uç okundu → yeniden`);
      uyu(bekle(n));
      continue;
    }
    eskiUc = 0;
    const olaylar = ayristir(text);
    if (!bosIzinli && !olaylar.some((o) => o.olay === "gecmis")) throw new DefterHatasi("TOHUMSUZ", "Merkezi defter tohumlanmamış (main + production geçmişi işlenmemiş). Numara verilemez; etkinleştirme adımlarına bakın.");
    const yazilmis = olaylar.filter((o) => o.islem === islem);
    if (yazilmis.length) return { tamam: true, olaylar: yazilmis, deneme: n, yeniden: true };
    durum(olaylar);
    const yeni = uret(olaylar, tip);
    if (!yeni) return { tamam: true, olaylar: [], deneme: n, yazilmadi: true };
    const satir = yeni.map((o) => JSON.stringify({ ...o, islem })).join("\n") + "\n";
    const icerik = (text && !text.endsWith("\n") ? text + "\n" : text) + satir;
    durum(ayristir(icerik)); // yeni içerik de geçerli durum geçişi olmalı
    const blob = git(cwd, ["hash-object", "-w", "--stdin"], { input: icerik }).out.trim();
    const agac = [];
    if (tip) for (const l of git(cwd, ["ls-tree", tip]).out.split("\n").filter(Boolean)) if (!l.endsWith(`\t${cfg.file}`)) agac.push(l);
    agac.push(`100644 blob ${blob}\t${cfg.file}`);
    const tree = git(cwd, ["mktree"], { input: agac.join("\n") + "\n" }).out.trim();
    const kim = { GIT_AUTHOR_NAME: "migration-numara", GIT_AUTHOR_EMAIL: "migration-numara@yerel", GIT_COMMITTER_NAME: "migration-numara", GIT_COMMITTER_EMAIL: "migration-numara@yerel" };
    const commit = git(cwd, ["commit-tree", tree, ...(tip ? ["-p", tip] : []), "-m", `migration-numara: ${yeni.map((o) => `${o.olay} ${o.surum}`).join(", ").slice(0, 200)}`], { env: kim }).out.trim();
    const p = git(cwd, ["push", "--quiet", "--porcelain", cfg.remote, `${commit}:${cfg.ref}`], { allowFail: true });
    // TEST ENJEKSİYONU (yalnız testler): push SUNUCUDA kabul edildikten sonra istemcinin hata görmesi (bağlantı koptu).
    const kopma = p.ok && process.env.MIGRATION_NUMARA_TEST_KOPMA === "1" && !globalThis.__mnKopmaYapildi;
    if (kopma) globalThis.__mnKopmaYapildi = true;
    if (p.ok && !kopma) {
      onbellekIlerlet(cwd, cfg, commit);
      return { tamam: true, olaylar: yeni.map((o) => ({ ...o, islem })), deneme: n, commit };
    }
    log(`deneme ${n}: ${kopma ? "bağlantı koptu (sonuç belirsiz)" : /rejected|non-fast-forward|fetch first|stale info|failed to update ref|cannot lock ref/i.test(p.out + p.err) ? "uç değişmiş (rakip yazdı)" : "push hatası"} → durum yeniden okunacak`);
    uyu(bekle(n));
  }
  throw new DefterHatasi("CEKISME", `Merkezi defter ${denemeMax} denemede güncellenemedi (yoğun eşzamanlı talep ya da ağ / sunucu sorunu). Hiçbir numara ayrılmadı; tekrar deneyin.`);
}

// ─── Üst düzey işlemler ────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Yeni numara ayırır. İdempotent: aynı (modül, ad, dal) için etkin ayırma varsa yeni numara verilmez, o döner.
 * `surum` verilirse yalnız o numara denenir (boş + bilinenlerin hepsinden büyük; iptal edilmişse RED).
 */
export function ayir(cwd, { modul, ad, dal, surum = null, refs = ["origin/main"], ek = [], cfg = DEFAULTS, log, capa = null } = {}) {
  if (!MODUL_RE.test(modul ?? "")) throw new DefterHatasi("GIRDI", "Modül adı geçersiz (küçük harf, rakam, tire; ör. atlas, uye-yonetimi)");
  if (!SLUG_RE.test(ad ?? "")) throw new DefterHatasi("GIRDI", "Migration adı geçersiz (küçük harf, rakam, alt çizgi; ör. astro_analysis_result_parts)");
  if (!dal || dal === "HEAD") throw new DefterHatasi("GIRDI", "Dal bilgisi yok (ayrık HEAD?) — bir çalışma dalında çalıştırın.");
  let sonuc = null;
  const r = ekle(
    cwd,
    (olaylar) => {
      const st = durum(olaylar);
      const etkin = [...st.values()].find((x) => !x.gecmis && x.durum !== "iptal" && x.modul === modul && x.dosya === `${x.surum}_${ad}.sql` && x.ayiranDal === dal);
      if (etkin) {
        sonuc = { surum: etkin.surum, dosya: etkin.dosya, mevcut: true, durum: etkin.durum };
        return null;
      }
      const bilinen = bilinenSurumler(cwd, olaylar, { refs, ek });
      const enBuyuk = [...bilinen].sort().at(-1);
      let v;
      if (surum) {
        if (!gecerliSurum(surum)) throw new DefterHatasi("GIRDI", `Geçersiz sürüm: ${surum}`);
        if (st.get(surum)?.durum === "iptal") throw new DefterHatasi("IPTAL", `${surum} iptal edilmiş bir numaradır; yeniden kullanılamaz.`);
        if (bilinen.has(surum)) throw new DefterHatasi("DOLU", `${surum} zaten kullanılıyor (defter / depo / production).`);
        if (enBuyuk && surum <= enBuyuk) throw new DefterHatasi("SIRA", `${surum} bilinen en büyük sürümden (${enBuyuk}) büyük olmalı.`);
        v = surum;
      } else v = sonraki(enBuyuk);
      sonuc = { surum: v, dosya: `${v}_${ad}.sql`, mevcut: false, durum: "ayrildi" };
      return [{ v: 2, olay: "ayir", surum: v, dosya: `${v}_${ad}.sql`, modul, dal, zaman: new Date().toISOString(), kimlik: kimlik(cwd) }];
    },
    { cfg, log, capa },
  );
  return { ...sonuc, deneme: r.deneme, commit: r.commit ?? null };
}

/** Durum olayı ekler (bagla / uygula / iptal). Biçim ve geçiş kuralları `durum()` tarafından zorlanır. */
export function olayEkle(cwd, { olay, surum, cfg = DEFAULTS, log, capa = null, ...alan } = {}) {
  if (!["bagla", "uygula", "iptal"].includes(olay)) throw new DefterHatasi("GIRDI", `Bilinmeyen olay: ${olay}`);
  return ekle(
    cwd,
    (olaylar) => {
      const s = durum(olaylar).get(surum);
      if (!s || s.gecmis) throw new DefterHatasi("YOK", `${surum} merkezi defterde ayrılmamış.`);
      if (s.durum === "iptal") throw new DefterHatasi("IPTAL", `${surum} iptal edilmiş.`);
      if (s.durum === "uygulandi") throw new DefterHatasi("UYGULANMIS", `${surum} production'a uygulanmış; yeni olay eklenemez.`);
      const temiz = Object.fromEntries(Object.entries(alan).filter(([, v]) => v !== null && v !== undefined));
      return [{ v: 2, olay, surum, dosya: s.dosya, ...temiz, zaman: new Date().toISOString(), kimlik: kimlik(cwd) }];
    },
    { cfg, log, capa },
  );
}

/** Bir commit'teki migration blob'unun HAM içeriği, SHA-256'sı ve git blob kimliği (satır sonu dönüşümü YOK). */
export function blobIcerik(cwd, rev, dosya) {
  // Yalnız normal dosya (100644/100755). Sembolik bağlantı (120000) / alt modül (160000) → içerik git'te değil: null.
  const ls = ham(cwd, ["ls-tree", rev, "--", `supabase/migrations/${dosya}`]);
  const mod = String(ls.stdout).split(/\s/)[0];
  if (ls.status !== 0 || !["100644", "100755"].includes(mod)) return null;
  const r = ham(cwd, ["show", `${rev}:supabase/migrations/${dosya}`]);
  if (r.status !== 0) return null;
  const id = ham(cwd, ["rev-parse", `${rev}:supabase/migrations/${dosya}`]);
  return { buf: r.stdout, sha256: crypto.createHash("sha256").update(r.stdout).digest("hex"), blob: String(id.stdout).trim() };
}
export function depoKoku(cwd = process.cwd()) {
  return git(cwd, ["rev-parse", "--show-toplevel"]).out.trim();
}
export function yapilandirma(root) {
  const p = path.join(root, "scripts", "migrations", "numara", "yapilandirma.json");
  return { ...DEFAULTS, zorunlu: false, capa: null, ...(fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {}) };
}
