/**
 * HD İlişki / Grup PROFESYONEL TAMAMLAMA — saf model / sahne / açıklama / rapor seçenekleri harness'i.
 *   A  Birleşik BodyGraph modeli: çizim = kayıtlı sonuç (birebir), yarım ≠ tam kanal, ortak kapılar, fallback
 *   B  Sahne: 36 kanal tabanı, tanımlı kanal katmanı = sonuç listesi, dinamik işaretleri, 64 kapı rozeti
 *   C  Penta sahnesi: 6 kanal, 12 kapı, üye etiketleri = heldBy, 3/4/5 kişi
 *   D  Analiz açıklamaları: adlar doğru, yasaklı iddia yok, Penta üye katkıları doğru kişide
 *   E  Rapor seçenekleri: varsayılan KAPALI; hazırlayan sınırı; yorum temizliği
 *   F  Sunucu PNG (resvg): Connection + Penta görseli üretilir; kaynak yoksa null (uydurma yok)
 *   G  Ekran/Word kaynak kodunda sağlayıcı adı yok
 * Çalıştır: npx tsx scripts/hd-relations/pro-harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
import { engineChart, fakeConnectionResponse, fakePentaResponse, PEOPLE } from "./fakeRelationRoxy";
import { validateRoxyConnection, connectionDynamicFor } from "../../lib/human-design/relations/connection";
import { validateRoxyPenta } from "../../lib/human-design/relations/penta";
import { buildCompositeModel } from "../../lib/human-design/relations/compositeModel";
import { buildConnectionBodygraphScene, CBG_CHANNEL_IDS, CBG_DYNAMIC_SHAPE, cbgStateFromModel } from "../../lib/human-design/relations/connectionBodygraphScene";
import { buildPentaScene, pentaGatePositions, pentaChannelLines } from "../../lib/human-design/relations/pentaScene";
import { connectionExplanations, pentaExplanations } from "../../lib/human-design/relations/explanations";
import { parseReportOptions, sanitizeComment } from "../../lib/human-design/relations/relationExtras";
import type { RelationAnalysisView } from "../../lib/human-design/relations/relationService";
import { CHANNELS } from "../../lib/human-design/engine/channels";

let pass = 0, fail = 0;
const fails: string[] = [];
const ok = (n: string, c: boolean, d?: unknown) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; fails.push(n); console.log(`  ✗ FAIL: ${n} ${d !== undefined ? JSON.stringify(d).slice(0, 500) : ""}`); } };
const section = (t: string) => console.log(`\n[${t}]`);
const gatesOf = (i: number) => [...new Set(engineChart(PEOPLE[i]).activations.map((a) => a.gate))];
const NAMES = ["Ayşe Yılmaz", "Mehmet Kaya", "Zeynep Demir", "Ali Çelik", "Elif Şahin", "Can Öztürk"];

async function main() {
  section("A — Birleşik BodyGraph modeli (tüm çiftler)");
  let pairs = 0, allEqual = true, halfOk = true, sharedOk = true, dynOk = true;
  const seenDyn = new Set<string>();
  for (let i = 0; i < PEOPLE.length; i++) for (let j = 0; j < PEOPLE.length; j++) {
    if (i === j) continue;
    pairs++;
    const v = validateRoxyConnection(fakeConnectionResponse(PEOPLE[i], PEOPLE[j]));
    if (!v.ok) { allEqual = false; continue; }
    const A = gatesOf(i), B = gatesOf(j);
    const m = buildCompositeModel(A, B, v.value);
    if (!m.ok) { allEqual = false; continue; }
    const drawn = Object.values(m.model.channels).filter((c) => c.state === "defined").map((c) => c.id).sort();
    if (drawn.join() !== v.value.channels.map((c) => c.id).sort().join()) allEqual = false;
    for (const ch of CHANNELS) {
      const st = m.model.channels[ch.id];
      const u = new Set([...A, ...B]);
      const n = [ch.gateA, ch.gateB].filter((g) => u.has(g)).length;
      if ((n === 1) !== (st.state === "half") || (n === 2) !== (st.state === "defined") || (n === 0) !== (st.state === "none")) halfOk = false;
      if (st.state === "defined") {
        seenDyn.add(st.dynamic);
        const pa = [ch.gateA, ch.gateB].filter((g) => A.includes(g)).length, pb = [ch.gateA, ch.gateB].filter((g) => B.includes(g)).length;
        if (connectionDynamicFor(pa, pb) !== st.dynamic) dynOk = false;
      }
    }
    for (let g = 1; g <= 64; g++) {
      const h = m.model.gates[g];
      const exp = A.includes(g) && B.includes(g) ? "both" : A.includes(g) ? "A" : B.includes(g) ? "B" : null;
      if (h !== exp) sharedOk = false;
    }
  }
  ok(`A1 ${pairs} çift: çizimde TANIMLI kanallar = kayıtlı sonuç listesi (birebir)`, allEqual);
  ok("A2 yarım kanal (tek kapı) ASLA tanımlı çizilmez; tanımlı = iki kapı; yok = sıfır", halfOk);
  ok("A3 kapı sahipliği: A / B / ortak / yok doğru", sharedOk);
  ok("A4 dinamikler OpenAPI kuralıyla tutarlı", dynOk);
  ok("A5 dört dinamiğin her biri en az bir çiftte görüldü", ["Electromagnetic", "Dominance", "Compromise", "Companionship"].every((d) => seenDyn.has(d)), [...seenDyn]);
  const v01 = validateRoxyConnection(fakeConnectionResponse(PEOPLE[0], PEOPLE[1]));
  if (!v01.ok) throw new Error("v01");
  ok("A6 kaynak bireysel aktivasyon yok (tarihsel kayıt) → model ÜRETİLMEZ (yedek şema)", !buildCompositeModel(null, gatesOf(1), v01.value).ok && !buildCompositeModel(gatesOf(0), null, v01.value).ok);
  const tampered = JSON.parse(JSON.stringify(v01.value));
  tampered.channels.pop();
  ok("A7 sonuç listesi kapılarla uyuşmazsa model ÜRETİLMEZ (uydurma çizim yok)", !buildCompositeModel(gatesOf(0), gatesOf(1), tampered).ok);
  const wrongPerson = buildCompositeModel(gatesOf(0), gatesOf(3), v01.value);
  ok("A8 başka kişinin kapılarıyla (karışma) model ÜRETİLMEZ", !wrongPerson.ok);

  section("B — Sahne (ekran ve Word aynı ilkeller)");
  const m01 = buildCompositeModel(gatesOf(0), gatesOf(1), v01.value);
  if (!m01.ok) throw new Error("m01");
  const sc = buildConnectionBodygraphScene(cbgStateFromModel(m01.model));
  const fills = sc.filter((p) => p.k === "fill") as Array<{ chs: string[] }>;
  const filledChs = new Set(fills.flatMap((f) => f.chs));
  const markers = sc.filter((p) => p.k === "marker") as Array<{ ch: string; shape: string }>;
  const definedIds = v01.value.channels.map((c) => c.id).sort().join();
  ok("B1 36 kanal borusu çizilir (30 tek boru + 5 ağ parçası; kenar / gövde / ışık katmanı)", sc.filter((p) => p.k === "pipe" && p.part === "edge").length === 35);
  ok("B2 işaretli (tanımlı) kanallar = kayıtlı sonuç listesi", markers.map((m) => m.ch).sort().join() === definedIds);
  ok("B3 boyalı kanallar yalnız tanımlı ya da yarım kanallar (boş kanal boyanmaz)", [...filledChs].every((c) => m01.model.channels[c].state !== "none"));
  ok("B4 dinamik işareti her tanımlı kanalda bir kez ve doğru şekilde", markers.length === v01.value.totalChannels && markers.every((mk) => { const c = v01.value.channels.find((x) => x.id === mk.ch)!; return CBG_DYNAMIC_SHAPE[c.dynamic] === mk.shape; }));
  ok("B5 64 kapı", sc.filter((p) => p.k === "gate").length === 64);
  ok("B6 yarım kanalda işaret yok (yarım ≠ tam)", markers.every((mk) => m01.model.channels[mk.ch].state === "defined"));
  ok("B7 etkileşim yüzeyi: 36 kanal güzergâhı", CBG_CHANNEL_IDS.length === 36);

  section("C — Penta sahnesi (3 / 4 / 5 kişi)");
  for (const n of [3, 4, 5]) {
    const v = validateRoxyPenta(fakePentaResponse(PEOPLE.slice(0, n)), n);
    if (!v.ok) { ok(`C0 ${n}`, false, v.errors); continue; }
    const s = buildPentaScene(v.value);
    const gateCircles = s.filter((p) => p.k === "circle" && typeof (p as { gate?: number }).gate === "number") as Array<{ gate: number }>;
    const lines = s.filter((p) => p.k === "polyline") as Array<{ ch: string; layer: string }>;
    const chans = [...new Set(lines.map((l) => l.ch))];
    const defined = [...new Set(lines.filter((l) => l.layer === "defined").map((l) => l.ch))].sort();
    ok(`C1 ${n} kişi: 12 kapı + 6 kanal; tanımlı çizgiler = defined kanallar`, gateCircles.length === 12 && chans.length === 6 && defined.join() === v.value.channels.filter((c) => c.defined).map((c) => c.id).sort().join());
    const texts = s.filter((p) => p.k === "text") as Array<{ text: string; x: number; y: number }>;
    const gp = pentaGatePositions();
    // Üye rozetleri: kapının sağında aynı satırda numaralar (1-tabanlı); taşıyan yoksa "boşluk".
    const labelOk = v.value.gates.every((g) => {
      const p = gp[g.gate];
      const row = texts.filter((t) => t.x > p.x + 10 && t.x < p.x + 110 && Math.abs(t.y - p.y) < 6).map((t) => t.text);
      return g.heldBy.length ? row.join(",") === g.heldBy.map((i) => String(i + 1)).join(",") : row.join() === "boşluk";
    });
    ok(`C2 ${n} kişi: her kapının üye etiketi heldBy ile aynı (1-tabanlı)`, labelOk);
  }
  ok("C3 Penta etkileşim yüzeyi 6 kanal", pentaChannelLines().length === 6);

  section("D — Analiz açıklamaları");
  const ex = connectionExplanations(v01.value, NAMES[0], NAMES[1]);
  const exText = JSON.stringify(ex);
  ok("D1 kişi adları metinde; A/B karışmaz (EM kanalında A'nın kapısı A'nın adıyla)", (() => {
    const em = v01.value.channels.find((c) => c.dynamic === "Electromagnetic");
    if (!em) return exText.includes(NAMES[0]) && exText.includes(NAMES[1]);
    const item = ex.flatMap((s) => s.items).find((it) => it.text.includes(`${NAMES[0]} ${em.personAGates[0]}. kapı`));
    return !!item;
  })());
  const forbidden = /%|yüzde|uyum puanı|evlilik|başarılı olacak|garanti eder|kesinlikle uyumlu|ruh eşi/i;
  ok("D2 yasaklı iddia (yüzde, puan, evlilik, garanti, ruh eşi) YOK", !forbidden.test(exText));
  const vp = validateRoxyPenta(fakePentaResponse(PEOPLE.slice(0, 4)), 4);
  if (!vp.ok) throw new Error("vp");
  const pe = pentaExplanations(vp.value, NAMES.slice(0, 4));
  const members = pe.find((s) => s.key === "members")!;
  ok("D3 Penta üye katkıları doğru kişide (heldBy)", members.items.every((it, i) => vp.value.gates.filter((g) => g.heldBy.includes(i)).every((g) => it.text.includes(`${g.gate}. kapı`))));
  ok("D4 Penta açıklamalarında yasaklı iddia yok + boşluk kapıları listelenir", !forbidden.test(JSON.stringify(pe)) && pe.find((s) => s.key === "gaps")!.items.length === Math.max(1, vp.value.summary.gapGates.length));

  section("E — Rapor seçenekleri ve yorum temizliği");
  const def = parseReportOptions({});
  ok("E1 varsayılan: tüm içerik seçimleri KAPALI", !("error" in def) && !def.analysis && !def.knowledge && !def.expertComment && def.preparedBy === null);
  const truthy = parseReportOptions({ sections: { analysis: "true", knowledge: 1, expert_comment: true } });
  ok("E2 yalnız gerçek true kabul edilir (\"true\"/1 → kapalı)", !("error" in truthy) && !truthy.analysis && !truthy.knowledge && truthy.expertComment);
  ok("E3 Raporu Hazırlayan ≤ 120 karakter", "error" in parseReportOptions({ prepared_by: "x".repeat(121) }) && !("error" in parseReportOptions({ prepared_by: "Uzm. Ayşe" })));
  ok("E4 yorum temizliği: kontrol karakterleri silinir, satırlar korunur", sanitizeComment("a\u0000b‮c\r\nd  \n") === "abc\nd");

  section("F — Sunucu PNG (resvg)");
  const { renderRelationImage } = await import("../../lib/human-design/relations/relationImages");
  const view = (kind: "connection" | "penta", result: unknown, gates: Array<number[] | null>): RelationAnalysisView => ({
    id: "x", kind, memberCount: gates.length, relationType: null, createdAt: "2026-10-17T00:00:00Z", result: result as never,
    participants: gates.map((g, i) => ({ position: i, clientId: null, name: NAMES[i], sourceChartId: null, status: "current", birthDate: null, birthTime: null, birthPlace: null, gates: g })),
  });
  const pngC = renderRelationImage(view("connection", v01.value, [gatesOf(0), gatesOf(1)]));
  ok("F1 Connection birleşik harita PNG üretilir", !!pngC && pngC.png.subarray(1, 4).toString() === "PNG" && pngC.width >= 1000);
  const pngR = renderRelationImage(view("connection", v01.value, [null, gatesOf(1)]));
  ok("F2 kaynak aktivasyon yoksa yalnız kayıtlı sonuçla çizilir (yarım kanalsız; tam çizimden farklı)", !!pngR && !!pngC && !pngR.png.equals(pngC.png));
  const pngP = renderRelationImage(view("penta", vp.value, [gatesOf(0), gatesOf(1), gatesOf(2), gatesOf(3)]));
  ok("F3 Penta şeması PNG üretilir", !!pngP && pngP.png.subarray(1, 4).toString() === "PNG");

  section("G — Kullanıcıya görünen sağlayıcı adı");
  const files = ["app/human-design/iliski-grup/components/HdRelationsContent.tsx", "app/human-design/iliski-grup/components/RelationResultViews.tsx", "app/human-design/iliski-grup/components/ConnectionBodygraph.tsx", "lib/human-design/relations/connectionBodygraphScene.ts", "app/human-design/iliski-grup/components/RelationWorkspace.tsx", "lib/human-design/relations/relationReport.ts", "lib/human-design/relations/labels.ts", "lib/human-design/relations/explanations.ts", "lib/human-design/relations/pentaScene.ts"];
  // Yalnız kullanıcıya ulaşabilen kod (yorum satırları / blokları ayıklanır).
  const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l) && !/^\s*import\s/.test(l)).join("\n");
  const leaks = files.filter((f) => /roxy|\/human-design\/(connection|penta)|nodeType|adapterVersion/i.test(codeOnly(readFileSync(f, "utf8"))));
  ok("G1 ekran + Word kodunda sağlayıcı adı / uç / nodeType / adaptör YOK", leaks.length === 0, leaks);

  console.log(`\nHD İLİŞKİ/GRUP PROFESYONEL: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
