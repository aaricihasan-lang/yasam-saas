/**
 * WT6 — Kupa & Hacamat takvim + protokol UX: SAF mantık + kaynak sözleşmeleri harness'ı (DB/prod YOK).
 * Çalıştır: npx tsx scripts/wt6/ux.harness.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
let pass = 0;
let fail = 0;
const ok = (c: unknown, m: string, d = "") => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}${!c && d ? "  → " + d : ""}`);
};
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${e}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.(tsx?)$/.test(e)) out.push(rel);
  }
  return out;
}

async function main() {
  console.log("── A) Kanonik yıl planı (saf) ──");
  {
    const m = await import("../../lib/cupping/calendarPlanResolve");
    const plans = [
      { id: "p27", year: 2027 },
      { id: "p26b", year: 2026 },
      { id: "p26a", year: 2026 },
    ];
    ok(m.pickPlanForYear(plans, 2026, null)?.id === "p26b", "yıl için mevcut plan (liste sırası: en son oluşturulan)");
    ok(m.pickPlanForYear(plans, 2026, "p26a")?.id === "p26a", "açık plan o yıla aitse o (bağlam korunur)");
    ok(m.pickPlanForYear(plans, 2026, "p27")?.id === "p26b", "açık plan başka yıldaysa o yılın planı");
    ok(m.pickPlanForYear(plans, 2030, "p26a") === null, "plan yoksa null (oluşturulacak)");
    const ys = m.calendarYearOptions([{ id: "x", year: 2019 }], 2026);
    ok(ys[0] === 2019 && ys.includes(2025) && ys.includes(2031) && !ys.includes(2032) && ys.join() === [...ys].sort((a, b) => a - b).join(), "yıl seçenekleri: geçmiş planlar + (yıl−1…yıl+5), artan");
    ok(m.defaultMonthFor(2026, new Date(2026, 9, 9)) === 10 && m.defaultMonthFor(2027, new Date(2026, 9, 9)) === 1, "varsayılan ay: bu yıl → bu ay; diğer → Ocak");
    ok(m.countDaysInMonth(["2026-02-01", "2026-02-28", "2026-03-01", "2026-12-02"], 2026, 2) === 2, "ay sayımı saf metin (TZ yok)");
  }

  console.log("\n── B) Kaynak önerisi: yalnız uzmanın KENDİ geçmişi (saf) ──");
  {
    const s = await import("../../lib/cupping/ownSources");
    const src = [
      { id: "1", source_name: "Ahmet Hoca Eğitim Notu" },
      { id: "2", source_name: "ahmet hoca eğitim notu" },
      { id: "3", source_name: "Sistem Kataloğu", origin_source_id: "x", transferred_at: "2026-01-01" },
      { id: "4", source_name: "Admin Aktarımı", origin_type: "admin_transfer" },
      { id: "5", source_name: "X Kitabı" },
      { id: "6", source_name: "İbn Sina Notları" },
    ];
    ok(s.ownSourceSuggestions(src, "").join("|") === "Ahmet Hoca Eğitim Notu|İbn Sina Notları|X Kitabı", "boş sorgu → yalnız kendi kaynakları (aktarılmış/sistem YOK), tekrar YOK");
    ok(s.ownSourceSuggestions(src, "AHMET").join() === "Ahmet Hoca Eğitim Notu", "harf duyarsız");
    ok(s.ownSourceSuggestions(src, "ibn").join() === "İbn Sina Notları", "Türkçe İ/i katlama");
    ok(s.ownSourceSuggestions(src, "kitab").join() === "X Kitabı", "içeren eşleşme");
    ok(s.ownSourceSuggestions(src, "katalog").length === 0, "sistem/katalog kaynağı aransa bile önerilmez");
    ok(s.ownSourceSuggestions(src, "X Kitabı").length === 0, "tam yazılmış ad tekrar önerilmez");
    ok(s.findOwnSourceByName(src, "  x  kitabı ")?.id === "5" && s.findOwnSourceByName(src, "Sistem Kataloğu") === null, "aynı adlı KENDİ kaynağı yeniden kullanılır; sistem kaynağı 'kendi' sayılmaz");
  }

  console.log("\n── C) Etiketler ──");
  {
    const t = await import("../../lib/cupping/protocolTags");
    ok(t.TAGS_LABEL === "Arama ve Sınıflandırma Etiketleri", "yeni başlık");
    ok(t.TAGS_HELP === "Bu protokolü daha sonra ararken veya gruplarken kullanılacak kelimeleri virgülle ayırarak yazın.", "açıklama metni");
    ok(t.TAGS_PLACEHOLDER === "baş ağrısı, migren, kupa, ense", "örnek");
    ok(JSON.stringify(t.parseTagsInput("baş ağrısı, migren,, kupa ,  ense ,Migren")) === JSON.stringify(["baş ağrısı", "migren", "kupa", "ense"]), "virgüllü giriş → temiz dizi");
    for (const f of ["app/kupa/protokoller/yeni/page.tsx", "app/kupa/protokoller/components/BasicInfoEditor.tsx"]) {
      const src = read(f);
      ok(/\{TAGS_LABEL\}/.test(src) && /\{TAGS_HELP\}/.test(src) && !/Etiketler \(virgülle\)/.test(src), `${f.split("/").pop()}: yeni başlık + açıklama (eski "Etiketler (virgülle)" YOK)`);
    }
  }

  console.log("\n── D) Takvim sözleşmeleri ──");
  {
    const ws = read("app/kupa/takvim/components/CalendarWorkspace.tsx");
    ok(/onEditDay=\{editing \? openDayEditor : openDayInfo\}/.test(ws) && /readOnly=\{!editing\}/.test(ws), "aylık: görüntülemede güne dokunma → yalnız bilgi");
    ok(/onDayClick=\{openDayInfo\}/.test(ws), "yıllık: güne dokunma → yalnız bilgi");
    ok(/\{editing \? <BulkDateSelector/.test(ws) && /portalReady && editing \? createPortal/.test(ws) && /\{editing \? <div className="hidden lg:block">\{saveBar\("inline"\)\}/.test(ws), "toplu seçim + kaydet barı yalnız DÜZENLEME modunda");
    ok(/\{editContext && editing \? \(/.test(ws), "gün düzenleme paneli yalnız düzenleme modunda");
    ok(/const openDayInfo = useCallback\(\(ymd: string\) => \{\s*setInfoYmd\(ymd\);\s*\}, \[\]\);/.test(ws), "bilgi açıcı YAZMAZ, taslağı DEĞİŞTİRMEZ");
    ok(/reuse_year: true/.test(ws) && /pickPlanForYear\(plans, year, activeIdRef\.current\)/.test(ws), "Yeni Takvim: mevcut yıl planı kullanılır, yoksa reuse_year ile oluşturulur");
    ok(/async function finishEditing\(\)[\s\S]{0,200}if \(dirty\) \{\s*if \(!\(await confirmDiscard\(\)\)\) return;/.test(ws), "Düzenlemeyi Bitir: kaydedilmemiş değişiklikte onay");
    ok(!/function FirstPlanButton/.test(ws), "eski 'tek tık plan oluştur' kaldırıldı (yıl/ay penceresi)");
    const pp = read("app/kupa/takvim/components/PlanPicker.tsx");
    ok(/onClick=\{onNewCalendar\}/.test(pp) && !/createCalendarPlan\(/.test(pp), "+ Yeni Takvim → yıl/ay penceresi (ad formu YOK)");
    ok(/Ad \/ Açıklama/.test(pp), "plan metadata düğmesi 'Ad / Açıklama' (gün düzenlemeyle karışmaz)");
    const route = read("app/api/kupa/calendar/plans/route.ts");
    ok(/reuse_year === true/.test(route) && /\.eq\("tenant_id", tenantId\)\s*\.eq\("year", year\)/.test(route), "sunucu reuse_year: yalnız aynı tenant + yıl (duplicate koruması)");
    const dip = read("app/kupa/takvim/components/DayInfoPanel.tsx");
    ok(!/fetch\(|api"|update|delete|add/i.test(strip(dip).replace(/aria-|data-|addEventListener|removeEventListener/g, "")), "DayInfoPanel hiçbir API/yazma çağrısı içermez");
  }

  console.log("\n── E) Protokol: manuel kayıt + çıkış koruması ──");
  {
    const files = walk("app/kupa/protokoller");
    const all = files.map((f) => strip(read(f))).join("\n");
    ok(!/autosave|auto-save|otomatik kay/i.test(all), "autosave kalıntısı yok");
    ok(!/onBlur=\{[^}]*(save|update|add|create)/i.test(all), "odaktan çıkmada (blur) yazma YOK");
    ok(!/beforeunload[\s\S]{0,200}(save|update|create)/i.test(all) && !/pagehide|sendBeacon/.test(all), "çıkışta (unload/pagehide/beacon) yazma YOK");
    const rel = read("app/kupa/protokoller/components/RelationSection.tsx");
    ok(/onPick=\{\(mid\) => \{\s*if \(!busy\) queueAdd\(mid\);/.test(rel) && /function queueAdd/.test(rel), "picker seçimi YAZMAZ ('eklenecek' listesine alır)");
    ok(/async function savePending\(\)[\s\S]{0,120}if \(busyRef\.current \|\| pending\.length === 0\) return;/.test(rel), "bağlantı yalnız 'Kaydet' ile; çift tık kilidi");
    for (const f of ["SourcesSection", "EntriesSection", "StepsSection", "PrepSection", "BasicInfoEditor", "RelationSection"]) {
      const s = read(`app/kupa/protokoller/components/${f}.tsx`);
      ok(/useReportDirty\(/.test(s) && /busyRef\.current/.test(s), `${f}: kirli durum bildirimi + çift-tık kilidi`);
    }
    const doc = read("app/kupa/protokoller/[id]/ProtocolDocumentClient.tsx");
    ok(/<ProtocolDirtyProvider>/.test(doc) && /useUnsavedChangesGuard\(anyDirty, confirmLeave\)/.test(doc), "belge sayfası: sayfa-geneli çıkış koruması (link + geri + yenile)");
    const yeni = read("app/kupa/protokoller/yeni/page.tsx");
    ok(/useUnsavedChangesGuard\(dirty, confirmLeave\)/.test(yeni) && />\s*\{saving \? "Kaydediliyor…" : "Kaydet"\}/.test(yeni) && /savingRef\.current/.test(yeni) && /"Kaydedildi\."/.test(yeni), "Yeni Protokol: görünür 'Kaydet' + çift-tık kilidi + 'Kaydedildi.' + çıkış koruması");
    const dirty = read("app/kupa/protokoller/hooks/protocolDirty.tsx");
    ok(/Kaydedilmemiş değişiklikleriniz var\.\\nKaydetmeden çıkmak istiyor musunuz\?/.test(dirty) && /confirmText: "Kaydetmeden Çık"/.test(dirty) && /cancelText: "Vazgeç"/.test(dirty), "çıkış onayı metni + seçenekler (Vazgeç / Kaydetmeden Çık)");
    const srcSec = strip(read("app/kupa/protokoller/components/SourcesSection.tsx"));
    ok(!/<select/.test(srcSec) && !/<datalist/.test(srcSec) && /<SourceNameField/.test(srcSec), "Kaynak: hazır katalog select/datalist YOK; serbest + kendi geçmişi önerisi");
    const ent = strip(read("app/kupa/protokoller/components/EntriesSection.tsx"));
    ok(!/<datalist/.test(ent) && /<SourceNameField/.test(ent), "Bilgi kaynağı: aynı kural");
    const field = read("app/kupa/protokoller/components/SourceNameField.tsx");
    ok(/ownSourceSuggestions\(sources, value\)/.test(field), "öneri kaynağı: ownSourceSuggestions (yalnız kendi)");
  }

  console.log(`\nWT6 UX harness: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
