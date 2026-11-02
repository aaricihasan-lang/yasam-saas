/**
 * D3 — Human Design demo örneği için TEK SEFERLİK RoxyAPI kaydı (owner onayı 2026-11-02: en fazla 12 çağrı).
 *
 *   npx tsx --tsconfig scripts/tsconfig.demo-vitrin-tests.json scripts/hd-demo/record-roxy-once.ts --confirm-12-calls --out <depo dışı yol>
 *
 * • Anahtar yalnız ortamdan / yerel .env.local'dan (ROXY_API_KEY) okunur; ekrana, dosyaya, loga YAZILMAZ.
 * • Çağrılar ÜRETİMİN kendi istemcileriyle yapılır (callRoxyBodygraph / callRoxyVariables / callRoxyConnection / callRoxyPenta),
 *   gövde üretimdeki kayıtlı-analiz girdisiyle aynı alanlardır (doğum anı + koordinat + nodeType; ad / iletişim yok).
 * • Sıra: 5 × BodyGraph → 5 × Variables → 1 × Connection → 1 × Penta = 12. İlk hatada DURUR (yeniden deneme yok → fazla kredi yok).
 * • Kayıt dosyası varsa hiç çağrı yapmaz (yanlışlıkla ikinci harcama yok).
 * • Demo hesabı çalışırken bu betik ve Roxy KULLANILMAZ; çıktı yalnız build-demo-fixture.ts'in girdisidir.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readRoxyServerConfig, ROXY_POLICY, ROXY_BODYGRAPH_ENDPOINT, ROXY_CONNECTION_ENDPOINT, ROXY_PENTA_ENDPOINT } from "@/lib/human-design/providers/roxy/config";
import { callRoxyBodygraph, type RoxyCallResult } from "@/lib/human-design/providers/roxy/client";
import { callRoxyConnection, callRoxyPenta, type RoxyBirthMoment } from "@/lib/human-design/providers/roxy/relationClient";
import { callRoxyVariables, ROXY_VARIABLES_ENDPOINT } from "@/lib/human-design/variables/roxyVariablesClient";
import { getTrDistrictRecord } from "@/lib/human-design/location/trDistricts";
import { DEMO_CONNECTION, DEMO_PENTA, DEMO_PEOPLE } from "./demoPeople";

// Ham yanıt (sağlayıcı açıklama metinleri dahil) DEPO DIŞINA yazılır: --out <yol> zorunlu. Depoya yalnız metinsiz yapısal kayıt girer
// (build-demo-fixture.ts --from-raw <yol> üretir). Lisanslı metinler herkese açık depoya / demoya konmaz.
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? resolve(process.argv[outArg + 1]) : "";
const MAX_CALLS = 12;

function loadEnvLocal(): void {
  if (process.env.ROXY_API_KEY) return;
  const p = resolve(__dirname, "../../.env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*(ROXY_API_KEY|ROXY_API_BASE_URL)\s*=\s*(.*)\s*$/.exec(line);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function demoBirthMoment(key: string): RoxyBirthMoment {
  const p = DEMO_PEOPLE.find((x) => x.key === key);
  if (!p) throw new Error(`bilinmeyen kişi ${key}`);
  const d = getTrDistrictRecord(p.districtId);
  if (!d || d.durum !== "dogrulandi") throw new Error(`${p.key}: ilçe kaydı yok / doğrulanmamış`);
  return { date: p.date, time: `${p.time}:00`, timezone: d.tz, latitude: d.lat, longitude: d.lon, nodeType: ROXY_POLICY.nodeType };
}

type Entry = { label: string; endpoint: string; request: unknown; raw: unknown };

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm-12-calls")) throw new Error("Ücretli çağrı onayı bayrağı yok (--confirm-12-calls).");
  if (!OUT || OUT.startsWith(resolve(__dirname, "../.."))) throw new Error("--out depo DIŞINDA bir yol olmalı (ham metinler depoya girmez).");
  if (existsSync(OUT)) throw new Error("Kayıt dosyası zaten var — ikinci harcama yapılmaz.");
  loadEnvLocal();
  const config = readRoxyServerConfig();
  if (!config) throw new Error("ROXY_API_KEY bulunamadı (ortam ya da .env.local).");
  const opts = { lang: ROXY_POLICY.lang, timeoutMs: 30_000 };
  const entries: Entry[] = [];
  let calls = 0;
  const run = async (label: string, endpoint: string, request: unknown, fn: () => Promise<RoxyCallResult>) => {
    if (calls >= MAX_CALLS) throw new Error("çağrı üst sınırı aşılacaktı — durduruldu");
    calls += 1;
    const r = await fn();
    console.log(`${calls}/${MAX_CALLS} ${label}: ${r.ok ? "OK" : `HATA ${r.kind} ${r.status ?? ""}`}`);
    if (!r.ok) {
      writeFileSync(`${OUT}.partial`, JSON.stringify({ calls, entries }, null, 1));
      throw new Error(`${label} başarısız — durduruldu (yeniden deneme yok). Kısmi kayıt: <out>.partial`);
    }
    entries.push({ label, endpoint, request, raw: r.raw });
  };
  for (const p of DEMO_PEOPLE) {
    const m = demoBirthMoment(p.key);
    await run(`bodygraph ${p.key}`, ROXY_BODYGRAPH_ENDPOINT, m, () => callRoxyBodygraph(config, m, opts));
  }
  for (const p of DEMO_PEOPLE) {
    const m = demoBirthMoment(p.key);
    const body = { ...m, nodeType: ROXY_POLICY.nodeType };
    await run(`variables ${p.key}`, ROXY_VARIABLES_ENDPOINT, body, () => callRoxyVariables(config, body, opts));
  }
  const conn = { personA: demoBirthMoment(DEMO_CONNECTION[0]), personB: demoBirthMoment(DEMO_CONNECTION[1]) };
  await run(`connection ${DEMO_CONNECTION.join("+")}`, ROXY_CONNECTION_ENDPOINT, conn, () => callRoxyConnection(config, conn, opts));
  const penta = { members: DEMO_PENTA.map(demoBirthMoment) };
  await run(`penta ${DEMO_PENTA.join("+")}`, ROXY_PENTA_ENDPOINT, penta, () => callRoxyPenta(config, penta, opts));
  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        note: "D3 Human Design demo — SENTETİK kişiler için TEK SEFERLİK gerçek RoxyAPI yanıtları (owner onayı 2026-11-02, 12 çağrı). Elle düzenlemeyin; build-demo-fixture.ts girdisi.",
        recordedAt: new Date().toISOString(),
        lang: ROXY_POLICY.lang,
        nodeType: ROXY_POLICY.nodeType,
        calls,
        entries,
      },
      null,
      1,
    )}\n`,
  );
  console.log(`Kaydedildi: ${calls} çağrı → ${OUT}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
