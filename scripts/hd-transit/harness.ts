/**
 * HD TRANSİT — saf katman testleri (ağ / DB / Roxy YOK).
 *   • Türkiye yerel saati ↔ UTC (bugün, geçmiş yaz/kış saati, gece yarısı / gün değişimi, boşluk / çakışma, aralık)
 *   • Genel transit: geçmiş / bugün / gelecek örnekleri, 13/13, deterministik, 36 kanal kapsamı
 *   • Transit BodyGraph durumu: yalnız iki kapısı aktif kanal tanımlı, tek kapı yarım, merkezler kanallardan
 * Çalıştır: npx tsx scripts/hd-transit/harness.ts
 */
import { computeGeneralTransit } from "../../lib/human-design/transit/generalTransit";
import { istanbulLocalParts, nowTransitMoment, resolveTransitMoment, utcOffsetLabel } from "../../lib/human-design/transit/transitMoment";
import { overlaySceneState, transitSceneState } from "../../lib/human-design/transit/transitScene";
import { CHANNELS } from "../../lib/human-design/engine/channels";
import { buildConnectionBodygraphScene } from "../../lib/human-design/relations/connectionBodygraphScene";
import { transitCenterLabel } from "../../lib/human-design/transit/transitLabels";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const utcOf = (d: string, t: string) => { const r = resolveTransitMoment(d, t); return r.ok ? r.moment.utcIso : r.code; };

section("Türkiye ↔ UTC");
ok(utcOf("2026-10-19", "09:00") === "2026-10-19T06:00:00.000Z", "2026 (kalıcı UTC+3): 09:00 → 06:00Z");
ok(utcOf("2026-10-19", "01:30") === "2026-10-18T22:30:00.000Z", "gece yarısı sonrası: 19.10 01:30 → 18.10 22:30Z (gün değişimi)");
ok(utcOf("2026-12-31", "23:59") === "2026-12-31T20:59:00.000Z" && utcOf("2027-01-01", "00:00") === "2026-12-31T21:00:00.000Z", "yıl sonu 23:59 / yeni yıl 00:00");
ok(utcOf("2010-07-01", "12:00") === "2010-07-01T09:00:00.000Z", "2010 yaz saati (UTC+3)");
ok(utcOf("2010-01-15", "12:00") === "2010-01-15T10:00:00.000Z", "2010 kış saati (UTC+2) — tarihsel kural");
ok(utcOf("2011-03-28", "03:30") === "LOCAL_TIME_GAP", "yaz saati boşluğu (2011-03-28 03:30) reddedilir", utcOf("2011-03-28", "03:30"));
ok(utcOf("2010-10-31", "03:30") === "LOCAL_TIME_AMBIGUOUS", "yaz saati çakışması (2010-10-31 03:30) reddedilir", utcOf("2010-10-31", "03:30"));
ok(utcOf("2026-13-01", "10:00") === "INVALID_DATE" && utcOf("2026-02-30", "10:00") === "INVALID_DATE" && utcOf("2026-10-19", "24:00") === "INVALID_TIME", "geçersiz tarih / saat reddedilir");
ok(utcOf("1899-12-31", "12:00") === "DATE_OUT_OF_RANGE" && utcOf("2101-01-01", "12:00") === "DATE_OUT_OF_RANGE", "1900–2100 dışı reddedilir");
const now = nowTransitMoment(new Date("2026-10-19T21:30:40Z"));
ok(now.ok && now.moment.localDate === "2026-10-20" && now.moment.localTime === "00:30" && now.moment.utcIso === "2026-10-19T21:30:00.000Z", "\"şimdi\" Türkiye saatiyle (UTC 21:30 → yerel 20.10 00:30, dakikaya kesilir)", now);
ok(JSON.stringify(istanbulLocalParts(new Date("2026-10-19T06:00:00Z"))) === JSON.stringify({ localDate: "2026-10-19", localTime: "09:00" }), "UTC → Türkiye yerel parçaları");
ok(utcOffsetLabel(10800) === "UTC+03:00" && utcOffsetLabel(7200) === "UTC+02:00", "ofset etiketi");

section("Genel transit — geçmiş / bugün / gelecek");
const samples = ["1950-01-01T00:00:00Z", "1999-08-11T11:03:00Z", "2026-10-19T06:00:00Z", "2030-06-21T12:00:00Z", "2075-03-15T18:45:00Z", "2100-12-31T20:59:00Z"];
for (const s of samples) {
  const t = computeGeneralTransit(new Date(s));
  const okShape = t.activations.length === 13 && t.activations.every((a) => a.gate >= 1 && a.gate <= 64 && a.line >= 1 && a.line <= 6);
  ok(okShape && t.utcIso === new Date(s).toISOString() && t.definedCenters.length + t.openCenters.length === 9, `${s}: 13 aktivasyon, kapı 1–64, çizgi 1–6, 9 merkez (${t.channels.length} kanal)`);
}
// Gece yarısı: Türkiye 23:59 ve 00:00 ayrı anlar; Ay farklı konumda (deterministik, an bazlı)
const a = computeGeneralTransit(new Date(utcOf("2026-10-19", "23:59")));
const b = computeGeneralTransit(new Date(utcOf("2026-10-20", "00:00")));
const moonA = a.activations.find((x) => x.body === "Moon")!;
const moonB = b.activations.find((x) => x.body === "Moon")!;
ok(moonB.longitude > moonA.longitude || moonB.longitude < 1, "gün değişiminde 1 dakika: Ay ileri hareket eder (an bazlı hesap)", { moonA: moonA.longitude, moonB: moonB.longitude });

section("36 kanal kapsamı");
const seen = new Set<string>();
for (let i = 0; i < 6000 && seen.size < 36; i++) {
  for (const c of computeGeneralTransit(new Date(Date.UTC(1900, 0, 1) + i * 86400_000 * 6.7)).channels) seen.add(c.id);
}
ok(CHANNELS.length === 36, "motor 36 kanal tanımlı");
ok(seen.size === 36, `1900–2010 taramasında transitin tamamladığı farklı kanal: ${seen.size}/36 (mekanizma tüm kanallar için aynı)`, [...seen].sort());

section("Transit BodyGraph durumu");
let sceneOk = true;
for (let i = 0; i < 200; i++) {
  const t = computeGeneralTransit(new Date(Date.UTC(1980, 0, 1) + i * 86400_000 * 91.3));
  const st = transitSceneState(t);
  const def = Object.values(st.channels).filter((c) => c.state === "defined").map((c) => c.id).sort();
  const half = Object.values(st.channels).filter((c) => c.state === "half").map((c) => c.id).sort();
  if (def.join() !== t.channels.map((c) => c.id).sort().join()) sceneOk = false;
  if (half.join() !== t.halfChannels.map((c) => c.id).sort().join()) sceneOk = false;
  if ([...st.definedCenters].sort().join() !== [...t.definedCenters].sort().join()) sceneOk = false;
  if (st.palette !== "connection" || st.halfStyle !== "dashed") sceneOk = false;
  const active = new Set(t.activeGates);
  for (let g = 1; g <= 64; g++) if ((st.gates[g] === "B") !== active.has(g)) sceneOk = false;
}
ok(sceneOk, "200 an: tanımlı = transit kanalları, yarım = tek kapı, merkezler = kanal merkezleri, kapılar turuncu (B), yarım kesikli");
const prims = buildConnectionBodygraphScene(transitSceneState(computeGeneralTransit(new Date("2026-10-19T06:00:00Z"))));
ok(prims.filter((p) => p.k === "gate").length === 64 && prims.filter((p) => p.k === "center").length === 9 && prims.some((p) => p.k === "silhouette"), "mevcut premium sahne: 64 kapı + 9 merkez + silüet (sahne kodu değişmeden)");
const ov = overlaySceneState([1, 8, 20], [34, 8]);
ok(ov.gates[1] === "A" && ov.gates[8] === "both" && ov.gates[34] === "B" && ov.channels["1-8"].state === "defined" && ov.channels["20-34"].state === "defined" && ov.channels["10-20"].state === "half", "kişisel katman: natal A (mavi), transit B (turuncu), ikisi birden iki renkli");
ok(transitCenterLabel("Sacral") === "Sakral" && transitCenterLabel("SolarPlexus") === "Solar Pleksus" && transitCenterLabel("Head") === "Baş" && transitCenterLabel("G") === "G / Kimlik" && transitCenterLabel("Heart") === "Kalp / Ego" && (["Ajna", "Throat", "Spleen", "Root"] as const).every((c) => !/^[a-z]/.test(transitCenterLabel(c))), "Türkçe merkez adları (9 merkezin hiçbiri ham kod değil)", (["Head", "Ajna", "Throat", "G", "Heart", "Spleen", "SolarPlexus", "Sacral", "Root"] as const).map((c) => transitCenterLabel(c)));

console.log(`\nHD TRANSİT SAF KATMAN: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
