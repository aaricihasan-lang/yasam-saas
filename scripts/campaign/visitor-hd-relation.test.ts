// KAMPANYA MERKEZİ — Gece operasyonu: HD İlişki Analizi (Connection) ziyaretçi çalıştırıcısı (DB/ağ YOK; KREDİ HARCANMAZ).
// Sahte sağlayıcı: BodyGraph = gerçek Roxy örnek yanıtı (doğum anına göre tasarım anı uyarlanır), Connection = uzman
// testlerinin şema-uyumlu sahte üreticisi (scripts/hd-relations/fakeRelationRoxy). Aynı UTC anı → aynı kapılar → tutarlı.
// Çalıştırma: npx tsx --tsconfig scripts/campaign/tsconfig.json scripts/campaign/visitor-hd-relation.test.ts
import fs from "node:fs";
import path from "node:path";
import { ReservationCallGuard } from "@/lib/campaign/quotaService";
import { VISITOR_RUNNERS, visitorRunnerFor } from "@/lib/campaign/visitor/runners";
import type { VisitorResult } from "@/lib/campaign/visitor/types";
import { consistentRoxyResponse } from "../hd-roxy/consistentFixture";
import { fakeConnectionResponse } from "../hd-relations/fakeRelationRoxy";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const ROOT = path.resolve(__dirname, "../..");
const NOW = new Date("2026-11-01T11:00:00Z");
const ENV = { ROXY_API_KEY: "zz-test-roxy-key-not-a-secret" } as Record<string, string>;
const BG = fs.readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8");

function fakeDb(opts: { denyAuthorize?: boolean } = {}) {
  const rpcs: string[] = [];
  let tables = 0;
  let id = 0;
  return {
    rpcs,
    tables: () => tables,
    db: {
      from: () => {
        tables++;
        throw new Error("tablo erişimi beklenmiyor");
      },
      rpc: async (fn: string) => {
        rpcs.push(fn);
        if (fn === "campaign_authorize_call") return opts.denyAuthorize ? { data: { ok: false, reason: "kampanya_kapali" }, error: null } : { data: { ok: true, call_id: ++id }, error: null };
        return { data: { ok: true, applied: false }, error: null };
      },
    },
  };
}
function fakeFetch(opts: { connection?: (body: { personA: never; personB: never }) => unknown; status?: number } = {}) {
  const calls: { path: string; body: unknown }[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, body });
    const h = { "content-type": "application/json", "x-ratelimit-limit": "50000", "x-ratelimit-remaining": "49000", "x-ratelimit-reset": "2500000" };
    if (u.pathname.endsWith("/human-design/bodygraph")) return new Response(consistentRoxyResponse(BG, init?.body), { status: 200, headers: h });
    if (u.pathname.endsWith("/human-design/connection")) {
      if (opts.status) return new Response("{}", { status: opts.status, headers: h });
      return new Response(JSON.stringify((opts.connection ?? ((b) => fakeConnectionResponse(b.personA, b.personB, { lang: "tr" })))(body)), { status: 200, headers: h });
    }
    return new Response("{}", { status: 404, headers: h });
  };
  return { fn, calls };
}
const ctx = (db: unknown, fetchImpl: unknown, over: Record<string, unknown> = {}) => ({
  db,
  guard: new ReservationCallGuard(db as never, "11111111-1111-4111-8111-111111111111", (over.max as number) ?? 3),
  commentsEnabled: false,
  hdOptions: { word: false, kb: true },
  env: ENV,
  now: NOW,
  fetchImpl,
  ...over,
});
type Runner = { parse: (i: Record<string, unknown>, n: Date) => { ok: true; value: never } | { ok: false; errors: Record<string, string> }; run: (c: unknown, v: never) => Promise<{ ok: true; result: VisitorResult } | { ok: false; code: string; message: string }> };
const R = VISITOR_RUNNERS.get("hd:connection") as unknown as Runner;
const yorum = (r: VisitorResult) => r.blocks.filter((b) => (b as { kind?: string }).kind === "yorum");
// Aynı UTC anı (İstanbul ve Ankara aynı saat dilimi) → aynı kapılar; konumlar farklı → iki ayrı kişi girdisi.
const IN = { birthDate: "2018-07-20", birthTime: "19:00", birthPlace: "tr-34-istanbul", birthDate2: "2018-07-20", birthTime2: "19:00", birthPlace2: "tr-06-ankara" };

(async () => {
  check("C00 hd:connection kayıtlı ve katalogda hazır", !!R && visitorRunnerFor("hd:connection") !== null);
  const v = R.parse(IN, NOW);
  check("C01 girdi doğrulanır", v.ok, v.ok ? "" : JSON.stringify(v.errors));
  if (!v.ok) return;
  const d = fakeDb();
  const f = fakeFetch();
  const out = await R.run(ctx(d.db, f.fn), v.value);
  check("C02 3 istek (2 BodyGraph + 1 Connection), hepsi kota yetkili, tablo erişimi yok", f.calls.length === 3 && d.rpcs.filter((x) => x === "campaign_authorize_call").length === 3 && d.tables() === 0, JSON.stringify(f.calls.map((c) => c.path)));
  check("C03 doğrulanmış birleşik sonuç: kanallar + merkezler + birleşik tanım", out.ok && out.result.blocks.some((b) => b.title === "Kanallar") && out.result.blocks.some((b) => b.title === "Merkezler"), out.ok ? "" : out.message);
  check("C04 yorum KAPALI → açıklama yok; dinamik tanımları veri olarak var", out.ok && yorum(out.result).length === 0 && !out.result.commentsShown && out.result.blocks.some((b) => b.title === "Dinamik türleri (tanım)"));
  const on = await R.run(ctx(fakeDb().db, fakeFetch().fn, { commentsEnabled: true }), v.value);
  check("C05 yorum AÇIK → sistem açıklamaları", on.ok && yorum(on.result).length > 0 && on.result.commentsShown);
  const conn = f.calls.find((c) => c.path.endsWith("/connection"))?.body as { personA?: { latitude: number }; personB?: { latitude: number } } | undefined;
  check("C06 connection isteği sunucuda çözülmüş konumla (istemci koordinatı yok)", !!conn?.personA && conn.personA.latitude === 41.0082 && conn.personB?.latitude === 39.9334);
  // Tutarsız sağlayıcı yanıtı → gösterilmez
  const bad = fakeFetch({ connection: (b) => { const r = fakeConnectionResponse(b.personA, b.personB, { lang: "tr" }) as unknown as { channels: { personAGates: number[] }[] }; if (r.channels[0]) r.channels[0].personAGates = [64]; return r; } });
  const badOut = await R.run(ctx(fakeDb().db, bad.fn), v.value);
  check("C07 bireysel haritalarla uyuşmayan connection sonucu GÖSTERİLMEZ", !badOut.ok);
  // Sağlayıcı hatası, yeniden deneme yok
  const e503 = fakeFetch({ status: 503 });
  const eOut = await R.run(ctx(fakeDb().db, e503.fn), v.value);
  check("C08 connection 503 → hata, connection yeniden denenmez", !eOut.ok && e503.calls.filter((c) => c.path.endsWith("/connection")).length === 1);
  // Kredi tavanı 2 → connection isteği ATILMAZ
  const cap = fakeFetch();
  const capOut = await R.run(ctx(fakeDb().db, cap.fn, { max: 2 }), v.value);
  check("C09 rezervasyon tavanı 2 → 3. (connection) istek ATILMAZ", !capOut.ok && cap.calls.length === 2 && !cap.calls.some((c) => c.path.endsWith("/connection")));
  // Kota yetkisi yoksa hiç istek yok
  const den = fakeFetch();
  const denOut = await R.run(ctx(fakeDb({ denyAuthorize: true }).db, den.fn), v.value);
  check("C10 kota yetkisi yok → istek ATILMAZ", !denOut.ok && den.calls.length === 0);
  // Girdi
  check("C11 iki kişinin bilgisi birebir aynıysa reddedilir", !R.parse({ ...IN, birthPlace2: "tr-34-istanbul" }, NOW).ok);
  check("C12 eksik ikinci kişi / bilinmeyen alan reddedilir", !R.parse({ ...IN, birthTime2: "" }, NOW).ok && !R.parse({ ...IN, clientId: "x" }, NOW).ok);
  const gap = R.parse({ ...IN, birthDate2: "2016-03-27", birthTime2: "01:30", birthPlace2: "gb-london" }, NOW);
  if (gap.ok) {
    const gf = fakeFetch();
    const go = await R.run(ctx(fakeDb().db, gf.fn), gap.value);
    check("C13 2. kişinin saati yaz saati boşluğunda → açık hata, 2. kişi için istek atılmaz", !go.ok && go.code === "girdi" && gf.calls.length === 1, go.ok ? "ok" : `${go.message} ${gf.calls.length}`);
  }
  check("C14 sonuçta kişisel kimlik / kayıt kimliği yok", out.ok && !/client_id|chart_id|[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(out.result)));
  console.log(`\nvisitor-hd-relation: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(`FAIL beklenmeyen hata — ${e?.stack ?? e}`);
  process.exit(1);
});
