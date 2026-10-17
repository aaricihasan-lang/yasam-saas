/**
 * HD canlı geri bildirim — Sistem Yorumu KAPILAR bölümü + tam ekran analizde TEK dikey scroll.
 *
 * Gerçek DB / Roxy / ağ YOK. Roxy verisi: repodaki kayıtlı örnek yanıt (scripts/hd-roxy/fixtures,
 * kişisel veri değil). Scroll kilidi: sahte document/window (jsdom yok).
 *
 * Çalıştırma: npx tsx scripts/hd-gates-scroll/harness.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

const netCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  netCalls.push(String(input));
  throw new Error("harness: ağ çağrısı yasak");
}) as typeof fetch;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
function section(t: string): void { console.log(`\n—— ${t}`); }

type Row = Record<string, unknown>;

async function main() {
  console.log("HD Kapılar bölümü + tek scroll harness'i (ağ/DB/Roxy YOK)");
  const SR = await import("../../lib/human-design/providers/roxy/systemReading");
  const SG = await import("../../lib/human-design/providers/roxy/systemReadingGates");
  const raw = JSON.parse(src("scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json")) as Row;
  const rawGates = raw.gates as Row[];

  // ══ 1. Kök neden: veri var mı? ══════════════════════════════════════════════
  section("1 — Kayıtlı Roxy yanıtında kapı açıklaması var mı, DTO taşıyor mu?");
  const uniqRaw = [...new Set(rawGates.map((g) => g.gate as number))];
  ok("1a Kayıtlı yanıt: 26 aktivasyon, 21 benzersiz kapı", rawGates.length === 26 && uniqRaw.length === 21);
  ok("1b Her aktivasyonda gateDescription dolu", rawGates.every((g) => typeof g.gateDescription === "string" && (g.gateDescription as string).length > 0));
  const perGate = new Map<number, Set<string>>();
  for (const g of rawGates) (perGate.get(g.gate as number) ?? perGate.set(g.gate as number, new Set()).get(g.gate as number)!).add(g.gateDescription as string);
  ok("1c gateDescription kapı düzeyinde (aynı kapının tüm aktivasyonlarında aynı metin)", [...perGate.values()].every((s) => s.size === 1));
  const dto = SR.extractSystemReading(raw)!;
  ok("1d DTO 26 aktivasyonu da gateDescription ile taşır (API bu DTO'yu aynen döndürür)", dto.activations.length === 26 && dto.activations.every((a) => !!a.gateDescription));

  // ══ 2. Gruplama ═════════════════════════════════════════════════════════════
  section("2 — Kapılar: benzersiz, 1→64, yalnız aktif kapılar, doğru metin");
  const gates = SG.groupSystemReadingGates(dto.activations);
  ok("2a 21 benzersiz aktif kapı → 21 kapı", gates.length === 21, String(gates.length));
  ok("2b Sayısal artan sıra", gates.every((g, i) => i === 0 || gates[i - 1]!.gate < g.gate), gates.map((g) => g.gate).join(","));
  ok("2c Yalnız haritadaki kapılar", gates.every((g) => uniqRaw.includes(g.gate)));
  ok("2d Her kapı tek açıklama = DTO'daki kapı açıklaması", gates.every((g) => g.descriptions.length === 1 && dto.activations.filter((a) => a.gate === g.gate).every((a) => a.gateDescription === g.descriptions[0])));
  const lineAndPlanet = new Set(dto.activations.flatMap((a) => [a.lineMeaning, a.planetDescription]).filter(Boolean) as string[]);
  ok("2e Çizgi ve gezegen metinleri kapı açıklaması olarak sunulmaz", gates.every((g) => g.descriptions.every((d) => !lineAndPlanet.has(d))));
  ok("2f Aktivasyon referansları korunur (toplam 26)", gates.reduce((n, g) => n + g.activations.length, 0) === 26);
  ok("2g Kapı adı Roxy'nin adı (kaynak ayrımı)", gates.every((g) => g.name === dto.activations.find((a) => a.gate === g.gate)?.gateName));

  // ══ 3. Uydurma yok ══════════════════════════════════════════════════════════
  section("3 — Açıklama yoksa uydurma yok");
  const noDesc = dto.activations.map((a) => (a.gate === gates[0]!.gate ? { ...a, gateDescription: null } : a));
  const g2 = SG.groupSystemReadingGates(noDesc);
  ok("3a Açıklaması olmayan kapı boş dizi döner", g2[0]!.descriptions.length === 0);
  const mixed = SG.groupSystemReadingGates([
    { side: "design", planet: "Ay", gate: 10, line: 1, gateName: null, gateDescription: "A", lineMeaning: "L1", planetDescription: "P1" },
    { side: "personality", planet: "Güneş", gate: 10, line: 4, gateName: "Ad", gateDescription: "B", lineMeaning: "L4", planetDescription: "P2" },
    { side: "design", planet: "Mars", gate: 99 as never, line: 1, gateName: "X", gateDescription: "X", lineMeaning: null, planetDescription: null },
  ]);
  ok("3b Farklı sağlayıcı metinleri ayrı ayrı korunur; geçersiz kapı (99) atlanır", mixed.length === 1 && mixed[0]!.descriptions.join("|") === "A|B" && mixed[0]!.name === "Ad");

  // ══ 4. Sunum ════════════════════════════════════════════════════════════════
  section("4 — Panel: Kapılar bölümü + mevcut bölümler korunur");
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { HdSystemReadingView } = await import("../../app/human-design/kayitli-haritalar/components/HdSystemReadingPanel");
  const html = renderToStaticMarkup(React.createElement(HdSystemReadingView, { data: dto }));
  ok("4a 'Kapılar (21)' bölümü var", html.includes("Kapılar (21)"));
  ok("4b 'Aktivasyonlar (26)' bölümü korunur ve Kapılar'dan SONRA gelir", html.includes("Aktivasyonlar (26)") && html.indexOf("Kapılar (21)") < html.indexOf("Aktivasyonlar (26)"));
  const order = [...html.matchAll(/data-hd-sr-gate="(\d+)"/g)].map((m) => Number(m[1]));
  ok("4c Her kapı bir kez, artan sırada", order.length === 21 && new Set(order).size === 21 && order.every((g, i) => i === 0 || order[i - 1]! < g), order.join(","));
  ok("4d Kapı başlığı '<n>. Kapı — <ad>' ve 'Açıklamayı göster'", html.includes(`${gates[0]!.gate}. Kapı`) && html.includes("Açıklamayı göster"));
  ok("4e Kapı bölümleri kapalı başlar (katlanır)", !/<details open=""[^>]*>\s*<summary[^>]*>\s*<span[^>]*>\s*<span[^>]*data-hd-sr-gate/.test(html));
  ok("4f Merkezler / Kanallar / Genel korunur", html.includes("Merkezler (") && html.includes("Kanallar (") && html.includes(">Genel<"));
  ok("4g Aktivasyonlar içindeki çizgi/gezegen alanları korunur", html.includes("Çizgi ") && html.includes("Gezegen"));
  const htmlEmpty = renderToStaticMarkup(React.createElement(HdSystemReadingView, { data: { ...dto, activations: noDesc } }));
  ok("4h Açıklamasız kapıda doğru boş durum metni", htmlEmpty.includes(SG.SYSTEM_READING_GATE_EMPTY) && (htmlEmpty.match(/data-hd-sr-gate-empty/g) ?? []).length === 1);
  const htmlNoAct = renderToStaticMarkup(React.createElement(HdSystemReadingView, { data: { ...dto, activations: [] } }));
  ok("4i Aktivasyon yoksa Kapılar bölümü hiç çizilmez", !htmlNoAct.includes("Kapılar ("));

  // ══ 5. Yetki / Roxy ════════════════════════════════════════════════════════
  section("5 — Yetki ve Roxy: değişiklik yok, yeni çağrı yok");
  const changed = execSync("git diff --name-only origin/main", { cwd: ROOT }).toString().trim().split(/\r?\n/).filter(Boolean);
  const untracked = execSync("git ls-files --others --exclude-standard", { cwd: ROOT }).toString().trim().split(/\r?\n/).filter(Boolean);
  const all = [...changed, ...untracked];
  // Kapılar bölümü SAF istemci türetmesidir: sistem yorumu DTO'su/ucu, Word/snapshot, motor ve yetki
  // dosyaları bu özellik için değişmemeli (dal kapsamından bağımsız, yalnız bu dosyalar).
  const gateScope = all.filter((f) => /providers\/roxy\/systemReading\.ts$|app\/api\/hd\/charts\/system-reading\/|reportSnapshot|wordReport|\/engine\/|modulePermissions|userGuard/.test(f));
  ok("5a Sistem yorumu DTO/ucu, Word/snapshot, motor ve yetki dosyaları değişmedi", gateScope.length === 0, gateScope.join(", "));
  const panel = src("app/human-design/kayitli-haritalar/components/HdSystemReadingPanel.tsx");
  ok("5b Panel yalnız kayıtlı-yorum ucunu çağırır (Roxy adresi yok)", /getChartSystemReading\(chartId\)/.test(panel) && !/roxyapi\.com|callRoxy/i.test(panel + src("lib/human-design/providers/roxy/systemReadingGates.ts")));
  ok("5c Kapılar türetmesi saf (fetch yok)", !/fetch\(/.test(src("lib/human-design/providers/roxy/systemReadingGates.ts")));

  // ══ 6. Scroll kilidi ════════════════════════════════════════════════════════
  section("6 — Tam ekran analiz: arka sayfa kilidi, tek scroll, güvenli temizlik");
  const g = globalThis as Row;
  const htmlStyle: Row = { overflow: "" };
  const bodyStyle: Row = { overflow: "auto" };
  const win = { scrollX: 0, scrollY: 640, scrollTo(x: number, y: number) { win.scrollX = x; win.scrollY = y; } };
  g.document = { documentElement: { style: htmlStyle }, body: { style: bodyStyle } };
  g.window = win;
  const L = await import("../../app/human-design/components/useHdBodyScrollLock");
  L.hdLockBodyScroll();
  ok("6a Açılınca html+body overflow hidden (arka sayfa kaymaz)", htmlStyle.overflow === "hidden" && bodyStyle.overflow === "hidden");
  L.hdLockBodyScroll(); // iç içe modal / Strict Mode ikinci mount
  L.hdUnlockBodyScroll();
  ok("6b İç içe/çift mount: bir kilit kalkınca hâlâ kilitli", htmlStyle.overflow === "hidden" && L.__hdScrollLockStateForTest().count === 1);
  win.scrollY = 0; // tarayıcı farkı simülasyonu
  L.hdUnlockBodyScroll();
  ok("6c Son kilit kalkınca ÖNCEKİ inline değerler geri gelir", htmlStyle.overflow === "" && bodyStyle.overflow === "auto");
  ok("6d Önceki kaydırma konumu geri verilir (640)", win.scrollY === 640);
  L.hdUnlockBodyScroll();
  ok("6e Fazladan kilit açma sayacı negatife düşürmez", L.__hdScrollLockStateForTest().count === 0 && bodyStyle.overflow === "auto");
  // React Strict Mode: mount → cleanup → mount → (kapanış) cleanup
  L.hdLockBodyScroll(); L.hdUnlockBodyScroll(); L.hdLockBodyScroll();
  ok("6f Strict Mode çift effect sonrası kilitli", htmlStyle.overflow === "hidden" && L.__hdScrollLockStateForTest().count === 1);
  L.hdUnlockBodyScroll();
  ok("6g Kapanış/unmount sonrası tamamen açık", htmlStyle.overflow === "" && !L.__hdScrollLockStateForTest().locked);

  const modal = src("app/human-design/kayitli-haritalar/components/HdComputedChartModal.tsx");
  const hookIdx = modal.indexOf("useHdBodyScrollLock();");
  const earlyReturnIdx = modal.indexOf('if (typeof document === "undefined") return null;');
  ok("6h Kilit, modal bileşeninde koşulsuz ve erken dönüşten ÖNCE çağrılır (hook kuralı)", hookIdx > 0 && earlyReturnIdx > hookIdx);
  ok("6i Tek scroll alanı: araç çubuğu flex-none, içerik min-h-0 flex-1 overflow-y-auto", /flex h-\[100dvh\] w-full flex-col/.test(modal) && /data-hd-toolbar/.test(modal) && /flex-none[^"]*border-b[^"]*bg-white[^"]*data-hd-toolbar|flex flex-none[^>]*data-hd-toolbar/.test(modal) && /min-h-0 flex-1 overflow-y-auto/.test(modal));
  ok("6j ESC/odak kancası değişmedi (useHdModalA11y aynen)", execSync("git diff --name-only origin/main -- app/human-design/components/useHdModalA11y.ts", { cwd: ROOT }).toString().trim() === "");
  // Mevcut (main'de izlenen) başka modal/diyalog dosyası değişmedi; yeni eklenen bileşenler hariç.
  const modifiedExisting = execSync("git diff --name-only --diff-filter=M origin/main", { cwd: ROOT }).toString().trim().split(/\r?\n/).filter(Boolean);
  // HdFullDeleteDialog: owner kararı 2026-10-17 (tek "Sil", iki onay) ile bilinçli değişti — kapsam dışı sayılmaz.
  const otherModals = modifiedExisting.filter((f) => /Modal|Dialog/.test(f) && !/HdComputedChartModal\.tsx$|HdFullDeleteDialog\.tsx$/.test(f));
  ok("6k Mevcut başka modal/diyalog dosyası değişmedi", otherModals.length === 0, otherModals.join(","));
  ok("6l Global CSS'e dokunulmadı", !changed.some((f) => /\.css$/.test(f)) && !untracked.some((f) => /^app\/.*\.css$|^styles\//.test(f)));

  ok("Z Harness boyunca dış ağ çağrısı 0", netCalls.length === 0, netCalls.join(","));
  console.log(`\nHD KAPILAR + SCROLL: ${pass} PASS / ${fail} FAIL`);
  if (fail) { for (const f of fails) console.log(` - ${f}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
