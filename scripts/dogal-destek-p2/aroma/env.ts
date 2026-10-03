/**
 * Doğal Destek P2 — AROMATERAPİ test ortamı (yalnız 127.0.0.1; PRODUCTION'A SIFIR TEMAS).
 *
 *  - scripts/anamnez/testEnv.ts (embedded-postgres + PostgREST shim) üzerine kurulur.
 *  - Şema: GERÇEK repo aroma migration'ları sırayla (yh_professional CDC dosyası hariç; ayrı
 *    olarak gerçek YH outbox + aktivasyon migration'ları ve CDC dosyasındaki YALNIZ iki aroma
 *    trigger'ı uygulanır) + YENİ 20271003100000 migration'ı.
 *  - RPC köprüsü: shim'in rpc yolu `select * from fn()` satırı döndürür (PostgREST'in jsonb
 *    skaler yanıtı ve PG DETAIL → `details` eşlemesi yok). Bu yüzden önüne küçük bir HTTP
 *    köprüsü konur: allowlist RPC'ler `SET ROLE service_role` ile gerçek fonksiyona gider,
 *    skaler JSON + {code,message,details,hint} hata döner; diğer her istek shim'e aktarılır.
 *  - timestamptz PostgREST biçiminde (ISO, mikro-saniye, ±HH:MM) döner → iyimser kilit
 *    token'ları prod'daki gibi birebir geri gönderilebilir.
 */
import http from "node:http";
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { startAnamnezTestEnv, seedAnamnez, type Seed, type TestEnv } from "../../anamnez/testEnv";

export const NEW_MIGRATION = "20271003100000_aromatherapy_owner_delete_taxa_preparations_claims.sql";
export const DELETE_RPCS = [
  "aromatherapy_delete_plant_taxon_with_audit",
  "aromatherapy_delete_preparation_with_audit",
  "aromatherapy_delete_claim_with_audit",
] as const;

/** PG metin çıktısı "2026-10-03 10:00:00.123456+00" → PostgREST "2026-10-03T10:00:00.123456+00:00". */
export function toPostgrestTimestamp(v: string): string {
  let s = v.replace(" ", "T");
  if (/[+-]\d\d$/.test(s)) s += ":00";
  return s;
}
// timestamptz (1184) — global pg tip ayrıştırıcısı (shim havuzu da aynı pg modülünü kullanır).
pg.types.setTypeParser(1184, toPostgrestTimestamp);

export const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

function aromaMigrations(): string[] {
  return readdirSync(path.join(process.cwd(), "supabase/migrations"))
    .filter((f) => /aromatherapy/i.test(f) && !/yh_professional/.test(f) && f !== NEW_MIGRATION)
    .sort();
}

/** CDC dosyasından YALNIZ aroma takson/preparat trigger ifadeleri (dosyanın tamamı numeroloji tablolarına da bağlanır). */
function aromaCdcTriggersSql(): string {
  const src = readMig("20261215000000_yh_professional_cohort_aroma_numeroloji_cdc.sql");
  const out: string[] = [];
  for (const t of ["aromatherapy_plant_taxa", "aromatherapy_preparations"]) {
    const drop = new RegExp(`DROP TRIGGER IF EXISTS yh_cdc_${t}_trg ON public\\.${t};`).exec(src);
    const create = new RegExp(`CREATE TRIGGER yh_cdc_${t}_trg[\\s\\S]*?;`).exec(src);
    if (!drop || !create) throw new Error(`CDC trigger ifadesi bulunamadı: ${t}`);
    out.push(drop[0], create[0]);
  }
  return out.join("\n");
}

export type BridgeState = { missingRpc: Set<string> };

export type AromaEnv = {
  env: TestEnv;
  seed: Seed;
  url: string;
  bridge: BridgeState;
  migrationsApplied: string[];
  cdcApplied: boolean;
  stop: () => Promise<void>;
};

export async function startAromaEnv(opts: { port: number; dirName: string }): Promise<AromaEnv> {
  const migs = aromaMigrations();
  const extraSql = migs.map(readMig);
  extraSql.push(readMig(NEW_MIGRATION));
  const env = await startAnamnezTestEnv({ port: opts.port, dirName: opts.dirName, extraSql });
  // Supabase varsayılan ACL emülasyonu: legacy oils/blends tablolarında migration'lar yalnız
  // anon/authenticated'tan REVOKE eder; service_role erişimi prod'da Supabase'in public şema
  // default privileges'ından gelir (embedded-postgres'te yok) → aynısı açıkça verilir.
  await env.su.query(`grant select, insert, update, delete on public.aromatherapy_oils, public.aromatherapy_blends to service_role`);

  // YH CDC: gerçek outbox + aktivasyon migration'ları + yalnız iki aroma trigger'ı (DELETE dahil).
  let cdcApplied = false;
  try {
    await env.su.query(readMig("20260815000000_yasam_hafizasi_outbox.sql"));
    await env.su.query(readMig("20260927000000_yh_source_activation_control.sql"));
    await env.su.query(aromaCdcTriggersSql());
    cdcApplied = true;
  } catch (e) {
    console.warn(`  (uyarı) YH CDC kurulamadı: ${(e as Error).message}`);
    try { await env.su.query("rollback"); } catch { /* */ }
  }

  const seed = await seedAnamnez(env.su);
  await env.su.query(
    `update public.users set module_permissions = '{"aromatherapy":true,"clients":true}'::jsonb where tenant_id = any($1::uuid[])`,
    [[seed.TA, seed.TB]],
  );

  const pool = new pg.Pool({ host: "127.0.0.1", port: opts.port, user: "postgres", password: "testpw", database: "postgres", max: 8 });
  const bridge: BridgeState = { missingRpc: new Set() };
  const allow = new Set<string>(DELETE_RPCS);
  const target = new URL(env.url);

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    const m = /^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/.exec(u.pathname);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "POST" && m && allow.has(m[1])) {
      const fn = m[1];
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      if (bridge.missingRpc.has(fn)) {
        return send(404, { code: "PGRST202", message: `Could not find the function public.${fn}`, details: null, hint: null });
      }
      const args = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
      const keys = Object.keys(args).filter((k) => /^[a-z_][a-z0-9_]*$/.test(k));
      const client = await pool.connect();
      try {
        await client.query("SET ROLE service_role");
        const r = await client.query(
          `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as v`,
          keys.map((k) => args[k]),
        );
        return send(200, r.rows[0]?.v ?? null);
      } catch (e) {
        const pe = e as { code?: string; message?: string; detail?: string; hint?: string };
        const status = pe.code === "42883" ? 404 : pe.code === "42501" ? 403 : 400;
        return send(status, { code: pe.code === "42883" ? "PGRST202" : pe.code ?? "XX000", message: pe.message ?? String(e), details: pe.detail ?? null, hint: pe.hint ?? null });
      } finally {
        try { await client.query("RESET ROLE"); } catch { /* */ }
        client.release();
      }
    }
    // Diğer her şey → shim.
    const fwd = http.request(
      { host: target.hostname, port: target.port, method: req.method, path: req.url, headers: req.headers },
      (up) => { res.writeHead(up.statusCode ?? 500, up.headers); up.pipe(res); },
    );
    fwd.on("error", (e) => send(502, { message: String(e) }));
    req.pipe(fwd);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  return {
    env,
    seed,
    url,
    bridge,
    migrationsApplied: [...migs, NEW_MIGRATION],
    cdcApplied,
    stop: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      await pool.end().catch(() => undefined);
      await env.stop();
    },
  };
}
