/**
 * WT4 — oturum/yetki + Şifa Rehberi sağlamlaştırma harness'ı (prod'a temas YOK, DB YOK).
 *
 * A) resolveActiveSession üç değerli sonuç (active / inactive / unavailable)
 * B) confirmSessionInvalid: tek "geçersiz" yanıt çıkış yaptırmaz; iki kesin "geçersiz" gerekir
 * C) Şifa kayıt akışı: 401 → "oturum sona erdi" mesajı (ham "Yetki gerekli" değil)
 * D) Kategori alanı saf mantığı (seçimden sonra yeniden seçilebilir; özel değer korunur)
 * E) Kaynak sözleşmeleri: onay döngüsü yok, çift gönderim kilidi, alt Kaydet, çıkış onayı,
 *    oturumsuz modül rotası "Yetkiniz Bulunmuyor" yerine "Oturumunuz Sona Erdi"
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}`);
};

function rpcDb(result: { data?: unknown; error?: unknown; throws?: boolean }): SupabaseClient {
  return {
    rpc: async () => {
      if (result.throws) throw new Error("socket hang up");
      return { data: result.data ?? null, error: result.error ?? null };
    },
    from: () => {
      throw new Error("yedek yola düşmemeli");
    },
  } as unknown as SupabaseClient;
}

async function main() {
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = globalThis;
  g.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

  console.log("── A) resolveActiveSession (üç değerli) ──");
  {
    const { resolveActiveSession, touchActiveSession, resolveSessionExpiryPolicy } = await import("../../lib/auth/sessionSecurity");
    const pol = resolveSessionExpiryPolicy({});
    ok((await resolveActiveSession(rpcDb({ data: "u-1" }), "tok", pol)).status === "active", "RPC userId → active");
    ok((await resolveActiveSession(rpcDb({ data: null }), "tok", pol)).status === "inactive", "RPC null (pasif/süresi dolmuş) → inactive");
    ok((await resolveActiveSession(rpcDb({ error: { code: "57014", message: "timeout" } }), "tok", pol)).status === "unavailable", "RPC hatası → unavailable (inactive DEĞİL)");
    ok((await resolveActiveSession(rpcDb({ throws: true }), "tok", pol)).status === "unavailable", "ağ istisnası → unavailable");
    ok((await resolveActiveSession(rpcDb({ data: "u-1" }), "  ", pol)).status === "inactive", "boş token → inactive");
    ok((await touchActiveSession(rpcDb({ error: { code: "57014" } }), "tok", pol)) === null, "guard yolu fail-closed korunur (touchActiveSession → null)");
  }

  console.log("\n── B) confirmSessionInvalid (iki aşamalı karar) ──");
  {
    const { confirmSessionInvalid } = await import("../../lib/auth/sessionExpiry");
    type S = { valid: boolean; reason: "expired" | "revoked" } | null;
    const seq = (arr: S[]) => {
      let i = 0;
      const calls: (string | null)[] = [];
      return { fn: async (t: string | null) => { calls.push(t); return arr[Math.min(i++, arr.length - 1)]; }, calls };
    };
    const tok = () => "tok-1";
    let s = seq([{ valid: false, reason: "revoked" }, { valid: true, reason: "revoked" }]);
    ok((await confirmSessionInvalid(1, s.fn, tok)) === null && s.calls.length === 2, "geçersiz → sonra geçerli: çıkış YOK");
    s = seq([{ valid: false, reason: "revoked" }, null]);
    ok((await confirmSessionInvalid(1, s.fn, tok)) === null, "geçersiz → sonra ağ/5xx (null): çıkış YOK");
    s = seq([null]);
    ok((await confirmSessionInvalid(1, s.fn, tok)) === null && s.calls.length === 1, "ağ/5xx: tek istek, çıkış YOK");
    s = seq([{ valid: true, reason: "revoked" }]);
    ok((await confirmSessionInvalid(1, s.fn, tok)) === null && s.calls.length === 1, "geçerli: tek istek");
    s = seq([{ valid: false, reason: "expired" }, { valid: false, reason: "expired" }]);
    const r = await confirmSessionInvalid(1, s.fn, tok);
    ok(r?.valid === false && r.reason === "expired" && s.calls.every((c) => c === "tok-1"), "iki kesin geçersiz (aynı token) → oturum sonu (neden korunur)");
    let n = 0;
    const changing = () => (n++ === 0 ? "tok-old" : "tok-new");
    s = seq([{ valid: false, reason: "revoked" }, { valid: false, reason: "revoked" }]);
    ok((await confirmSessionInvalid(1, s.fn, changing)) === null && s.calls.length === 1, "araya yeni giriş (token değişti) → eski token yüzünden çıkış YOK");
    s = seq([{ valid: false, reason: "revoked" }]);
    ok((await confirmSessionInvalid(1, s.fn, () => null)) === null && s.calls.length === 0, "token yok → istek yok");
  }

  console.log("\n── C) Şifa yazma akışı: 401 → oturum mesajı ──");
  {
    const { saveGuideVersioned, SIFA_SESSION_ENDED_MESSAGE } = await import("../../lib/sifa-rehberi/guideSaveFlow");
    const calls: string[] = [];
    const deps = {
      headers: () => ({ "x-user-id": "" }),
      fetchImpl: async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${url}`);
        return new Response(JSON.stringify({ error: "Yetki gerekli." }), { status: 401 });
      },
    };
    const r = await saveGuideVersioned(deps, { guideId: "g1", fields: { name: "x" }, sections: [], expectedUpdatedAt: "2026-10-08T00:00:00Z" });
    ok(!r.ok && r.error === SIFA_SESSION_ENDED_MESSAGE && !/Yetki gerekli/.test(r.error), "PATCH 401 → 'oturum sona erdi' (ham 'Yetki gerekli' değil)");
    ok(calls.length === 1 && calls[0].startsWith("PATCH"), "401'de bölüm PUT'u ÇAĞRILMAZ");
    ok(!r.ok && r.updatedAt === "2026-10-08T00:00:00Z", "sürüm tabanı değişmez (taslak korunur)");
    const live = read("lib/sifa-rehberi/healingGuideLiveData.ts");
    ok((live.match(/res\.status === 401\) return \{[^}]*SIFA_SESSION_ENDED_MESSAGE/g) ?? []).length === 3, "tekli sil + toplu sil + oluştur: 401 → oturum mesajı");
  }

  console.log("\n── D) Kategori alanı ──");
  {
    const { categorySelectValue, resolveCategorySelection, CATEGORY_CUSTOM_OPTION } = await import("../../lib/sifa-rehberi/categoryField");
    ok(categorySelectValue("", false) === "", "boş → 'seçilmedi'");
    ok(categorySelectValue("sinir sistemi", false) === "Sinir Sistemi", "önerilen (harf farkı) → kanonik seçenek");
    ok(categorySelectValue("Eski Özel Kategori", false) === CATEGORY_CUSTOM_OPTION, "önerilen dışı eski değer → 'Diğer' (kaybolmaz)");
    let st = resolveCategorySelection("Sinir Sistemi", "");
    ok(st.value === "Sinir Sistemi" && !st.customMode, "ilk seçim");
    st = resolveCategorySelection("Cilt", st.value);
    ok(st.value === "Cilt" && !st.customMode, "SEÇİMDEN SONRA başka kategori seçilebilir (yeniden açılır)");
    st = resolveCategorySelection("", st.value);
    ok(st.value === "" && !st.customMode, "kategori kaldırılabilir");
    st = resolveCategorySelection(CATEGORY_CUSTOM_OPTION, "Cilt");
    ok(st.value === "" && st.customMode && categorySelectValue(st.value, st.customMode) === CATEGORY_CUSTOM_OPTION, "önerilenden 'Diğer'e geçiş → metin kutusu boş açılır");
    st = resolveCategorySelection(CATEGORY_CUSTOM_OPTION, "Eski Özel Kategori");
    ok(st.value === "Eski Özel Kategori", "özel değerde 'Diğer' metni korur");
    const comp = read("components/sifa-rehberi/SifaCategoryField.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
    ok(/<select/.test(comp) && !/<datalist\s+id/.test(comp) && !/\slist=/.test(comp), "yerel select; datalist YOK");
    const create = read("app/sifa-rehberi/page.tsx");
    const edit = read("app/sifa-rehberi/[id]/page.tsx");
    ok(!/<datalist/.test(create) && /<SifaCategoryField/.test(create), "yeni kayıt formu: datalist kaldırıldı, SifaCategoryField kullanılıyor");
    ok(/<SifaCategoryField/.test(edit), "düzenleme formu: aynı kategori alanı");
  }

  console.log("\n── E) Kaynak sözleşmeleri ──");
  {
    const edit = read("app/sifa-rehberi/[id]/page.tsx");
    const del = edit.slice(edit.indexOf("async function confirmDeleteRecord()"), edit.indexOf("if (loading) {"));
    const closeBeforeError = /const \{ error \} = await deleteHealingGuide\(id\);\s*setDeleteConfirmOpen\(false\);\s*if \(error\)/.test(del);
    ok(closeBeforeError, "onay döngüsü YOK: silme sonucu ne olursa olsun modal kapanır, hata bir kez görünür");
    ok(/if \(!id \|\| deleteInFlightRef\.current\) return;/.test(del) && /finally \{\s*deleteInFlightRef\.current = false;/.test(del), "silme çift-tık kilidi");
    ok(/if \(saveInFlightRef\.current\) return;\s*saveInFlightRef\.current = true;/.test(edit), "Kaydet senkron ref kilidi (çift PATCH yok)");
    const bottom = edit.slice(edit.indexOf("data-testid=\"sifa-save-bottom\""), edit.indexOf("data-testid=\"sifa-save-bottom\"") + 200);
    ok(/onClick=\{\(\) => void handleSaveFields\(\)\}/.test(bottom), "alt Kaydet ÜSTTEKİYLE aynı eylem (handleSaveFields)");
    ok(/void handleSaveFields\(\);/.test(edit.slice(edit.indexOf("function toggleEditOrSave"), edit.indexOf("function toggleEditOrSave") + 200)), "üst Kaydet → handleSaveFields");
    ok(/editEnabled && !isDemo \? \(\s*<div className="mt-3/.test(edit), "alt Kaydet yalnız düzenleme modunda (demo hariç)");
    ok(/useUnsavedGuard\(editDirty\)/.test(edit) && /useBackNavigationGuard\(\s*editDirty/.test(edit) && /useSifaLinkLeaveGuard\(editDirty\)/.test(edit), "kaydedilmemiş-değişiklik guard'ları KORUNDU");
    ok(/SIFA_DISCARD_CONFIRM/.test(edit) && /Değişiklikleri sil ve çık/.test(read("lib/sifa-rehberi/leaveGuard.ts")), "Vazgeç onayı (Değişiklikleri sil ve çık) KORUNDU");
    const create = read("app/sifa-rehberi/page.tsx");
    ok(/if \(createInFlightRef\.current\) return;/.test(create), "yeni kayıt Kaydet çift-tık kilidi");

    const mrg = read("components/auth/ModuleRouteGuard.tsx");
    ok(/!cached \? "session"/.test(mrg), "oturumsuz modül rotası → 'session' nedeni (yetki reddi değil)");
    ok(/addEventListener\("storage", onStorage\)/.test(mrg) && /e\.key !== "yasam_user"/.test(mrg), "başka sekmede çıkış → bu sayfa bayat oturumla kalmaz");
    const denied = read("components/auth/ModuleAccessDenied.tsx");
    ok(/Oturumunuz Sona Erdi/.test(denied) && /href=\{isSession \? "\/\?login=1" : "\/"\}/.test(denied) && /Ana Panele Dön/.test(denied), "oturum yok → 'Giriş Yap' (/?login=1); yetki reddi metni/düğmesi aynı");
    const exit = read("lib/auth/sessionExit.ts");
    ok(/softNavigate\(href\)/.test(exit) && /window\.location\.pathname === target/.test(exit) && /window\.location\.replace\(href\)/.test(exit), "oturum sonu: önce istemci-tarafı geçiş (beforeunload yok), sonra tam yükleme");
    ok((mrg.match(/leaveAfterSessionEnd\("\/", (reason|"revoked"), \(href\) => router\.replace\(href\)\)/g) ?? []).length === 2, "iki oturum-sonu yolu da router ile çıkar");

    const home = read("app/page.tsx");
    ok(/onClick=\{\(\) => void requestLogout\(\)\}/.test(home) && !/onClick=\{logout\}/.test(home), "ana panel çıkış düğmesi onaysız çıkış yapmaz");
    ok(/const ok = await confirm\(\{[\s\S]{0,300}logoutConfirmTitle[\s\S]{0,300}if \(ok\) logout\(\);/.test(home), "çıkış yalnız açık onayla");
    ok(/if \(status === 401\) \{[\s\S]{0,400}const s = await confirmSessionInvalid\(\);\s*if \(s\) \{\s*endSessionForReason\(s\.reason\);/.test(home), "Admin Paneli 401: yalnız iki kesin 'geçersiz' ile giriş akışı (varsayılan 'revoked' ile çıkış YOK)");
    const tr = JSON.parse(read("messages/tr/home.json"));
    const en = JSON.parse(read("messages/en/home.json"));
    ok(["logoutConfirmTitle", "logoutConfirmMessage", "logoutConfirmCancel"].every((k) => typeof tr.home?.dashboard?.[k] === "string" && typeof en.home?.dashboard?.[k] === "string"), "TR/EN anahtar paritesi");
    const guard = read("hooks/useSessionGuard.ts");
    ok((guard.match(/await confirmSessionInvalid\(\)/g) ?? []).length === 2 && !/checkSessionStatus\(/.test(guard), "useSessionGuard + useStoredSessionGuard iki aşamalı karar kullanır");
  }

  console.log(`\nWT4 session+sifa harness: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
