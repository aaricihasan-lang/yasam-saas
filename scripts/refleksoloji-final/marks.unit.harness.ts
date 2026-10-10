/**
 * REFLEKSOLOJİ FINAL — Danışan Haritası SAF + KAYNAK KİLİDİ harness'ı (DB/tarayıcı yok).
 * Çalıştır: npx tsx scripts/refleksoloji-final/marks.unit.harness.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  MARK_SIDES,
  MARK_SURFACES,
  MARK_SIZE_RATIO,
  SURFACE_DEFS,
  countBySurface,
  describeMark,
  fromViewBox,
  handMirrored,
  markRadius,
  marksForSurface,
  surfaceLabel,
  surfaceView,
  toViewBox,
  validateMarkInput,
  validateMarkPatch,
  validateSessionInput,
  type MarkSide,
  type MarkSurface,
} from "../../lib/refleksoloji/markSurfaces";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

// ─── 1. Yüzey kaydı ─────────────────────────────────────────────────────────────
section("1. Yüzey kaydı");
ok(JSON.stringify([...MARK_SURFACES]) === JSON.stringify(["foot_sole", "foot_inner", "foot_outer", "hand_palm", "hand_dorsum"]), "5 yüzey: taban/iç/dış ayak, avuç içi, el sırtı (2D yüz YOK — ürün kararı)");
ok(JSON.stringify([...MARK_SIDES]) === JSON.stringify(["right", "left"]), "taraf yalnız sağ/sol ('none' yok)");
ok(Object.keys(SURFACE_DEFS).length === 5 && !("face" in SURFACE_DEFS), "yüzey kaydında 'face' yok");
ok(surfaceLabel("hand_palm", "left") === "Sol El — Avuç İçi" && surfaceLabel("foot_sole", "right") === "Sağ Ayak Tabanı" && surfaceLabel("hand_dorsum", "right") === "Sağ El — El Sırtı", "Türkçe yüzey etiketleri");

// ─── 2. Görsel/crop ─────────────────────────────────────────────────────────────
section("2. Ayak crop (doğru yarı) + el aynası");
const sR = surfaceView("foot_sole", "right");
const sL = surfaceView("foot_sole", "left");
ok(sR.image?.x === 0 && sL.image?.x === -512 && sR.width === 512, "taban: Sağ = sol yarı, Sol = sağ yarı (görselde 'Sağ' solda)");
ok(surfaceView("foot_inner", "right").image?.x === 0 && surfaceView("foot_inner", "left").image?.x === -768, "iç yan: Sağ solda");
ok(surfaceView("foot_outer", "right").image?.x === -768 && surfaceView("foot_outer", "left").image?.x === 0, "dış yan: Sol solda (görsel düzeni ters)");
ok(handMirrored("hand_palm", "right") === false && handMirrored("hand_palm", "left") === true, "avuç: sağ = temel (başparmak dışa), sol = ayna");
ok(handMirrored("hand_dorsum", "right") === true && handMirrored("hand_dorsum", "left") === false, "el sırtı: sağ = ayna (başparmak içe), sol = temel");
ok(surfaceView("hand_palm", "left").vector?.kind === "hand_palm" && !surfaceView("hand_palm", "left").image, "el = SVG şema (raster yok)");
for (const f of ["klinik_taban.png", "klinik_yan_ic.png", "klinik_yan_dis.png"]) {
  ok(statSync(path.join(root, "public/refleksoloji", f)).size > 1000, `mevcut atlas görseli yeniden kullanıldı: ${f}`);
}

// ─── 3. Koordinat paritesi (M/N/O/P) ────────────────────────────────────────────
section("3. Koordinat paritesi — farklı ekranlar aynı normalize nokta");
/** preserveAspectRatio xMidYMid meet: viewBox → ekran. */
function meet(view: { width: number; height: number }, cw: number, ch: number) {
  const s = Math.min(cw / view.width, ch / view.height);
  const ox = (cw - view.width * s) / 2;
  const oy = (ch - view.height * s) / 2;
  return {
    toScreen: (ux: number, uy: number) => ({ px: ox + ux * s, py: oy + uy * s }),
    toUser: (px: number, py: number) => ({ ux: (px - ox) / s, uy: (py - oy) / s }),
  };
}
const screens = [
  { name: "360×540 mobil", w: 360, h: 540 },
  { name: "390×560 mobil", w: 390, h: 560 },
  { name: "412×600 mobil", w: 412, h: 600 },
  { name: "768×620 tablet", w: 768, h: 620 },
  { name: "1366×600 web", w: 1366, h: 600 },
  { name: "1920×780 web", w: 1920, h: 780 },
  { name: "web zoom 200% (683×300)", w: 683, h: 300 },
];
let maxErr = 0;
for (const s of MARK_SURFACES) {
  const side: MarkSide = "left";
  const v = surfaceView(s, side);
  for (const p of [{ x: 0.1234, y: 0.8765 }, { x: 0.5, y: 0.5 }, { x: 0.9999, y: 0.0001 }]) {
    // "mobilde konan" nokta → saklanan normalize → "webde" çizilen ekran noktası → geri normalize
    for (const a of screens) {
      const ma = meet(v, a.w, a.h);
      const { cx, cy } = toViewBox(v, p.x, p.y);
      const scr = ma.toScreen(cx, cy);
      const back = ma.toUser(scr.px, scr.py);
      const n = fromViewBox(v, back.ux, back.uy);
      maxErr = Math.max(maxErr, Math.abs(n.x - p.x), Math.abs(n.y - p.y));
      for (const b of screens) {
        // a ekranında dokunulan piksel → normalize → b ekranında aynı anatomik oran
        const mb = meet(v, b.w, b.h);
        const sb = mb.toScreen(cx, cy);
        const relA = { x: (scr.px - ma.toScreen(0, 0).px) / (ma.toScreen(v.width, 0).px - ma.toScreen(0, 0).px) };
        const relB = { x: (sb.px - mb.toScreen(0, 0).px) / (mb.toScreen(v.width, 0).px - mb.toScreen(0, 0).px) };
        maxErr = Math.max(maxErr, Math.abs(relA.x - relB.x));
      }
    }
  }
}
ok(maxErr < 1e-4, `mobil↔web normalize sapma < 1e-4 (maks ${maxErr.toExponential(2)})`);
ok(JSON.stringify(fromViewBox({ width: 400, height: 560 }, -50, 900)) === JSON.stringify({ x: 0, y: 1 }), "viewBox dışı → [0,1] içine kırpılır");
ok(Math.abs(markRadius({ width: 400, height: 560 }, "large") - 400 * MARK_SIZE_RATIO.large) < 1e-9 && markRadius({ width: 400, height: 560 }, "small") < markRadius({ width: 400, height: 560 }, "medium"), "nokta yarıçapı viewBox'a oranlı (ekrandan bağımsız), K<O<B");

// ─── 4. Yüzey filtresi (5 — kayıtlar arası ayrım) ───────────────────────────────
section("4. Yüzey filtresi");
const sample = MARK_SURFACES.flatMap((s) =>
  MARK_SIDES.map((side) => ({ surface: s as MarkSurface, side: side as MarkSide, id: `${s}:${side}` })),
);
ok(sample.length === 10, "10 (yüzey, taraf) çifti");
for (const m of sample) {
  const got = marksForSurface(sample, m.surface, m.side);
  ok(got.length === 1 && got[0].id === m.id, `${m.id} yalnız kendisini görür`);
}
ok(countBySurface(sample).get("hand_dorsum:left") === 1 && countBySurface(sample).size === 10, "yüzey sayaçları");

// ─── 5. Doğrulama ───────────────────────────────────────────────────────────────
section("5. Doğrulama");
ok(!validateMarkInput({ surface: "face", side: "right", x: 0.5, y: 0.5 }).ok && !validateMarkInput({ surface: "face", x: 0.5, y: 0.5 }).ok, "2D yüz girdisi reddedilir");
ok(!validateMarkInput({ surface: "foot_sole", side: "none", x: 0.5, y: 0.5 }).ok, "taraf 'none' reddedilir");
ok(!validateMarkInput({ surface: "hand_dorsum", x: 0.5, y: 0.5 }).ok, "el sırtı taraf zorunlu");
ok(!validateMarkInput({ surface: "foot_sole", side: "right", x: Number.NaN, y: 0.5 }).ok, "NaN reddedilir");
ok(!validateMarkInput({ surface: "foot_sole", side: "right", x: Infinity, y: 0.5 }).ok, "Infinity reddedilir");
const longNote = validateMarkInput({ surface: "hand_palm", side: "right", x: 0.1, y: 0.1, note: "a".repeat(900) });
ok(longNote.ok && longNote.value.note?.length === 500, "nokta notu 500 karaktere kırpılır");
ok(!validateMarkPatch({ surface: "foot_sole" }).ok, "PATCH yalnız yüzey → reddedilir");
ok(!validateMarkPatch({ x: 0.5 }).ok, "PATCH x varken y zorunlu");
ok(validateSessionInput({ session_date: "2028-02-29" }).ok && !validateSessionInput({ session_date: "2027-02-29" }).ok, "artık yıl tarih doğrulaması");
ok(!validateSessionInput({ session_date: "10.10.2026" }).ok, "TR biçimli tarih API'de reddedilir (ISO zorunlu)");
const d = describeMark({ size: "large", intensity: "strong", note: "hassas" }, 3);
ok(d.includes("3. nokta") && d.includes("Büyük") && d.includes("Yoğun") && d.includes("hassas"), "erişilebilir metin: numara + boyut + yoğunluk + not (renge bağımlı değil)");

// ─── 6. Kaynak kilitleri ────────────────────────────────────────────────────────
section("6. Kaynak kilitleri");
const mig = read("supabase/migrations/20271013000000_reflexology_client_marks.sql");
const surfaceCheck = /surface IN \(([^)]+)\)/.exec(mig)?.[1].replace(/['\s]/g, "").split(",") ?? [];
ok(JSON.stringify(surfaceCheck) === JSON.stringify([...MARK_SURFACES]), "DB CHECK yüzey listesi = TS MARK_SURFACES", surfaceCheck);
ok(/CONSTRAINT reflexology_marks_side_chk CHECK \(side IN \('right', 'left'\)\)/.test(mig), "DB CHECK taraf = sağ/sol");
ok(/surface\s+text\s+NOT NULL/.test(mig) && !/CREATE TYPE/i.test(mig), "yüzey serbest text + isimli CHECK (enum yok) → gelecekte 3D yüz yalnız kısıt değişimi");
ok(/GELECEK PLANLANMIŞ GELİŞTİRME: Yüz Refleksolojisi doğrudan 3D/.test(mig) && /Yüz Refleksolojisi doğrudan 3D/.test(read("lib/refleksoloji/markSurfaces.ts")), "3D yüz planı migration + kayıtta belgelendi");
ok(/FOREIGN KEY \(tenant_id, client_id\)\s+REFERENCES public\.clients \(tenant_id, id\) ON DELETE CASCADE/.test(mig), "seans → danışan composite FK CASCADE");
ok(/FOREIGN KEY \(tenant_id, client_id, session_id\)\s+REFERENCES public\.reflexology_mark_sessions \(tenant_id, client_id, id\) ON DELETE CASCADE/.test(mig), "nokta → seans composite FK (aynı danışan) CASCADE");
const sqlNoComments = mig.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
ok(!/reflexology_(atlas|protocols|notes)\b/.test(sqlNoComments), "migration eski refleksoloji tablolarına DOKUNMAZ (yalnız yorumda anılır)");
ok(!/\b(DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE public\.reflexology_(atlas|protocols|notes))/i.test(sqlNoComments), "yıkıcı komut yok");
ok(!/yh_cdc_enqueue|yh_client_outbox_enqueue/.test(sqlNoComments), "YH CDC trigger eklenmedi (koordinat gürültüsü yok)");

const apiFiles = [
  "app/api/refleksoloji/marks/sessions/route.ts",
  "app/api/refleksoloji/marks/sessions/[id]/route.ts",
  "app/api/refleksoloji/marks/sessions/[id]/marks/route.ts",
  "app/api/refleksoloji/marks/items/[markId]/route.ts",
];
for (const f of apiFiles) {
  const src = read(f);
  const handlers = src.match(/export async function (GET|POST|PATCH|DELETE)/g) ?? [];
  const guards = src.match(/requireModuleAccess\(req, "reflexology"\)/g) ?? [];
  ok(handlers.length > 0 && handlers.length === guards.length, `${f}: her handler requireModuleAccess("reflexology")`);
  const froms = src.match(/\.from\("reflexology_[a-z_]+"\)/g) ?? [];
  const scoped = src.match(/\.eq\("tenant_id", tenantId\)|tenant_id: tenantId/g) ?? [];
  ok(scoped.length >= froms.length, `${f}: her sorgu tenant kapsamlı (${scoped.length}/${froms.length})`);
}
const marksPost = read("app/api/refleksoloji/marks/sessions/[id]/marks/route.ts");
ok(/client_id: session\.client_id/.test(marksPost) && !/body\.client_id/.test(marksPost), "nokta client_id YALNIZ seanstan");
const sessPost = read("app/api/refleksoloji/marks/sessions/route.ts");
ok(/requireClientInTenant\(db, tenantId, clientId\)/.test(sessPost), "seans: danışan tenant doğrulaması");

const editor = read("app/refleksoloji/danisan-haritasi/components/SessionEditor.tsx");
ok(/runBulkDeleteConfirm\(confirm, \{[\s\S]{0,80}deleteAll: true/.test(editor), "'Tümünü sil' → sayıdan bağımsız 3 aşamalı onay");
const list = read("app/refleksoloji/danisan-haritasi/components/SessionList.tsx");
ok(/requiresBulkDeleteGuard\(s\.mark_count\)[\s\S]{0,40}runBulkDeleteConfirm/.test(list), "3+ noktalı seans silme → 3 aşamalı onay");
const canvas = read("app/refleksoloji/danisan-haritasi/components/MarkCanvas.tsx");
ok(/touchAction: "manipulation"/.test(canvas) && /touchAction: "none"/.test(canvas), "zemin pinch/kaydırma serbest, nokta sürükleme kilitli");
ok(/MIN_HIT_PX = 22/.test(canvas), "dokunma alanı ≥ 44 CSS px");
ok(/<clipPath id=\{clipId\}>/.test(canvas) && /clipPath=\{`url\(#\$\{clipId\}\)`\}/.test(canvas), "zemin viewBox'a kırpılır (ayak PNG'sinin diğer yarısı görünmez)");
ok(/getScreenCTM\(\)/.test(canvas) && !/naturalWidth|getBoundingClientRect\(\)\.left/.test(canvas), "koordinat SVG CTM ile (görsel yüklenme/piksel bağımlılığı yok)");
const api = read("app/refleksoloji/danisan-haritasi/lib/marksApi.ts");
ok(/reflexUserHeaders\(\)/.test(api), "istemci kimlik başlığı reflexUserHeaders (HTTPONLY H5)");

// H5: refleksoloji içinde koşulsuz/boş token başlığı kalmadı.
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rfFiles = [...walk("app/refleksoloji"), ...walk("lib/refleksoloji")];
const badToken = rfFiles.filter((f) => /"x-session-token":\s*readSessionToken\(\)\s*\?\?/.test(read(f)));
ok(badToken.length === 0, "refleksoloji: `x-session-token: readSessionToken() ?? \"\"` kalmadı", badToken);

const art = read("app/refleksoloji/danisan-haritasi/components/SurfaceArt.tsx");
ok(!/FaceArt|"face"/.test(art) && !/"face"|Yüz(?!ey)/.test(editor), "UI: 2D yüz çizimi/sekmesi yok");
const menu = read("app/refleksoloji/components/ReflexologyMainMenu.tsx");
ok(!/[yY]üz(?!ey)/.test(menu), "hub menüsünde yüz vaadi yok");
ok(menu.includes('href: "/refleksoloji/danisan-haritasi"'), "ana menüde Danışan Haritası kartı");
ok(read("lib/danisan/deletePreview.ts").includes('table: "reflexology_marks"'), "danışan silme önizlemesi yeni tabloları sayar");
ok(read("lib/backup/registry.ts").includes('entry("reflexology_marks"'), "yedek kaydı yeni tabloları içerir");

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.error("BAŞARISIZ:\n - " + failures.join("\n - "));
  process.exit(1);
}
