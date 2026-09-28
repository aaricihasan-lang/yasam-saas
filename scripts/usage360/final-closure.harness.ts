/**
 * USAGE360 NİHAİ KAPANIŞ — IP maskeleme + IP retention job + gizlilik metni kapısı (DB/ağ YOK).
 * Kapsam: IPv4/IPv6/mapped/liste/port/zone maskeleme (ham IP asla geri dönmez), admin
 * oturum/güvenlik route'larının maskeli dönüşü, retention job'larının varsayılan KAPALI olması,
 * owner onaylı gizlilik metninin birebir yer alması + yasaklı mutlak garanti/gözetim dili YOK.
 * Çalıştır: npx tsx scripts/usage360/final-closure.harness.ts
 */
import Module from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { maskIp, maskIpRows, MASKED_UNKNOWN } from "../../lib/security/maskIp";

const moduleWithResolve = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const origResolve = moduleWithResolve._resolveFilename;
moduleWithResolve._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return join(process.cwd(), "scripts/usage360/fixtures/server-only-stub.cjs");
  return origResolve.call(this, request, ...rest);
};

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let passed = 0, failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.error(`  ✗ ${label}`); }
}

console.log("\n[maskIp]");
ok(maskIp("185.12.34.56") === "185.12.xxx.xxx", "IPv4 → ilk iki oktet");
ok(maskIp(" 10.0.0.1 ") === "10.0.xxx.xxx", "boşluk kırpılır");
ok(maskIp("185.12.34.56:443") === "185.12.xxx.xxx", "IPv4:port");
ok(maskIp("185.12.34.56, 10.0.0.1") === "185.12.xxx.xxx", "XFF listesi → yalnız ilk adres");
ok(maskIp("::ffff:185.12.34.56") === "185.12.xxx.xxx", "IPv4-mapped IPv6");
ok(maskIp("2a02:4780:1:2::5") === "2a02:4780:xxxx::", "IPv6 kısaltılmış");
ok(maskIp("2A02:04780:0:0:0:0:0:1") === MASKED_UNKNOWN, "geçersiz hextet (5 hane) → gizli");
ok(maskIp("2001:0db8:0000:0000:0000:ff00:0042:8329") === "2001:db8:xxxx::", "IPv6 tam biçim, baştaki sıfırlar atılır");
ok(maskIp("::1") === "0:0:xxxx::", "IPv6 loopback");
ok(maskIp("fe80::1%eth0") === "fe80:0:xxxx::", "zone id atılır");
ok(maskIp("[2001:db8::7]:8080") === "2001:db8:xxxx::", "[v6]:port");
ok(maskIp(null) === null && maskIp(undefined) === null && maskIp("") === null && maskIp("  ") === null, "boş → null");
for (const bad of ["999.1.1.1", "abc", "1.2.3", "1:2:3", "1::2::3", "<script>", "185.12.34.56.7"]) {
  ok(maskIp(bad) === MASKED_UNKNOWN, `tanınmayan "${bad}" → gizli (ham değer dönmez)`);
}
const raws = ["185.12.34.56", "2a02:4780:1:2::5", "::ffff:203.0.113.9", "198.51.100.7, 10.1.1.1"];
ok(raws.every((r) => { const m = maskIp(r) ?? ""; return !m.includes("34.56") && !m.includes(":5") && !m.includes("113.9") && !m.includes("100.7"); }), "maskeli çıktı ham IP'nin gizli kısmını içermez");
const rows = maskIpRows([{ id: "a", ip_address: "185.12.34.56", city: "Konya" }, { id: "b", city: "İzmir" }]);
ok(rows[0].ip_address === "185.12.xxx.xxx" && rows[0].city === "Konya" && !("ip_address" in rows[1]) && rows[1].city === "İzmir", "maskIpRows yalnız ip_address alanını değiştirir");

console.log("\n[admin route'ları]");
for (const p of ["app/api/admin/users/[id]/security-events/route.ts", "app/api/admin/users/[id]/active-sessions/route.ts"]) {
  const s = read(p);
  ok(s.includes('from "@/lib/security/maskIp"'), `${p}: maskIp içe aktarılır`);
  const jsonCalls = s.slice(s.lastIndexOf("NextResponse.json({"));
  ok(/sessions:\s*maskIpRows\(/.test(jsonCalls), `${p}: sessions maskeli döner`);
}
ok(/events:\s*maskIpRows\(eventsData\)/.test(read("app/api/admin/users/[id]/security-events/route.ts")), "security-events: olaylar maskeli döner");

async function jobs(): Promise<void> {
const { isSecurityIpRetentionEnabled, SECURITY_IP_RETENTION_CRON } = await import("../../lib/inngest/functions/securityIpRetention");
const { isUsage360RetentionEnabled } = await import("../../lib/inngest/functions/usage360Retention");
console.log("\n[retention job'ları]");
ok(!isSecurityIpRetentionEnabled({}) && !isSecurityIpRetentionEnabled({ SECURITY_IP_RETENTION_ENABLED: "1" }) && isSecurityIpRetentionEnabled({ SECURITY_IP_RETENTION_ENABLED: "true" }), "IP retention yalnız tam \"true\" ile açılır (varsayılan KAPALI)");
ok(!isUsage360RetentionEnabled({}) && isUsage360RetentionEnabled({ USAGE360_RETENTION_ENABLED: "true" }), "Usage360 retention yalnız \"true\" ile açılır");
ok(SECURITY_IP_RETENTION_CRON === "41 4 * * *", "IP retention cron günlük 04:41 UTC");
const inngestRoute = read("app/api/inngest/route.ts");
ok(inngestRoute.includes("securityIpRetentionFunction,") && inngestRoute.includes("usage360RetentionFunction,"), "iki job Inngest'e kayıtlı");
const job = read("lib/inngest/functions/securityIpRetention.ts");
ok(job.includes('db.rpc("security_ip_retention_purge", { p_dry_run: false })') && !/ip_address/.test(job.replace(/\/\*[\s\S]*?\*\//g, "")), "job yalnız RPC çağırır; IP alanına dokunan/loglayan kod yok");
const mig = read("supabase/migrations/20270207000000_security_ip_retention.sql");
const migCode = mig.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
ok(!/\b(DROP|TRUNCATE|DELETE)\b/i.test(migCode) && /interval '90 days'/.test(migCode), "migration additive: DROP/TRUNCATE/DELETE yok; süre sabit 90 gün");
const manifest = JSON.parse(read("supabase/expected-manifest.json"));
ok(["security_ip_retention_purge", "usage360_expert_list", "usage360_expert_detail", "usage360_expert_timeline", "usage360_measurement_start"].every((n) => manifest.functions_no_client_execute.names.includes(n)), "yeni RPC'ler expected-manifest'te (istemci EXECUTE yok)");
}

function privacy(): void {
console.log("\n[gizlilik metni]");
const page = read("app/gizlilik-politikasi/page.tsx");
const flat = page.replace(/\s+/g, " ");
const OWNER = [
  "Hizmetin güvenliğinin sağlanması, performansının değerlendirilmesi ve hizmetlerin geliştirilmesi amacıyla; son oturum zamanı, cihaz/platform türü ve depolama miktarı gibi sınırlı teknik kullanım ve sistem istatistikleri işlenebilir.",
  "Bu istatistikler yalnızca sistemin kullanımına ilişkin teknik bilgilerden oluşur. Kullanıcı tarafından sisteme girilen danışan içerikleri, danışan bilgileri, anamnez kayıtları, notlar, rapor metinleri, form yanıtları, analiz içerikleri, protokoller, yüklenen belgeler ve uzman tarafından oluşturulan diğer mesleki veya kişisel içerikler kullanım istatistiği amacıyla görüntülenmez, analiz edilmez veya istatistik kayıtlarına aktarılmaz.",
  "Uzmanların sisteme girdikleri mesleki veriler ve danışan içerikleri diğer uzmanlar tarafından görüntülenemez. Yönetim panelinde uzmanların içerikleri görüntülenmez; yönetim tarafında yalnız hesap yönetimi, teknik sistem işlemleri ve kullanım istatistikleriyle sınırlı bilgiler bulunur.",
  "Yönetim tarafında görülebilen bilgiler; hesabın durumu, son oturum zamanı, işlem türlerinin sayıları, yaklaşık aktif kullanım süresi, cihaz/platform bilgileri, depolama miktarı ve benzeri teknik sistem istatistikleriyle sınırlıdır.",
  "Bu bilgiler, yapılan işlemin içeriğini değil, yalnızca sistem üzerinde bir işlem gerçekleştiğini gösterir.",
  "Yaşam Sistemi’nin temel veri gizliliği yaklaşımı; her uzmanın kendi çalışma alanındaki mesleki ve danışan verilerinin diğer uzmanlardan izole tutulması, kullanıcı içeriklerinin yönetimsel kullanım istatistiklerinden kesin olarak ayrılması ve sistem yönetiminin kullanıcı içeriklerinin rutin olarak görüntülenmesine dayanmamasıdır.",
];
OWNER.forEach((para, i) => ok(flat.includes(para), `owner metni paragraf ${i + 1} birebir`));
const lower = flat.toLocaleLowerCase("tr");
for (const banned of ["hiçbir koşulda", "hiçbir şekilde giremez", "hesabına giremez", "takip edilmektedir", "izlenmektedir"]) {
  ok(!lower.includes(banned), `yasaklı ifade yok: "${banned}"`);
}
ok(!/banner|popup|toast/i.test(page), "gizlilik sayfasında Usage360 popup/banner yok");
}

jobs().then(() => {
  privacy();
  console.log(`\n──────────\nUSAGE360 FINAL CLOSURE: PASS ${passed} · FAIL ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}).catch((e) => { console.error(e); process.exit(1); });
