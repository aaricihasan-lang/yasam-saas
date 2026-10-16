/**
 * HD Bilgi Bankası — kapı/kanal GÖRÜNEN AD kişiselleştirmesi + OTOMATİK sıralama + admin ÜÇ kaynak.
 *
 * Owner talimatı TEST 1–13 (TEST 14 = tsc/lint/build ayrı koşulur).
 * Gerçek DB / Storage / RoxyAPI / ağ YOK: bellek-içi sahte Supabase + guard stub'ı; tüm veri SENTETİK.
 *
 * Çalıştırma: npx tsx scripts/hd-kb-names-sort/harness.ts
 */
import Module, { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const STUBS: Record<string, string> = {
  "server-only": join(ROOT, "scripts/final-hardening/hday-stubs/empty.cjs"),
  "@/lib/auth/userGuard": join(ROOT, "scripts/final-hardening/hday-stubs/userGuard.cjs"),
};
{
  const M = Module as unknown as { _resolveFilename: (r: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  M._resolveFilename = function (r: string, ...rest: unknown[]) {
    if (STUBS[r]) return STUBS[r];
    return orig.call(this, r, ...rest);
  };
}
const req = createRequire(import.meta.url);

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
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─── Sahte Supabase (AŞAMA 1/2 harness'leriyle aynı davranış) ───────────────────
type Row = Record<string, unknown>;
class FakeDb {
  tables: Record<string, Row[]> = {};
  selects: { table: string; cols: string }[] = [];
  from(t: string) { return new FakeQuery(this, t); }
  rpc() { return Promise.resolve({ data: null, error: { message: "rpc yok (harness)" } }); }
}
class FakeQuery {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private preds: ((r: Row) => boolean)[] = [];
  private payload: Row | Row[] | null = null;
  private cols = "*";
  private mode: "many" | "maybe" | "single" = "many";
  private wantRows = false;
  constructor(private db: FakeDb, private table: string) {}
  select(cols?: string) { this.cols = cols ?? "*"; if (this.op !== "select") this.wantRows = true; else this.db.selects.push({ table: this.table, cols: this.cols }); return this; }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.preds.push((r) => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.preds.push((r) => vs.includes(r[c])); return this; }
  neq() { return this; }
  not() { return this; }
  is() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  private exec(): { data: unknown; error: unknown } {
    const rows = (this.db.tables[this.table] ??= []);
    let affected: Row[];
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      for (const p of list) {
        if (this.table === "human_design_knowledge_records" && rows.some((r) => r.tenant_id === p.tenant_id && r.code === p.code)) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
      }
      affected = list.map((p) => ({ id: randomUUID(), sort_order: 0, ...structuredClone(p) }));
      rows.push(...affected);
    } else {
      affected = rows.filter((r) => this.preds.every((f) => f(r)));
      if (this.op === "update") for (const r of affected) Object.assign(r, this.payload, { updated_at: new Date(Date.now() + rows.length).toISOString() });
      if (this.op === "delete") this.db.tables[this.table] = rows.filter((r) => !affected.includes(r));
    }
    const proj = (r: Row) => {
      if (this.cols.trim() === "*") return structuredClone(r);
      const o: Row = {};
      for (const c of this.cols.split(",").map((x) => x.trim()).filter(Boolean)) o[c] = r[c];
      return o;
    };
    const data = affected.map(proj);
    if (this.op !== "select" && !this.wantRows) return { data: null, error: null };
    if (this.mode === "maybe") return { data: data[0] ?? null, error: null };
    if (this.mode === "single") return data[0] ? { data: data[0], error: null } : { data: null, error: { message: "no rows" } };
    return { data, error: null };
  }
  then<T>(res: (v: { data: unknown; error: unknown }) => T, rej?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.exec()).then(res, rej);
  }
}

let currentGuard: Row | null = null;
(globalThis as Row).__HDAY_GUARD__ = () => {
  if (!currentGuard) {
    const { NextResponse } = req("next/server");
    return { ok: false, response: NextResponse.json({ ok: false, error: "Yetki gerekli." }, { status: 401 }) };
  }
  return currentGuard;
};
const T_EXPERT = "11111111-1111-4111-8111-111111111111";
const T_ADMIN = "22222222-2222-4222-8222-222222222222";
function guardFor(db: FakeDb, tenantId: string, role: "expert" | "admin"): Row {
  return {
    ok: true, db, tenantId, userId: `u-${tenantId.slice(0, 4)}`, is_demo_account: false,
    profile: { role, membership_status: "active", module_permissions: { human_design: true, hd_system_reading: true } },
  };
}
function mkReq(method: string, url: string, body?: unknown) {
  const { NextRequest } = req("next/server");
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function call(handler: (r: unknown) => Promise<Response>, method: string, url: string, body?: unknown) {
  const res = await handler(mkReq(method, url, body));
  let json: Row = {};
  try { json = (await res.clone().json()) as Row; } catch { /* yok */ }
  return { status: res.status, json };
}
async function docxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

async function main() {
  console.log("HD Bilgi Bankası — görünen ad + otomatik sıralama + admin üç kaynak harness'i (sahte DB; gerçek DB/Roxy/ağ YOK)");
  const N = await import("../../lib/human-design/knowledge/hdNames");
  const S = await import("../../lib/human-design/knowledge/hdKnowledgeSort");
  const KP = await import("../../lib/human-design/api/knowledgePersistence");
  const SV2 = await import("../../lib/human-design/reporting/reportSnapshotV2");
  const WV2 = await import("../../lib/human-design/reporting/wordReportV2");
  const AC = await import("../../lib/human-design/normalize/hdAppCodes");
  const route = req("../../app/api/hd/knowledge/route.ts") as Record<string, (r: unknown) => Promise<Response>>;
  const db = new FakeDb();
  const KB = () => (db.tables.human_design_knowledge_records ??= []);
  const asExpert = () => { currentGuard = guardFor(db, T_EXPERT, "expert"); };
  const asAdmin = () => { currentGuard = guardFor(db, T_ADMIN, "admin"); };
  const U = "http://l/api/hd/knowledge";

  // ══ TEST 1 ═══════════════════════════════════════════════════════════════════
  section("TEST 1 — Normal uzman 21. Kapı adını değiştirir; kod kapi_21 kalır");
  asExpert();
  const created = await call(route.POST, "POST", U, { category: "Kapılar", title: "21 — Aşk Kapısı", code: "kapi_21", content: "", is_active: false, keywords: [], tags: [], related_centers: [], related_channels: [], related_gates: [], expert_notes: null });
  const gateId = String(created.json.id ?? "");
  const r21 = () => KB().find((r) => r.id === gateId) ?? {};
  ok("1a Açıklamasız (taslak) kayıtla yalnız ad kaydedilebilir", created.status === 200 && !!gateId, JSON.stringify(created));
  ok("1b Başlık '21 — Aşk Kapısı', kod 'kapi_21'", r21().title === "21 — Aşk Kapısı" && r21().code === "kapi_21");
  ok("1c sort_order kullanıcıdan alınmadı (DB varsayılanı)", r21().sort_order === 0);
  let up = await call(route.PATCH, "PATCH", U, { id: gateId, title: "Akıl Kapısı" });
  ok("1d Kısmi güncelleme (yalnız ad) → numara koddan korunur: '21 — Akıl Kapısı'", up.status === 200 && r21().title === "21 — Akıl Kapısı" && r21().code === "kapi_21", JSON.stringify({ up, t: r21().title }));
  up = await call(route.PATCH, "PATCH", U, { id: gateId, category: "Kapılar", code: "kapi_21", title: "22 — Aşk Kapısı" });
  ok("1e Başlıkta başka numara yazılsa da numara değişmez ('21 — Aşk Kapısı')", up.status === 200 && r21().title === "21 — Aşk Kapısı");
  up = await call(route.PATCH, "PATCH", U, { id: gateId, category: "Kapılar", code: "kapi_21", title: "21 — " });
  ok("1f Boş ad → hazır ada güvenli dönüş ('21 — Haznedar kapısı'); teknik kimlik korunur", up.status === 200 && r21().title === "21 — Haznedar kapısı" && r21().code === "kapi_21", String(r21().title));
  await call(route.PATCH, "PATCH", U, { id: gateId, category: "Kapılar", code: "kapi_21", title: "21 — Aşk Kapısı" });
  const bad = await call(route.POST, "POST", U, { category: "Kapılar", title: "65 — Uydurma", code: "kapi_65", content: "", is_active: false });
  ok("1g Sistemde olmayan kapı (kapi_65) reddedilir", bad.status === 400 && !KB().some((r) => r.code === "kapi_65"));
  const dup = await call(route.POST, "POST", U, { category: "Kapılar", title: "21 — Başka", code: "kapi_21", content: "", is_active: false });
  ok("1h Aynı kod için ikinci kayıt üretilmez → 409 + mevcut kayıt id'si", dup.status === 409 && dup.json.existing_id === gateId && KB().filter((r) => r.tenant_id === T_EXPERT && r.code === "kapi_21").length === 1, JSON.stringify(dup));
  ok("1i Hazır sözlük değişmedi (constants '21 — Haznedar kapısı')", N.hdGateDefaultName(21) === "Haznedar kapısı");

  // ══ TEST 2 ═══════════════════════════════════════════════════════════════════
  section("TEST 2 — Admin kendi hesabında aynı kapıya farklı ad verir; uzmanın adı değişmez");
  asAdmin();
  const adm = await call(route.POST, "POST", U, { category: "Kapılar", title: "21 — Yönetim Kapısı", code: "kapi_21", content: "", is_active: false });
  ok("2a Admin kendi tenant'ında kapi_21 kaydı açabilir (uzmanla çakışmaz)", adm.status === 200);
  const namesAdmin = await call(route.GET, "GET", `${U}?names=1`);
  asExpert();
  const namesExpert = await call(route.GET, "GET", `${U}?names=1`);
  const ovA = N.buildHdNameOverrides(namesAdmin.json.rows as Row[]);
  const ovE = N.buildHdNameOverrides(namesExpert.json.rows as Row[]);
  ok("2b Admin görünen adı: 'Yönetim Kapısı'", ovA.gates[21] === "Yönetim Kapısı", JSON.stringify(ovA));
  ok("2c Uzmanın görünen adı hâlâ 'Aşk Kapısı'", ovE.gates[21] === "Aşk Kapısı", JSON.stringify(ovE));
  ok("2d Ad uç noktası YALNIZ category/code/title okur (içerik/özel not yok)", db.selects.filter((s) => s.cols.includes("title") && !s.cols.includes("content") && s.cols === "category, code, title").length >= 2);

  // ══ TEST 3 ═══════════════════════════════════════════════════════════════════
  section("TEST 3 — 29–46 kanalının adı değişir; teknik kanal eşleşmesi değişmez");
  const ch = await call(route.POST, "POST", U, { category: "Kanallar", title: "29-46 Aşk Kanalı", code: "kanal_29_46", content: "Uzmanın kanal açıklaması.", is_active: true });
  const chId = String(ch.json.id ?? "");
  const chRow = KB().find((r) => r.id === chId) ?? {};
  ok("3a Kayıt: '29-46 Aşk Kanalı' / kanal_29_46", chRow.title === "29-46 Aşk Kanalı" && chRow.code === "kanal_29_46");
  const fake = await call(route.POST, "POST", U, { category: "Kanallar", title: "29-47 Uydurma", code: "kanal_29_47", content: "", is_active: false });
  ok("3b Sistemde tanımlı olmayan kanal (29-47) oluşturulamaz", fake.status === 400);
  const codes = AC.buildExpertKnowledgeCodes({ type_code: "generator", authority_code: "sacral", profile_code: "1_3", definition_code: "single", active_centers: [], open_centers: [], gates: [21, 29, 46], channels: ["29-46"] } as never);
  ok("3c Harita kodları görünen addan bağımsız: kanal_29_46 + kapi_21", codes.includes("kanal_29_46") && codes.includes("kapi_21"));
  const ov3 = N.buildHdNameOverrides(KB().filter((r) => r.tenant_id === T_EXPERT));
  ok("3d Görünen kanal etiketi '29-46 Aşk Kanalı'; hazır etiket değişmedi", N.hdChannelDisplayLabel("29-46", ov3) === "29-46 Aşk Kanalı" && N.hdChannelDisplayLabel("29-46", null) === "29-46 Keşif Kanalı (Discovery)");

  // ══ TEST 4 ═══════════════════════════════════════════════════════════════════
  section("TEST 4 — Uzman açıklama girer; eşleşme koddan devam eder");
  up = await call(route.PATCH, "PATCH", U, { id: gateId, content: "Uzmanın 21. Kapı açıklaması.", is_active: true, expert_notes: "GİZLİ-NOT-21" });
  const rep = await KP.listKnowledgeForReport(db as never, T_EXPERT, codes);
  ok("4a Aktif kapı + kanal kaydı rapor eşleşmesine girer (başlık ne olursa olsun)", up.status === 200 && rep.rows.map((r) => r.code).sort().join(",") === "kanal_29_46,kapi_21", JSON.stringify(rep.rows.map((r) => r.code)));
  ok("4b Eşleşen kapı kaydının başlığı kişisel ad", rep.rows.find((r) => r.code === "kapi_21")?.title === "21 — Aşk Kapısı");

  // ══ TEST 5 ═══════════════════════════════════════════════════════════════════
  section("TEST 5 — Yeni Word'de kişisel ad; eski raporlar değişmez");
  const mkInput = (over: Row = {}) => ({
    generatedAt: "2026-10-16T09:00:00.000Z", chartId: randomUUID(), source: "manual" as const, provider: null,
    client: { name: "ZZ Sentetik", birthDate: "1990-07-15", birthTime: "14:30:00", birthPlace: "İstanbul", timezone: "Europe/Istanbul" },
    codes: { type_code: "generator", authority_code: "sacral", profile_code: "1_3", definition_code: "single", active_centers: ["sacral", "spleen", "g_identity"], open_centers: [], gates: [21, 29, 46], channels: ["29-46"] } as never,
    computed: null, requested: "expert" as const, systemReadingPermitted: false, systemReading: null,
    expertRecords: rep.rows, bodygraph: { status: "missing" as const }, chartImage: null, ...over,
  });
  const snapNew = SV2.buildReportSnapshotV2(mkInput({ nameOverrides: ov3 }) as never);
  const g21 = snapNew.gates.find((g) => g.gate === 21);
  ok("5a Yeni snapshot kapı adı donar: 'Aşk Kapısı'", g21?.name === "Aşk Kapısı" && g21?.label === "21. Kapı");
  ok("5b Yeni snapshot kanal etiketi: '29-46 Aşk Kanalı'", snapNew.channels.find((c) => c.code === "29-46")?.label === "29-46 Aşk Kanalı");
  const txtNew = await docxText(await WV2.renderHdReportV2Buffer(snapNew, {}));
  ok("5c Word teknik kapı tablosu kişisel adı gösterir", txtNew.includes("Aşk Kapısı") && !txtNew.includes("Haznedar kapısı"));
  ok("5d Word kanal bölümü kişisel adı gösterir", txtNew.includes("Aşk Kanalı"));
  ok("5e Word 'Uzman Açıklamaları' başlığı kayıt başlığıyla tutarlı ('21 — Aşk Kapısı')", txtNew.includes("21 — Aşk Kapısı"));
  const snapOld = structuredClone(snapNew) as unknown as { gates: Row[]; channels: Row[]; commentary: { expert: { entries: Row[] } } };
  snapOld.commentary.expert.entries = []; // yalnız teknik tablo karşılaştırılır
  for (const g of snapOld.gates) delete g.name;
  for (const c of snapOld.channels) c.label = `${c.code} Keşif Kanalı`;
  const txtOld = await docxText(await WV2.renderHdReportV2Buffer(snapOld as never, {}));
  ok("5f Eski snapshot (ad alanı yok) eski davranışla üretilir: hazır kapı adı", txtOld.includes("Haznedar kapısı") && !txtOld.includes("Aşk Kapısı"));
  const snapNoOv = SV2.buildReportSnapshotV2(mkInput({ nameOverrides: null }) as never);
  ok("5g Kişisel ad yoksa hazır ad (kanal etiketi önceki sürümle birebir)", snapNoOv.gates.find((g) => g.gate === 21)?.name === "Haznedar kapısı" && snapNoOv.channels[0]?.label === "29-46 Keşif Kanalı (Discovery)");
  const svc = src("lib/human-design/reporting/reportSnapshotV2Service.ts");
  ok("5h Rapor servisi adları tenant'tan okur ve snapshot'a verir", /listKnowledgeNames\(db, tenantId\)/.test(svc) && /nameOverrides,/.test(svc));
  ok("5i Teknik veri etkilenmez: kapı numarası/merkez/kanal kodu aynı", JSON.stringify(snapNew.gates.map((g) => [g.gate, g.center, g.channel])) === JSON.stringify(snapNoOv.gates.map((g) => [g.gate, g.center, g.channel])));

  // ══ TEST 6 ═══════════════════════════════════════════════════════════════════
  section("TEST 6 — Kapılar 1, 51, 52, 54, 58, 60 sırasıyla");
  const gateRows = [60, 1, 54, 51, 58, 52].map((n, i) => ({ id: `g${i}`, category: "Kapılar", code: `kapi_${n}`, title: `${n} — ${"ZYXWVU"[i]} adı`, sort_order: 100 - n, updated_at: `2026-0${(i % 9) + 1}-01` }));
  const sortedGates = S.sortHdKnowledgeRecords(gateRows).map((r) => r.code);
  ok("6a Teknik numaraya göre küçükten büyüğe (ad, tarih, eski sort_order etkisiz)", sortedGates.join(",") === "kapi_1,kapi_51,kapi_52,kapi_54,kapi_58,kapi_60", sortedGates.join(","));
  ok("6b Girilmemiş kapılar listeye eklenmez", sortedGates.length === 6);

  // ══ TEST 7 ═══════════════════════════════════════════════════════════════════
  section("TEST 7 — Kanallar numaraya göre; alfabetik ad sırayı etkilemez");
  const chRows = ["29-46", "10-34", "1-8", "10-20", "3-60", "2-14"].map((c, i) => ({ id: `c${i}`, category: "Kanallar", code: `kanal_${c.replace("-", "_")}`, title: `${c} ${"ABCDEF"[i]} Kanalı`, sort_order: i }));
  const sortedCh = S.sortHdKnowledgeRecords(chRows).map((r) => r.code.replace("kanal_", "").replace("_", "-"));
  ok("7a Sıra: 1-8, 2-14, 3-60, 10-20, 10-34, 29-46", sortedCh.join(",") === "1-8,2-14,3-60,10-20,10-34,29-46", sortedCh.join(","));
  const wordOrder = SV2.buildReportSnapshotV2(mkInput({ expertRecords: [
    { category: "Kapılar", code: "kapi_60", title: "60 — A", content: "x", is_active: true },
    { category: "Kanallar", code: "kanal_29_46", title: "29-46 A", content: "x", is_active: true },
    { category: "Kapılar", code: "kapi_1", title: "1 — Z", content: "x", is_active: true },
    { category: "Kanallar", code: "kanal_1_8", title: "1-8 Z", content: "x", is_active: true },
  ] }) as never).commentary.expert.entries.map((e) => e.code);
  ok("7b Word uzman bölümü: kategori sırası korunur, kategori içinde doğal sayısal sıra", wordOrder.join(",") === "kanal_1_8,kanal_29_46,kapi_1,kapi_60", wordOrder.join(","));
  ok("7c Analiz eşleşme grupları da aynı otomatik sıralamayı kullanır", /sortHdKnowledgeRecords\(j\.rows/.test(src("app/human-design/rapor-olustur/helpers/hdRapor.ts")));
  ok("7d Bilgi Bankası listesi otomatik sıralanır", /setRows\(sortHdKnowledgeRecords\(data\)\)/.test(src("app/human-design/bilgi-bankasi/components/HdBilgiKayitListesi.tsx")));

  // ══ TEST 8 ═══════════════════════════════════════════════════════════════════
  section("TEST 8 — Admin ve uzman formlarında manuel Sıralama girişi yok");
  const form = src("app/human-design/bilgi-bankasi/components/HdBilgiKayitForm.tsx");
  const editor = src("app/human-design/bilgi-bankasi/[recordId]/HdKayitEditor.tsx");
  ok("8a Yeni kayıt formunda 'Sıralama' alanı/sort_order girişi yok", !/>Sıralama</.test(form) && !/sort_order/.test(form));
  ok("8b Editörde 'Sıralama' alanı yok; güncellemede sort_order GÖNDERİLMEZ", !/>Sıralama</.test(editor) && !/sort_order:\s*form\./.test(editor));
  ok("8c Admin kişisel alanı da aynı bileşeni kullanır (HdKnowledgeWorkspace)", /adminSource === "expert"[\s\S]{0,600}<HdKnowledgeWorkspace/.test(src("app/human-design/bilgi-bankasi/page.tsx")));
  ok("8d Admin merkezî ekranında manuel sıra girişi yok", !/sort_order|>Sıralama</.test(src("app/admin/human-design/page.tsx")) && !/>Sıralama</.test(src("components/human-design/knowledge/CanonicalGroupList.tsx")));

  // ══ TEST 9 ═══════════════════════════════════════════════════════════════════
  section("TEST 9 — Diğer kategorilerde kararlı sıra; kayıt kaybı yok");
  const mixed = [
    { id: "n1", category: "Genel Notlar", code: "not_cicek", title: "Çiçek" },
    { id: "n2", category: "Genel Notlar", code: "not_ilk", title: "İlk" },
    { id: "n3", category: "Genel Notlar", code: "not_cam", title: "Cam" },
    { id: "t1", category: "Tipler", code: "tip_reflector", title: "Reflektör" },
    { id: "t2", category: "Tipler", code: "tip_generator", title: "Jeneratör" },
    { id: "m1", category: "Merkezler", code: "merkez_acik_head", title: "Açık — Baş" },
    { id: "m2", category: "Merkezler", code: "merkez_tanimli_head", title: "Tanımlı — Baş" },
    ...gateRows, ...chRows,
  ];
  const a1 = S.sortHdKnowledgeRecords(mixed).map((r) => r.id);
  const a2 = S.sortHdKnowledgeRecords([...mixed].reverse()).map((r) => r.id);
  ok("9a Girdi sırası ne olursa olsun aynı sonuç (kararlı)", a1.join() === a2.join());
  ok("9b Kayıt kaybolmaz (sayı aynı)", a1.length === mixed.length && new Set(a1).size === mixed.length);
  ok("9c Tipler sistemin sabit sırasında (Jeneratör, Reflektör'den önce)", a1.indexOf("t2") < a1.indexOf("t1"));
  ok("9d Merkezler sabit seçenek sırasında (Tanımlı — Baş, Açık — Baş'tan önce)", a1.indexOf("m2") < a1.indexOf("m1"));
  ok("9e Serbest kategori Türkçe alfabetik: Cam, Çiçek, İlk", [a1.indexOf("n3"), a1.indexOf("n1"), a1.indexOf("n2")].every((v, i, arr) => i === 0 || arr[i - 1] < v));
  ok("9f Kategori sırası: Tipler → Merkezler → Kanallar → Kapılar → Genel Notlar", a1.indexOf("t2") < a1.indexOf("m2") && a1.indexOf("m1") < a1.indexOf("c2") && a1.indexOf("c0") < a1.indexOf("g1") && a1.indexOf("g0") < a1.indexOf("n3"));
  ok("9g sort_order kolonu silinmedi / toplu güncellenmedi (persistence izin listesinde duruyor)", /"sort_order",/.test(src("lib/human-design/api/knowledgePersistence.ts")));

  // ══ TEST 10 ══════════════════════════════════════════════════════════════════
  section("TEST 10 — Admin üç kaynak ayrı; normal uzmanın akışı değişmez");
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { HdChartKnowledgeTabs } = await import("../../app/human-design/kayitli-haritalar/components/HdChartKnowledgeTabs");
  const expertEl = React.createElement("div", { "data-expert": "1" }, "UZMAN-ICERIK");
  const centralEl = React.createElement("div", { "data-central": "1" }, "MERKEZI-ICERIK");
  const sources = { expert: React.createElement("div", { "data-x": "1" }, "UZMAN-AYRI"), central: centralEl };
  const expertOn = renderToStaticMarkup(React.createElement(HdChartKnowledgeTabs, { chartId: "c1", allowed: true, adminSources: sources }, expertEl));
  const expertOff = renderToStaticMarkup(React.createElement(HdChartKnowledgeTabs, { chartId: "c1", allowed: false, adminSources: sources }, expertEl));
  ok("10a Uzman (yetkili): iki sekme [Uzman Bilgilerim][Sistem Yorumu]; merkezî/Roxy adı YOK", expertOn.includes("Sistem Yorumu") && !expertOn.includes("Merkezi Bilgi Bankası Yorumu") && !expertOn.includes("Roxy API Yorumu") && expertOn.includes("UZMAN-ICERIK"));
  ok("10b Uzman (yetkisiz): sekme yok, içerik birebir", expertOff === '<div data-expert="1">UZMAN-ICERIK</div>');
  const g = globalThis as Row;
  const store: Record<string, string> = {};
  g.window = g;
  g.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
  const YU = await import("../../lib/auth/yasamUser");
  const storageKey = (src("lib/auth/yasamUser.ts").match(/const STORAGE_KEY\s*=\s*"([^"]+)"/) ?? [])[1] ?? "";
  store[storageKey] = JSON.stringify({ id: "a1", email: "a@x.test", role: "admin", name: "A", full_name: "A", tenant_id: T_ADMIN, active: true, approval_status: "approved" });
  const adminParsed = YU.isAdminUser(YU.readYasamUser());
  const adminOn = renderToStaticMarkup(React.createElement(HdChartKnowledgeTabs, { chartId: "c1", allowed: true, adminSources: sources }, expertEl));
  ok("10c Admin: üç ayrı sekme — Uzman Bilgilerim / Merkezi Bilgi Bankası Yorumu / Roxy API Yorumu", adminParsed && adminOn.includes("Uzman Bilgilerim") && adminOn.includes("Merkezi Bilgi Bankası Yorumu") && adminOn.includes("Roxy API Yorumu") && !adminOn.includes(">Sistem Yorumu<"), adminParsed ? adminOn.slice(0, 400) : "admin oturumu taklit edilemedi");
  ok("10d Admin: kişisel ve merkezî içerik AYRI panellerde (karışmaz)", /id="hd-know-panel-expert"[^>]*>[\s\S]*UZMAN-AYRI[\s\S]*id="hd-know-panel-central"[^>]*>[\s\S]*MERKEZI-ICERIK/.test(adminOn) && !/hd-know-panel-expert[^>]*>[^]*MERKEZI-ICERIK[^]*hd-know-panel-central/.test(adminOn));
  ok("10e Roxy paneli ilk tıklamaya kadar yüklenmez (yeni istek yok)", !adminOn.includes("data-hd-system-reading-panel"));
  delete store[storageKey];
  const sysRoute = src("app/api/hd/charts/system-reading/route.ts");
  ok("10f Roxy yorumu kayıtlı veriden okunur; RoxyAPI çağrılmaz", /RoxyAPI ÇAĞRILMAZ/.test(sysRoute));
  const page = src("app/human-design/bilgi-bankasi/page.tsx");
  ok("10g Admin Bilgi Bankası: Roxy kaynağı düzenlenebilir kütüphane DEĞİL (haritaya yönlendirir)", /adminSource === "system"[\s\S]{0,900}kayitli-haritalar/.test(page) && /Düzenlenebilir bir kütüphane değildir/.test(page));
  ok("10h Uzman Bilgi Bankası sayfası değişmedi (!isAdmin → HdKnowledgeWorkspace)", /\{!isAdmin \? \(\s*<HdKnowledgeWorkspace isDemo=\{isDemo\} \/>/.test(page));
  const wordBtn = src("app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx");
  ok("10i Word seçimi aynı: içerik varsayılan KAPALI; admin yalnız etiket görür; merkezî içerik Word'e eklenmez notu", /useState\(false\);\s*\n\s*const \[addSystem/.test(wordBtn) && /bu Word raporuna eklenmez/.test(wordBtn) && !/isAdminUser\(/.test(wordBtn));

  // ══ TEST 11 ══════════════════════════════════════════════════════════════════
  section("TEST 11 — Merkezî kayıtlar adminin kişisel kayıtlarıyla karışmaz");
  ok("11a Kişisel uç/ad okuması yalnız human_design_knowledge_records (hd_canonical_* yok)", !/hd_canonical/.test(src("lib/human-design/api/knowledgePersistence.ts")) && !/hd_canonical/.test(src("lib/human-design/knowledge/hdNames.ts")));
  ok("11b Merkezî liste admin API'sinden (canonical) — kişisel kayıtlarla aynı listeye girmez", /hdGet<\{ rows: HdCanonicalAdminListRow\[\] \}>\(`canonical\?kind=/.test(page));
  ok("11c Rapor servisi merkezî içeriği Word'e eklemez (yalnız kişisel kayıt + Roxy)", !/hd_canonical|canonicalRead/.test(svc));

  // ══ TEST 12 ══════════════════════════════════════════════════════════════════
  section("TEST 12 — Tenant yetkileri ve gizlilik");
  asAdmin();
  const cross = await call(route.PATCH, "PATCH", U, { id: gateId, title: "21 — Ele Geçirme" });
  ok("12a Başka tenant'ın kaydı güncellenemez (404) ve değişmez", cross.status === 404 && r21().title === "21 — Aşk Kapısı");
  const adminNames = (await call(route.GET, "GET", `${U}?names=1`)).json.rows as Row[];
  ok("12b Ad listesi yalnız kendi tenant'ı", adminNames.every((r) => r.code !== "kanal_29_46") && adminNames.length === 1);
  currentGuard = null;
  const anon = await call(route.GET, "GET", `${U}?names=1`);
  ok("12c Oturumsuz istek reddedilir", anon.status === 401);
  ok("12d Tenant/user id gövdeden alınmaz (guard'dan)", KB().every((r) => r.tenant_id === T_EXPERT || r.tenant_id === T_ADMIN));

  // ══ TEST 13 ══════════════════════════════════════════════════════════════════
  section("TEST 13 — Uydurma yok; Özel Çalışma Notları Word'e girmez");
  ok("13a Rapor okuması expert_notes içermez", !/expert_notes/.test(KP.KNOWLEDGE_REPORT_COLUMNS) && rep.rows.every((r) => !("expert_notes" in (r as Row))));
  ok("13b Word metninde özel not yok", !txtNew.includes("GİZLİ-NOT-21"));
  const draftOnly = SV2.buildReportSnapshotV2(mkInput({ expertRecords: [{ category: "Kapılar", code: "kapi_21", title: "21 — Aşk Kapısı", content: "", is_active: false }] }) as never);
  ok("13c Yalnız-ad (açıklamasız taslak) kaydı Word'e yorum olarak girmez", draftOnly.commentary.expert.entries.length === 0);
  ok("13d Hiç kaydı olmayan kapı için yorum uydurulmaz", !snapNew.commentary.expert.entries.some((e) => e.code === "kapi_29" || e.code === "kapi_46"));
  ok("13e Harness boyunca dış ağ çağrısı 0", netCalls.length === 0, netCalls.join(","));

  // ══ GÜVENLİK A–L (merge öncesi) ═══════════════════════════════════════════════
  section("A — Mevcut kapi_21 adı değişir, kod aynı kalır");
  asExpert();
  const before = () => structuredClone(r21());
  let res = await call(route.PATCH, "PATCH", U, { id: gateId, category: "Kapılar", code: "kapi_21", title: "21 — Sevgi Kapısı" });
  ok("A1 Tam yük (aynı kategori/kod) + yeni ad → 200; kod kapi_21", res.status === 200 && r21().code === "kapi_21" && r21().title === "21 — Sevgi Kapısı", JSON.stringify(res));

  section("B — Doğrudan API ile kapi_21 → kapi_22 reddedilir; veri değişmez");
  let snap = before();
  res = await call(route.PATCH, "PATCH", U, { id: gateId, category: "Kapılar", code: "kapi_22", title: "22 — Başka Kapı", content: "DEĞİŞMEMELİ" });
  ok("B1 Tam yükle kod değişimi → 400 HD_IDENTITY_LOCKED", res.status === 400 && res.json.code === "HD_IDENTITY_LOCKED", JSON.stringify(res));
  ok("B2 Kayıt birebir aynı (kod, başlık, içerik, updated_at)", JSON.stringify(r21()) === JSON.stringify(snap));
  res = await call(route.PATCH, "PATCH", U, { id: gateId, code: "kapi_22" });
  ok("B3 Yalnız kod içeren kısmi istek de reddedilir; veri aynı", res.status === 400 && res.json.code === "HD_IDENTITY_LOCKED" && JSON.stringify(r21()) === JSON.stringify(snap));
  ok("B4 kapi_22 kaydı oluşmadı", !KB().some((r) => r.tenant_id === T_EXPERT && r.code === "kapi_22"));

  section("C — kanal_29_46 başka kanal koduna çevrilemez");
  const chBefore = structuredClone(KB().find((r) => r.id === chId));
  res = await call(route.PATCH, "PATCH", U, { id: chId, category: "Kanallar", code: "kanal_10_20", title: "10-20 Başka" });
  ok("C1 kanal_29_46 → kanal_10_20 → 400; kayıt değişmedi", res.status === 400 && res.json.code === "HD_IDENTITY_LOCKED" && JSON.stringify(KB().find((r) => r.id === chId)) === JSON.stringify(chBefore), JSON.stringify(res));
  res = await call(route.PATCH, "PATCH", U, { id: chId, code: "kanal_46_29" });
  ok("C2 Ters çift (kanal_46_29) de reddedilir", res.status === 400 && KB().find((r) => r.id === chId)?.code === "kanal_29_46");

  section("D — Kapılar kaydı başka kategoriye dönüştürülemez");
  snap = before();
  res = await call(route.PATCH, "PATCH", U, { id: gateId, category: "Genel Notlar", code: "not_kapi_21", title: "Not" });
  ok("D1 Kapılar → Genel Notlar → 400; veri aynı", res.status === 400 && res.json.code === "HD_IDENTITY_LOCKED" && JSON.stringify(r21()) === JSON.stringify(snap), JSON.stringify(res));
  res = await call(route.PATCH, "PATCH", U, { id: gateId, category: "Kanallar" });
  ok("D2 Yalnız kategori içeren kısmi istek de reddedilir", res.status === 400 && r21().category === "Kapılar");
  res = await call(route.PATCH, "PATCH", U, { id: chId, category: "Kapılar", code: "kapi_29" });
  ok("D3 Kanallar → Kapılar reddedilir", res.status === 400 && KB().find((r) => r.id === chId)?.category === "Kanallar");

  section("E — Başka tenant'ın kapı/kanal kaydı okunamaz/değiştirilemez");
  asAdmin();
  snap = before();
  res = await call(route.GET, "GET", `${U}?id=${gateId}`);
  ok("E1 Başka tenant GET ?id= → 404 (varlık sızdırılmaz)", res.status === 404 && !JSON.stringify(res.json).includes("Sevgi"));
  res = await call(route.PATCH, "PATCH", U, { id: gateId, category: "Kapılar", code: "kapi_21", title: "21 — Ele Geçirme" });
  ok("E2 Başka tenant PATCH → 404; veri aynı", res.status === 404 && JSON.stringify(r21()) === JSON.stringify(snap));
  res = await call(route.DELETE, "DELETE", `${U}?id=${gateId}`);
  ok("E3 Başka tenant DELETE → 404; kayıt duruyor", res.status === 404 && KB().some((r) => r.id === gateId));
  res = await call(route.GET, "GET", `${U}?codes=kapi_21,kanal_29_46`);
  ok("E4 Kod eşleşme okuması yalnız kendi tenant'ı", res.status === 200 && (res.json.rows as Row[]).every((r) => r.tenant_id === T_ADMIN));
  asExpert();
  res = await call(route.PATCH, "PATCH", U, { id: gateId, title: "21 — Sevgi Kapısı", tenant_id: T_ADMIN, user_id: "u-saldiri" });
  ok("E5 Gövdedeki tenant_id/user_id yok sayılır (sahiplik değişmez)", res.status === 200 && r21().tenant_id === T_EXPERT && r21().user_id === `u-${T_EXPERT.slice(0, 4)}`, JSON.stringify({ t: r21().tenant_id, u: r21().user_id }));

  section("F — Yalnız ad; açıklama boş kalabilir; taslak/aktif kuralları korunur");
  const f = await call(route.POST, "POST", U, { category: "Kapılar", title: "51 — Cesaret Kapısı", code: "kapi_51", content: "", is_active: false });
  const fId = String(f.json.id ?? "");
  const fRow = () => KB().find((r) => r.id === fId) ?? {};
  ok("F1 Açıklamasız taslak kayıt + ad kaydedilir", f.status === 200 && fRow().title === "51 — Cesaret Kapısı");
  res = await call(route.PATCH, "PATCH", U, { id: fId, title: "Yürek Kapısı" });
  ok("F2 Yalnız ad güncellemesi (açıklama boş) → 200", res.status === 200 && fRow().title === "51 — Yürek Kapısı");
  res = await call(route.PATCH, "PATCH", U, { id: fId, is_active: true });
  ok("F3 Boş açıklamayla aktif etme hâlâ reddedilir (mevcut kural)", res.status === 400 && fRow().is_active === false);
  const ver = String(fRow().updated_at ?? "");
  res = await call(route.PATCH, "PATCH", U, { id: fId, title: "51 — Eski Sürüm", expected_updated_at: "1999-01-01T00:00:00.000Z" });
  ok("F4 Optimistic locking korunur: bayat sürüm → 409, ad değişmez", res.status === 409 && fRow().title === "51 — Yürek Kapısı", JSON.stringify(res));
  res = await call(route.PATCH, "PATCH", U, { id: fId, title: "51 — Güncel Sürüm", expected_updated_at: ver });
  ok("F5 Güncel sürümle kimlik-kilitli güncelleme çalışır", res.status === 200 && fRow().title === "51 — Güncel Sürüm", JSON.stringify(res));

  section("G — Ad değişince önceki açıklamalar kaybolmaz");
  await call(route.PATCH, "PATCH", U, { id: gateId, content: "Kalıcı açıklama 21.", is_active: true, expert_notes: "Kalıcı özel not." });
  res = await call(route.PATCH, "PATCH", U, { id: gateId, title: "21 — Yeni Ad" });
  ok("G1 Yalnız ad değişti; açıklama/özel not/aktiflik korundu", res.status === 200 && r21().title === "21 — Yeni Ad" && r21().content === "Kalıcı açıklama 21." && r21().expert_notes === "Kalıcı özel not." && r21().is_active === true);
  res = await call(route.PATCH, "PATCH", U, { id: chId, category: "Kanallar", code: "kanal_29_46", title: "29-46 Yeni Kanal Adı" });
  ok("G2 Kanal adı değişti; kanal açıklaması korundu", res.status === 200 && KB().find((r) => r.id === chId)?.content === "Uzmanın kanal açıklaması.");
  await call(route.PATCH, "PATCH", U, { id: gateId, title: "21 — Aşk Kapısı" });
  await call(route.PATCH, "PATCH", U, { id: chId, title: "29-46 Aşk Kanalı" });

  section("H — 21. Kapı ve 29–46 yeni Word'de kişisel adla; eski snapshot değişmez");
  const ovH = N.buildHdNameOverrides(KB().filter((r) => r.tenant_id === T_EXPERT));
  const repH = await KP.listKnowledgeForReport(db as never, T_EXPERT, codes);
  const snapH = SV2.buildReportSnapshotV2(mkInput({ nameOverrides: ovH, expertRecords: repH.rows }) as never);
  const txtH = await docxText(await WV2.renderHdReportV2Buffer(snapH, {}));
  ok("H1 Word: 21. Kapı 'Aşk Kapısı', 29–46 'Aşk Kanalı'; hazır adlar yok", txtH.includes("Aşk Kapısı") && txtH.includes("Aşk Kanalı") && !txtH.includes("Haznedar kapısı") && !txtH.includes("Keşif Kanalı"));
  const frozen = JSON.stringify(snapNew);
  await call(route.PATCH, "PATCH", U, { id: gateId, title: "21 — Sonradan Ad" });
  ok("H2 Sonradan ad değişimi önceden üretilmiş snapshot'ı değiştirmez", JSON.stringify(snapNew) === frozen && snapNew.gates.find((g) => g.gate === 21)?.name === "Aşk Kapısı");
  await call(route.PATCH, "PATCH", U, { id: gateId, title: "21 — Aşk Kapısı" });

  section("I — Sıralama teknik numaraya göre; ad değişimi sırayı etkilemez");
  const renamed = gateRows.map((r) => (r.code === "kapi_60" ? { ...r, title: "60 — AAAA" } : r.code === "kapi_1" ? { ...r, title: "1 — ZZZZ" } : r));
  const sortedRen = S.sortHdKnowledgeRecords(renamed).map((r) => r.code);
  ok("I1 Ad 'AAAA'/'ZZZZ' olsa da sıra 1,51,52,54,58,60", sortedRen.join(",") === "kapi_1,kapi_51,kapi_52,kapi_54,kapi_58,kapi_60", sortedRen.join(","));
  const listed = (await call(route.GET, "GET", U)).json.rows as Row[];
  const listedGates = S.sortHdKnowledgeRecords(listed.filter((r) => r.category === "Kapılar")).map((r) => r.code);
  ok("I2 Gerçek API listesi + otomatik sıra: kapi_21 → kapi_51", listedGates.join(",") === "kapi_21,kapi_51", listedGates.join(","));

  section("J — Admin üç kaynak ayrı; uzman akışı değişmedi (bkz. TEST 10)");
  ok("J1 TEST 10 kontrollerinin tamamı geçti", !fails.some((x) => x.startsWith("10")));

  section("K — Kayıtlı Roxy yorumunu açmak yeni ücretli çağrı oluşturmaz");
  const sysPanel = src("app/human-design/kayitli-haritalar/components/HdSystemReadingPanel.tsx");
  ok("K1 Panel yalnız kayıtlı-yorum ucunu çağırır (Roxy adresi yok)", /\/api\/hd\/charts\/system-reading/.test(sysPanel) && !/roxyapi\.com|callRoxy|ROXY_API/i.test(sysPanel));
  ok("K2 Kayıtlı-yorum ucu Roxy istemcisini çağırmaz", !/callRoxy|fetchRoxy|roxyapi\.com/i.test(sysRoute));
  ok("K3 Bu çalışmanın dosyalarında Roxy çağrısı yok", !/callRoxy|roxyapi\.com/i.test(src("app/human-design/kayitli-haritalar/components/HdChartKnowledgeTabs.tsx") + src("app/human-design/bilgi-bankasi/page.tsx") + src("lib/human-design/reporting/reportSnapshotV2Service.ts")));

  section("L — Aynı kod için mükerrer kayıt oluşturulamaz");
  res = await call(route.POST, "POST", U, { category: "Kanallar", title: "29-46 İkinci", code: "kanal_29_46", content: "", is_active: false });
  ok("L1 İkinci kanal_29_46 → 409 + mevcut id", res.status === 409 && res.json.existing_id === chId);
  const note = await call(route.POST, "POST", U, { category: "Genel Notlar", title: "Bir not", code: "not_bir_not", content: "", is_active: false });
  res = await call(route.PATCH, "PATCH", U, { id: String(note.json.id), category: "Kapılar", code: "kapi_21", title: "21 — Kopya" });
  ok("L2 Başka kaydı mevcut koda (kapi_21) çevirmek → 409; kapi_21 tek", res.status === 409 && KB().filter((r) => r.tenant_id === T_EXPERT && r.code === "kapi_21").length === 1, JSON.stringify(res));
  ok("L3 Ağ çağrısı hâlâ 0", netCalls.length === 0);

  console.log(`\nHD BİLGİ BANKASI AD/SIRA/KAYNAK: ${pass} PASS / ${fail} FAIL`);
  if (fail) { for (const f of fails) console.log(` - ${f}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
