/**
 * USAGE360 2C — Admin 360 Türkçe etiketleri ve biçimlendirme (saf; istemci).
 * Yalnız sabit enum değerlerini insan-okur metne çevirir; kullanıcı içeriği içermez.
 */

export const CHANNEL_LABEL: Record<string, string> = {
  android_app: "Android Yaşam Sistemi",
  android_webview_derived: "Android WebView (türetilmiş)",
  desktop_web: "Masaüstü Web",
  mobile_web: "Mobil Web",
  tablet_web: "Tablet Web",
  unknown: "Bilinmiyor",
};

export const CHANNEL_SHORT: Record<string, string> = {
  android_app: "Android",
  android_webview_derived: "Android~",
  desktop_web: "Masaüstü",
  mobile_web: "Mobil",
  tablet_web: "Tablet",
  unknown: "?",
};

export const ACTION_LABEL: Record<string, string> = {
  module_opened: "Modül açıldı",
  record_created: "Kayıt oluşturuldu",
  record_updated: "Kayıt güncellendi",
  record_deleted: "Kayıt silindi",
  analysis_run: "Analiz çalıştırıldı",
  report_generated: "Rapor oluşturuldu",
  report_exported: "Rapor dışa aktarıldı",
  file_uploaded: "Dosya yüklendi",
  ai_task_completed: "AI işi tamamlandı",
  action_failed: "İşlem başarısız",
};

export const SUB_ENTITY_LABEL: Record<string, string> = {
  client: "danışan", analysis: "analiz", session: "seans", homework: "ödev", stone: "taş", charge: "ücret",
  combination: "kombinasyon", consent: "onam", appointment: "randevu", note: "not", photo: "fotoğraf",
  anamnesis: "anamnez", knowledge: "bilgi kaydı", source: "kaynak", source_entry: "kaynak girdisi",
  source_link: "kaynak bağlantısı", mineral: "mineral", category: "kategori", inventory: "envanter",
  exclusion: "gizleme", oil: "yağ", soap_cream: "sabun/krem", accessory: "aksesuar", other_item: "diğer ürün",
  sale: "satış", guide: "rehber", section: "bölüm", energy_body: "enerji bedeni", subconscious: "bilinçaltı",
  imagination: "imajinasyon", symbol: "sembol", chakra: "çakra", chakra_block: "çakra bloğu", protocol: "protokol",
  organ: "organ", atlas: "atlas", blend: "karışım", article: "makale", claim: "iddia", glossary_term: "sözlük terimi",
  plant_taxon: "bitki", preparation: "preparat", method: "yöntem", archive: "arşiv", file: "dosya", document: "belge",
  chart: "harita", report: "rapor", image: "görsel", hacamat_rule: "hacamat kuralı", hacamat_calendar: "hacamat takvimi",
  point: "nokta", technique: "teknik", topic: "konu", topic_note: "konu notu", safety: "güvenlik notu",
  placement: "yerleşim", point_topic: "nokta-konu", advice_template: "öneri şablonu", client_advice: "danışan önerisi",
  calendar_plan: "takvim planı", calendar_day: "takvim günü", plan: "plan", day: "gün", meal: "öğün", item: "kalem",
  food: "besin", template: "şablon", assignment: "atama", measurement: "ölçüm", preference: "tercih",
  allergen: "alerjen", profile: "profil",
};

export const ERROR_CLASS_LABEL: Record<string, string> = {
  validation: "Doğrulama", permission: "Yetki", conflict: "Çakışma", too_large: "Çok büyük", server: "Sunucu",
  timeout: "Zaman aşımı", network: "Ağ", client_export: "Tarayıcı dışa aktarım", client_upload: "Tarayıcı yükleme",
};

export const OS_LABEL: Record<string, string> = {
  android: "Android", ios: "iOS", windows: "Windows", macos: "macOS", linux: "Linux", chromeos: "ChromeOS", other: "Diğer",
};
export const BROWSER_LABEL: Record<string, string> = {
  chrome: "Chrome", safari: "Safari", firefox: "Firefox", edge: "Edge", samsung: "Samsung", opera: "Opera", webview: "WebView", other: "Diğer",
};

export const DOW_LABEL = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]; // ISO 1..7

/** ~ işaretli yaklaşık süre: "~42 dk", "~1 sa 5 dk", 0 → "0 dk". */
export function formatDurationTr(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds <= 0) return "0 dk";
  const mins = Math.round(seconds / 60);
  if (mins < 1) return "~<1 dk";
  if (mins < 60) return `~${mins} dk`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `~${h} sa ${m} dk` : `~${h} sa`;
}

export function actionText(action: string, subEntity: string | null, failedAction?: string | null): string {
  const base = ACTION_LABEL[action] ?? action;
  const sub = subEntity ? SUB_ENTITY_LABEL[subEntity] ?? subEntity : null;
  if (action === "action_failed") {
    const what = failedAction ? (ACTION_LABEL[failedAction] ?? failedAction).toLowerCase() : null;
    return `İşlem başarısız${what ? ` (${what}${sub ? ` · ${sub}` : ""})` : sub ? ` (${sub})` : ""}`;
  }
  return sub ? `${base} · ${sub}` : base;
}

/** "HH:mm" (TR saati) — zaman çizelgesi. */
export function formatTimeTr(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "28 Eyl Pzt" (TR günü, YYYY-MM-DD girdisi). */
export function formatDayTr(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "short", weekday: "short" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Kanal ziyaret oranları → yüzdeler (toplam 0 ise boş). */
export function channelShares(map: Record<string, number>): { channel: string; pct: number; visits: number }[] {
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([channel, visits]) => ({ channel, visits, pct: Math.round((visits / total) * 100) }));
}
