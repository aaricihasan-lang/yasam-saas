/**
 * WT5 — Aromaterapi + Doğaltaş + Biyoenerji ortak UX düzeltmeleri harness'ı (prod/DB YOK).
 *
 * A) "(Kopya)" — kopya adı saf mantığı + karışım kopyalama akışı sözleşmesi
 * B) Doğaltaş Detay Arama "Kontrol edildi" — bağlam anahtarı + sessionStorage işaretleri
 * C) Biyoenerji genel arama — Türkçe katlama, ön-süzgeç deseni, eşleşme/sıralama, tenant sözleşmesi
 * D) Kaynak sözleşmeleri — Aromaterapi üst şerit yok, yağ sekmeleri mobilde sarar, Doğaltaş drawer
 *    mobil bottom-sheet, kombinasyon üstü çizgi yok + lejant, "Ajanda & Randevu Merkezi"
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string, d = "") => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}${!c && d ? "  → " + d : ""}`);
};

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

async function main() {
  console.log("── A) (Kopya) ──");
  {
    const { stripCopySuffix, suggestCopyName, validateCopyName } = await import("../../lib/aromaterapi/copyName");
    ok(stripCopySuffix("Akgünlük (Kopya)") === "Akgünlük", "tek (Kopya) eki atılır");
    ok(stripCopySuffix("Rahatlama (Kopya) (Kopya)") === "Rahatlama", "zincir (Kopya) (Kopya) atılır");
    ok(stripCopySuffix("Rahatlama (kopya)") === "Rahatlama", "harf duyarsız");
    ok(stripCopySuffix("(Kopya)") === "(Kopya)", "yalnız ek olan ad boşa düşmez");
    const existing = ["Rahatlama", "Rahatlama 2", "Uyku"];
    const s1 = suggestCopyName("Rahatlama", existing);
    ok(s1 === "Rahatlama 3" && !/Kopya/i.test(s1), "öneri çakışmasız ve (Kopya) İÇERMEZ", s1);
    ok(suggestCopyName("Rahatlama (Kopya)", existing) === "Rahatlama 3", "kopyanın kopyası kirlenmez");
    ok(validateCopyName("  ", existing) !== null, "boş ad reddedilir");
    ok(validateCopyName("rahatlama", existing) !== null, "mevcut adla (harf farkı) aynı ad reddedilir");
    ok(validateCopyName("Rahatlama  2", existing) !== null, "boşluk farkı da çakışma sayılır");
    ok(validateCopyName("Akşam Rahatlama", existing) === null, "yeni gerçek ad kabul edilir");

    const page = read("app/aromaterapi/karisim-olusturucu/page.tsx");
    ok(!/\(Kopya\)/.test(page.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "karışım sayfası kodunda otomatik '(Kopya)' eki YOK");
    ok(/onClick=\{\(\) => openCopyDialog\(b\)\}/.test(page) && !/copyBlend\(/.test(page), "Kopyala → ad penceresi (anında kayıt YOK)");
    ok(/const nameError = validateCopyName\(copyName, saved\.map\(\(b\) => b\.name\)\)/.test(page) && /name: copyName\.trim\(\)/.test(page), "kayıt kullanıcının yazdığı (doğrulanmış) adla");
    ok(/if \(!blend \|\| copyingId\) return;/.test(page), "çift tık kilidi korunur");
    const oil = read("app/aromaterapi/yaglar/[id]/page.tsx") + read("app/aromaterapi/_components/OilsPage.tsx");
    ok(!/\(Kopya\)/.test(oil), "yağ akışında '(Kopya)' üreten kod yok (eski kayıtlar 06-15 MVP kalıntısı)");
  }

  console.log("\n── B) Kontrol edildi ──");
  {
    const m = await import("../../lib/dogaltas/searchChecked");
    const st = new MemStorage();
    ok(m.searchContextKey({ query: "" }) === "", "arama/filtre yok → bağlam yok");
    const kalp = m.searchContextKey({ query: "kalp çakrası" });
    ok(kalp !== "" && kalp === m.searchContextKey({ query: "  KALP   ÇAKRASI " }), "aynı arama (boşluk/harf farkı) = aynı bağlam");
    const filt = m.searchContextKey({ query: "", chakra: "Kalp" });
    ok(filt !== "" && filt !== kalp, "yalnız Detay Arama filtresi de bağlam oluşturur");
    ok(m.readCheckedIds(st, kalp).size === 0, "başta işaret yok");
    m.markChecked(st, kalp, "s1");
    m.markChecked(st, kalp, "s2");
    m.markChecked(st, kalp, "s1");
    const set = m.readCheckedIds(st, kalp);
    ok(set.has("s1") && set.has("s2") && set.size === 2 && !set.has("s3"), "1. ve 2. açılan işaretli, bakılmayan değil, tekrar yok");
    ok(m.readCheckedIds(st, filt).size === 0, "başka bağlamın işaretleri KARIŞMAZ");
    m.markChecked(st, filt, "s9");
    ok(m.readCheckedIds(st, kalp).has("s1") && m.readCheckedIds(st, filt).has("s9"), "önceki aramaya dönünce işaretleri geri gelir");
    m.markChecked(st, "", "x");
    ok(!st.getItem(m.SEARCH_CHECKED_STORAGE_KEY)!.includes('"x"'), "bağlam yokken işaret yazılmaz");
    for (let i = 0; i < 25; i++) m.markChecked(st, m.searchContextKey({ query: "q" + i }), "id");
    ok(m.readCheckedIds(st, kalp).size === 0 && JSON.parse(st.getItem(m.SEARCH_CHECKED_STORAGE_KEY)!).contexts.length === 20, "en fazla 20 bağlam (eskiler düşer)");
    const bad = new MemStorage(); bad.setItem(m.SEARCH_CHECKED_STORAGE_KEY, "{bozuk");
    ok(m.readCheckedIds(bad, kalp).size === 0, "bozuk depolama → boş (hata yok)");
    const page = read("app/dogaltas/dogaltas-listesi/page.tsx");
    ok(/isViewedInSearch=\{searchCheckedContext !== "" && viewedStoneIds\.has\(stone\.id\)\}/.test(page), "etiket yalnız arama/filtre bağlamında");
    ok(/browserSessionStorage\(\)/.test(page) && !/VIEWED_SEARCH_STORAGE_KEY/.test(page), "kalıcı localStorage listesi yerine sessionStorage");
    ok(/onClick=\{\(\) => onNavigate\(stone\.id\)\}/.test(page), "yalnız Detay Arama filtresiyle açılan sonuç da işaretlenir");
    ok(!/filteredStones\s*=[\s\S]{0,400}viewedStoneIds/.test(page), "işaret sonuç listesini/sıralamayı DEĞİŞTİRMEZ");
    const tr = JSON.parse(read("messages/tr/stones.list.json"));
    const en = JSON.parse(read("messages/en/stones.list.json"));
    const dig = (o: Record<string, unknown>): string | undefined => {
      for (const v of Object.values(o)) {
        if (v && typeof v === "object") {
          const c = (v as Record<string, unknown>).card as Record<string, unknown> | undefined;
          if (c && typeof c.viewed === "string") return c.viewed;
          const r = dig(v as Record<string, unknown>);
          if (r) return r;
        }
      }
      return undefined;
    };
    ok(dig(tr) === "Kontrol edildi" && dig(en) === "Checked", "etiket metni 'Kontrol edildi' (EN 'Checked')");
  }

  console.log("\n── C) Biyoenerji genel arama ──");
  {
    const g = await import("../../lib/biyoenerji/globalSearch");
    ok(g.BIO_GLOBAL_SECTIONS.length === 6 && new Set(g.BIO_GLOBAL_SECTIONS.map((s) => s.table)).size === 6, "6 mevcut Biyoenerji bölümü (yeni tablo yok)");
    ok(g.BIO_GLOBAL_SECTIONS.every((s) => !s.fields.some((f) => /tenant|_id$|^id$|created|updated|origin/.test(f))), "sistem/teknik kolonlar aranmaz");
    ok(g.cleanBioGlobalQuery("m") === "" && g.cleanBioGlobalQuery("  mide ") === "mide", "min 2 karakter + trim");
    ok(g.cleanBioGlobalQuery("a,b(c)%d_e") === "a b c d e", "PostgREST/ilike özel karakterleri temizlenir");
    ok(g.bioPrefilterPattern("mide") === "%m_de%" && g.bioPrefilterPattern("çakra") === "%_akra%", "Türkçe harf çiftleri joker (collation bağımsız)");
    const sec = g.BIO_GLOBAL_SECTIONS.find((s) => s.key === "bilincalti-sebepleri")!;
    const rows = [
      { id: "1", title: "MİDE AĞRISI", content: "x" },
      { id: "2", title: "Korku", content: "Mide bölgesinde sıkışma hissi ve kaygı" },
      { id: "3", title: "Made up", content: "made" },
      { id: "4", title: "Öfke", content: null },
    ];
    const hits = rows.map((r) => g.matchBioRow(sec, r, "mide")).filter(Boolean) as NonNullable<ReturnType<typeof g.matchBioRow>>[];
    ok(hits.length === 2 && hits.map((h) => h.id).join() === "1,2", "büyük/küçük + Türkçe İ: 'mide' → 'MİDE' ve 'Mide' eşleşir; ön-süzgeç fazlası ('made') düşer");
    ok(hits[0].matchedField === "title" && hits[1].matchedFieldLabel === "İçerik" && /Mide bölgesinde/.test(hits[1].snippet), "eşleşen alan etiketi + önizleme");
    ok(hits.every((h) => h.sectionLabel === "Bilinçaltı Sebepleri"), "sonuçta bölüm adı");
    const cak = g.BIO_GLOBAL_SECTIONS.find((s) => s.key === "cakralar")!;
    ok(g.matchBioRow(cak, { id: "c1", name: "Kalp Çakrası" }, "cakra")?.title === "Kalp Çakrası", "ASCII yazım 'cakra' → 'Çakrası' eşleşir");
    ok(g.matchBioRow(cak, { id: "c1", name: "Kalp" }, "xyz") === null, "eşleşmeyen → null (0 sonuç)");
    ok(g.bioHitHref("cakralar", "a b", "t") === "/dashboard/biyoenerji/cakralar/a%20b", "detay rotası (çakra)");
    ok(g.bioHitHref("enerji-bedenleri", "id", "Eterik Beden") === "/dashboard/biyoenerji/enerji-bedenleri?q=Eterik%20Beden", "detay rotası olmayan bölüm → bölüm + arama");
    const sorted = g.sortBioHits([
      { ...hits[1], title: "Zeta" }, { ...hits[0], title: "Alfa", matchedField: "content" }, { ...hits[0], title: "Beta" },
    ], sec);
    ok(sorted[0].title === "Beta" && sorted[1].title === "Alfa", "başlık eşleşmeleri önce, sonra alfabetik");

    const route = read("app/api/biyoenerji/search/route.ts");
    ok(/requireModuleAccess\(req, "energy_body"\)/.test(route), "modül kapısı energy_body");
    ok(/\.eq\("tenant_id", tenantId\)/.test(route) && !/searchParams\.get\("tenant/.test(route), "tenant yalnız session'dan (istemci tenant veremez)");
    ok(/BIO_GLOBAL_SECTIONS\.map/.test(route) && !/searchParams\.get\("(table|resource|cols)"\)/.test(route), "tablo/kolon listesi sunucuda sabit");
    ok(/bioDbError\(/.test(route), "ham DB hatası istemciye dönmez");
    const ui = read("app/dashboard/biyoenerji/components/BiyoenerjiGlobalSearch.tsx");
    ok(/seq !== reqSeq\.current/.test(ui), "eski yanıt yeni aramayı ezmez");
    ok(/<BiyoenerjiGlobalSearch \/>/.test(read("app/dashboard/biyoenerji/page.tsx")), "Biyoenerji ana ekranında üstte");
    for (const f of ["EnerjiBedenleri", "BiyoenerjiSeanslari"]) {
      ok(/get\("q"\)/.test(read(`app/dashboard/biyoenerji/components/${f}.tsx`)), `${f}: ?q= ile bölüm araması açılır`);
    }
  }

  console.log("\n── D) Kaynak sözleşmeleri ──");
  {
    ok(!existsSync(join(ROOT, "app/aromaterapi/_components/AromaterapiModuleNav.tsx")), "Aromaterapi tekrar eden üst modül şeridi kaldırıldı");
    const oil = read("app/aromaterapi/yaglar/[id]/page.tsx");
    const nav = oil.match(/<nav aria-label="Yağ bilgi sekmeleri"[^>]*className="([^"]+)"/);
    ok(Boolean(nav) && /\bflex-wrap\b/.test(nav![1]) && !/(^|\s)overflow-x-auto/.test(nav![1]) && /lg:flex-col/.test(nav![1]), "yağ sekmeleri mobilde sarar (yatay kaydırma yok), webde dikey kenar çubuğu");
    const drawer = read("app/dogaltas/components/StoneDetailDrawer.tsx");
    ok(/mt-auto flex h-\[88dvh\]/.test(drawer) && /sm:h-full/.test(drawer) && /onClick=\{onClose\}/.test(drawer), "taş detay drawer: mobilde dokunulabilir karartılmış alan + backdrop kapatır");
    ok(/return createPortal\(/.test(drawer) && /document\.body,/.test(drawer) && /fixed inset-0 z-\[70\]/.test(drawer), "taş detay drawer body'ye portal + üst çubuğun üstünde (× masaüstünde tıklanabilir)");
    const reader = read("components/common/reader/ReaderModal.tsx");
    ok(/event\.target === event\.currentTarget\) onClose\(\)/.test(reader) && /onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/.test(reader), "okuma modalı: backdrop kapatır, içerik kapatmaz");
    const combo = read("app/dogaltas/kombinasyonlar/[title]/page.tsx");
    ok(!/line-through/.test(combo), "kombinasyon: üstü çizili taş YOK");
    ok(/combo-stone-legend/.test(combo) && /legendInStock/.test(combo) && /legendOutOfStock/.test(combo) && /legendGhost/.test(combo), "kombinasyon: renk/işaret lejantı");
    ok(/combo-extra-stones/.test(combo), "notlardan çıkan stoklu taşlar gereken listeden AYRI");
    ok(/const missingStoneNames = chipsStones\.filter\(/.test(combo) && /resolveStockKey\(chip, stockMap\) === null/.test(combo), "veri anlamı (eksik = stokta olmayan) DEĞİŞMEDİ");
    const ctr = JSON.parse(read("messages/tr/stones.combinations.json"));
    const find = (o: unknown): Record<string, string> | null => {
      if (o && typeof o === "object") {
        const d = (o as Record<string, unknown>).detail as Record<string, string> | undefined;
        if (d && d.stonesListTitle) return d;
        for (const v of Object.values(o as Record<string, unknown>)) { const r = find(v); if (r) return r; }
      }
      return null;
    };
    const d = find(ctr)!;
    ok(d.stonesListTitle === "Bu Kombinasyon İçin Gereken Taşlar" && /STOKTA OLMAYAN/.test(d.missingStonesLabel), "başlıklar açık (Gereken / Stokta Olmayan)");
    const den = find(JSON.parse(read("messages/en/stones.combinations.json")))!;
    ok(["legendInStock", "legendOutOfStock", "legendGhost", "extraStonesTitle", "missingStonesHint", "criticalStockHint"].every((k) => d[k] && den[k]), "TR/EN anahtar paritesi");
    const ctr2 = JSON.parse(read("messages/tr/clients.json"));
    const cen2 = JSON.parse(read("messages/en/clients.json"));
    const tk = (j: Record<string, unknown>) => JSON.stringify(j).match(/"takip":\{"title":"([^"]+)"/)?.[1];
    ok(tk(ctr2) === "Ajanda & Randevu Merkezi" && tk(cen2) === "Agenda & Appointment Center", "'Danışan Takip' → 'Ajanda & Randevu Merkezi'");
    ok(!/"Danışan Takip"/.test(read("messages/tr/clients.json")), "eski ad kullanıcı metinlerinde kalmadı");
    ok(/href: "\/danisan-yolculugu\/takip"/.test(read("app/danisan-yolculugu/page.tsx")), "rota/iç isimler DEĞİŞMEDİ");
    {
      // "Elementler" adı bu işte KESİNLİKLE değişmez: dalın origin/main'e göre farkında silinen/eklenen
      // "Elementler" satırı olmamalı (git yoksa kontrol atlanmaz → FAIL).
      let diff = "";
      try {
        diff = (await import("node:child_process")).execSync("git diff origin/main -- app components lib messages", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      } catch { diff = "__git_error__"; }
      ok(diff !== "__git_error__" && !diff.split("\n").some((l) => /^[+-](?![+-])/.test(l) && /Elementler/.test(l)), "'Elementler' adı değişmedi (fark yok)");
    }
  }

  console.log(`\nWT5 UX harness: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
