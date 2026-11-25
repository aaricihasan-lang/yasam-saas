/**
 * I18N rapor golden'ları — SABİT, SENTETİK fikstürler (gerçek danışan/uzman verisi YOK; DB/ağ YOK).
 *
 * Kullanıcı içeriği alanlarına (protokol notu, gün notu, şablon metni, uzman dipnotu…) bilerek Türkçe
 * karakterli NÖBETÇİ metinler konur (⟦KULLANICI…⟧). EN belgede bu metinler AYNEN kalmalıdır (kullanıcı
 * notu çevrilmez); EN belgede kalan diğer Türkçe metinler sistem sızıntısıdır.
 */
import type { ProtocolWordInput } from "@/lib/cupping/protocolWord";
import type { BuildCalendarWordInput } from "@/lib/cupping/calendarWord";
import type { CuppingAdviceTemplate, CuppingCalendarPlan, CuppingCalendarPlanDay, CuppingDayColorKey } from "@/lib/cupping/calendarTypes";
import type { ExpertBranding } from "@/lib/docx/expertBranding";

/** Kullanıcı nöbetçi öneki — EN taramasında bu dizeyi içeren metin düğümleri "kullanıcı içeriği" sayılır. */
export const USER_MARK = "⟦KULLANICI";

/** 1×1 şeffaf PNG (logo yolu için; içerik deterministik). */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export function brandingFixture(withLogo = true): ExpertBranding {
  return {
    name: "⟦KULLANICI uzman adı: Ayşe Işıl Öztürk⟧",
    title: "⟦KULLANICI unvan: Hacamat Uzmanı⟧",
    organization: "⟦KULLANICI kurum: Şifa Çağı Merkezi⟧",
    contactLine: "⟦KULLANICI iletişim: 0555 000 00 00 · ornek@example.invalid⟧",
    note: "⟦KULLANICI dipnot: Uygulama sonrası ılık su için; ağır egzersizden kaçının.⟧",
    logoPng: withLogo ? { data: PNG_1X1, width: 1, height: 1 } : null,
  };
}

export function protocolFull(): ProtocolWordInput {
  return {
    protocol: {
      title: "⟦KULLANICI başlık: Baş Ağrısı Protokolü — Şİğ Öçü⟧",
      category: "⟦KULLANICI kategori: Baş & Boyun⟧",
      summary: "⟦KULLANICI özet: Kısa özet satırı.⟧\n⟦KULLANICI özet: İkinci satır.⟧",
      tags: ["⟦KULLANICI etiket: migren⟧", "⟦KULLANICI etiket: gerilim⟧"],
      preparation_note: "⟦KULLANICI hazırlık: Uygulama öncesi hazırlık notu.⟧",
      aftercare_note: "⟦KULLANICI sonrası: Uygulama sonrası dinlenme.⟧",
      follow_up_note: "⟦KULLANICI takip: Bir hafta sonra takip.⟧",
    },
    points: [
      { name: "⟦KULLANICI nokta: Kâhil / İki Kürek Arası⟧", note: "⟦KULLANICI not: Ana bölge⟧", extra: "⟦KULLANICI bölge: Üst sırt⟧" },
      { name: "⟦KULLANICI nokta: Baş / Bıngıldak⟧", note: null, extra: null },
    ],
    techniques: [{ name: "⟦KULLANICI teknik: Sabit Kuru Kupa⟧", note: "⟦KULLANICI not: 5 dakika⟧", extra: null }],
    steps: [
      { title: "⟦KULLANICI adım: Temizlik⟧", body: "⟦KULLANICI gövde: Bölgeyi temizle.⟧\n⟦KULLANICI gövde: Alkol uygula.⟧", stage_label: "⟦KULLANICI evre: Hazırlık⟧" },
      { title: null, body: "⟦KULLANICI gövde: Kupaları yerleştir.⟧", stage_label: null },
    ],
    safety: [
      { name: "⟦KULLANICI güvenlik: Gebelikte uygulanmaz⟧", note: "⟦KULLANICI not: protokole özel⟧", extra: null, detail: "⟦KULLANICI içerik: Uzmanın güvenlik metni.⟧\n⟦KULLANICI içerik: İkinci satır.⟧" },
    ],
    entries: [
      { title: "⟦KULLANICI bilgi: Geleneksel kullanım⟧", content: "⟦KULLANICI bilgi: Bu bölge geleneksel olarak…⟧", source_label: "⟦KULLANICI kaynak: Süleyman Gök⟧", locator: "s.42" },
    ],
    sources: [
      { name: "⟦KULLANICI kaynak: Zakir Benli — Hacamat Tedavisi⟧", type_label: null, locator: "s.10", note: "⟦KULLANICI not: birincil⟧" },
      { name: "⟦KULLANICI kaynak: İkinci Kaynak⟧", type_label: null, locator: null, note: null },
    ],
  };
}

export function protocolMinimal(): ProtocolWordInput {
  return { protocol: { title: "⟦KULLANICI başlık: Minimal Protokol⟧" }, points: [], techniques: [], steps: [], safety: [], entries: [], sources: [] };
}

const COLORS: (CuppingDayColorKey | null)[] = ["blue", "green", "yellow", "red", "purple", "orange", "pink", null];

export function mkPlan(over: Partial<CuppingCalendarPlan> = {}): CuppingCalendarPlan {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    tenant_id: "00000000-0000-4000-8000-0000000000aa",
    name: "⟦KULLANICI plan adı: 2026 Hacamat Planı — Çağrı⟧",
    year: 2026,
    description: null,
    advice_template_id: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function mkDay(i: number, ymd: string, label: string | null, note: string | null): CuppingCalendarPlanDay {
  return {
    id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, "0")}`,
    tenant_id: "00000000-0000-4000-8000-0000000000aa",
    plan_id: "00000000-0000-4000-8000-000000000001",
    gregorian_date: ymd,
    selection_source: "manual",
    user_label: label,
    note,
    color_key: COLORS[i % COLORS.length] ?? null,
    created_at: "2026-01-01T00:00:00Z",
  } as CuppingCalendarPlanDay;
}

/** Az sayıda gün → tek A3 sayfası. */
export function calendarSmallDays(): CuppingCalendarPlanDay[] {
  return [
    mkDay(0, "2026-01-05", "⟦KULLANICI kısa: Sabah seansı⟧", "⟦KULLANICI not: Aç karnına; ılık ortam.⟧\n⟦KULLANICI not: İkinci satır — Şöyle böyle.⟧"),
    mkDay(1, "2026-03-17", "⟦KULLANICI kısa: Öğle⟧", null),
    mkDay(2, "2026-06-21", null, null),
    mkDay(7, "2026-09-09", "⟦KULLANICI kısa: Renksiz gün⟧", "⟦KULLANICI not: Renk yok kaydı.⟧"),
    mkDay(4, "2026-12-31", "⟦KULLANICI kısa: Yıl sonu⟧", null),
  ];
}

/** Çok gün + uzun notlar → A3 + A4 devam (taşma senaryosu). */
export function calendarOverflowDays(): CuppingCalendarPlanDay[] {
  const out: CuppingCalendarPlanDay[] = [];
  let i = 0;
  for (let m = 1; m <= 12; m++) {
    for (const d of [3, 17, 19]) {
      const ymd = `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      out.push(mkDay(i, ymd, `⟦KULLANICI kısa: Gün ${i + 1} — öğleden sonra⟧`, i % 3 === 0 ? `⟦KULLANICI not ${i + 1}: Uzun detay notu; ılık duş, bol su, ağır yemekten kaçınma. Şeker ve çay sınırlı.⟧` : null));
      i++;
    }
  }
  return out;
}

export function adviceTemplate(): CuppingAdviceTemplate {
  return {
    id: "00000000-0000-4000-8000-0000000000t1",
    tenant_id: "00000000-0000-4000-8000-0000000000aa",
    title: "⟦KULLANICI şablon: Genel Bilgilendirme⟧",
    before_text: "⟦KULLANICI öncesi: Uygulamadan 3 saat önce hafif beslenin.⟧",
    after_text: "⟦KULLANICI sonrası: Uygulama günü duş almayın.⟧\n⟦KULLANICI sonrası: Bol su için.⟧",
    general_note: "⟦KULLANICI genel: Sorularınız için uzmanınıza danışın.⟧",
    is_default: false,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

export type CalendarFixture = { name: string; input: BuildCalendarWordInput };

export function calendarFixtures(): CalendarFixture[] {
  return [
    { name: "kupa-takvim-yillik-a3", input: { plan: mkPlan(), days: calendarSmallDays(), template: adviceTemplate() } },
    { name: "kupa-takvim-yillik-bos", input: { plan: mkPlan(), days: [], template: null } },
    { name: "kupa-takvim-yillik-tasma", input: { plan: mkPlan(), days: calendarOverflowDays(), template: adviceTemplate() } },
    { name: "kupa-takvim-yillik-imzali", input: { plan: mkPlan(), days: calendarSmallDays(), template: adviceTemplate(), branding: brandingFixture() } },
    { name: "kupa-takvim-yillik-tasma-imzali", input: { plan: mkPlan(), days: calendarOverflowDays(), template: adviceTemplate(), branding: brandingFixture() } },
    { name: "kupa-takvim-aylik-ocak", input: { plan: mkPlan(), days: calendarSmallDays(), template: adviceTemplate(), month: 1 } },
    { name: "kupa-takvim-aylik-bos-subat", input: { plan: mkPlan(), days: calendarSmallDays(), template: null, month: 2 } },
    { name: "kupa-takvim-aylik-imzali-eylul", input: { plan: mkPlan(), days: calendarSmallDays(), template: adviceTemplate(), month: 9, branding: brandingFixture() } },
  ];
}

export type ProtocolFixture = { name: string; input: ProtocolWordInput };

export function protocolFixtures(): ProtocolFixture[] {
  return [
    { name: "kupa-protokol-tam", input: protocolFull() },
    { name: "kupa-protokol-minimal", input: protocolMinimal() },
    { name: "kupa-protokol-imzali", input: { ...protocolFull(), branding: brandingFixture() } },
    { name: "kupa-protokol-imzali-A", input: { ...protocolFull(), branding: brandingFixture(), brandingVariant: "A" } },
    { name: "kupa-protokol-imzali-C", input: { ...protocolFull(), branding: brandingFixture(false), brandingVariant: "C" } },
  ];
}
