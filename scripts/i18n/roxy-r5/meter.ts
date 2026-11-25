// R5 ROXY — ortak ÜCRETLİ ÇAĞRI SAYACI (Owner §26: toplam üst sınır 500, başarısız dahil).
//
// • Her HTTP isteği, ATILMADAN ÖNCE `SAYAC.jsonl` dosyasına {"tur":"istek"} satırı olarak yazılır; sonuç ayrı {"tur":"sonuc"} satırıdır.
// • Sert sınır: dosyadaki "istek" satırı sayısı ≥ OWNER_CAP (500) ya da bu koşunun --max değerine ulaşıldıysa istek ATILMAZ (hata fırlatır).
// • Yeniden deneme bu katmanda YOK; çağıranlar maxRetries: 0 verir.
// • Anahtar hiçbir satıra yazılmaz; URL'den yalnız yol + lang alınır. Sağlayıcı kota başlıkları (X-RateLimit-Used/Remaining)
//   faturalama gözlemi için kaydedilir (kota sayısı sır değildir).
import fs from "node:fs";
import path from "node:path";

export const OWNER_CAP = 500;
export const KANIT = process.env.R5_KANIT_DIR ?? "C:/YasamSistemi-Kanit/I18N-F1-R5-2026-11-25";
export const SAYAC = path.join(KANIT, "roxy", "SAYAC.jsonl");

export function countRequests(): number {
  if (!fs.existsSync(SAYAC)) return 0;
  return fs
    .readFileSync(SAYAC, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .filter((l) => {
      try {
        return JSON.parse(l).tur === "istek";
      } catch {
        return false;
      }
    }).length;
}

export type CallCtx = { modul: string; amac: string; kisi?: string };
let current: CallCtx = { modul: "?", amac: "?" };
export function setCtx(c: CallCtx): void {
  current = c;
}

let runMax = 0;
let runCalls = 0;
export function setRunMax(n: number): void {
  runMax = n;
}
export function runCallCount(): number {
  return runCalls;
}

export class BudgetError extends Error {}

function append(obj: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(SAYAC), { recursive: true });
  fs.appendFileSync(SAYAC, JSON.stringify(obj) + "\n");
}

/** Sayaçlı fetch — ürün istemcilerine `fetchImpl` olarak verilir. */
export const meteredFetch = async (input: string, init: RequestInit): Promise<Response> => {
  const total = countRequests();
  if (total >= OWNER_CAP) throw new BudgetError(`Owner üst sınırı doldu (${total}/${OWNER_CAP}) — istek ATILMADI`);
  if (runMax > 0 && runCalls >= runMax) throw new BudgetError(`koşu sınırı doldu (${runCalls}/${runMax}) — istek ATILMADI`);
  const u = new URL(input);
  const no = total + 1;
  runCalls++;
  append({
    tur: "istek",
    no,
    zaman: new Date().toISOString(),
    saglayici: "roxyapi",
    yontem: init.method ?? "GET",
    uc: u.pathname.replace(/^\/api\/v2/, ""),
    dil: u.searchParams.get("lang") ?? "(yok)",
    modul: current.modul,
    kisi: current.kisi ?? null,
    amac: current.amac,
  });
  const t0 = Date.now();
  try {
    const res = await fetch(input, init);
    append({
      tur: "sonuc",
      no,
      zaman: new Date().toISOString(),
      http: res.status,
      ms: Date.now() - t0,
      rlUsed: res.headers.get("x-ratelimit-used"),
      rlRemaining: res.headers.get("x-ratelimit-remaining"),
    });
    lastRate = { used: res.headers.get("x-ratelimit-used"), remaining: res.headers.get("x-ratelimit-remaining") };
    return res;
  } catch (e) {
    append({ tur: "sonuc", no, zaman: new Date().toISOString(), http: null, ms: Date.now() - t0, hata: e instanceof Error ? e.name : "bilinmeyen" });
    throw e;
  }
};

export let lastRate: { used: string | null; remaining: string | null } = { used: null, remaining: null };

/** Çıktı dosyalarında anahtar metni olmadığını programatik doğrular (anahtar yazdırılmaz). */
export function assertNoKeyIn(dir: string): { files: number; leaks: number } {
  const key = (process.env.ROXY_API_KEY ?? "").trim();
  let files = 0;
  let leaks = 0;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        files++;
        if (key && fs.readFileSync(p, "utf8").includes(key)) leaks++;
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return { files, leaks };
}

export function saveRaw(rel: string, data: unknown): string {
  const key = (process.env.ROXY_API_KEY ?? "").trim();
  const text = JSON.stringify(data, null, 1);
  if (key && text.includes(key)) throw new Error("yanıt anahtar metni içeriyor — kaydedilmedi");
  const p = path.join(KANIT, "roxy", "ham", rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
}

export function argMax(defaultMax: number): number {
  const a = process.argv.indexOf("--max");
  const n = a >= 0 ? Number(process.argv[a + 1]) : defaultMax;
  return Number.isInteger(n) && n > 0 ? Math.min(n, OWNER_CAP) : defaultMax;
}
