/**
 * REFLEKSOLOJİ SATIŞ ÖNCESİ NİHAİ KAPANIŞ — regresyon harness'i (tsx; DB/ağ YOK).
 *
 * Çalıştır: npm run refleksoloji:final-close:harness
 *
 * Gerçek istemci kod yolları (atlasStorage + refleksolojiAtlasSync + notesSync) sahte
 * tarayıcı (localStorage/EventTarget) ve sahte sunucu (gerçek decideAtlasPut /
 * validateAtlasPayload / reconcileNoteSync kararlarıyla) üzerinde koşar.
 *
 *   ATLAS  T1–T9   (RF-01/02/03/06/08/13)
 *   NOT    N1–N4   (RF-04/10)
 *   PROTOKOL P1–P2 (RF-09)
 *   MODAL  M1      (RF-05)   + RF-07 kaynak kilidi + atlas doğrulama
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SavedClinicalNote } from "@/app/refleksoloji/notlar/types";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(name: string, cond: unknown, detail = ""): void {
  try {
    assert.ok(cond);
    pass += 1;
    console.log(`  ✅ ${name}`);
  } catch {
    fail += 1;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string): void {
  console.log(`\n──────── ${t} ────────`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Sahte tarayıcı: cihaz başına AYRI localStorage (aynı cihazda sekmeler ORTAK) ──
class MemoryStorage {
  map = new Map<string, string>();
  /** RF-13 simülasyonu: bu desene uyan anahtara yazım kota hatası verir. */
  failPattern: RegExp | null = null;
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    if (this.failPattern && this.failPattern.test(k)) {
      const e = new Error("QuotaExceededError");
      e.name = "QuotaExceededError";
      throw e;
    }
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  get length() {
    return this.map.size;
  }
}
const devices = new Map<string, MemoryStorage>();
let ls = new MemoryStorage();
const win = new EventTarget() as EventTarget & { localStorage: MemoryStorage };
Object.defineProperty(win, "localStorage", { get: () => ls });
(globalThis as unknown as { window: unknown }).window = win;
Object.defineProperty(globalThis, "localStorage", { get: () => ls, configurable: true });

const USER = { id: "user-a", tenant_id: "tenant-a", role: "expert" };
function seedLogin(store: MemoryStorage) {
  store.map.set("yasam_user", JSON.stringify(USER));
  store.map.set("yasam_session_token", "tok-a");
}

// ─── Sahte sunucu ────────────────────────────────────────────────────────────
let clock = 0;
const tick = () => new Date(Date.UTC(2026, 9, 2, 10, 0, 0) + (clock += 1000)).toISOString();
let serverAtlas: { updated_at: string; document: unknown; organ_list: string[] } | null = null;
const serverNotes = new Map<string, { updated_at: string; raw_json: unknown }>();
let offline = false;
let hangAtlasPut = false;
let delayAtlasPutMs = 0;
const log: string[] = [];
const PLATFORM_BODY_LIMIT = 4.5 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  log.push(`${method} ${url}`);
  if (offline) throw new TypeError("Failed to fetch");
  const bodyStr = typeof init?.body === "string" ? init.body : "";
  if (Buffer.byteLength(bodyStr, "utf8") > PLATFORM_BODY_LIMIT) {
    return new Response("Request Entity Too Large\nFUNCTION_PAYLOAD_TOO_LARGE", { status: 413 });
  }
  const { decideAtlasPut } = await import("@/lib/refleksoloji/atlasSyncCore");
  const { validateAtlasPayload } = await import("@/lib/refleksoloji/atlasValidate");
  const { prepareNoteSyncBatch } = await import("@/lib/refleksoloji/notesSyncBatch");
  const { reconcileNoteSync } = await import("@/lib/refleksoloji/notesConcurrency");

  if (url === "/api/refleksoloji/atlas") {
    if (method === "GET") {
      return json({
        ok: true,
        document: srvDoc() ?? null,
        organ_list: serverAtlas?.organ_list ?? [],
        updated_at: serverAtlas?.updated_at ?? null,
      });
    }
    if (hangAtlasPut) {
      // Askıda kalan istek: yalnız AbortController ile biter.
      return await new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(init.signal?.reason ?? new Error("aborted")));
      });
    }
    if (delayAtlasPutMs > 0) await sleep(delayAtlasPutMs);
    const body = JSON.parse(bodyStr || "{}");
    const invalid = validateAtlasPayload({
      document: body.document,
      organList: body.organ_list,
      bodyBytes: Buffer.byteLength(bodyStr, "utf8"),
    });
    if (invalid) return json({ ok: false, code: invalid.code }, invalid.status);
    const d = decideAtlasPut({
      current: serverAtlas,
      expected: typeof body.expected_updated_at === "string" ? body.expected_updated_at : null,
      incomingDocument: body.document,
      incomingOrganList: body.organ_list ?? [],
      allowEmpty: body.allow_empty === true,
    });
    if (d.kind === "conflict") return json({ ok: false, conflict: true, code: d.code }, 409);
    const updated_at = tick();
    serverAtlas = { updated_at, document: body.document, organ_list: body.organ_list ?? [] };
    return json({ ok: true, updated_at });
  }

  if (url === "/api/refleksoloji/notes") {
    if (method === "GET") {
      return json({
        ok: true,
        notes: [...serverNotes.values()].map((r) => ({ ...(r.raw_json as object), baseUpdatedAt: r.updated_at })),
      });
    }
    const body = JSON.parse(bodyStr || "{}");
    const prepared = prepareNoteSyncBatch(body);
    if (!prepared.ok) return json({ ok: false }, prepared.error.status);
    const store = {
      async getManyByUid(uids: string[]) {
        const m = new Map<string, { updated_at: string; raw_json: unknown }>();
        for (const u of uids) if (serverNotes.has(u)) m.set(u, serverNotes.get(u)!);
        return m;
      },
      async casUpdate(uid: string, expected: string, fields: Record<string, unknown>, now: string) {
        const r = serverNotes.get(uid);
        if (!r || r.updated_at !== expected) return null;
        const next = { updated_at: now, raw_json: fields.raw_json };
        serverNotes.set(uid, next);
        return next;
      },
      async getByUid(uid: string) {
        return serverNotes.get(uid) ?? null;
      },
      async createNote(uid: string, fields: Record<string, unknown>, now: string) {
        const next = { updated_at: now, raw_json: fields.raw_json };
        serverNotes.set(uid, next);
        return next;
      },
      async deleteNote(uid: string, expected: string | null) {
        const r = serverNotes.get(uid);
        if (r && (!expected || r.updated_at === expected)) {
          serverNotes.delete(uid);
          return { deleted: 1, existsAfter: null };
        }
        return { deleted: 0, existsAfter: serverNotes.get(uid) ?? null };
      },
    };
    const r = await reconcileNoteSync(store as never, prepared.valid, prepared.deletions, tick(), prepared.rejected);
    return json({ ok: r.conflicts === 0 && r.rejected === 0, ...r }, r.conflicts > 0 ? 409 : 200);
  }
  return json({ ok: false }, 404);
}
(globalThis as unknown as { fetch: unknown }).fetch = fakeFetch;

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
/** Kapanış içinde atanan sunucu durumunu TS daraltmasından bağımsız okur. */
const srvDoc = (): unknown => (serverAtlas as { document: unknown } | null)?.document;
type R = Record<string, unknown>;
const reg = (id: string, cx = 0.3, cy = 0.4): R => ({ id, shape: "oval", cx, cy, rx: 0.05, ry: 0.05, angle: 0, color: "rgba(1,2,3,0.2)" });
const emptyEntry = () => ({ taban: { sol: [], sag: [] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } });
function entryWith(cells: Array<[string, "sol" | "sag", R]>) {
  const e = emptyEntry() as Record<string, Record<string, R[]>>;
  for (const [view, foot, r] of cells) e[view][foot].push(r);
  return e;
}
function regionIdsOf(doc: unknown, organ: string): string[] {
  const e = (doc as Record<string, Record<string, Record<string, R[]>>> | null)?.[organ];
  if (!e) return [];
  const ids: string[] = [];
  for (const view of Object.keys(e)) for (const foot of ["sol", "sag"]) for (const r of e[view]?.[foot] ?? []) ids.push(String(r.id));
  return ids.sort();
}

async function main() {
  const atlasStorage = await import("@/lib/atlasStorage");
  const atlasSync = await import("@/lib/refleksolojiAtlasSync");
  const runtime = await import("@/lib/refleksoloji/runtimeReset");
  const merge = await import("@/lib/refleksoloji/atlasMerge");
  const core = await import("@/lib/refleksoloji/atlasSyncCore");
  const validate = await import("@/lib/refleksoloji/atlasValidate");
  const normalize = await import("@/lib/refleksoloji/atlasNormalize");
  const syncStatus = await import("@/lib/refleksoloji/syncStatus");

  /**
   * Cihaz değiştir: ayrı localStorage. YENİ cihazda modül durumu sıfırlanır (taze sayfa);
   * zaten açık bir cihaza dönüşte sayfası açık kalmış sayılır (hidrasyon korunur, bayat
   * olabilir — 409 yolu böyle sınanır). Sayfa yenileme ayrıca resetReflexologyRuntime ile.
   */
  function switchDevice(name: string) {
    const fresh = !devices.has(name);
    if (fresh) {
      const s = new MemoryStorage();
      seedLogin(s);
      devices.set(name, s);
    }
    ls = devices.get(name)!;
    if (fresh) runtime.resetReflexologyRuntime();
  }
  async function openAtlasPage() {
    await atlasStorage.hydrateAndMergeAtlas();
    await atlasSync.flushAtlasNow(); // varsa otomatik gönderim (RF-03) — debounce'u beklemeden
  }
  /** Bölge Haritası'ndaki "Kaydet" (useAtlasWorkspace.handleSave) ile AYNI yol: güncel depo + taslak. */
  function saveRegion(organ: string, view: "taban" | "yan_ic" | "yan_dis", foot: "left" | "right", r: R) {
    const next = atlasStorage.mergeDraftIntoAtlas(atlasStorage.loadAtlas(), [
      { ...(r as object), organ, view, footSide: foot } as never,
    ]);
    return atlasStorage.saveAtlas(next);
  }
  function seedServer(doc: R, list: string[]) {
    serverAtlas = { updated_at: tick(), document: doc, organ_list: list };
  }

  // ════════════════════════════════════════════════════════════════════════
  section("SAF 3-yollu birleştirme (mergeAtlasThreeWay)");
  {
    const base = { _meta: {}, Mide: entryWith([["taban", "sol", reg("r0")]]) };
    const local = { _meta: {}, Mide: entryWith([["taban", "sol", reg("r0")], ["taban", "sol", reg("r1")]]) };
    const server = { _meta: {}, Mide: entryWith([["taban", "sol", reg("r0")], ["yan_ic", "sag", reg("r2")]]) };
    const r = merge.mergeAtlasThreeWay(server, local, base);
    ok("aynı organ, farklı yüzey: iki taraftaki yeni bölge de korunur", regionIdsOf(r.document, "Mide").join() === "r0,r1,r2");
    ok("bağımsız değişiklikte çakışma raporu YOK", r.conflicts.length === 0 && r.mode === "three-way");

    const moved = { _meta: {}, Mide: entryWith([["taban", "sol", reg("r0", 0.5, 0.5)]]) };
    const added = { _meta: {}, Mide: entryWith([["taban", "sol", reg("r0")], ["taban", "sag", reg("r3")]]) };
    const r2 = merge.mergeAtlasThreeWay(added, moved, base);
    const r0 = (r2.document.Mide as Record<string, Record<string, R[]>>).taban.sol.find((x) => x.id === "r0");
    ok("yerel taşıma + uzak ekleme → ikisi de korunur", r0?.cx === 0.5 && regionIdsOf(r2.document, "Mide").includes("r3"));

    const editA = { _meta: {}, Mide: entryWith([["taban", "sol", reg("r0", 0.6, 0.6)]]) };
    const editB = { _meta: {}, Mide: entryWith([["taban", "sol", reg("r0", 0.1, 0.1)]]) };
    const r3 = merge.mergeAtlasThreeWay(editB, editA, base);
    ok("gerçek çakışma (aynı bölge iki yerde farklı) → yerel korunur + conflicts raporu",
      r3.conflicts.includes("Mide") && ((r3.document.Mide as Record<string, Record<string, R[]>>).taban.sol[0].cx === 0.6));

    const delLocal = { _meta: { tombstones: {} }, Mide: entryWith([]) };
    const r4 = merge.mergeAtlasThreeWay(editB, delLocal, base);
    ok("yerel bölge silme × uzak düzenleme → düzenleme kazanır (sessiz kayıp yok)", regionIdsOf(r4.document, "Mide").join() === "r0");

    // Mezar taşsız organ kaybı (RF-13 bozuk/bayat yerel) → organ KORUNUR
    const r5 = merge.mergeAtlasThreeWay(base, { _meta: {} }, base);
    ok("mezar taşsız kaybolan organ silme sayılmaz (toplu küçülme koruması)", regionIdsOf(r5.document, "Mide").join() === "r0");
    // Meşru silme (mezar taşlı) → organ silinir + mezar taşı korunur
    const r6 = merge.mergeAtlasThreeWay(base, { _meta: { tombstones: { mide: "2026-10-02T10:00:00.000Z" } } }, base);
    ok("mezar taşlı organ silme uygulanır", !("Mide" in r6.document) && !!r6.document._meta?.tombstones?.mide);
    // Base yok (ilk geçiş) → birleşim, hiçbir bölge düşmez
    const r7 = merge.mergeAtlasThreeWay(server, local, null);
    ok("base yokken birleşim: tüm bölgeler korunur", regionIdsOf(r7.document, "Mide").join() === "r0,r1,r2" && r7.mode === "union");
    // Aynı organın iki anahtarı (NFC/NFD) → bölgeler birleşir
    const nfd = "karaciğer";
    const dup = { _meta: {}, "karaciğer": entryWith([["taban", "sol", reg("k1")]]), [nfd]: entryWith([["taban", "sag", reg("k2")]]) };
    const r8 = merge.mergeAtlasThreeWay(dup, dup, dup);
    ok("aynı kanonik organın iki anahtarı → bölgeler tek organda birleşir", regionIdsOf(r8.document, "karaciğer").join() === "k1,k2");
    // Organ listesi 3-yollu
    const ol = merge.mergeOrganListThreeWay(["Mide", "Kalp"], ["Mide", "Böbrek"], ["Mide"], {}, []);
    ok("organ listesi: iki taraftaki yeni ad korunur", ol.join() === "Böbrek,Kalp,Mide");
    const ol2 = merge.mergeOrganListThreeWay(["Mide", "Kalp"], ["Mide"], ["Mide", "Kalp"], {}, []);
    ok("organ listesi: yalnız yerelde değişmeyen ad uzaktan korunur", ol2.includes("Kalp"));
  }

  // ════════════════════════════════════════════════════════════════════════
  section("T1 — base boş; A ve B farklı yüzeylere bölge ekler, ikisi de kaydeder");
  {
    serverAtlas = null;
    switchDevice("A1");
    await openAtlasPage();
    switchDevice("B1");
    await openAtlasPage();
    switchDevice("A1");
    saveRegion("Mide", "taban", "left", reg("a1"));
    await atlasSync.flushAtlasNow();
    switchDevice("B1");
    saveRegion("Mide", "yan_ic", "right", reg("b1"));
    await atlasSync.flushAtlasNow();
    ok("T1 sunucuda iki bölge de var", regionIdsOf(srvDoc(), "Mide").join() === "a1,b1", JSON.stringify(regionIdsOf(srvDoc(), "Mide")));
    switchDevice("A1");
    await openAtlasPage();
    ok("T1 A yeniden açınca B'nin bölgesini de görür", regionIdsOf(atlasStorage.loadAtlas(), "Mide").join() === "a1,b1");
  }

  section("T2 — aynı organda bağımsız iki değişiklik (taşı × ekle) → sessiz kayıp yok");
  {
    seedServer({ _meta: {}, Mide: entryWith([["taban", "sol", reg("m0")]]) }, ["Mide"]);
    switchDevice("A2");
    await openAtlasPage();
    switchDevice("B2");
    await openAtlasPage();
    switchDevice("A2");
    saveRegion("Mide", "taban", "left", reg("m0", 0.7, 0.7)); // taşı
    await atlasSync.flushAtlasNow();
    switchDevice("B2");
    saveRegion("Mide", "yan_dis", "left", reg("m9")); // ekle
    await atlasSync.flushAtlasNow();
    const sDoc = srvDoc() as Record<string, Record<string, Record<string, R[]>>>;
    ok("T2 taşınan bölge yeni konumda", sDoc.Mide.taban.sol.find((x) => x.id === "m0")?.cx === 0.7);
    ok("T2 diğer cihazın eklediği bölge de var", regionIdsOf(sDoc, "Mide").includes("m9"));
  }

  section("T3 — bayat sekme: B yeni organ kaydeder, A başka organda kaydeder → B korunur");
  {
    seedServer({ _meta: {}, Mide: entryWith([["taban", "sol", reg("s0")]]) }, ["Mide"]);
    switchDevice("TAB"); // A ve B AYNI cihaz (ortak depo)
    await openAtlasPage();
    const staleA = atlasStorage.loadAtlas(); // A sekmesi mount anı state'i
    saveRegion("Böbrek", "taban", "right", reg("bx")); // B sekmesi
    await atlasSync.flushAtlasNow();
    ok("T3 B'nin organı sunucuda", regionIdsOf(srvDoc(), "Böbrek").join() === "bx");
    // A sekmesi (yeni handleSave): güncel depo + kendi taslağı
    saveRegion("Mide", "taban", "left", reg("s1"));
    await atlasSync.flushAtlasNow();
    ok("T3 A kaydı sonrası B'nin organı KORUNDU", regionIdsOf(srvDoc(), "Böbrek").join() === "bx");
    ok("T3 A'nın bölgesi de kaydedildi", regionIdsOf(srvDoc(), "Mide").join() === "s0,s1");
    // Savunma-derinliği: eski kod gibi BAYAT state'ten tam belge yazılsa bile sunucu reddeder,
    // istemci 3-yollu birleştirip yeniden dener → B'nin organı yine korunur.
    const staleNext = atlasStorage.mergeDraftIntoAtlas(staleA, [{ ...(reg("s2") as object), organ: "Mide", view: "taban", footSide: "left" } as never]);
    atlasStorage.saveAtlas(staleNext);
    await atlasSync.flushAtlasNow();
    ok("T3 bayat tam belge bile B'nin organını SİLEMEDİ (ATLAS_SHRINK + birleştirme)", regionIdsOf(srvDoc(), "Böbrek").join() === "bx");
    ok("T3 bayat sekmenin yeni bölgesi de kaydedildi", regionIdsOf(srvDoc(), "Mide").includes("s2"));
    const shrink = core.decideAtlasPut({
      current: { updated_at: "U", document: { _meta: {}, Mide: entryWith([]), Böbrek: entryWith([]) }, organ_list: [] },
      expected: "U",
      incomingDocument: { _meta: { tombstones: {} }, Mide: entryWith([]) },
      incomingOrganList: [],
      allowEmpty: false,
    });
    ok("T3 sunucu: mezar taşsız organ düşüren PUT → 409 ATLAS_SHRINK", shrink.kind === "conflict" && shrink.code === "ATLAS_SHRINK");
    const legit = core.decideAtlasPut({
      current: { updated_at: "U", document: { _meta: {}, Mide: entryWith([]), Böbrek: entryWith([]) }, organ_list: [] },
      expected: "U",
      incomingDocument: { _meta: { tombstones: { böbrek: "2026-10-02T10:00:00.000Z" } }, Mide: entryWith([]) },
      incomingOrganList: [],
      allowEmpty: false,
    });
    ok("T3 sunucu: mezar taşlı (meşru) organ silme → kabul", legit.kind === "update");
  }

  section("T4 — PUT başarısız + yerel değişiklik → yenile/hydrate → değişiklik kaybolmaz");
  {
    seedServer({ _meta: {}, Mide: entryWith([["taban", "sol", reg("p0")]]) }, ["Mide"]);
    switchDevice("T4");
    await openAtlasPage();
    offline = true;
    saveRegion("Mide", "yan_dis", "right", reg("p1"));
    await atlasSync.flushAtlasNow();
    const st = syncStatus.getReflexologySyncStatus();
    ok("T4 başarısız PUT sessiz başarı DEĞİL (offline/error durumu)", st.state === "offline" || st.state === "error", st.state);
    ok("T4 sunucuda henüz yok", !regionIdsOf(srvDoc(), "Mide").includes("p1"));
    offline = false;
    runtime.resetReflexologyRuntime(); // sayfa yenileme
    await openAtlasPage();
    ok("T4 yenileme sonrası yerelde KORUNDU", regionIdsOf(atlasStorage.loadAtlas(), "Mide").includes("p1"));
    ok("T4 yenileme sonrası OTOMATİK gönderildi (sunucuda)", regionIdsOf(srvDoc(), "Mide").includes("p1"));
  }

  section("T5 — depolama yazımı başarısız → taban ilerlemez, sonraki küçük kayıt sunucuyu küçültemez");
  {
    seedServer(
      { _meta: {}, Mide: entryWith([["taban", "sol", reg("q0")]]), Kalp: entryWith([["taban", "sag", reg("q1")]]), Dalak: entryWith([["yan_ic", "sol", reg("q2")]]) },
      ["Mide", "Kalp", "Dalak"],
    );
    switchDevice("T5"); // yeni cihaz, boş yerel
    const baseBefore = atlasSync.loadAtlasBase();
    ls.failPattern = /:atlas$/; // atlas yazımı kota hatası
    const r = await atlasStorage.hydrateAndMergeAtlas();
    ok("T5 hydrate depolama hatasında null döner", r === null);
    ok("T5 taban İLERLEMEDİ", JSON.stringify(atlasSync.loadAtlasBase()) === JSON.stringify(baseBefore));
    ok("T5 hidrasyon tamamlanmış SAYILMADI", !atlasSync.isAtlasHydrated());
    ok("T5 kullanıcıya depolama hatası gösterildi", syncStatus.getReflexologySyncStatus().state === "error");
    ls.failPattern = null;
    const putsBefore = log.filter((l) => l.startsWith("PUT /api/refleksoloji/atlas")).length;
    saveRegion("Mide", "taban", "left", reg("q9")); // küçük kayıt (yerel yalnız Mide)
    await atlasSync.flushAtlasNow();
    ok("T5 hidrasyon yokken PUT GÖNDERİLMEDİ", log.filter((l) => l.startsWith("PUT /api/refleksoloji/atlas")).length === putsBefore);
    ok("T5 sunucu atlası KÜÇÜLMEDİ (3 organ)", ["Mide", "Kalp", "Dalak"].every((o) => regionIdsOf(srvDoc(), o).length > 0));
    await openAtlasPage(); // depolama düzeldi → normal hidrasyon
    ok("T5 düzelince 3 organ + yeni bölge birlikte", regionIdsOf(srvDoc(), "Kalp").join() === "q1" && regionIdsOf(srvDoc(), "Mide").includes("q9"));
  }

  section("T6 — uçuştaki PUT sırasında sayfa geçişi (hydrate) → kayıp yok");
  {
    seedServer({ _meta: {}, Mide: entryWith([["taban", "sol", reg("v0")]]) }, ["Mide"]);
    switchDevice("T6");
    await openAtlasPage();
    delayAtlasPutMs = 300;
    saveRegion("Mide", "taban", "right", reg("v1"));
    const inflight = atlasSync.flushAtlasNow();
    await sleep(50);
    runtime.resetReflexologyRuntime(); // route değişimi (yeni sayfa modülü durumu)
    await atlasStorage.hydrateAndMergeAtlas(); // yeni sayfanın hydrate'i PUT bitmeden
    ok("T6 hydrate sırasında yerel değişiklik KORUNDU", regionIdsOf(atlasStorage.loadAtlas(), "Mide").includes("v1"));
    await inflight;
    delayAtlasPutMs = 0;
    await atlasSync.flushAtlasNow();
    ok("T6 sonuçta sunucuda", regionIdsOf(srvDoc(), "Mide").includes("v1"));
  }

  section("T7 — çift kaydet (çift tık) → tutarlı tek içerik, hata yok");
  {
    seedServer({ _meta: {}, Mide: entryWith([]) }, ["Mide"]);
    switchDevice("T7");
    await openAtlasPage();
    saveRegion("Mide", "taban", "left", reg("d1"));
    const a = atlasSync.flushAtlasNow();
    saveRegion("Mide", "taban", "left", reg("d1"));
    const b = atlasSync.flushAtlasNow();
    const [ra, rb] = await Promise.all([a, b]);
    ok("T7 iki flush da hatasız (ok/unchanged)", ["ok", "unchanged"].includes(ra.status) && ["ok", "unchanged"].includes(rb.status), `${ra.status}/${rb.status}`);
    ok("T7 bölge tek kez", regionIdsOf(srvDoc(), "Mide").join() === "d1");
    ok("T7 durum 'kaydedildi'", syncStatus.getReflexologySyncStatus().state === "synced");
  }

  section("T8 — askıda kalan PUT zaman aşımına uğrar, zinciri kilitlemez, retry çalışır");
  {
    seedServer({ _meta: {}, Mide: entryWith([]) }, ["Mide"]);
    switchDevice("T8");
    await openAtlasPage();
    atlasSync.__setAtlasRequestTimeoutMsForTests(300);
    hangAtlasPut = true;
    saveRegion("Mide", "yan_ic", "left", reg("h1"));
    const t0 = Date.now();
    const out = await atlasSync.flushAtlasNow();
    const st = syncStatus.getReflexologySyncStatus();
    ok("T8 zaman aşımında hata (sessiz başarı yok)", out.status === "error" && st.state === "error" && /zaman aşımı/.test(st.message), st.message);
    ok("T8 süre sınırlı (≤2 sn)", Date.now() - t0 < 2000);
    ok("T8 'Yeniden dene' sunuldu", typeof st.retry === "function");
    ok("T8 değişiklik cihazda bekliyor", atlasSync.atlasHasUnsyncedChanges());
    hangAtlasPut = false;
    const out2 = await atlasSync.flushAtlasNow();
    ok("T8 zincir kilitlenmedi; retry başarılı", out2.status === "ok" && regionIdsOf(srvDoc(), "Mide").includes("h1"));
    atlasSync.__setAtlasRequestTimeoutMsForTests(20_000);
  }

  section("T9 — görsel doğal boyutu (naturalSize) yokken çizim yok (kaynak kilidi)");
  {
    const src = readFileSync("app/refleksoloji/bolge-haritasi/components/FootCanvas.tsx", "utf8");
    ok("T9 imageReady naturalSize>0 koşulu", /const imageReady = !imageLoadError && naturalSize\.w > 0 && naturalSize\.h > 0/.test(src));
    ok("T9 canDraw imageReady gerektirir", /const canDraw = isAddMode && activeOrgan && imageReady/.test(src));
    ok("T9 pointerdown imageReady olmadan çizmez", /!activeOrgan \|\| !imageReady\) return;/.test(src));
    ok("T9 overlay (bölgeler + çizim katmanı) görsel hazır olmadan render edilmez", /\{imageReady && imageRect\.width > 0 \? \(/.test(src));
    ok("T9 yükleniyor durumu gösterilir", /Ayak görseli yükleniyor…/.test(src));
    ok("T9 önbellekten yüklenmiş görsel yarışı ele alınır (img.complete)", /img\.complete && img\.naturalWidth > 0/.test(src));
    const { computeObjectContainRect } = await import("@/app/refleksoloji/bolge-haritasi/utils/imageContainRect");
    const full = computeObjectContainRect(930, 753, 0, 0);
    ok("T9 (neden) naturalSize=0 iken contain-rect tüm konteyner olur → kilit gerekli", full.width === 930 && full.height === 753);
  }

  section("Atlas sunucu doğrulaması (dar hardening)");
  {
    const good = { _meta: {}, Mide: entryWith([["taban", "sol", reg("g1")]]) };
    ok("geçerli belge → kabul", validate.validateAtlasPayload({ document: good, organList: ["Mide"], bodyBytes: 500 }) === null);
    const nullReg = { _meta: {}, Mide: { taban: { sol: [null], sag: [] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } } };
    ok("null bölge → 400 ATLAS_INVALID", validate.validateAtlasPayload({ document: nullReg, organList: [], bodyBytes: 500 })?.status === 400);
    const badPts = { _meta: {}, Mide: entryWith([["taban", "sol", { ...reg("b1"), shape: "free_draw", points: "x" }]]) };
    ok("dizi olmayan points → 400", validate.validateAtlasPayload({ document: badPts, organList: [], bodyBytes: 500 })?.status === 400);
    const nan = { _meta: {}, Mide: entryWith([["taban", "sol", { ...reg("n1"), cx: "0.3" }]]) };
    ok("sayı olmayan koordinat → 400", validate.validateAtlasPayload({ document: nan, organList: [], bodyBytes: 500 })?.status === 400);
    ok("aşırı büyük gövde → 413", validate.validateAtlasPayload({ document: good, organList: [], bodyBytes: 4.2 * 1024 * 1024 })?.status === 413);
    ok("belge nesne değil → 400", validate.validateAtlasPayload({ document: [], organList: [], bodyBytes: 10 })?.status === 400);
    const norm = normalize.normalizeAtlasDocument(nullReg) as unknown as Record<string, Record<string, Record<string, unknown[]>>>;
    ok("istemci normalize null bölgeyi ayıklar (renderer/Word çökmez)", norm.Mide.taban.sol.length === 0);
    const extra = { _meta: {}, Mide: entryWith([["taban", "sol", { ...reg("e1"), future: { a: 1 } }]]) };
    ok("bilinmeyen ekstra alan geriye uyum için kabul", validate.validateAtlasPayload({ document: extra, organList: [], bodyBytes: 500 }) === null);
  }

  // ════════════════════════════════════════════════════════════════════════
  const nv = await import("@/lib/refleksoloji/notesValidation");
  const ncore = await import("@/lib/refleksoloji/notesClientCore");
  const notesSync = await import("@/app/refleksoloji/notlar/lib/notesSync");
  const noteStorage = await import("@/app/refleksoloji/notlar/lib/noteStorage");
  const mkNote = (id: string, over: Partial<SavedClinicalNote> = {}): SavedClinicalNote => ({
    id,
    title: `QA ${id}`,
    date: "2026-10-02",
    content: `içerik ${id}`,
    attachments: [],
    createdAt: "2026-10-02T10:00:00.000Z",
    updatedAt: "2026-10-02T10:00:00.000Z",
    dirty: true,
    ...over,
  });
  const bigAttachment = (bytes: number) => ({
    id: "att-big",
    displayName: "big.png",
    fileName: "big.png",
    mimeType: "image/png",
    size: bytes,
    dataUrl: `data:image/png;base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`,
  });

  section("N1 — sınır üstü ek istemcide (istek gitmeden) reddedilir");
  {
    ok("N1 3.5 MB dosya reddedilir (en fazla 3 MB)", !nv.checkNoteAttachmentFile({ name: "a.png", type: "image/png", size: 3.5 * 1024 * 1024 }).ok);
    ok("N1 2.9 MB dosya kabul", nv.checkNoteAttachmentFile({ name: "a.png", type: "image/png", size: 2.9 * 1024 * 1024 }).ok);
    ok("N1 not toplamı 3 MB'ı aşınca reddedilir", nv.checkNoteAttachmentsTotal(2 * 1024 * 1024, 1.5 * 1024 * 1024, "b.png") !== null);
    ok("N1 not toplamı sınır içinde kabul", nv.checkNoteAttachmentsTotal(1 * 1024 * 1024, 1.5 * 1024 * 1024, "b.png") === null);
    const maxNote = mkNote("max", { attachments: [bigAttachment(nv.NOTE_ATTACHMENTS_TOTAL_MAX_BYTES)] });
    const wire = JSON.stringify({ notes: [ncore.toWireNote(maxNote)], deleted_uids: [] });
    ok("N1 sınırdaki (3 MB) ekli not tek istekte platform sınırının ALTINDA", Buffer.byteLength(wire) < PLATFORM_BODY_LIMIT && Buffer.byteLength(wire) < nv.NOTE_SYNC_REQUEST_SAFE_BYTES,
      `${Buffer.byteLength(wire)} bayt`);
  }

  section("N2 — büyük ek başarısız olsa bile başka küçük not sunucuya gider");
  {
    const plan = ncore.planNoteSyncChunks(
      [mkNote("big", { attachments: [bigAttachment(3.6 * 1024 * 1024)] }), mkNote("small")],
      [],
      { safeBytes: nv.NOTE_SYNC_REQUEST_SAFE_BYTES },
    );
    ok("N2 plan: büyük not 'oversize', küçük not parçada", plan.oversize.map((n) => n.id).join() === "big" && plan.chunks.flatMap((c) => c.notes.map((n) => n.id)).join() === "small");
    serverNotes.clear();
    switchDevice("N2");
    noteStorage.saveNotesToStorage([
      mkNote("eski-buyuk", { attachments: [bigAttachment(3.6 * 1024 * 1024)] }), // eski 4MB kuralıyla eklenmiş
      mkNote("kucuk-1"),
      mkNote("kucuk-2"),
    ]);
    const out = await notesSync.flushNotesNow();
    ok("N2 küçük notlar sunucuda", serverNotes.has("kucuk-1") && serverNotes.has("kucuk-2"));
    ok("N2 büyük not gönderilmedi ve yerelde 'reddedildi' işaretli", !serverNotes.has("eski-buyuk") && !!noteStorage.loadNotesFromStorage().find((n) => n.id === "eski-buyuk")?.syncRejected);
    ok("N2 büyük not SİLİNMEDİ (cihazda duruyor)", !!noteStorage.loadNotesFromStorage().find((n) => n.id === "eski-buyuk"));
    ok("N2 kullanıcıya görünür durum", out.status === "rejected" && syncStatus.getReflexologySyncStatus().state === "error");
    const putsBefore = log.filter((l) => l === "PUT /api/refleksoloji/notes").length;
    noteStorage.saveNotesToStorage([...noteStorage.loadNotesFromStorage(), mkNote("kucuk-3")]);
    await notesSync.flushNotesNow();
    ok("N2 sonraki not da gider (kalıcı blokaj yok)", serverNotes.has("kucuk-3") && log.filter((l) => l === "PUT /api/refleksoloji/notes").length === putsBefore + 1);
    // Planlayıcı tahmini yetmese bile (platform 413) tek tek denenir
    const plan2 = ncore.planNoteSyncChunks([mkNote("x1"), mkNote("x2")], [], { safeBytes: 10_000_000 });
    ok("N2 normal küçük notlar tek parçada (gereksiz istek yok)", plan2.chunks.length === 1);
  }

  section("N3 — iki sekme aynı notu değiştirir → çakışma görünür (sessiz ezme yok)");
  {
    const opened = mkNote("n3", { updatedAt: "2026-10-02T10:00:00.000Z" });
    const savedByOtherTab = { ...opened, updatedAt: "2026-10-02T10:05:00.000Z" };
    ok("N3 diğer sekme kaydettiyse çakışma algılanır", ncore.hasLocalEditConflict(savedByOtherTab, opened.updatedAt));
    ok("N3 değişmediyse çakışma yok", !ncore.hasLocalEditConflict(opened, opened.updatedAt));
    ok("N3 kullanıcı bilinçli 'üzerine yaz' derse çakışma engellemez", !ncore.hasLocalEditConflict(savedByOtherTab, opened.updatedAt, true));
    ok("N3 yeni not (önceki yok) çakışma değildir", !ncore.hasLocalEditConflict(undefined, null));
    const hook = readFileSync("app/refleksoloji/notlar/hooks/useClinicalNotes.ts", "utf8");
    const list = readFileSync("app/refleksoloji/notlar/components/KlinikNotlarLayout.tsx", "utf8");
    const detail = readFileSync("app/refleksoloji/notlar/components/NotDetayLayout.tsx", "utf8");
    ok("N3 hook çakışmada kaydetmez", /hasLocalEditConflict\(previous, opts\.expectedUpdatedAt, opts\.force\)/.test(hook));
    ok("N3 liste ekranı düzenleme başlangıç sürümünü gönderir + onay sorar",
      /expectedUpdatedAt: editingSince/.test(list) && /Üzerine yaz/.test(list) && /setEditingSince\(note\.updatedAt\)/.test(list));
    ok("N3 detay ekranı düzenleme başlangıç sürümünü gönderir + onay sorar",
      /expectedUpdatedAt: editingSince/.test(detail) && /Üzerine yaz/.test(detail));
  }

  section("N4 — çift kaydet → tek kayıt");
  {
    switchDevice("N4");
    const n = mkNote("n4");
    notesSync.saveNotesAndSync([n]);
    notesSync.saveNotesAndSync([n]);
    await Promise.all([notesSync.flushNotesNow(), notesSync.flushNotesNow()]);
    ok("N4 sunucuda tek satır", [...serverNotes.keys()].filter((k) => k === "n4").length === 1);
    ok("N4 yerelde tek not", noteStorage.loadNotesFromStorage().filter((x) => x.id === "n4").length === 1);
  }

  // ════════════════════════════════════════════════════════════════════════
  const psc = await import("@/lib/refleksoloji/protocolSyncCore");
  section("P1/P2 — silinen protokol bayat düzenlemeyle DİRİLMEZ; normal güncelleme bozulmaz");
  {
    const del = psc.decideProtocolMissingRow("2026-10-02T10:00:00.000Z");
    ok("P1 satır yok + expected var → 409 PROTOCOL_DELETED (yeni satır yok)", del.kind === "conflict" && del.code === "PROTOCOL_DELETED");
    ok("P1 satır yok + expected yok (hiç eşitlenmemiş yerel kayıt) → ekle", psc.decideProtocolMissingRow(null).kind === "insert");
    const route = readFileSync("app/api/refleksoloji/protocols/by-uid/[uid]/route.ts", "utf8");
    const iDel = route.indexOf("decideProtocolMissingRow(expected)");
    const iIns = route.indexOf('.insert({ ...fields, tenant_id: tenantId, source_uid: uid })');
    ok("P1 route: diriltme kontrolü insert'ten ÖNCE", iDel > 0 && iIns > iDel);
    const editor = readFileSync("app/refleksoloji/protokol-haritasi/components/ProtokolHaritasiLayout.tsx", "utf8");
    ok("P1 editör: sunucuda olmayan eşitlenmiş kopyadan düzenleme açılmaz", /setEditDeletedElsewhere\(true\)/.test(editor) && !/setEditBaseVersion\(null\);\s*setEditState\("ready"\);\s*return;\s*}\s*setEditState\("notfound"\)/.test(editor));
    const registry = readFileSync("app/refleksoloji/protokol-haritasi/hooks/useProtocolRegistry.ts", "utf8");
    ok("P1 istemci 409 PROTOCOL_DELETED'i ayrı ve açık mesajla gösterir", /PROTOCOL_DELETED/.test(registry) && /PROTOCOL_DELETED_ERROR/.test(registry));
    ok("P2 normal CAS: aynı sürüm → kabul", psc.decideProtocolCas("v1", "v1").ok === true);
    ok("P2 farklı sürüm → PROTOCOL_STALE", psc.decideProtocolCas("v1", "v2").ok === false);
    ok("P2 expected yok (eski istemci) → koşulsuz (geriye uyum)", psc.decideProtocolCas(null, "v2").ok === true);
  }

  section("M1 — Atlas düzenle modalı açıkken onay penceresi EN ÜSTTE ve kullanılabilir");
  {
    const confirmSrc = readFileSync("components/ui/ConfirmProvider.tsx", "utf8");
    const modalSrc = readFileSync("app/refleksoloji/kayitli-atlas/components/AtlasEditModal.tsx", "utf8");
    const z = (s: string) => Math.max(...[...s.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1])), 0);
    ok("M1 onay body'ye portal ile render edilir (ata stacking context'ine hapsolmaz)", /createPortal\(/.test(confirmSrc) && /setPortalTarget\(document\.body\)/.test(confirmSrc));
    ok("M1 onay katmanı düzenleme modalının üstünde", z(confirmSrc) > z(modalSrc), `${z(confirmSrc)} > ${z(modalSrc)}`);
    ok("M1 onay katmanı tüm modal/lightbox katmanlarının (≤10000) üstünde", z(confirmSrc) > 10000);
    ok("M1 Escape/Tab alttaki modala ulaşmaz (window capture + stopPropagation)",
      /window\.addEventListener\("keydown", handleKeyDown, true\)/.test(confirmSrc) && /e\.key === "Escape" \|\| e\.key === "Tab"\) e\.stopPropagation\(\)/.test(confirmSrc));
    ok("M1 kapanınca odak açan elemana döner", /previousFocus\?\.isConnected/.test(confirmSrc));
  }

  section("RF-07 — dar ekran protokol detay haritası (kaynak kilidi)");
  {
    const d = readFileSync("app/refleksoloji/kayitli-protokoller/components/KayitliProtokolDetayLayout.tsx", "utf8");
    ok("RF-07 mobil asgari harita yüksekliği 460px", /h-\[max\(min\(56vh,680px\),460px\)\]/.test(d) && /sm:h-\[max\(min\(64vh,760px\),460px\)\]/.test(d));
    ok("RF-07 masaüstü (xl) yüksekliği değişmedi", /xl:h-\[min\(72vh,820px\)\]/.test(d));
    ok("RF-07 eksik-atlas uyarısı harita kutusunun dışında", /showMissingNotice=\{false\}/.test(d) && /<MissingOrgansNotice organs=\{missingOrgans\} \/>/.test(d));
    ok("RF-07 koordinat paritesi: ölçek (scale) sarmalayıcısı YOK", !/scale-\[1\.0/.test(d));
  }
}

main()
  .catch((e) => {
    fail += 1;
    failures.push(`harness hata: ${(e as Error).stack ?? e}`);
    console.error(e);
  })
  .finally(() => {
    console.log(`\n──────── SONUÇ: ${pass} PASS / ${fail} FAIL ────────`);
    if (fail > 0) {
      console.log("BAŞARISIZ:");
      for (const f of failures) console.log(`  - ${f}`);
      process.exit(1);
    }
    console.log("✅ REFLEKSOLOJİ NİHAİ KAPANIŞ — ALL PASS");
    process.exit(0);
  });
