/**
 * WT7 — toplu tam Word PERFORMANS ölçümü (gerçek route + gerçek Postgres; ZZ_ sentetik; prod'a SIFIR temas).
 *
 * Senaryolar: 1 / 3 / 10 / 50 / 100 (sınır) danışan; her danışan tekli raporun tüm bölümleri dolu.
 *   - "gerçekçi": danışan başına 1 analiz görseli (prod ölçümü: danışan başına en çok 1, ort. ~268 KB)
 *   - "ağır": danışan başına 3 analiz görseli × ~536 KB (prod'daki EN BÜYÜK görsel boyutu)
 * Ölçülen: süre, tepe RSS / heap artışı, DOCX boyutu, dosya açılıyor mu (zip + document.xml), tüm
 * danışanlar var mı (her birinin SON_i işareti), X-Report-Client-Count.
 * Çalıştır: npx tsx --expose-gc scripts/wt7/bulk-perf.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import zlib from "node:zlib";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY, startDyTestEnv, seedDyUser, seedRichClient, type DyUser } from "./dyTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const H = harness("wt7/bulk-perf");
const MB = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;

/**
 * ~target bayt, HER ÇAĞRIDA FARKLI geçerli PNG: gerçek PNG'nin IEND'inden önce CRC'si doğru bir ancillary
 * chunk (rastgele içerik) eklenir. Farklı bayt → docx görseli SHA1 ile tekilleştiremez (gerçekçi boyut).
 */
let pngSeq = 0;
function pngOfSize(base: Buffer, target: number): Buffer {
  const iend = base.length - 12;
  const pad = Math.max(16, target - base.length - 12);
  const type = Buffer.from("zzPd", "ascii"); // küçük harf → ancillary, okuyucular yok sayar
  const data = randomBytes(pad);
  data.writeUInt32BE(++pngSeq, 0);
  const len = Buffer.alloc(4); len.writeUInt32BE(pad, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([type, data])) >>> 0, 0);
  return Buffer.concat([base.subarray(0, iend), len, type, data, crc, base.subarray(iend)]);
}

function req(u: DyUser, body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/clients/word-report-bulk", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token },
    body: JSON.stringify(body),
  });
}

(async () => {
  const env = await startDyTestEnv({ port: 54494, dirName: "wt7-dy-perf-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  const rows: string[] = [];
  try {
    const bulk = await import("../../app/api/clients/word-report-bulk/route");
    const base = readFileSync(path.join(process.cwd(), "public/assets/biyoenerji-anasayfa.png"));
    const scenarios: { label: string; sizes: number[]; analyses: number; imgBytes: number }[] = [
      { label: "gerçekçi", sizes: [1, 3, 10, 50, 100], analyses: 1, imgBytes: 268_000 },
      { label: "ağır", sizes: [10, 50, 100], analyses: 3, imgBytes: 536_000 },
    ];
    let seq = 0;
    for (const sc of scenarios) {
      env.setStorageFile(() => pngOfSize(base, sc.imgBytes));
      for (const n of sc.sizes) {
        const U = await seedDyUser(su, `P${seq}`);
        const first = seq * 1000;
        for (let i = 0; i < n; i++) await seedRichClient(su, U.tenant, first + i, { analyses: sc.analyses, withImages: true, charges: ["paid", "unpaid", null] });
        seq++;
        (globalThis as { gc?: () => void }).gc?.();
        const rss0 = process.memoryUsage().rss;
        const heap0 = process.memoryUsage().heapUsed;
        let peakRss = rss0;
        let peakHeap = heap0;
        const timer = setInterval(() => {
          const m = process.memoryUsage();
          peakRss = Math.max(peakRss, m.rss);
          peakHeap = Math.max(peakHeap, m.heapUsed);
        }, 25);
        const t0 = Date.now();
        const res = await bulk.POST(req(U, { exportMode: "all" }));
        const buf = Buffer.from(await res.arrayBuffer());
        const ms = Date.now() - t0;
        clearInterval(timer);
        let opens = false;
        let present = 0;
        let mediaN = 0;
        try {
          const zip = await JSZip.loadAsync(buf);
          const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
          opens = xml.length > 0;
          for (let i = 0; i < n; i++) if (xml.includes(`SON_${first + i}_KESILMEDI`)) present++;
          const media = Object.keys(zip.files).filter((f) => /^word\/media\/.+\.png$/.test(f)).length;
          mediaN = media;
          rows.push(`${sc.label.padEnd(9)} n=${String(n).padStart(3)}  ${String(ms).padStart(6)} ms  docx ${String(MB(buf.length)).padStart(6)} MB  ΔRSS tepe ${String(MB(peakRss - rss0)).padStart(6)} MB  Δheap tepe ${String(MB(peakHeap - heap0)).padStart(6)} MB  görsel ${media}  danışan ${present}/${n}`);
        } catch (e) {
          rows.push(`${sc.label} n=${n} AÇILMADI: ${String(e).slice(0, 120)}`);
        }
        H.ok(res.status === 200 && res.headers.get("X-Report-Client-Count") === String(n), `${sc.label} n=${n}: 200 + sayaç ${n}`);
        H.ok(opens && present === n, `${sc.label} n=${n}: dosya açılıyor ve ${n}/${n} danışan TAM`);
        H.ok(mediaN >= n * sc.analyses, `${sc.label} n=${n}: tüm analiz görselleri gömülü (${mediaN} ≥ ${n * sc.analyses})`);
        H.ok(ms < 240_000, `${sc.label} n=${n}: süre < 240 sn (maxDuration 300)`);
        await su.query(`delete from clients where tenant_id=$1`, [U.tenant]);
      }
    }
  } catch (e) {
    H.ok(false, `beklenmeyen hata: ${String((e as Error)?.stack ?? e).slice(0, 600)}`);
  } finally {
    env.setStorageFile(null);
    console.log("\n── ölçüm ──");
    for (const r of rows) console.log(r);
    console.log(`storage GET: ${env.stats.storageGets}`);
    await env.stop();
  }
  H.done();
})();
