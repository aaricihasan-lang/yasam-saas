/**
 * DOĞAL DESTEK P2 — AROMATERAPİ birim + kaynak-sözleşme testleri (DB/ağ YOK).
 *
 *   AROMA-2  yağ veri katmanı (createOil/updateOil/deleteOil/deleteOils/fetchOilCounts/
 *            fetchOilNameMap) fetch THROW ettiğinde ASLA throw etmez → {error}; çağıranlar
 *            yükleniyor bayraklarını `finally` içinde sıfırlar (kaynak sözleşmesi).
 *   AROMA-3  updateOil token gönderir; 409 → stale:true; token yoksa istek GÖNDERİLMEZ.
 *   AROMA-1  taşıyıcı seçimi yarış koruması: A-yavaş/B-hızlı → yalnız B; A sonrası serbest
 *            metin → A yok sayılır; kayıt yükleme/sıfırlama bekleyen yanıtı geçersiz kılar;
 *            yükleme sürerken / eşleşmezken kaydet-yazdır kapısı.
 *   NEW-2    yağ detay başlığı mobil sınıf sözleşmesi (yığılma, sarma, kırılma, dokunma hedefi).
 *   AROMA-4  istemci silme sarmalayıcısı (ağ hatası → kod; referans metni) + sunucu sınıflandırma.
 * Çalıştır: npx tsx --tsconfig scripts/tsconfig.aromaterapi-tests.json scripts/dogal-destek-p2/aroma/unit.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

/** `async function <name>(` gövdesini (dengeli süslü parantez) döndürür. */
function fnBody(src: string, name: string): string {
  const i = src.search(new RegExp(`(async )?function ${name}\\(`));
  if (i < 0) return "";
  const open = src.indexOf("{", src.indexOf(")", i));
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (depth === 0) return src.slice(open, k + 1); }
  }
  return "";
}

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

async function main(): Promise<void> {
  const realFetch = globalThis.fetch;

  // ── AROMA-2 / AROMA-3 — veri katmanı ──────────────────────────────────────
  section("AROMA-2 — yağ veri katmanı ağ hatasında throw etmez");
  const data = await import("../../../lib/aromaterapi/aromatherapyData");
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new TypeError("Failed to fetch"); }) as typeof fetch;
  const NET = data.OIL_NETWORK_ERROR_MESSAGE;
  const cases: Array<[string, () => Promise<Record<string, unknown>>]> = [
    ["createOil", () => data.createOil({ name: "x" })],
    ["updateOil", () => data.updateOil("id-1", { name: "x" }, "2026-10-03T10:00:00.123456+00:00")],
    ["deleteOil", () => data.deleteOil("id-1")],
    ["deleteOils", () => data.deleteOils(["id-1", "id-2"])],
    ["fetchOilCounts", () => data.fetchOilCounts()],
    ["fetchOilNameMap", () => data.fetchOilNameMap()],
  ];
  for (const [name, fn] of cases) {
    let threw = false;
    let res: Record<string, unknown> = {};
    try { res = await fn(); } catch { threw = true; }
    ok(!threw && res.error === NET, `${name}: fetch throw → {error: ağ mesajı}, throw YOK`, res);
  }
  ok(NET.includes("Sunucuya ulaşılamadı"), "ağ hata mesajı Türkçe ve anlaşılır", NET);
  ok(calls === 6, "her fonksiyon gerçekten fetch denedi (6)", calls);
  // res.json() bozuk olsa da throw etmez.
  globalThis.fetch = (async () => new Response("<html>bozuk</html>", { status: 502 })) as typeof fetch;
  const bad = await data.createOil({ name: "x" });
  ok(bad.error === "HTTP 502" && bad.id === null, "JSON olmayan 502 yanıtı → {error:'HTTP 502'}", bad);

  section("AROMA-3 — updateOil iyimser kilit istemcisi");
  let lastBody: Record<string, unknown> | null = null;
  calls = 0;
  globalThis.fetch = (async (_u: string, init?: RequestInit) => {
    calls++;
    lastBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ ok: false, error: "AROMA_STALE_OIL", stale: true }), { status: 409 });
  }) as typeof fetch;
  const st = await data.updateOil("id-1", { notes: "n" }, "2026-10-03T10:00:00.123456+00:00");
  ok(st.stale === true && st.error === data.OIL_STALE_MESSAGE && st.updatedAt === null, "409 → stale:true + Türkçe çakışma mesajı", st);
  ok(st.error!.includes("başka bir yerde güncellendi"), "çakışma mesajı kullanıcıya ne yapacağını söyler");
  ok((lastBody as Record<string, unknown> | null)?.expected_updated_at === "2026-10-03T10:00:00.123456+00:00", "token gövdede AYNEN gönderilir", lastBody);
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, id: "id-1", updated_at: "2026-10-03T10:00:01.5+00:00" }), { status: 200 })) as typeof fetch;
  const okRes = await data.updateOil("id-1", { notes: "n" }, "2026-10-03T10:00:00.123456+00:00");
  ok(okRes.error === null && okRes.stale === false && okRes.updatedAt === "2026-10-03T10:00:01.5+00:00", "200 → yeni updated_at döner", okRes);
  calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as typeof fetch;
  const noTok = await data.updateOil("id-1", { notes: "n" }, null);
  ok(calls === 0 && noTok.error === data.OIL_MISSING_VERSION_MESSAGE, "token yoksa istek GÖNDERİLMEZ (sürümsüz ezme yok)", { calls, noTok });
  globalThis.fetch = realFetch;

  section("AROMA-2 — çağıranlar bayrakları finally'de sıfırlar (kaynak sözleşmesi)");
  const detail = read("app/aromaterapi/yaglar/[id]/page.tsx");
  const oils = read("app/aromaterapi/_components/OilsPage.tsx");
  const dSave = fnBody(detail, "handleSave");
  const dDel = fnBody(detail, "handleDelete");
  const oSave = fnBody(oils, "handleSave");
  const oBulk = fnBody(oils, "handleBulkDelete");
  ok(/finally\s*\{\s*setSaving\(false\);?\s*\}/.test(dSave), "detay handleSave: setSaving(false) finally içinde", dSave.slice(0, 200));
  ok(/updateOil\([\s\S]*oil\?\.updated_at/.test(dSave), "detay handleSave: updateOil'e oil.updated_at token'ı geçiliyor");
  ok(/if \(stale\)[\s\S]*setStaleConflict\(true\)[\s\S]*return;/.test(dSave) && !/if \(stale\)[^}]*setDraft\(/.test(dSave), "detay: 409'da taslak SIFIRLANMAZ, çakışma bandı açılır");
  ok(/if \(updatedAt\) setOil\(/.test(dSave), "detay: başarıda yeni token hemen işlenir");
  ok(/finally\s*\{\s*setDeleting\(false\);/.test(dDel), "detay handleDelete: setDeleting(false) finally içinde");
  ok(/finally\s*\{\s*setSaving\(false\);\s*if \(!succeeded\) submittingRef\.current = false;/.test(oSave), "OilsPage handleSave: saving + submittingRef finally içinde (başarısızlıkta kilit açılır)");
  ok(/catch\s*\{[\s\S]*OIL_NETWORK_ERROR_MESSAGE/.test(oSave), "OilsPage handleSave: beklenmeyen throw → ağ mesajı (sahte başarı toast'ı YOK)");
  ok(/finally\s*\{\s*setDeleteLoading\(false\);/.test(oBulk), "OilsPage handleBulkDelete: deleteLoading finally içinde");
  ok(!/setSaving\(false\);\s*\n\s*if \(insertError\)/.test(oSave), "eski 'await sonrası setSaving(false)' kalıbı kaldırıldı");

  // ── AROMA-1 — taşıyıcı yarış koruması ─────────────────────────────────────
  section("AROMA-1 — taşıyıcı seçimi: yalnız güncel yanıt uygulanır");
  const cs = await import("../../../app/aromaterapi/karisim-olusturucu/carrierSelection");
  type Oil = { oil: { contraindications: string; safety_notes: string; photosensitivity_status: string; is_photosensitive: boolean } | null; error: string | null };
  const OIL_A: Oil = { oil: { contraindications: "A-KONTRENDİKASYON", safety_notes: "A-not", photosensitivity_status: "yes", is_photosensitive: true }, error: null };
  const OIL_B: Oil = { oil: { contraindications: "B-kontrendikasyon", safety_notes: "B-not", photosensitivity_status: "no", is_photosensitive: false }, error: null };

  {
    const gate = cs.createCarrierSelectionGate();
    const applied: Array<{ forId: string | null; contra: string }> = [];
    let state = cs.emptyCarrierSafety(null);
    const apply = (s: typeof state) => { state = s; applied.push({ forId: s.forId, contra: s.contra }); };
    const dA = deferred<Oil>();
    const dB = deferred<Oil>();
    const pA = cs.resolveCarrierSelection(gate, "A", () => dA.promise, apply);
    ok(gate.isPending(), "A seçildi → yükleniyor");
    const pB = cs.resolveCarrierSelection(gate, "B", () => dB.promise, apply);
    dB.resolve(OIL_B); // B hızlı
    const rB = await pB;
    dA.resolve(OIL_A); // A yavaş — B'den SONRA gelir
    const rA = await pA;
    ok(rB === "applied" && rA === "ignored", "A-yavaş/B-hızlı: B uygulandı, A yok sayıldı", { rA, rB });
    ok(state.forId === "B" && state.contra === "B-kontrendikasyon" && state.photo === "no", "son durum yalnız B'nin güvenlik verisi", state);
    ok(applied.every((x) => x.contra !== "A-KONTRENDİKASYON"), "A'nın kontrendikasyonu HİÇ uygulanmadı", applied);
    ok(!gate.isPending(), "B uygulandıktan sonra bekleyen yok");
  }
  {
    const gate = cs.createCarrierSelectionGate();
    let state = cs.emptyCarrierSafety(null);
    const apply = (s: typeof state) => { state = s; };
    const dA = deferred<Oil>();
    const pA = cs.resolveCarrierSelection(gate, "A", () => dA.promise, apply);
    const rFree = await cs.resolveCarrierSelection(gate, null, async () => OIL_B, apply); // serbest metin
    dA.resolve(OIL_A);
    const rA = await pA;
    ok(rFree === "none" && rA === "ignored", "A sonrası serbest metin: A yanıtı yok sayıldı", { rFree, rA });
    ok(state.forId === null && state.contra === "" && state.photo === "unknown", "serbest metin → unknown/boş (A verisi YOK)", state);
  }
  {
    const gate = cs.createCarrierSelectionGate();
    let state = cs.emptyCarrierSafety(null);
    const dA = deferred<Oil>();
    const pA = cs.resolveCarrierSelection(gate, "A", () => dA.promise, (s) => { state = s; });
    gate.invalidate(); // kayıtlı karışım yüklendi / form sıfırlandı
    dA.resolve(OIL_A);
    ok((await pA) === "ignored" && state.forId === null, "kayıt yükleme/sıfırlama bekleyen A yanıtını geçersiz kılar", state);
    ok(!gate.isPending(), "invalidate sonrası bekleyen yok");
  }
  {
    const gate = cs.createCarrierSelectionGate();
    let state = cs.emptyCarrierSafety(null);
    const r = await cs.resolveCarrierSelection(gate, "A", async () => { throw new Error("ağ"); }, (s) => { state = s; });
    ok(r === "applied" && state.forId === "A" && state.photo === "unknown" && state.contra === "", "detay yüklenemezse 'unknown'/boş (güvenli DEMEZ, eski veri YOK)", state);
    const r2 = await cs.resolveCarrierSelection(gate, "A", async () => ({ oil: null, error: "HTTP 500" }), (s) => { state = s; });
    ok(r2 === "applied" && state.photo === "unknown", "HTTP hata → unknown");
  }
  {
    const gate = cs.createCarrierSelectionGate();
    const seen: string[] = [];
    const dA1 = deferred<Oil>();
    const dA2 = deferred<Oil>();
    const p1 = cs.resolveCarrierSelection(gate, "A", () => dA1.promise, (s) => seen.push(`1:${s.contra}`));
    const p2 = cs.resolveCarrierSelection(gate, "A", () => dA2.promise, (s) => seen.push(`2:${s.contra}`));
    dA2.resolve(OIL_A);
    dA1.resolve(OIL_B);
    await Promise.all([p1, p2]);
    ok(seen.length === 1 && seen[0] === "2:A-KONTRENDİKASYON", "aynı id'ye ardışık iki istek: yalnız SONUNCUSU uygulanır", seen);
  }

  section("AROMA-1 — kaydet/yazdır kapısı");
  ok(cs.carrierSaveBlockReason({ carrierId: "A", carrierLoading: true, carrierSafetyFor: null })?.includes("yükleniyor") === true, "yükleniyor → kayıt engellenir");
  ok(cs.carrierSaveBlockReason({ carrierId: "B", carrierLoading: false, carrierSafetyFor: "A" })?.includes("eşleşmiyor") === true, "snapshot başka taşıyıcıya ait → engellenir");
  ok(cs.carrierSaveBlockReason({ carrierId: "B", carrierLoading: false, carrierSafetyFor: "B" }) === null, "eşleşen snapshot → izinli");
  ok(cs.carrierSaveBlockReason({ carrierId: null, carrierLoading: false, carrierSafetyFor: null }) === null, "serbest metin/boş taşıyıcı → izinli");

  const blend = read("app/aromaterapi/karisim-olusturucu/page.tsx");
  const pick = fnBody(blend, "pickCarrier");
  ok(/resolveCarrierSelection\(\s*carrierGateRef\.current/.test(pick), "pickCarrier istek-sırası kapısını kullanıyor");
  ok(/setCarrierContra\(""\)[\s\S]*resolveCarrierSelection/.test(pick), "pickCarrier: önceki taşıyıcı verisi istekten ÖNCE temizlenir");
  ok(!/await fetchOilDetail\(tenantId, cid\)/.test(pick), "eski korumasız 'await fetchOilDetail(tenantId, cid)' kalıbı yok");
  ok(/carrierSaveBlockReason\(/.test(fnBody(blend, "handleSave")), "handleSave taşıyıcı kapısını uygular");
  ok(/carrierSaveBlockReason\(/.test(fnBody(blend, "printActiveBlend")), "printActiveBlend taşıyıcı kapısını uygular");
  ok(/disabled=\{saving \|\| carrierLoading\}/.test(blend), "Kaydet düğmesi taşıyıcı yüklenirken pasif");
  ok(/carrierGateRef\.current\.invalidate\(\)/.test(fnBody(blend, "resetForm")) && /carrierGateRef\.current\.invalidate\(\)/.test(fnBody(blend, "loadBlend")), "resetForm + loadBlend bekleyen yanıtı geçersiz kılar");

  // ── NEW-2 — mobil başlık sözleşmesi ───────────────────────────────────────
  section("NEW-2 — yağ detay başlığı mobil düzeni");
  const hdrStart = detail.indexOf("{/* ─── HERO HEADER");
  const hdr = detail.slice(hdrStart, detail.indexOf("</header>", hdrStart));
  ok(hdr.includes('className="flex flex-col gap-3 sm:flex-row sm:items-start"'), "<sm: başlık ve eylemler ALT ALTA; sm+: yan yana (masaüstü korunur)");
  ok(hdr.includes('className="min-w-0 w-full sm:flex-1"'), "başlık sütunu mobilde tam genişlik");
  ok(hdr.includes('className="mb-2 flex flex-wrap items-center gap-1.5"'), "breadcrumb sarılabilir");
  ok(/<h1 className="[^"]*break-words[^"]*\[overflow-wrap:anywhere\][^"]*">\s*\{oil\.name\}/.test(hdr), "başlık uzun kesintisiz adı kırar (break-words + overflow-wrap:anywhere)");
  ok(/\[overflow-wrap:anywhere\]">\{oil\.latin_name\}/.test(hdr), "Latince ad da kırılabilir");
  ok(hdr.includes('className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:gap-1"'), "eylemler: mobilde tam genişlik + wrap; sm+'da eski shrink-0 düzeni");
  ok(!hdr.includes('className="flex shrink-0 flex-wrap items-center gap-1"'), "mobilde başlığı sıkıştıran eski shrink-0 eylem kutusu yok");
  ok(!/className="flex items-start gap-3"/.test(hdr), "eski tek-satır (row) başlık düzeni yok");
  const btnBase = /const btnBase = "([^"]+)"/.exec(detail)?.[1] ?? "";
  ok(btnBase.split(" ").includes("h-10") && btnBase.split(" ").includes("sm:h-8"), "düğmeler mobilde 40px (h-10), sm+'da eski 32px (h-8)", btnBase);
  ok(/ml-auto[^"`]*sm:ml-0/.test(hdr), "Sil mobilde Düzenle'den ayrık (ml-auto), sm+'da eski konum");

  // ── AROMA-4 — istemci silme sarmalayıcısı + sunucu sınıflandırma ─────────
  section("AROMA-4 — istemci/sunucu silme yardımcıları");
  const dc = await import("../../../lib/aromaterapi/contentDeleteClient");
  globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
  const net = await dc.deleteContentRecord("plant_taxon", "id", { expected_updated_at: "t", reason: "r" });
  ok(net.ok === false && net.errorCode === "AROMA_NETWORK_ERROR", "ağ hatası → AROMA_NETWORK_ERROR (throw YOK)", net);
  globalThis.fetch = (async () => { throw new DOMException("x", "AbortError"); }) as typeof fetch;
  const ab = await dc.deleteContentRecord("claim", "id", { expected_updated_at: "t", reason: "r" });
  ok(ab.ok === false && ab.errorCode === null, "AbortError → sessiz (mesaj yok)", ab);
  let sentUrl = "";
  let sentBody: Record<string, unknown> = {};
  globalThis.fetch = (async (u: string, init?: RequestInit) => {
    sentUrl = u;
    sentBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: false, code: "AROMA_PREPARATION_REFERENCED", references: { claims: 2, method_series: 1 } }), { status: 409 });
  }) as typeof fetch;
  const ref = await dc.deleteContentRecord("preparation", "p-1", { expected_updated_at: "t", reason: "r" });
  ok(sentUrl === "/api/aromaterapi/preparations/p-1" && Object.keys(sentBody).sort().join(",") === "expected_updated_at,reason", "DELETE yalnız {expected_updated_at, reason} gönderir", { sentUrl, sentBody });
  ok(ref.errorCode === "AROMA_PREPARATION_REFERENCED" && ref.references?.claims === 2 && ref.references?.method_series === 1, "409 referans sayıları okunur", ref);
  const txt = dc.describeContentReferences("preparation", ref.references);
  ok(txt === "Bu kayıt 2 bilgi kaydı / 1 üretim yöntemi tarafından kullanılıyor; önce onları silin.", "referans metni: hangi kayıtlar engelliyor", txt);
  ok(dc.describeContentReferences("plant_taxon", { preparations: 3 }) === "Bu kayıt 3 preparat tarafından kullanılıyor; önce onları silin.", "takson referans metni");
  ok(/ilişkileri düzenleme ekranından kaldırın/.test(dc.describeContentReferences("claim", { relations: 1 })), "claim ilişki metni yönlendirir");
  ok(/başka kayıtlar tarafından/.test(dc.describeContentReferences("plant_taxon", { preparations: -1 })), "yarış (-1) → genel metin");
  ok(/yenileyip/.test(dc.contentDeleteMessageForCode("AROMA_STALE")), "stale mesajı yeniden yüklemeyi önerir");
  globalThis.fetch = realFetch;

  const sm = await import("../../../lib/aromaterapi/service/contentDeleteMutations");
  ok(sm.classifyContentDeleteError("claim", { code: "PGRST202", message: "x" }) === "AROMA_DELETE_UNAVAILABLE", "PGRST202 → AROMA_DELETE_UNAVAILABLE");
  ok(sm.classifyContentDeleteError("claim", { code: "42883", message: "x" }) === "AROMA_DELETE_UNAVAILABLE", "42883 → AROMA_DELETE_UNAVAILABLE");
  ok(sm.classifyContentDeleteError("plant_taxon", { code: "23503", message: "violates fk" }) === "AROMA_TAXON_REFERENCED", "23503 → *_REFERENCED (defense-in-depth)");
  ok(sm.classifyContentDeleteError("preparation", { code: "P0001", message: "AROMA_STALE" }) === "AROMA_STALE", "P0001 AROMA_STALE");
  ok(sm.classifyContentDeleteError("preparation", { code: "P0001", message: "AROMA_STALE extra" }) === "AROMA_WRITE_FAILED", "P0001 tam eşitlik (includes YOK)");
  ok(sm.CONTENT_DELETE_ERROR_HTTP.AROMA_DELETE_UNAVAILABLE === 503 && sm.CONTENT_DELETE_ERROR_HTTP.AROMA_CLAIM_REFERENCED === 409 && sm.CONTENT_DELETE_ERROR_HTTP.AROMA_CLAIM_NOT_FOUND === 404, "HTTP eşlemesi 503/409/404");
  const parsed = sm.parseContentReferenceDetails("preparation", JSON.stringify({ claims: 4, method_series: 0, secret: "x" }));
  ok(parsed?.claims === 4 && parsed?.method_series === 0 && !("secret" in (parsed ?? {})), "DETAIL yalnız beklenen sayı anahtarlarıyla ayrıştırılır", parsed);
  ok(sm.parseContentReferenceDetails("claim", "not-json") === null, "bozuk DETAIL → null");

  const action = read("app/aromaterapi/_components/write/AromaterapiDeleteAction.tsx");
  ok(/useSubmitLock\(\)/.test(action) && /if \(pending \|\| reason\.trim\(\) === ""\) return;/.test(action), "silme diyaloğu tek gönderim (in-flight kilidi) + zorunlu gerekçe");
  ok(/if \(isDemo\) return null;/.test(action), "demo hesapta Sil hiç render edilmez");
  ok(/router\.push\(listHref\)/.test(action) && /setDialog\("stale"\)/.test(action) && /setDialog\("in-use"\)/.test(action), "başarı → liste; stale → yeniden yükle; referanslı → engelleyen kayıtlar");
  for (const [p, kind] of [
    ["app/aromaterapi/katalog/bitkiler/[id]/page.tsx", "plant_taxon"],
    ["app/aromaterapi/katalog/preparatlar/[id]/page.tsx", "preparation"],
    ["app/aromaterapi/bilgi-kayitlari/[id]/page.tsx", "claim"],
  ] as const) {
    const src = read(p);
    ok(new RegExp(`<AromaterapiDeleteAction\\s+kind="${kind}"[\\s\\S]*?updatedAt=\\{[^}]*updated_at\\}[\\s\\S]*?isDemo=\\{isDemo\\}`).test(src), `${p}: Sil eylemi (${kind}) sürüm token'ı + demo gizleme ile bağlı`);
  }
  for (const r of ["plant-taxa", "preparations", "claims"]) {
    const src = read(`app/api/aromaterapi/${r}/[id]/route.ts`);
    ok(/export async function DELETE\(/.test(src) && /handleContentDelete\(req, id, "(plant_taxon|preparation|claim)"\)/.test(src), `${r}/[id]: DELETE handler ortak sözleşmeye bağlı`);
  }

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.error("Başarısız:", failures);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
