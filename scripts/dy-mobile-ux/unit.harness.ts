/**
 * DANIŞAN YOLCULUĞU — MOBİL UX + ANALİZ GÜVENLİĞİ: birim + statik kapsam harness'i (DB'siz, ağsız).
 * Çalıştır: npx tsx scripts/dy-mobile-ux/unit.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { CLIENT_DETAIL_TAB_DEFS, CLIENT_DETAIL_TABS } from "../../lib/danisan/clientDetailTabs";
import {
  getDanisanListCache,
  removeClientFromDanisanListCache,
  setDanisanListCache,
} from "../../lib/danisan/listCache";
import { freeTextFieldProps } from "../../components/danisan/anamnez/styles";
import { MOBILE_HIDDEN_BLOCK, MOBILE_HIDDEN_INLINE_FLEX } from "../../components/platform/mobileHidden";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

console.log("[1] Sekme sırası");
const ids = CLIENT_DETAIL_TAB_DEFS.map((t) => t.id as string);
ok(ids.indexOf("randevular") > ids.indexOf("beslenme"), "Randevular Beslenme'den SONRA");
ok(ids[ids.length - 1] === "randevular", "Randevular son sekme");
ok(
  JSON.stringify([...ids].sort()) ===
    JSON.stringify(["analizler", "anamnez", "beslenme", "genel", "hafiza", "notlar", "odevler", "randevular", "seanslar", "taslar", "ucretlendirme", "yolculuk"]),
  "sekme kümesi aynı (hiçbir sekme kaybolmadı)",
);
ok((CLIENT_DETAIL_TABS as readonly string[]).includes("randevular") && (CLIENT_DETAIL_TABS as readonly string[]).includes("odevler"), "?tab= allowlist randevular + odevler");
ok(JSON.stringify(ids.filter((x) => x !== "randevular")) === JSON.stringify(["genel", "anamnez", "notlar", "taslar", "seanslar", "ucretlendirme", "odevler", "analizler", "yolculuk", "hafiza", "beslenme"]),
  "diğer sekmelerin göreli sırası korunuyor");

console.log("\n[2] Liste önbelleği — silme sonrası Aktif Uyarı");
const T = "tenant-x";
setDanisanListCache(T, { clients: [{ id: "c1" }, { id: "c2" }], total: 5, fullLoaded: false, alerts: { c1: 2, c2: 1, c9: 3 } });
removeClientFromDanisanListCache(T, "c1");
let e = getDanisanListCache(T);
ok(!!e && e.total === 4 && e.clients.length === 1 && !("c1" in e.alerts) && e.alerts.c2 === 1 && e.alerts.c9 === 3, "tekli silme: danışan + uyarısı düşer, diğerleri korunur");
removeClientFromDanisanListCache(T, "c9"); // sayfalı listede yüklü değil ama uyarısı var
e = getDanisanListCache(T);
ok(!!e && e.total === 4 && !("c9" in e.alerts), "yüklü olmayan danışan silindi: uyarısı yine düşer, total değişmez");
removeClientFromDanisanListCache(T, "yok");
e = getDanisanListCache(T);
ok(!!e && e.total === 4 && Object.keys(e.alerts).length === 1, "ilgisiz id → değişiklik yok");

console.log("\n[3] Anamnez serbest metin metadata");
const p = freeTextFieldProps("A.reason");
ok(p.name === "anamnez_A_reason" && p.autoComplete === "off" && p.autoCapitalize === "sentences" && p.spellCheck === true, "name/autocomplete/autocapitalize/spellcheck");
ok(!/user|login|mail|pass/i.test(p.name), "name kimlik çağrıştırmıyor");
const fi = read("components/danisan/anamnez/AnamnezFieldInput.tsx");
ok((fi.match(/freeTextFieldProps\(/g) ?? []).length >= 4, "metin/textarea/ynd/satır alanları metadata'lı");
ok(read("app/page.tsx").includes("current-password") || read("components/ui/PasswordInput.tsx").includes("autoComplete"), "giriş ekranı parola davranışına dokunulmadı");

console.log("\n[4] Mobilde gizli / web'de görünür");
ok(MOBILE_HIDDEN_INLINE_FLEX === "no-android hidden md:inline-flex" && MOBILE_HIDDEN_BLOCK === "no-android hidden md:block", "ortak sınıflar (Android SSR + telefon genişliği)");
ok(read("components/danisan/anamnez/AnamnezAttachments.tsx").includes("MOBILE_HIDDEN_INLINE_FLEX"), "PDF Ekle mobilde gizli");
ok(read("app/dashboard/clients/[id]/components/StonesTab.tsx").includes("MOBILE_HIDDEN_BLOCK"), "Bilgisayardan Foto Seç mobilde gizli");
ok(read("app/globals.css").includes("html[data-android] .no-android"), "SSR .no-android kuralı mevcut");

console.log("\n[5] KVKK kompakt");
const page = read("app/dashboard/clients/[id]/page.tsx");
ok(/source="dy_detay"\s+collapsible/.test(page), "danışan detayında collapsible");
ok(!read("app/danisan-yolculugu/kayit/page.tsx").includes("collapsible"), "kayıt ekranı davranışı değişmedi");
const panel = read("components/kvkk/ClientConsentPanel.tsx");
ok(panel.includes("useState(false)") && panel.includes("aria-expanded={open}") && panel.includes("border-rose-200"), "varsayılan kapalı + aria-expanded + kırmızı ton");

console.log("\n[6] Analiz");
const an = read("app/dashboard/clients/[id]/components/AnalizlerTab.tsx");
ok(an.includes("<fieldset disabled={readOnly}") && an.includes("setReadOnly(true)"), "kayıtlı analiz salt okunur");
ok(an.includes("savingRef.current") && an.includes("closeModal();"), "çift tıklama kilidi + başarıda kapanma");
ok(/catch \{\s*showToast\(\{ title: t\("toast.failTitle"\), message: t\("toast.saveNetwork"\)/.test(an), "ağ hatasında modal açık + hata");

console.log("\n[7] Aktif Uyarı route");
const route = read("app/api/clients/homeworks-alerts/route.ts");
ok(route.includes('.from("clients")') && route.includes("if (!existing.has(id)) delete alerts[id]"), "yetim (silinmiş danışan) satırları sayılmaz");

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`);
if (fail > 0) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
