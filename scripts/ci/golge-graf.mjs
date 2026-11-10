/**
 * Akıllı CI F3 — gerçek bağımlılık grafiği (yalnız okuma; git geçmişini DEĞİŞTİRMEZ).
 *
 * Herhangi bir commit'in ağacı `git ls-tree` + `git cat-file --batch` ile okunur (çalışma dizinine dokunulmaz). Kaynak
 * dosyalardaki import / export-from / require / literal import() ifadeleri "@/" ve göreli yollarla çözülür. Ayrıca kodda
 * geçen depo yolu metinleri (ör. "supabase/migrations/…", path.join(ROOT, "app", "x")) ÖNEK bağımlılığı olarak kaydedilir.
 * Statik çözülemeyen erişim (değişkenli import/require, dizin tarama, `next build/start`, git ls-files …) dosyayı
 * GENİŞ işaretler: böyle bir testin etkisi daraltılamaz, her (belge dışı) öneride yer alır.
 * Bütün git çağrıları argüman dizisiyle yapılır (kabuk yok) → dosya adları komut olarak yorumlanamaz.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const KOD_UZANTI = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const COZUM_UZANTI = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];
const UST_DIZIN = "(?:app|lib|components|hooks|shared|supabase|messages|public|data|i18n|prisma|scripts|docs)";
const YOL_METNI = new RegExp(`(?<![A-Za-z0-9_\\-./])(${UST_DIZIN}/[A-Za-z0-9_\\-./\\[\\]()@+]*)`, "g");
const KOK_DOSYA = /(?<![A-Za-z0-9_\-./])([A-Za-z0-9_\-]+\.(?:json|md|sql|ts|mjs))(?![A-Za-z0-9_])/g;
const IMPORT_RE = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1/g,
  /\bimport\s*(['"])([^'"\n]+)\1/g,
  /\bimport\s*\(\s*(['"`])([^'"`$\n]+)\1\s*\)/g,
  /\brequire(?:\.resolve)?\s*\(\s*(['"`])([^'"`$\n]+)\1\s*\)/g,
];
const DINAMIK_RE = /(?<![\w$.])(?:import|require)\(\s*(?!['"`][^'"`$\n]*['"`]\s*\))[^)\s]/;
const GENIS_RE = /\breaddir(?:Sync)?\s*\(|\bopendir(?:Sync)?\s*\(|\bglob(?:Sync)?\s*\(|fast-glob|ls-files|["']grep["']|\bnext\s+(?:build|start|dev)\b|["']next["']\s*,\s*["'](?:build|start|dev)["']/;
/** Yorumları kaba biçimde çıkarır (yalnız geniş/dinamik taraması için; yol metni taraması yorumları da kapsar → ihtiyatlı). */
const yorumsuz = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\'"`])\/\/[^\n]*/g, "$1");

export function git(cwd, args, opts = {}) {
  return execFileSync("git", args, { cwd, encoding: opts.buffer ? undefined : "utf8", maxBuffer: 1 << 30, stdio: ["pipe", "pipe", "pipe"], ...opts });
}

/** sha'nın depoda tam commit olarak bulunup bulunmadığı. */
export function commitVar(cwd, sha) {
  if (!/^[0-9a-f]{7,64}$/i.test(String(sha ?? ""))) return false;
  try { git(cwd, ["cat-file", "-e", `${sha}^{commit}`]); return true; } catch { return false; }
}

/** Bir commit'in ağacını okur: { sha, files:Set, read(p) } — kod ve JSON dosyaları önceden yüklenir. */
export function agacOku(cwd, sha) {
  const listing = git(cwd, ["ls-tree", "-r", "-z", "--name-only", sha]).split("\0").filter(Boolean);
  const files = new Set(listing);
  const yuklenecek = listing.filter((f) => KOD_UZANTI.test(f) || f.endsWith(".json") && !f.startsWith("public/"));
  const icerik = new Map();
  for (let i = 0; i < yuklenecek.length; i += 2000) {
    const parca = yuklenecek.slice(i, i + 2000);
    const out = git(cwd, ["cat-file", "--batch"], { input: parca.map((f) => `${sha}:${f}`).join("\n") + "\n", buffer: true });
    let pos = 0;
    for (const f of parca) {
      const nl = out.indexOf(10, pos);
      const header = out.subarray(pos, nl).toString("utf8");
      pos = nl + 1;
      if (/ missing$/.test(header)) continue;
      const size = Number(header.split(" ")[2]);
      icerik.set(f, out.subarray(pos, pos + size).toString("utf8"));
      pos += size + 1;
    }
  }
  return { sha, files, read: (p) => icerik.get(p) ?? null };
}

function coz(agac, from, spec) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else if (spec === "server-only") return null;
  else return null; // paket: lockfile / package.json değişikliği zaten ALTYAPI → FULL
  if (base.startsWith("../")) return null;
  const aday = [base, ...COZUM_UZANTI.map((e) => base + e), ...COZUM_UZANTI.map((e) => `${base}/index${e}`)];
  if (/\.(m|c)?js$/.test(base)) for (const e of [".ts", ".tsx", ".mts", ".cts"]) aday.push(base.replace(/\.(m|c)?js$/, e));
  return aday.find((a) => agac.files.has(a)) ?? `?${base}`;
}

/** Tek dosyanın bağımlılıkları. */
function bagimliliklar(agac, f) {
  const src = agac.read(f);
  if (src == null) return { imports: [], cozulemeyen: [], onekler: [], genis: false };
  const imports = new Set();
  const cozulemeyen = new Set();
  for (const re of IMPORT_RE) for (const m of src.matchAll(re)) {
    const r = coz(agac, f, m[2]);
    if (r == null) continue;
    if (r.startsWith("?")) cozulemeyen.add(r.slice(1)); else imports.add(r);
  }
  const onekler = new Set();
  for (const m of src.matchAll(YOL_METNI)) onekler.add(m[1].replace(/[./]+$/, ""));
  for (const m of src.matchAll(/\b(?:join|resolve)\s*\(([^()]*)\)/g)) {
    const parcalar = [...m[1].matchAll(/(['"])([^'"\n]*)\1/g)].map((x) => x[2]).filter(Boolean);
    const y = path.posix.normalize(parcalar.join("/")).replace(/^\.\//, "").replace(/[./]+$/, "");
    if (new RegExp(`^${UST_DIZIN}(/|$)`).test(y)) onekler.add(y);
  }
  for (const m of src.matchAll(KOK_DOSYA)) if (agac.files.has(m[1])) onekler.add(m[1]);
  const kod = yorumsuz(src);
  const genis = DINAMIK_RE.test(kod) || GENIS_RE.test(kod);
  return { imports: [...imports], cozulemeyen: [...cozulemeyen], onekler: [...onekler].filter(Boolean), genis };
}

/** Grafik: kök dosyalardan geçişli kapanış (dosyalar + önekler + geniş işaret). */
export function grafKur(agac) {
  const cache = new Map();
  const dep = (f) => { if (!cache.has(f)) cache.set(f, bagimliliklar(agac, f)); return cache.get(f); };
  const kapanis = (kok) => {
    const files = new Set();
    const onekler = new Set();
    const cozulemeyen = new Set();
    const genisNedeni = [];
    const yigin = [kok];
    while (yigin.length) {
      const f = yigin.pop();
      if (files.has(f)) continue;
      files.add(f);
      if (!agac.files.has(f)) continue;
      const d = dep(f);
      d.onekler.forEach((o) => onekler.add(o));
      d.cozulemeyen.forEach((c) => cozulemeyen.add(c));
      if (d.genis) genisNedeni.push(f);
      for (const i of d.imports) if (!files.has(i)) yigin.push(i);
    }
    return { files, onekler, cozulemeyen, genis: genisNedeni.length > 0, genisNedeni: genisNedeni.sort() };
  };
  return { agac, kapanis };
}

/** Bir yol, verilen kapanış tarafından kullanılıyor mu? (dosya, önek eşleşmesi veya çözülemeyen eski yol) */
export function kullaniyorMu(k, p) {
  if (k.files.has(p)) return true;
  for (const c of k.cozulemeyen) if (p === c || p.startsWith(c + ".") || p.startsWith(c + "/")) return true;
  for (const o of k.onekler) if (p === o || p.startsWith(o + "/") || p.startsWith(o + ".") || (o.length > 3 && p.startsWith(o))) return true;
  return false;
}
