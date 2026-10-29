/**
 * Klasik Numeroloji — ÜRÜN YOLU gerçek sağlayıcı uçtan uca doğrulaması.
 *
 * Gerçek servis + gerçek istemci + gerçek normalize/oracle + GEÇİCİ gömülü PG (production bağlantısı YOK).
 * Her HTTP denemesi runner.ts ile AYNI deftere (attempt → result, 1 kredi) yazılır; 500 tavanı burada da zorunlu.
 * Sentetik ad/tarih. Anahtar yalnız ROXY_API_KEY ortamından; loga yazılmaz.
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/e2e-real/real-service.ts
 */
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } from "../../anamnez/testEnv";

const ROOT = path.resolve(__dirname, "../../..");
{
  // `server-only` Next derleyicisi dışında boş modüle çözülür (routes.harness ile aynı yöntem; gerçek normalizer kullanılır).
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const OUT = "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29";
const LEDGER = path.join(OUT, "ledger.jsonl");
const CAP = 500;
const REAL_KEY = (process.env.ROXY_API_KEY ?? "").trim();

let pass = 0;
let fail = 0;
const ok = (c: boolean, label: string, detail?: unknown) => {
  if (c) {
    pass++;
    console.log(`✓ ${label}`);
  } else {
    fail++;
    console.log(`✗ ${label}${detail === undefined ? "" : `\n    ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
};

const attempts = () => (existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").split("\n").filter((l) => l.includes('"event":"attempt"')).length : 0);
function appendLedger(row: Record<string, unknown>): void {
  const fd = openSync(LEDGER, "a");
  try {
    writeSync(fd, JSON.stringify(row) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

let providerCalls = 0;
const callLog: string[] = [];
let caseTag = "e2e";
const realFetch = globalThis.fetch;
async function ledgerFetch(url: string, init: RequestInit): Promise<Response> {
  const n = attempts();
  if (n >= CAP) throw new Error(`TAVAN DOLDU ${n}/${CAP}`);
  const endpoint = `${init.method ?? "GET"} ${new URL(url).pathname.replace(/^\/api\/v2/, "").replace(/\/\d+$/, "/{n}")}`;
  const id = `e2e-${caseTag}-${providerCalls + 1}-${Date.now().toString(36)}`;
  providerCalls++;
  callLog.push(endpoint);
  appendLedger({ at: new Date().toISOString(), event: "attempt", id, endpoint, purpose: `ürün yolu uçtan uca: ${caseTag}`, credit: 1, totalAttempts: n + 1, remainingSession: CAP - n - 1 });
  let http: number | null = null;
  let kind = "ok";
  const rl: Record<string, string> = {};
  try {
    const res = await realFetch(url, init);
    http = res.status;
    for (const h of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
      const v = res.headers.get(h);
      if (v !== null) rl[h] = v;
    }
    if (!res.ok) kind = `http_${res.status}`;
    return res;
  } catch (e) {
    kind = e instanceof Error && e.name === "AbortError" ? "timeout" : "network";
    throw e;
  } finally {
    appendLedger({ at: new Date().toISOString(), event: "result", id, endpoint, http, kind, credit: 1, totalAttempts: n + 1, remainingSession: CAP - n - 1, rl });
  }
}

async function main(): Promise<void> {
  if (!REAL_KEY) throw new Error("ROXY_API_KEY yok");
  const before = attempts();
  console.log(`defter başlangıç: ${before}/${CAP}`);
  if (before + 20 > CAP) throw new Error("bütçe yetersiz");

  // Yerel/test dışı ağ kilidi: yalnız localhost + resmî sağlayıcı (ledgerFetch üzerinden).
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    throw new Error(`ağ kilidi: ${u.replace(/[?#].*$/, "")}`);
  }) as typeof fetch;

  const LEGACY = `create table if not exists public.numerology_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
      name text, surname text, birth_date text, analysis_data jsonb, created_at timestamptz default now());`;
  const MIGS = ["20270121000000_numerology_core_rls_lock.sql", "20271120000300_numerology_records_client_link.sql", "20271205000000_numerology_classic_core.sql"].map((f) =>
    readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"),
  );
  const env = await startAnamnezTestEnv({ port: 54597, dirName: `num-klasik-e2e-${Date.now()}`, extraSql: [LEGACY, ...MIGS] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  try {
    const su = env.su;
    const TA = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_NUMK_E2E')`, [TA]);
    // EN uğurlu ilişkiler kataloğu (QA özetinden, yalnız yerel test DB'sine)
    const lucky = JSON.parse(readFileSync(path.join(OUT, "lucky-gemstones.json"), "utf8")) as Record<string, { en: Record<string, unknown> }>;
    for (const [lp, v] of Object.entries(lucky)) {
      await su.query(`insert into public.numerology_classic_catalog(kind, number, lang, payload, spec_version) values ('lucky_association',$1,'en',$2,'numerology-openapi-2.0.0')`, [Number(lp), JSON.stringify(v.en)]);
    }

    const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const pc = await import("../../../lib/numeroloji-klasik/server/providerClient");
    const quota = await import("../../../lib/numeroloji-klasik/server/quota");
    const svc = await import("../../../lib/numeroloji-klasik/server/service");
    const repo = await import("../../../lib/numeroloji-klasik/server/repository");
    const bridge = await import("../../../lib/numeroloji-klasik/server/normalizerBridge");
    const input = await import("../../../lib/numeroloji-klasik/input");
    const report = await import("../../../lib/numeroloji-klasik/report/docx");

    const buckets = new Map<string, number>();
    const deps = {
      providerCallsEnabled: true,
      config: { apiKey: REAL_KEY, baseUrl: pc.CLASSIC_PROVIDER_BASE_URL },
      callProvider: (c: Parameters<typeof pc.callClassicEndpoint>[0], id: Parameters<typeof pc.callClassicEndpoint>[1], p: Parameters<typeof pc.callClassicEndpoint>[2], o: Parameters<typeof pc.callClassicEndpoint>[3]) =>
        pc.callClassicEndpoint(c, id, p, { ...o, fetchImpl: ledgerFetch }),
      normalize: bridge.defaultNormalize,
      verify: bridge.defaultVerify,
      rateLimit: async (scope: string, value: string, limit: number) => {
        const k = `${scope}:${value}`;
        const n = (buckets.get(k) ?? 0) + 1;
        buckets.set(k, n);
        return { allowed: n <= limit, retryAfterSec: 0 };
      },
      quotaState: new quota.ProviderQuotaState(),
      quotaFloor: 3000,
      cacheSecret: "zz-numk-e2e-secret",
    } as Parameters<typeof svc.computeClassicAnalysis>[2];
    const ctx = { db, tenantId: TA, userId: randomUUID(), isDemo: false, canLinkClients: false };
    const req = (body: unknown) => {
      const v = input.validateAnalysisRequest(body);
      if (!v.ok) throw new Error(`doğrulama: ${v.error}`);
      return v.value;
    };

    type View = { id: string; status: string; result: Record<string, unknown>; verification?: unknown };
    const run = async (tag: string, body: unknown) => {
      caseTag = tag;
      const c0 = providerCalls;
      const r = await svc.computeClassicAnalysis(ctx, req(body), deps);
      const calls = callLog.slice(c0);
      return { r, calls, n: providerCalls - c0, view: (r.body as { analysis?: View }).analysis };
    };
    const verStatuses = (o: unknown, acc: string[] = []): string[] => {
      if (o && typeof o === "object") {
        const rec = o as Record<string, unknown>;
        if (rec.verification && typeof rec.verification === "object" && typeof (rec.verification as { status?: unknown }).status === "string") acc.push((rec.verification as { status: string }).status);
        for (const v of Object.values(rec)) verStatuses(v, acc);
      }
      return acc;
    };

    // 1) Kişi — tüm teknikler, Türkçe karakterli ad
    const all = ["core", "bridge", "personal_day", "chaldean", "dual"];
    const p1 = await run("kisi-tumu", { kind: "person", title: "ZZ E2E Kişi", techniques: all, input: { fullName: "Işıl Çağrı Öztürk", birth: { year: 1990, month: 11, day: 29 } } });
    ok(p1.r.status === 200 || p1.r.status === 201, "kişi (tüm teknikler) gerçek sağlayıcıyla hesaplandı", p1.r);
    ok(p1.n === 4, `kişi: tam 4 sağlayıcı çağrısı (chart, bridge, personal-day, chaldean; dual türetildi) — gerçek ${p1.n}`, p1.calls);
    ok(!p1.calls.some((c) => c.includes("/dual")), "kişi: /dual çağrılmadı");
    ok(p1.view?.status === "complete", "kişi: kayıt durumu complete", p1.view?.status);
    const st1 = verStatuses(p1.view?.result);
    ok(st1.length > 10 && !st1.includes("mismatch"), `kişi: ${st1.length} doğrulama, uyuşmazlık yok`, st1.filter((s) => s !== "match"));
    const resultJson = JSON.stringify(p1.view ?? {});
    ok(!/roxy/i.test(resultJson), "kişi: uzman görünümünde sağlayıcı adı yok");
    ok(/luckyEn|gemstones/.test(resultJson), "kişi: uğurlu ilişkiler (TR + EN katalog) mevcut");

    // 2) Aynı istek → önbellek (0 çağrı)
    const p2 = await run("kisi-tekrar", { kind: "person", title: "ZZ E2E Kişi 2", techniques: all, input: { fullName: "Işıl Çağrı Öztürk", birth: { year: 1990, month: 11, day: 29 } } });
    ok(p2.n === 0, `aynı girdiyle yeniden hesap: 0 sağlayıcı çağrısı (önbellek) — gerçek ${p2.n}`, p2.calls);
    // jsonb anahtar sırasını değiştirir → kanonik (sıralı anahtar) karşılaştırma; ham metin farkı ayrıca raporlanır.
    const rawSame = JSON.stringify(p2.view?.result) === JSON.stringify(p1.view?.result);
    ok(input.canonicalJson(p2.view?.result) === input.canonicalJson(p1.view?.result), `önbellekten gelen sonuç ilkiyle içerikçe aynı (ham metin sırası ${rawSame ? "aynı" : "farklı: jsonb anahtar sırası"})`);

    // 3) Kayıtlı analizi yeniden açma → 0 çağrı
    const c3 = providerCalls;
    const g = await repo.getAnalysis(db, TA, p1.view!.id);
    ok(g.ok && providerCalls === c3, "kayıtlı analizi açma: 0 çağrı");

    // 4) Word raporu kayıtlı veriden → 0 çağrı
    if (g.ok) {
      const c4 = providerCalls;
      const buf = await report.buildPersonReport(report.toReportRecord(g.value), { variant: "full" });
      ok(buf.length > 5000 && providerCalls === c4, `Word (tam) kayıtlı veriden üretildi (${buf.length} bayt), 0 çağrı`);
      writeFileSync(path.join(OUT, "word-ornek", "e2e-gercek-kisi-tam.docx"), buf);
    }

    // 5) Usta sayı vakası (Life Path 11 hedefli) — çekirdek + Kalde
    const p5 = await run("kisi-usta", { kind: "person", title: "ZZ E2E Usta", techniques: ["core", "chaldean"], input: { fullName: "Deniz Ay", birth: { year: 1982, month: 11, day: 29 } } });
    ok(p5.n === 2 && p5.view?.status === "complete", `usta vaka: 2 çağrı, complete — gerçek ${p5.n}`, p5.calls);
    const st5 = verStatuses(p5.view?.result);
    ok(!st5.includes("mismatch"), `usta vaka: ${st5.length} doğrulama, uyuşmazlık yok`);

    // 6) İlişki
    const p6 = await run("iliski", { kind: "relationship", title: "ZZ E2E İlişki", input: { person1: { fullName: "Selin Kaya", birth: { year: 1988, month: 2, day: 29 } }, person2: { fullName: "Mert Şahin", birth: { year: 1985, month: 7, day: 14 } } } });
    ok(p6.n === 1 && p6.view?.status === "complete", `ilişki: 1 çağrı, complete — gerçek ${p6.n}`, p6.r);

    // 7) İşletme
    const p7 = await run("isletme", { kind: "business", title: "ZZ E2E İşletme", input: { name: "Yıldız Çiçekçilik" } });
    ok(p7.n === 1 && p7.view?.status === "complete", `işletme: 1 çağrı, complete — gerçek ${p7.n}`, p7.r);

    // 8) İsim adayları (2 aday)
    const p8 = await run("isimler", { kind: "names", title: "ZZ E2E İsimler", input: { candidates: ["Ece Naz", "Elif Su"] } });
    ok(p8.n === 2 && p8.view?.status === "complete", `isim adayları: aday başına 1 çağrı (2) — gerçek ${p8.n}`, p8.r);
    ok(!verStatuses(p8.view?.result).includes("mismatch"), "isim adayları: uyuşmazlık yok");

    // 9) Yerel ret: sesli harfsiz ad sağlayıcıya gitmez
    const c9 = providerCalls;
    const v9 = input.validateAnalysisRequest({ kind: "person", input: { fullName: "Brr Ttt", birth: { year: 1990, month: 1, day: 1 } } });
    ok(!v9.ok && providerCalls === c9, "sesli harfsiz ad yerelde reddedildi, 0 çağrı");

    const rows = (await su.query(`select count(*)::int n from public.numerology_classic_analyses where tenant_id = $1`, [TA])).rows[0].n as number;
    ok(rows === 6, `6 analiz kaydı yazıldı — gerçek ${rows}`);
    console.log(`\nsağlayıcı çağrısı (bu koşu): ${providerCalls} · defter: ${attempts()}/${CAP}`);
    writeFileSync(path.join(OUT, "e2e-gercek-sonuc.json"), JSON.stringify({ at: new Date().toISOString(), pass, fail, providerCalls, ledger: attempts(), calls: callLog }, null, 2));
  } finally {
    await env.stop();
  }
  console.log(`\nE2E GERÇEK: ${pass} ✓ / ${fail} ✗`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("e2e hatası:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
