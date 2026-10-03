/**
 * ŞİFA REHBERİ — SIFA-1 istemci orkestrasyonu + SIFA-2 ayrılma koruması HARNESS (DB'siz, saf).
 *
 *   A) saveGuideVersioned (enjekte fetch): PATCH kapısı → PUT; 409'da PUT ASLA; sürüm ilerletme.
 *   B) guideVersion: belirteç ayrıştırma / monoton yeni damga.
 *   C) leaveGuard: resolveGuardedLinkTarget (dirty + aynı-origin → yakala; diğerleri geçir),
 *      unsavedUploadPaths.
 *   D) Kaynak sözleşmesi: detay/yeni-kayıt sayfaları "Vazgeç" + guard bağlantısı + sürüm akışı.
 *
 * Çalıştır: npx tsx scripts/dogal-destek-p2/sifa/client.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  saveGuideVersioned,
  patchGuideVersioned,
  type FetchLike,
} from "../../../lib/sifa-rehberi/guideSaveFlow";
import {
  parseExpectedUpdatedAt,
  nextVersionStamp,
  isValidVersionToken,
  SIFA_STALE_MESSAGE,
} from "../../../lib/sifa-rehberi/guideVersion";
import { resolveGuardedLinkTarget, unsavedUploadPaths, type LeaveClickInput } from "../../../lib/sifa-rehberi/leaveGuard";
import { editorSignature } from "../../../lib/sifa-rehberi/sectionEditorModel";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

type Call = { url: string; method: string; body: Record<string, unknown> };
type Reply = { status: number; json: Record<string, unknown> } | "network";

/** Sahte fetch: çağrıları kaydeder, sırayla hazır yanıt döner. */
function fakeFetch(replies: Reply[]): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, method: String(init?.method), body: JSON.parse(String(init?.body ?? "{}")) });
    const r = replies[i++];
    if (!r) throw new Error(`beklenmeyen ${i}. çağrı: ${url}`);
    if (r === "network") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, calls };
}
const deps = (f: FetchLike) => ({ fetchImpl: f, headers: () => ({ "x-user-id": "u", "x-session-token": "t" }) });

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

async function main(): Promise<void> {
  const V0 = "2026-10-01T10:00:00.123456+00:00";
  const V1 = "2026-10-01T10:05:00.000+00:00";
  const V2 = "2026-10-01T10:05:00.001+00:00";
  const G = "11111111-1111-4111-8111-111111111111";

  // ── A) Orkestrasyon ─────────────────────────────────────────────────────
  section("A1. PATCH 409 → PUT ASLA çağrılmaz; taslak dokunulmaz; hata döner");
  {
    const fields = deepFreeze({ name: "Astım", category: "Bayat kategori", images: null });
    const sections = deepFreeze([{ section_type: "reasons", note: "A'nın notu", source: "eski" }]);
    const snapshot = JSON.stringify({ fields, sections });
    const { fetchImpl, calls } = fakeFetch([{ status: 409, json: { ok: false, stale: true, error: SIFA_STALE_MESSAGE } }]);
    const r = await saveGuideVersioned(deps(fetchImpl), { guideId: G, fields, sections, expectedUpdatedAt: V0 });
    ok(calls.length === 1 && calls[0].method === "PATCH" && calls[0].url === `/api/sifa-rehberi/guides/${G}`, "yalnız 1 çağrı: PATCH guide", calls);
    ok(calls[0].body.expected_updated_at === V0, "PATCH gövdesi expected_updated_at = yüklenen sürüm (AYNEN)", calls[0].body);
    ok(calls[0].body.category === "Bayat kategori" && calls[0].body.name === "Astım", "PATCH gövdesi alanları taşır");
    ok(!r.ok && r.stage === "guide" && r.stale && r.error === SIFA_STALE_MESSAGE, "sonuç: stage=guide, stale=true, Türkçe mesaj", r);
    ok(!r.ok && r.updatedAt === V0, "bilinen sürüm DEĞİŞMEZ (tekrar → yine 409; otomatik ezme yok)", r);
    ok(JSON.stringify({ fields, sections }) === snapshot, "girdi (taslak) MUTASYONA UĞRAMADI");
  }

  section("A2. Başarı → PATCH sonra PUT; PUT beklenen = PATCH'in yeni sürümü; sürüm ilerler");
  {
    const { fetchImpl, calls } = fakeFetch([
      { status: 200, json: { ok: true, updated_at: V1 } },
      { status: 200, json: { ok: true, inserted: 1, deleted: 2, updated_at: V2 } },
    ]);
    const secs = [{ section_type: "reasons", note: "n" }];
    const r = await saveGuideVersioned(deps(fetchImpl), { guideId: G, fields: { name: "Astım" }, sections: secs, expectedUpdatedAt: V0 });
    ok(calls.map((c) => c.method).join(",") === "PATCH,PUT", "sıra: PATCH → PUT", calls.map((c) => c.method));
    ok(calls[1].url === `/api/sifa-rehberi/guides/${G}/sections`, "PUT sections url");
    ok(calls[0].body.expected_updated_at === V0 && calls[1].body.expected_updated_at === V1, "PATCH=V0, PUT=V1 (PATCH yanıtından)", calls.map((c) => c.body.expected_updated_at));
    ok(JSON.stringify(calls[1].body.sections) === JSON.stringify(secs), "PUT bölüm yükü");
    ok(r.ok && r.updatedAt === V2, "sonuç ok + updatedAt = PUT sürümü (V2)", r);
  }

  section("A3. Kısmi: PATCH ok, PUT 409 / 500 → stage=sections, sürüm = PATCH'in");
  {
    let f = fakeFetch([{ status: 200, json: { ok: true, updated_at: V1 } }, { status: 409, json: { ok: false, stale: true } }]);
    let r = await saveGuideVersioned(deps(f.fetchImpl), { guideId: G, fields: { name: "x" }, sections: [], expectedUpdatedAt: V0 });
    ok(!r.ok && r.stage === "sections" && r.stale && r.updatedAt === V1, "PUT 409 → stage=sections, stale, updatedAt=V1", r);
    f = fakeFetch([{ status: 200, json: { ok: true, updated_at: V1 } }, { status: 500, json: { ok: false, error: "İşlem sırasında beklenmeyen bir hata oluştu." } }]);
    r = await saveGuideVersioned(deps(f.fetchImpl), { guideId: G, fields: { name: "x" }, sections: [], expectedUpdatedAt: V0 });
    ok(!r.ok && r.stage === "sections" && !r.stale && r.updatedAt === V1 && /beklenmeyen/.test(r.error), "PUT 500 → stage=sections, stale=false, updatedAt=V1 (yeniden deneme self-conflict YOK)", r);
  }

  section("A4. Düz kayıt (sections=null) → yalnız PATCH; ağ/404/demo/400");
  {
    let f = fakeFetch([{ status: 200, json: { ok: true, updated_at: V1 } }]);
    let r = await saveGuideVersioned(deps(f.fetchImpl), { guideId: G, fields: { name: "x" }, sections: null, expectedUpdatedAt: V0 });
    ok(f.calls.length === 1 && r.ok && r.updatedAt === V1, "sections=null → yalnız PATCH", { calls: f.calls.length, r });
    f = fakeFetch(["network"]);
    r = await saveGuideVersioned(deps(f.fetchImpl), { guideId: G, fields: { name: "x" }, sections: [], expectedUpdatedAt: V0 });
    ok(!r.ok && r.stage === "guide" && r.error === "Sunucuya ulaşılamadı." && f.calls.length === 1, "ağ hatası → PUT yok", r);
    f = fakeFetch([{ status: 404, json: { ok: false, notFound: true } }]);
    r = await saveGuideVersioned(deps(f.fetchImpl), { guideId: G, fields: { name: "x" }, sections: [], expectedUpdatedAt: V0 });
    ok(!r.ok && r.notFound && f.calls.length === 1, "404 → notFound, PUT yok", r);
    f = fakeFetch([{ status: 400, json: { ok: false, code: "SIFA_MISSING_VERSION", error: "Kayıt sürüm bilgisi eksik. Sayfayı yenileyip tekrar deneyin." } }]);
    r = await saveGuideVersioned(deps(f.fetchImpl), { guideId: G, fields: { name: "x" }, sections: [], expectedUpdatedAt: V0 });
    ok(!r.ok && !r.stale && /sürüm bilgisi eksik/.test(r.error) && f.calls.length === 1, "400 → sunucu mesajı, PUT yok", r);
    f = fakeFetch([{ status: 200, json: { ok: true, demo: true } }, { status: 200, json: { ok: true, demo: true } }]);
    r = await saveGuideVersioned(deps(f.fetchImpl), { guideId: G, fields: { name: "x" }, sections: [], expectedUpdatedAt: V0 });
    ok(r.ok && r.updatedAt === V0 && f.calls[1].body.expected_updated_at === V0, "demo yanıtı (updated_at yok) → sürüm değişmez", r);
    f = fakeFetch([{ status: 200, json: { ok: true, updated_at: V1 } }]);
    const p = await patchGuideVersioned(deps(f.fetchImpl), G, { images: [] }, null);
    ok(p.ok && p.updatedAt === V1 && f.calls[0].body.expected_updated_at === null && "expected_updated_at" in f.calls[0].body, "legacy null belirteç AÇIKÇA (null) gönderilir", f.calls[0].body);
  }

  // ── B) Belirteç ─────────────────────────────────────────────────────────
  section("B. guideVersion");
  ok(parseExpectedUpdatedAt({}).ok === false && (parseExpectedUpdatedAt({}) as { code: string }).code === "SIFA_MISSING_VERSION", "anahtar yok → MISSING");
  ok(parseExpectedUpdatedAt({ expected_updated_at: undefined }).ok === false, "undefined → MISSING");
  const pn = parseExpectedUpdatedAt({ expected_updated_at: null });
  ok(pn.ok && pn.value === null, "null → geçerli (legacy)");
  for (const good of [V0, "2026-10-01T10:00:00Z", "2026-10-01 10:00:00.5+00", "2026-10-01T10:00:00+0300"]) {
    ok(isValidVersionToken(good), `geçerli: ${good}`);
  }
  for (const bad of ["", " ", "abc", "2026-10-01", "2026-02-30T25:61:00Z", "2026-10-01T10:00:00Z; drop table", 5, null, {}]) {
    ok(!isValidVersionToken(bad), `geçersiz: ${JSON.stringify(bad)}`);
  }
  ok(nextVersionStamp(null, new Date("2026-10-01T10:00:00.000Z")) === "2026-10-01T10:00:00.000Z", "nextVersionStamp: şimdi");
  ok(nextVersionStamp("2026-10-01T10:00:00.500Z", new Date("2026-10-01T10:00:00.500Z")) === "2026-10-01T10:00:00.501Z", "aynı ms → +1ms (eşit olamaz)");
  ok(nextVersionStamp("2026-10-01T11:00:00.000+00:00", new Date("2026-10-01T10:00:00.000Z")) === "2026-10-01T11:00:00.001Z", "saat geride → beklenenden ileri");

  // ── C) Ayrılma koruması (saf) ───────────────────────────────────────────
  section("C. resolveGuardedLinkTarget");
  const cur = "https://www.example.test/sifa-rehberi/abc?x=1";
  const base: LeaveClickInput = {
    dirty: true, leaving: false, defaultPrevented: false, button: 0,
    metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    anchor: { href: "https://www.example.test/", target: "", download: false },
    currentHref: cur,
  };
  const t = (o: Partial<LeaveClickInput>) => resolveGuardedLinkTarget({ ...base, ...o });
  ok(t({}) === "/", "dirty + logo (/) → YAKALA, hedef '/'");
  ok(t({ anchor: { href: "/sifa-rehberi?view=list" } }) === "/sifa-rehberi?view=list", "dirty + göreli aynı-origin link → yakala (search korunur)");
  ok(t({ anchor: { href: "/kupa#x" } }) === "/kupa#x", "hash korunur");
  ok(t({ dirty: false }) === null, "dirty DEĞİL → geçir (soru yok)");
  ok(t({ leaving: true }) === null, "zaten ayrılıyor → geçir");
  ok(t({ anchor: { href: "https://evil.example.com/" } }) === null, "harici origin → geçir");
  ok(t({ anchor: { href: "/", target: "_blank" } }) === null, "target=_blank (yeni sekme) → geçir");
  ok(t({ anchor: { href: "/", target: "_self" } }) === "/", "target=_self → yakala");
  ok(t({ ctrlKey: true }) === null && t({ metaKey: true }) === null && t({ shiftKey: true }) === null && t({ altKey: true }) === null, "Ctrl/Cmd/Shift/Alt-tık → geçir");
  ok(t({ button: 1 }) === null, "orta tık → geçir");
  ok(t({ defaultPrevented: true }) === null, "başkası preventDefault etti → geçir");
  ok(t({ anchor: { href: "/x.docx", download: true } }) === null, "download → geçir");
  ok(t({ anchor: null }) === null, "link değil → geçir");
  ok(t({ anchor: { href: "/sifa-rehberi/abc?x=1#bolum" } }) === null, "aynı sayfa (yalnız hash) → geçir");
  ok(t({ anchor: { href: "mailto:a@b.c" } }) === null && t({ anchor: { href: "tel:123" } }) === null, "mailto/tel → geçir");
  ok(t({ anchor: { href: "javascript:void(0)" } }) === null, "javascript: → geçir");
  ok(t({ anchor: { href: "http://[bad" } }) === null, "ayrıştırılamayan href → geçir");
  // Kaydet sonrası: editDirty = editEnabled && sig !== initSig → editEnabled=false ⇒ dirty=false ⇒ geçir.
  const sec = { key: "k", section_type: "reasons", mode: null, title: null, note: "a", source: "", source_kind: "", expert_note: "", attention: "", images: [] };
  const initSig = editorSignature("Astım", "", [sec]);
  const dirtyOf = (editEnabled: boolean, sig: string) => editEnabled && sig !== initSig;
  const changed = editorSignature("Astım", "", [{ ...sec, note: "b" }]);
  ok(t({ dirty: dirtyOf(true, changed) }) === "/", "düzenleme + değişiklik → yakala");
  ok(t({ dirty: dirtyOf(false, changed) }) === null, "başarılı kayıt / Vazgeç sonrası (editEnabled=false) → geçir");
  ok(t({ dirty: dirtyOf(true, initSig) }) === null, "düzenleme ama değişiklik yok → geçir");

  section("C2. unsavedUploadPaths");
  ok(JSON.stringify(unsavedUploadPaths([[{ file_path: "a" }]], [[{ file_path: "a" }, { file_path: "b" }], [{ id: "x" }, null, { file_path: "c" }]])) === JSON.stringify(["b", "c"]), "yalnız kaydedilmemiş yüklemeler (a hariç)");
  ok(unsavedUploadPaths([], []).length === 0, "boş → boş");

  // ── D) Kaynak sözleşmesi ────────────────────────────────────────────────
  section("D. Kaynak sözleşmesi (detay + yeni kayıt + hook)");
  const detail = read("app/sifa-rehberi/[id]/page.tsx");
  const create = read("app/sifa-rehberi/page.tsx");
  const hook = read("components/sifa-rehberi/useSifaLinkLeaveGuard.ts");
  const live = read("lib/sifa-rehberi/healingGuideLiveData.ts");
  const logo = read("components/layout/AppLogoLink.tsx");
  ok(/\{editEnabled \? \(\s*<button[\s\S]{0,200}onClick=\{\(\) => void handleCancelEdit\(\)\}[\s\S]{0,400}Vazgeç\s*<\/button>/.test(detail), "detay: düzenleme modunda 'Vazgeç' butonu (handleCancelEdit)");
  const cancelFn = detail.slice(detail.indexOf("async function handleCancelEdit"), detail.indexOf("function discardEditDraft"));
  ok(/if \(editDirty\)[\s\S]*SIFA_DISCARD_CONFIRM/.test(cancelFn) && /discardEditDraft\(\)/.test(cancelFn), "detay Vazgeç: dirty → onay, sonra taslak atılır");
  const discardFn = detail.slice(detail.indexOf("function discardEditDraft"), detail.indexOf("async function handleReloadLatest"));
  ok(/setEditEnabled\(false\)/.test(discardFn) && /setDraft\(recordToDraft\(record\)\)/.test(discardFn) && !/saveHealingGuide|updateHealingGuide/.test(discardFn), "Vazgeç: kaydetmeden düzenlemeden çıkar + taslak sıfırlanır");
  ok(/useSifaLinkLeaveGuard\(editDirty\)/.test(detail), "detay: link guard editDirty ile bağlı");
  ok(/useUnsavedGuard\(editDirty\)/.test(detail) && /useBackNavigationGuard\(\s*editDirty/.test(detail), "detay: beforeunload + popstate guard'ları KORUNDU");
  ok(/useSifaLinkLeaveGuard\(createDirty, discardCreateDraft\)/.test(create), "yeni kayıt: link guard createDirty ile bağlı (onayda form atılır)");
  ok(/onClick=\{\(\) => void handleCancelCreate\(\)\}[\s\S]{0,400}Vazgeç/.test(create), "yeni kayıt: footer 'Vazgeç' butonu");
  const cancelCreate = create.slice(create.indexOf("async function handleCancelCreate"));
  ok(/if \(createDirty\)[\s\S]{0,200}confirm\(/.test(cancelCreate) && /goToMainMenu\(\)/.test(cancelCreate.slice(0, 600)), "yeni kayıt Vazgeç: dirty → onay, sonra ana menü");
  ok(/document\.addEventListener\("click", onClick, true\)/.test(hook) && /removeEventListener\("click", onClick, true\)/.test(hook), "hook: capture-phase click dinleyicisi (+temizlik)");
  ok(/useConfirm\(\)/.test(hook) && /SIFA_LEAVE_CONFIRM/.test(hook) && !/window\.confirm/.test(hook), "hook: uygulama-içi ConfirmProvider (native confirm DEĞİL)");
  ok(/resolveGuardedLinkTarget\(/.test(hook) && /router\.push\(target\)/.test(hook), "hook: saf karar + onayda router.push");
  ok(/<Link\s+href="\/"/.test(logo), "AppLogoLink değişmedi (Next <Link href=\"/\">) — capture guard kapsar");
  // SIFA-1 istemci akışı
  ok(!/replaceHealingGuideSections/.test(detail) && !/replaceHealingGuideSections/.test(live), "eski sürümsüz PUT yardımcısı kaldırıldı (tüm PUT'lar sürümlü)");
  ok(/saveHealingGuide\(\{[\s\S]{0,300}expectedUpdatedAt: editBaseVersionRef\.current/.test(detail), "Kaydet: düzenleme tabanı sürümüyle saveHealingGuide");
  const toggle = detail.slice(detail.indexOf("function toggleEditOrSave"), detail.indexOf("async function confirmDeleteRecord"));
  ok(/editBaseVersionRef\.current = record\.updated_at/.test(toggle), "Düzenle: taban sürüm GÖSTERİLEN kayıttan alınır");
  const save = detail.slice(detail.indexOf("async function handleSaveFields"), detail.indexOf("function flatDraftFields"));
  const failBranch = save.slice(save.indexOf("if (!result.ok)"), save.indexOf("editBaseVersionRef.current = result.updatedAt;\n    viewVersionRef"));
  ok(failBranch.length > 0 && !/setEditEnabled|setDraft|setEditSections|loadRecord/.test(failBranch), "409/hata dalı: düzenleme modu + taslak KORUNUR (reset yok)");
  ok(/SIFA_STALE_MESSAGE/.test(failBranch) && /setStaleConflict\(true\)/.test(failBranch), "409: Türkçe çakışma mesajı + 'Son hali yükle' önerisi");
  ok(/Son hali yükle/.test(detail) && /SIFA_RELOAD_CONFIRM/.test(detail) && /invalidateHealingGuideCache\(id\)/.test(detail), "'Son hali yükle': onay + önbellek düşürme + taze yükleme");
  const persist = detail.slice(detail.indexOf("async function persistImages"), detail.indexOf("function triggerImagePick"));
  ok(/updateHealingGuide\(\s*id,[\s\S]{0,120}currentKnownVersion\(\)/.test(persist) && /advanceKnownVersion\(updatedAt\)/.test(persist), "görsel persist: sürüm belirteci + başarıda sürüm ilerler");
  const upCalls = detail.match(/updateHealingGuide\(/g) ?? [];
  const upWithVersion = detail.match(/updateHealingGuide\([^;]*?(currentKnownVersion\(\)|editBaseVersionRef)/g) ?? [];
  ok(upCalls.length > 0 && upCalls.length === upWithVersion.length, `TÜM updateHealingGuide çağrıları sürüm taşır (${upWithVersion.length}/${upCalls.length})`);
  ok(/export async function updateHealingGuide\(\s*guideId: string,\s*fields: Record<string, unknown>,\s*expectedUpdatedAt: string \| null,/.test(live), "updateHealingGuide imzası belirteci ZORUNLU kılar");
  const fileChange = detail.slice(detail.indexOf("async function handleGuideImageFileChange"), detail.indexOf("async function removeGuideImage("));
  ok(/if \(dbErr\)[\s\S]{0,600}cleanupSifaPhoto\(entry\.file_path!\)/.test(fileChange), "görsel ekle çakışırsa: hata + mevcut orphan cleanup yolu");

  console.log(`\nŞİFA SIFA-1/SIFA-2 CLIENT HARNESS: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log("FAILURES:\n - " + failures.join("\n - "));
    process.exitCode = 1;
  } else {
    console.log("OVERALL: PASS");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
