/**
 * FAZ1 Final Hardening — PAKET DY-B: listelerde gizli seçim güvenliği, tek-tık silmeler,
 * submit kilitleri, Stok kayıt tekilliği, atomik alerji replace eşlemesi, indirme adları.
 * Saf/deterministik; DB/ağ YOK. Çalıştırma: npx tsx scripts/final-hardening/lists.harness.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pruneSelection, visibleSelection } from "../../lib/ui/selection";
import { composeDeleteMessage } from "../../hooks/useDeleteConfirm";
import { buildNameListLines } from "../../lib/ui/deleteConfirmMessage";
import { createSubmitLock } from "../../lib/ui/submitLock";
import {
  findSaveTarget,
  newPhotosOnly,
  planStockSave,
  stockFormSignature,
  type StockRetryState,
} from "../../app/urun-stok/stockSaveAttempt";
import { addOrUpdateAccessoryItem, type AccessoryItem } from "../../lib/urun-stok/accessoryStockLogic";
import { mapReplaceAllergensError } from "../../app/api/beslenme/clients/[clientId]/allergens/replaceAllergensError";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}:`, (e as Error).message);
  }
}

type Row = { id: string; name: string };
const rows: Row[] = [
  { id: "a", name: "Ametist" },
  { id: "b", name: "Beyaz Kuvars" },
  { id: "c", name: "Citrin" },
  { id: "d", name: "Dumanlı Kuvars" },
];
const search = (q: string) => rows.filter((r) => r.name.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")));

/** React setState(prev => prune(prev)) + effect döngüsü simülasyonu: kaç render tetiklenir? */
function simulatePruneEffect(initial: Set<string>, visibleIds: string[], maxLoops = 10) {
  let state = initial;
  let renders = 0;
  for (let i = 0; i < maxLoops; i++) {
    const next = pruneSelection(state, visibleIds);
    if (Object.is(next, state)) break; // React: aynı referans → yeniden render YOK
    state = next;
    renders++;
  }
  return { state, renders };
}

(async () => {
  // ── 1) Seçim budama (Şifa/Doğaltaş/Numeroloji/Stok/Biyoenerji aynı desen) ──────────
  await t("arama daralınca gizli seçim budanır", () => {
    const sel = new Set(["a", "b", "c"]);
    const visible = search("kuvars").map((r) => r.id); // b, d
    const { state, renders } = simulatePruneEffect(sel, visible);
    assert.deepEqual([...state], ["b"]);
    assert.equal(renders, 1, "tek budama render'ı");
  });
  await t("değişiklik yoksa aynı Set → render döngüsü yok", () => {
    const sel = new Set(["b"]);
    const { state, renders } = simulatePruneEffect(sel, ["a", "b", "c", "d"]);
    assert.equal(state, sel);
    assert.equal(renders, 0);
  });
  await t("boş seçim her zaman aynı referans", () => {
    const empty = new Set<string>();
    assert.equal(pruneSelection(empty, []), empty);
  });
  await t("filtre temizlenince budanan seçim geri GELMEZ (güvenli yön)", () => {
    const sel = new Set(["a", "b"]);
    const afterSearch = pruneSelection(sel, search("beyaz").map((r) => r.id));
    const afterClear = pruneSelection(afterSearch, rows.map((r) => r.id));
    assert.deepEqual([...afterClear], ["b"]);
  });
  await t("silme/Word yalnız görünür ∩ seçili (budama effect'i henüz koşmadıysa bile)", () => {
    const staleSel = new Set(["a", "b", "c"]); // effect öncesi tek render
    const visible = search("kuvars");
    const ids = visibleSelection(staleSel, visible.map((r) => r.id));
    assert.deepEqual(ids, ["b"]);
    const targets = visible.filter((r) => staleSel.has(r.id));
    assert.deepEqual(targets.map((r) => r.name), ["Beyaz Kuvars"]);
  });
  await t("sıra-indeksli satış seçimi liste yenilenince temizlenir (Stok geçmişi)", () => {
    // Stok sayfalarındaki effect: setHistSel(prev => prev.size ? new Set() : prev)
    const reset = (prev: Set<number>) => (prev.size ? new Set<number>() : prev);
    const sel = new Set([2]);
    assert.equal(reset(sel).size, 0);
    const empty = new Set<number>();
    assert.equal(reset(empty), empty, "boşsa aynı referans → döngü yok");
  });

  // ── 2) Onay mesajında adlar ────────────────────────────────────────────────────────
  await t("onay mesajı silinecek adları listeler + geri alınamaz", () => {
    const msg = composeDeleteMessage({ message: "Seçili 2 kayıt silinecek.", names: ["Beyaz Kuvars", "Citrin"] });
    assert.match(msg, /• Beyaz Kuvars/);
    assert.match(msg, /• Citrin/);
    assert.match(msg, /Bu işlem geri alınamaz\./);
  });
  await t("12 adda ilk 10 + 've 2 kayıt daha'", () => {
    const names = Array.from({ length: 12 }, (_, i) => `Kayıt ${i + 1}`);
    const lines = buildNameListLines(names, 12);
    assert.equal(lines.length, 11);
    assert.equal(lines[10], "• ve 2 kayıt daha");
  });
  await t("kütüphane gizleme (geri alınabilir) → 'geri alınamaz' eklenmez", () => {
    const msg = composeDeleteMessage({ message: "1 taş görünümünden kaldırılacak.", names: ["Ametist"], irreversible: false });
    assert.doesNotMatch(msg, /geri alınamaz/);
  });
  await t("mesaj zaten 'geri alınamaz' diyorsa tekrar eklenmez (Stok)", () => {
    const msg = composeDeleteMessage({ message: "Seçili 1 stok kaydı kalıcı olarak silinecek. Bu işlem geri alınamaz.", names: ["X"] });
    assert.equal(msg.match(/geri alınamaz/g)?.length, 1);
  });

  // ── 3) Submit kilidi (Numeroloji/Biyoenerji/Stok/Alerji) ───────────────────────────
  await t("aynı tick'te iki tık → tek istek", async () => {
    const lock = createSubmitLock(5_000);
    let calls = 0;
    const work = () => lock.run(async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return "ok"; });
    const [a, b] = await Promise.all([work(), work()]);
    assert.equal(calls, 1);
    assert.equal(a, "ok");
    assert.equal(b, undefined);
    assert.equal(await work(), "ok", "iş bitince kilit açılır");
    assert.equal(calls, 2);
  });

  // ── 4) Stok kayıt tekilliği (id form denemesi başına bir kez; miktar iki kez eklenmez) ──
  const baseInput = {
    name: "KAPLAN GÖZÜ BİLEKLİK",
    productGroup: "Bileklik",
    productModel: "",
    material: "Doğaltaş",
    color: "Kahverengi",
    sizeKind: "Bilek",
    sizeDetail: "18 cm",
    stockQty: 5,
    costTotal: 100,
    salePriceTotal: 0,
    profitPct: 100,
    barcode: "",
    photos: ["data:image/png;base64,AAA"],
    note: "",
    deltaMode: true,
  };
  const sigOf = (inp: typeof baseInput, editingId: string | null = null) =>
    stockFormSignature([editingId, inp.name, inp.stockQty, inp.costTotal, inp.note, inp.photos.length, inp.deltaMode]);

  /** Sayfa akışını (saveStockNow) saf olarak simüle eder; cloudOk=false → retryRef set edilir. */
  function simulateSave(
    inventory: AccessoryItem[],
    retry: StockRetryState | null,
    inp: typeof baseInput,
    editingId: string | null,
    cloudOk: boolean,
  ) {
    const beforeIds = new Set(inventory.map((i) => i.id));
    const signature = sigOf(inp, editingId);
    const plan = planStockSave(retry, signature, editingId, beforeIds);
    let items = inventory;
    let target: AccessoryItem | undefined;
    if (plan.kind === "retry-cloud") {
      target = inventory.find((it) => it.id === plan.targetId);
    } else {
      const existing = plan.id ? inventory.find((it) => it.id === plan.id) : undefined;
      const res = addOrUpdateAccessoryItem(inventory, {
        ...inp,
        id: plan.id,
        photos: plan.forceAbsolute ? newPhotosOnly(inp.photos, existing?.photos) : inp.photos,
        deltaMode: plan.forceAbsolute ? false : inp.deltaMode,
      });
      if (!res.ok) throw new Error(res.error);
      items = res.items;
      target = findSaveTarget(items, beforeIds, plan.id);
    }
    const nextRetry: StockRetryState | null = cloudOk || !target
      ? null
      : { signature, targetId: target.id, isNew: !editingId };
    return { items, target, plan, retry: nextRetry };
  }

  await t("bulut hatası sonrası AYNI form tekrar → yeni kayıt/id YOK, miktar iki kez eklenmez", () => {
    const first = simulateSave([], null, baseInput, null, false);
    assert.equal(first.items.length, 1);
    const id = first.target!.id;
    assert.equal(first.target!.stockQty, 5);
    const second = simulateSave(first.items, first.retry, baseInput, null, true);
    assert.equal(second.plan.kind, "retry-cloud");
    assert.equal(second.items.length, 1, "yerelde ikinci satır yok");
    assert.equal(second.target!.id, id, "aynı client_id buluta yeniden yazılır (upsert)");
    assert.equal(second.target!.stockQty, 5, "miktar 10 olmadı");
  });
  await t("bulut hatası sonrası form DEĞİŞTİ → aynı yeni kayıt mutlak güncellenir (id aynı, foto tekrarlanmaz)", () => {
    const first = simulateSave([], null, baseInput, null, false);
    const changed = { ...baseInput, stockQty: 7, note: "düzeltildi" };
    const second = simulateSave(first.items, first.retry, changed, null, true);
    assert.equal(second.plan.kind, "merge");
    assert.equal(second.items.length, 1);
    assert.equal(second.target!.id, first.target!.id);
    assert.equal(second.target!.stockQty, 7, "delta değil mutlak (5+7=12 değil)");
    assert.equal(second.target!.photos.length, 1, "foto tekrar eklenmedi");
  });
  await t("başarılı kayıttan sonra yeni form → yeni kayıt (retry temizlenir)", () => {
    const first = simulateSave([], null, baseInput, null, true);
    assert.equal(first.retry, null);
    const second = simulateSave(first.items, first.retry, { ...baseInput, name: "AMETİST KOLYE" }, null, true);
    assert.equal(second.items.length, 2);
  });
  await t("düzenleme modu kendi id'sini günceller; retry isNew=false", () => {
    const seed = simulateSave([], null, baseInput, null, true).items;
    const editId = seed[0].id;
    const edit = simulateSave(seed, null, { ...baseInput, stockQty: 9, deltaMode: false }, editId, false);
    assert.equal(edit.plan.kind, "merge");
    assert.equal(edit.target!.id, editId);
    assert.equal(edit.retry?.isNew, false);
    const again = simulateSave(edit.items, edit.retry, { ...baseInput, stockQty: 9, deltaMode: false }, editId, true);
    assert.equal(again.plan.kind, "retry-cloud");
  });
  await t("retry hedefi yerelde silinmişse (yeniden yükleme) normal birleştirme", () => {
    const plan = planStockSave({ signature: "s", targetId: "gone", isNew: true }, "s", null, new Set(["x"]));
    assert.deepEqual(plan, { kind: "merge", id: undefined, forceAbsolute: false });
  });
  await t("Doğaltaş stok (ad|tür anahtarı): aynı form tekrar → retry-cloud", () => {
    const plan = planStockSave({ signature: "sig", targetId: "ametist|dizi", isNew: false }, "sig", null, new Set(["ametist|dizi"]));
    assert.deepEqual(plan, { kind: "retry-cloud", targetId: "ametist|dizi" });
    const changed = planStockSave({ signature: "sig", targetId: "ametist|dizi", isNew: false }, "sig2", null, new Set(["ametist|dizi"]));
    assert.equal(changed.kind, "merge");
  });
  await t("newPhotosOnly yalnız yeni fotoğrafları döner", () => {
    assert.deepEqual(newPhotosOnly(["a", "b"], ["a"]), ["b"]);
    assert.deepEqual(newPhotosOnly(["a"], undefined), ["a"]);
  });

  // ── 5) Atomik alerji replace — RPC hata eşlemesi (ham mesaj sızmaz) ─────────────────
  await t("RPC hata eşlemesi", () => {
    assert.deepEqual(mapReplaceAllergensError({ code: "PGRST202", message: "Could not find the function" }), { status: 503, code: "ALLERGEN_RPC_MISSING" });
    assert.deepEqual(mapReplaceAllergensError({ code: "P0002", message: "client_not_found_for_tenant" }), { status: 404, code: "CLIENT_NOT_FOUND" });
    assert.deepEqual(mapReplaceAllergensError({ code: "22023", message: "unknown_allergen" }), { status: 400, code: "UNKNOWN_ALLERGEN" });
    assert.deepEqual(mapReplaceAllergensError({ code: "22023", message: "bad_allergen_item" }), { status: 400, code: "BAD_ALLERGEN_ITEM" });
    assert.deepEqual(mapReplaceAllergensError({ code: "22023", message: "custom_too_long" }), { status: 400, code: "CUSTOM_TOO_LONG" });
    assert.deepEqual(mapReplaceAllergensError({ code: "23505", message: "dup" }), { status: 409, code: "CUSTOM_DUPLICATE" });
    assert.deepEqual(mapReplaceAllergensError({ code: "XX000", message: "boom" }), { status: 500, code: "ALLERGEN_SAVE_FAILED" });
  });
  await t("alerji route'u delete→insert yerine RPC kullanır", () => {
    const route = read("app/api/beslenme/clients/[clientId]/allergens/route.ts");
    assert.match(route, /rpc\("nutrition_replace_client_allergens"/);
    assert.doesNotMatch(route, /\.delete\(\)/);
    assert.doesNotMatch(route, /\.insert\(/);
    assert.doesNotMatch(route, /^export (function|const) (?!GET|PUT|runtime)/m, "route yalnız izinli export'lar");
  });

  // ── 6) Statik kapılar: sahip olunan dosyalar ────────────────────────────────────────
  const LIST_FILES: Array<[string, RegExp]> = [
    ["app/sifa-rehberi/page.tsx", /filteredRows\.filter\(\(r\) => selectedForExport\.has\(r\.id\)\)/],
    ["app/dogaltas/dogaltas-listesi/page.tsx", /filteredStones\.filter\(\(s\) => selectedIds\.has\(s\.id\)\)/],
    ["app/dogaltas/tas-bilgi-kutuphanesi/page.tsx", /filtered\.filter\(\(r\) => selectedIds\.has\(r\.id\)\)/],
    ["app/dogaltas/mineral-listesi/page.tsx", /minerals\.filter\(\(m\) => selectedMineralIds\.has\(m\.id\)\)/],
    ["app/numeroloji/liste/page.tsx", /visibleSelection\(selectedIds, filteredRows\.map/],
    ["app/urun-stok/aksesuar/page.tsx", /displayed\.filter\(\(i\) => selectedIds\.has\(i\.id\)\)/],
    ["app/urun-stok/yag/page.tsx", /displayed\.filter\(\(i\) => selectedIds\.has\(i\.id\)\)/],
    ["app/urun-stok/sabun-krem/page.tsx", /displayed\.filter\(\(i\) => selectedIds\.has\(i\.id\)\)/],
    ["app/urun-stok/diger/page.tsx", /displayed\.filter\(\(i\) => selectedIds\.has\(i\.id\)\)/],
    ["app/urun-stok/dogaltas/page.tsx", /displayedStock\.filter\(\(it\) => selectedKeys\.has\(itemKeyFrom\(it\)\)\)/],
    ["app/dashboard/biyoenerji/components/Cakralar.tsx", /selectedVisibleRows\.map\(\(r\) => r\.id\)/],
    ["app/dashboard/biyoenerji/components/BilincaltiSebepleri.tsx", /selectedVisibleRows\.map\(\(r\) => r\.id\)/],
    ["app/dashboard/biyoenerji/components/Imajinasyonlar.tsx", /selectedVisibleRows\.map\(\(r\) => r\.id\)/],
    ["app/dashboard/biyoenerji/components/SembolDili.tsx", /selectedVisibleRows\.map\(\(r\) => r\.id\)/],
    ["app/dashboard/biyoenerji/components/EnerjiBedenleri.tsx", /selectedVisibleRows\.map\(\(r\) => r\.id\)/],
    ["app/dashboard/biyoenerji/components/BiyoenerjiSeanslari.tsx", /selectedVisibleRows\.map\(\(r\) => r\.id\)/],
  ];
  for (const [file, deleteRe] of LIST_FILES) {
    await t(`liste: ${file} budama + görünür silme`, () => {
      const src = read(file);
      assert.match(src, /pruneSelection\(prev, visible(Ids|Keys)\)/, "pruneSelection effect");
      assert.match(src, deleteRe, "silme görünür ∩ seçili");
    });
  }
  await t("liste silme onayları ad listesi taşır", () => {
    for (const f of [
      "app/sifa-rehberi/page.tsx",
      "app/dogaltas/dogaltas-listesi/page.tsx",
      "app/dogaltas/tas-bilgi-kutuphanesi/page.tsx",
      "app/dogaltas/mineral-listesi/page.tsx",
      "app/urun-stok/aksesuar/page.tsx",
      "app/urun-stok/dogaltas/page.tsx",
    ]) assert.match(read(f), /names: /, f);
    // Numeroloji adları kendi buildNumerolojiDeleteConfirm mesajında taşır (mevcut harness).
    assert.match(read("app/numeroloji/liste/page.tsx"), /buildNumerolojiDeleteConfirm\(ids\.length, names\)/);
    // Biyoenerji danger modal adları gösterir.
    assert.match(read("app/dashboard/biyoenerji/components/BiyoenerjiDangerDeleteModal.tsx"), /buildNameListLines\(names, count\)/);
    for (const f of ["Cakralar", "BilincaltiSebepleri", "Imajinasyonlar", "SembolDili", "EnerjiBedenleri", "BiyoenerjiSeanslari"]) {
      assert.match(read(`app/dashboard/biyoenerji/components/${f}.tsx`), /names=\{danger\.mode === "all" \? undefined : selectedVisibleRows\.map/, f);
    }
  });
  await t("tek-tık silmeler onaylı", () => {
    const tab = read("app/dashboard/clients/[id]/components/BeslenmeTab.tsx");
    assert.equal((tab.match(/await deleteConfirm\(/g) ?? []).length, 2, "ölçüm + tercih");
    assert.match(tab, /banner\.measurementDeleteFailed/);
    assert.match(tab, /banner\.prefDeleteFailed/);
    const tde = read("app/beslenme/_components/TopicDetailEditor.tsx");
    // Beslenme arşiv kaldırıldı (2026-09-27): rehber "Arşivle" → onaylı "Sil" → 3 onaylı silme yolu.
    assert.equal((tde.match(/await deleteConfirm\(/g) ?? []).length, 3, "bölüm + konu-besin + rehber Sil");
    assert.match(read("app/beslenme/_components/SourcesPanel.tsx"), /await deleteConfirm\(/);
    assert.match(read("app/beslenme/planlar/_components/MealCard.tsx"), /await deleteConfirm\(/);
    const sab = read("app/beslenme/sablonlar/page.tsx");
    assert.match(sab, /await deleteConfirm\(/);
    assert.doesNotMatch(sab, /confirmDeleteId/, "aynı noktada iki adımlı buton kaldırıldı");
    const sifa = read("app/sifa-rehberi/[id]/page.tsx");
    assert.match(sifa, /title: "Görseli sil"/);
    assert.match(sifa, /disabled=\{imageRemoving\}/);
    assert.match(read("app/human-design/danisanlar/components/HdChartImageUpload.tsx"), /title: "Harita görselini sil"/);
  });
  await t("submit kilitleri", () => {
    const num = read("app/numeroloji/components/SaveAnalysisButton.tsx");
    assert.match(num, /useSubmitLock\(\)/);
    assert.match(num, /Kaydedildi ✓/);
    assert.match(num, /setSavedSignature\(sig\)/);
    for (const f of ["BilincaltiSebepleri", "BilincaltiSebepleriDetail", "BiyoenerjiSeanslari", "Cakralar", "CakralarDetail", "EnerjiBedenleri", "Imajinasyonlar", "ImajinasyonlarDetail", "SembolDili", "SembolDiliDetail"]) {
      const src = read(`app/dashboard/biyoenerji/components/${f}.tsx`);
      // Kilit handler'ın İLK ifadesi (tenant çözümünden önce).
      assert.match(src, /async function handle(Kaydet|Guncelle)\(\) \{\r?\n\s+\/\/ Çift gönderim kilidi[^\n]*\r?\n\s+await saveLock/, f);
    }
    for (const p of ["aksesuar", "yag", "sabun-krem", "diger"]) {
      const src = read(`app/urun-stok/${p}/page.tsx`);
      assert.match(src, /\.run\(\(\) => saveStockNow\(\)\)/, p);
      assert.match(src, /disabled=\{saveLock\.pending\}/, p);
      assert.match(src, /planStockSave\(retryRef\.current/, p);
    }
    assert.match(read("app/urun-stok/dogaltas/page.tsx"), /\.run\(\(\) => addStockNow\(\)\)/);
    const tab = read("app/dashboard/clients/[id]/components/BeslenmeTab.tsx");
    assert.match(tab, /const \{ run: runSave, pending: saving \} = useSubmitLock\(\)/);
  });
  await t("istemci indirme adları sunucudan (UTC 'dün' yok)", () => {
    const files = [
      "app/sifa-rehberi/page.tsx", "app/sifa-rehberi/[id]/page.tsx",
      "app/dogaltas/page.tsx", "app/dogaltas/dogaltas-listesi/page.tsx", "app/dogaltas/dogaltas-listesi/[id]/page.tsx",
      "app/dogaltas/mineral-listesi/page.tsx", "app/dogaltas/mineral-listesi/[id]/page.tsx",
      "app/dogaltas/tas-bilgi-kutuphanesi/page.tsx", "app/dogaltas/kombinasyonlar/page.tsx", "app/dogaltas/kombinasyonlar/[title]/page.tsx",
      "app/numeroloji/liste/page.tsx", "app/numeroloji/liste/[id]/page.tsx", "app/numeroloji/bilgi-bankasi/components/BilgiKayitListesi.tsx",
      "app/urun-stok/canli-stok/page.tsx",
      ...["BilincaltiSebepleri", "BilincaltiSebepleriDetail", "BiyoenerjiSeanslari", "Cakralar", "CakralarDetail", "EnerjiBedenleri", "Imajinasyonlar", "ImajinasyonlarDetail", "SembolDili", "SembolDiliDetail"]
        .map((f) => `app/dashboard/biyoenerji/components/${f}.tsx`),
    ];
    for (const f of files) {
      const src = read(f);
      assert.doesNotMatch(src, /toISOString\(\)\.slice\(0, ?10\)/, f);
      assert.doesNotMatch(src, /\ba\.download\s*=/, f);
      assert.match(src, /downloadFileResponse\(res, /, f);
    }
  });
  await t("Stok sıralama seçenekleri lib anahtarlarıyla eşleşir", () => {
    for (const p of ["aksesuar", "sabun-krem", "diger"]) {
      const src = read(`app/urun-stok/${p}/page.tsx`);
      for (const v of ["Ürün (Z→A)", "Stok (Az→Çok)", "Stok (Çok→Az)"]) assert.ok(src.includes(`value="${v}"`), `${p}: ${v}`);
    }
  });

  console.log(`\nDY-B lists harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})();
