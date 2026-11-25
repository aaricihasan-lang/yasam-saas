/* eslint-disable @typescript-eslint/no-explicit-any -- test: katalog nesnelerine dinamik yol erişimi ve createTranslator tip daraltması */
/**
 * I18N-F1 — saf altyapı birim testleri (ağ / DB / sır yok). Çalıştırma: npx tsx scripts/i18n/unit.test.ts
 * Kapsam: yayın kapısı, locale çözümü, kalıcı tercih önceliği + hesap izolasyonu, katalog yedeği, sözde-yerelleştirme,
 * biçimlendirme, API hata kodu, silme onayı (TR birebir + EN), terminoloji tutarlılığı, sağlayıcı dili, çıktı dili.
 */
import { createTranslator } from "next-intl";
import { decideLocaleSwitching, effectiveLocale } from "../../lib/i18n/gate";
import { resolveLocale, ACTIVE_LOCALES, DEFAULT_LOCALE } from "../../lib/i18n/locales";
import { desiredLocaleForAccount, parseAccountPreference, syncDecision } from "../../lib/i18n/localePreference";
import { getCatalogMessages } from "../../lib/i18n/catalog";
import { pseudoLocalizeString } from "../../lib/i18n/pseudo";
import { absoluteDateSeparator, formatCurrency, formatDateAbsolute, formatDateAbsoluteInZone, formatDateTimeAbsolute, formatNumber, formatTime24, localeTag } from "../../lib/i18n/format";
import { apiErrorCode, localizeApiError, withServerDetail } from "../../lib/i18n/apiError";
import { buildBulkDeleteStages, bulkPhraseMatches, setDefaultBulkDeleteTexts, TR_BULK_DELETE_TEXTS, type BulkDeleteTexts } from "../../lib/ui/bulkDeleteGuard";
import { buildNameListLines, setDefaultMoreRecordsLine, TR_MORE_RECORDS } from "../../lib/ui/deleteConfirmMessage";
import { SubmitTimeoutError, submitErrorCode, submitErrorMessageKey } from "../../lib/ui/submitLock";
import { composeDeleteMessage, TR_DELETE_CONFIRM_TEXTS, type DeleteConfirmTexts } from "../../hooks/useDeleteConfirm";
import { BODY_IDS, ELEMENT_IDS, fromLegacyTr, MOON_PHASE_IDS, toLegacyTr, ZODIAC_IDS } from "../../lib/i18n/terms/registry";
import { BODY_LABELS, SIGN_LABELS } from "../../lib/astrology/labels/tr";
import { providerLanguageFor, withLanguageInCacheKey } from "../../lib/i18n/providerLanguage";
import { outputLocaleFor, resolveOutputLocale } from "../../lib/i18n/output";
import { computeBurc } from "../../lib/danisan/burc";

let pass = 0;
let fail = 0;
function ok(cond: unknown, name: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.error(`  FAIL ${name}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
}
function section(s: string) { console.log(`\n[${s}]`); }

// ── 1. Yayın kapısı ───────────────────────────────────────────────────────────
section("1. yayın kapısı (Owner A1)");
ok(decideLocaleSwitching(undefined, "production") === false, "production + bayrak yok → KAPALI");
ok(decideLocaleSwitching("", "production") === false, "production + boş → KAPALI");
ok(decideLocaleSwitching("yes", "production") === false, "production + tanımsız değer → KAPALI");
ok(decideLocaleSwitching("on", "production") === true, "production + on → açık (Preview/test bilinçli)");
ok(decideLocaleSwitching(" ON ", "production") === true, "büyük/küçük harf ve boşluk toleransı");
ok(decideLocaleSwitching(undefined, "development") === true, "next dev → açık");
ok(decideLocaleSwitching("off", "development") === false, "dev + off → kapalı");
ok(effectiveLocale("en", false) === "tr", "kapı kapalı: eski NEXT_LOCALE=en çerezi YOK SAYILIR → tr");
ok(effectiveLocale("en", true) === "en", "kapı açık: en uygulanır");
for (const bad of ["de", "fr", "EN", "en-GB", "../../etc", "<script>", "", null, undefined, "tr;en"]) {
  ok(effectiveLocale(bad as string, true) === "tr", `geçersiz/yetkisiz dil reddedilir: ${JSON.stringify(bad)}`);
}
ok(resolveLocale("tr") === "tr" && ACTIVE_LOCALES.join() === "tr,en" && DEFAULT_LOCALE === "tr", "aktif diller tr,en; kaynak tr");

// ── 2. Kalıcı tercih önceliği + izolasyon ─────────────────────────────────────
section("2. kalıcı dil tercihi (Owner A7)");
ok(desiredLocaleForAccount(false, { status: "set", locale: "en" }) === "tr", "kapı kapalıyken hesap tercihi bile uygulanmaz");
ok(desiredLocaleForAccount(true, { status: "set", locale: "en" }) === "en", "hesap tercihi en → en");
ok(desiredLocaleForAccount(true, { status: "unset" }) === "tr", "hesapta tercih yok → kaynak dil (önceki kullanıcının dili taşınmaz)");
ok(desiredLocaleForAccount(true, { status: "unavailable" }) === null, "tercih okunamıyor → karar yok (çerez korunur)");
// Ortak bilgisayar senaryosu: A (en) çıkış yapmadan B giriş yapar; çerez 'en' kalmıştır.
ok(JSON.stringify(syncDecision(true, "en", { status: "unset" })) === JSON.stringify({ action: "apply", locale: "tr" }), "ortak bilgisayar: B'nin tercihi yok → tr'ye çekilir");
ok(JSON.stringify(syncDecision(true, "en", { status: "set", locale: "tr" })) === JSON.stringify({ action: "apply", locale: "tr" }), "ortak bilgisayar: B tr seçmiş → tr");
ok(JSON.stringify(syncDecision(true, "tr", { status: "set", locale: "en" })) === JSON.stringify({ action: "apply", locale: "en" }), "yeni cihaz / tarayıcı: hesap en → çerez en'e eşitlenir");
ok(syncDecision(true, "en", { status: "set", locale: "en" }).action === "none", "zaten eşit → işlem yok (döngü yok)");
ok(syncDecision(false, "en", { status: "set", locale: "en" }).action === "none", "kapı kapalı → senkron yapılmaz");
ok(syncDecision(true, "en", { status: "unavailable", reason: "not_migrated" }).action === "none", "migration yok → çereze dokunulmaz");
ok(parseAccountPreference({ status: "set", locale: "fr" }).status === "unavailable", "sunucudan gelen aktif olmayan dil reddedilir");
ok(parseAccountPreference({ status: "set", locale: "en" }).status === "set", "geçerli yanıt ayrıştırılır");
ok(parseAccountPreference("x").status === "unavailable" && parseAccountPreference(null).status === "unavailable", "bozuk yanıt → unavailable");

// ── 3. Katalog + eksik anahtar politikası ─────────────────────────────────────
section("3. katalog ve eksik anahtar yedeği");
const tr = getCatalogMessages("tr");
const enRaw = getCatalogMessages("en");
const enProd = getCatalogMessages("en", { sourceFallback: true });
ok(typeof (tr as any).clients?.detail?.appt?.notFound === "string", "F0 bulgu 20: clients.detail.appt.notFound artık katalogda");
// Sentetik eksik anahtar: yalnız tr'de olan bir anahtar prod birleştirmesinde tr metnine düşer, boş/ham anahtar değil.
const merged = getCatalogMessages("en", { sourceFallback: true }) as any;
ok(merged.common.deleteConfirm.title === (enRaw as any).common.deleteConfirm.title, "prod birleştirme hedef dil metnini korur");
ok(enProd !== enRaw, "prod (kaynak yedekli) ve dev (yedeksiz) katalog ayrı nesneler");
{
  const t = createTranslator({ locale: "en", messages: { a: { only: "x" } } as any, namespace: "a" as never, onError: () => {}, getMessageFallback: () => "" });
  ok((t as any)("missing") === "", "sunucu getMessageFallback: eksik anahtar ham yol göstermez");
}

// ── 4. Sözde-yerelleştirme ────────────────────────────────────────────────────
section("4. pseudo-localization");
const p1 = pseudoLocalizeString("Delete {count, plural, one {# record} other {# records}} for {name}");
ok(p1.startsWith("⟪") && p1.includes("{count, plural, one {# ŕéçóŕď} other {# ŕéçóŕďš}}") && p1.includes("{name}"), "ICU argüman/çoğul sözdizimi korunur, metin dönüşür", p1);
ok(pseudoLocalizeString("Click <b>here</b>").includes("<b>") && pseudoLocalizeString("Click <b>here</b>").includes("</b>"), "rich text etiket adları korunur");
ok(pseudoLocalizeString("12:30") === "12:30", "harfsiz metin değişmez");

// ── 5. Biçimlendirme ─────────────────────────────────────────────────────────
section("5. merkezî biçimlendirme (Owner A8)");
ok(localeTag("tr") === "tr-TR" && localeTag("en") === "en-GB" && localeTag("de") === "de-DE", "tr-TR / en-GB / de-DE");
const d = new Date(Date.UTC(2026, 10, 3, 21, 5)); // 4 Kasım 00:05 İstanbul
ok(formatDateAbsoluteInZone(d, "Europe/Istanbul") === "04.11.2026", "saat dilimine bağlı mutlak tarih — sunucu UTC iken gün kaymaz", formatDateAbsoluteInZone(d));
ok(formatDateAbsoluteInZone(d, "UTC") === "03.11.2026", "UTC'de gün farklı (gün kayması riski görünür)");
ok(formatTime24(d, "en", "Europe/Istanbul") === "00:05" && formatTime24(d, "tr", "Europe/Istanbul") === "00:05", "24 saat biçimi her dilde (en-GB'de AM/PM yok)");
ok(formatNumber(1234.5, undefined, "tr") === "1.234,5" && formatNumber(1234.5, undefined, "en") === "1,234.5" && formatNumber(1234.5, undefined, "de") === "1.234,5", "sayı ayraçları dile göre");
const tryTr = formatCurrency(1250, "tr"), tryEn = formatCurrency(1250, "en");
ok(tryTr.includes("1.250,00") && tryEn.includes("1,250.00") && /₺|TRY/.test(tryTr) && /₺|TRY/.test(tryEn), "para: tutar ve birim (TRY) aynı; yalnız biçim değişir", [tryTr, tryEn]);
ok(formatCurrency(1250, "en", "TRY").replace(/[^0-9]/g, "") === formatCurrency(1250, "tr", "TRY").replace(/[^0-9]/g, ""), "dil değişimi tutarı değiştirmez");
ok(formatDateAbsolute("2026-01-02T12:00:00") === "02.01.2026", "mevcut DD.MM.YYYY sözleşmesi değişmedi");
{
  // A13 (Owner §19): EN ekranda en-GB sayısal tarih DD/MM/YYYY; TR çıktısı BAYT-BAYT aynı; 24 saat.
  // Eski (R5 öncesi) uygulamanın birebir kopyası — TR/argümansız çıktı bununla bayt-bayt karşılaştırılır.
  const legacyAbs = (v: Date | string | number | null | undefined) => {
    if (v == null) return "";
    const x = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(x.getTime())) return "";
    return `${String(x.getDate()).padStart(2, "0")}.${String(x.getMonth() + 1).padStart(2, "0")}.${x.getFullYear()}`;
  };
  const legacyAbsDT = (v: Date) => `${legacyAbs(v)} ${String(v.getHours()).padStart(2, "0")}:${String(v.getMinutes()).padStart(2, "0")}`;
  const samples: Array<Date | string | number | null | undefined> = [
    "2026-01-02T12:00:00", "1999-12-31T23:59:00", "2000-02-29T00:00:00", "2026-11-25", "1987-07-04T05:06:07Z",
    Date.UTC(2026, 10, 3, 21, 5), new Date(2030, 0, 1, 0, 0), null, undefined, "", "geçersiz",
  ];
  let trSame = true, noArgSame = true, enOk = true;
  for (const v of samples) {
    if (formatDateAbsolute(v, "tr") !== legacyAbs(v)) trSame = false;
    if (formatDateAbsolute(v) !== legacyAbs(v)) noArgSame = false;
    if (formatDateAbsolute(v, "en") !== legacyAbs(v).replace(/\./g, "/")) enOk = false;
  }
  ok(trSame, "A13: TR mutlak tarih eski uygulamayla BAYT-BAYT aynı (11 örnek, geçersiz/boş dahil)");
  ok(noArgSame, "A13: locale verilmeyen eski çağrılar aynen DD.MM.YYYY (geriye uyum)");
  ok(enOk && formatDateAbsolute("2026-01-02T12:00:00", "en") === "02/01/2026", "A13: EN en-GB DD/MM/YYYY (gün/ay sırası; MM/DD yok)");
  ok(formatDateAbsolute("2026-01-02T12:00:00", "de") === "02.01.2026", "A13: de DD.MM.YYYY (planlı dil; gösterim kapalı)");
  const dt = new Date(2026, 0, 2, 0, 5);
  ok(formatDateTimeAbsolute(dt, "tr") === legacyAbsDT(dt) && formatDateTimeAbsolute(dt) === legacyAbsDT(dt) && formatDateTimeAbsolute(dt) === "02.01.2026 00:05", "A13: TR tarih+saat bayt-bayt aynı, 24 saat");
  const dt2 = new Date(2026, 0, 2, 13, 7);
  ok(formatDateTimeAbsolute(dt2, "en") === "02/01/2026 13:07" && !/AM|PM/i.test(formatDateTimeAbsolute(dt2, "en")), "A13: EN tarih+saat DD/MM/YYYY HH:mm, AM/PM yok");
  ok(formatDateAbsoluteInZone(d, "Europe/Istanbul", "tr") === "04.11.2026" && formatDateAbsoluteInZone(d, "Europe/Istanbul", "en") === "04/11/2026" && formatDateAbsoluteInZone(d) === "04.11.2026", "A13: saat dilimli mutlak tarih — TR nokta / EN eğik çizgi, gün kayması yok");
  ok(absoluteDateSeparator("en") === "/" && absoluteDateSeparator("tr") === "." && absoluteDateSeparator(undefined) === "." && absoluteDateSeparator("xx") === ".", "A13: bilinmeyen dil → kaynak dil biçimi");
  // Saklama / giriş sözleşmesi: biçimlendirici girdiyi değiştirmez (ISO dizgi aynen kalır).
  const iso = "1990-04-01";
  formatDateAbsolute(iso, "en");
  ok(iso === "1990-04-01" && new Date(iso).toISOString().startsWith("1990-04-01"), "A13: ISO saklama değeri değişmez (yalnız gösterim)");
}

// ── 6. API hata kodu ─────────────────────────────────────────────────────────
section("6. sunucu hata kodları (F0 bulgu 6)");
const enErr = createTranslator({ locale: "en", messages: getCatalogMessages("en") as any, namespace: "common.apiErrors" as never }) as any;
const trErr = createTranslator({ locale: "tr", messages: getCatalogMessages("tr") as any, namespace: "common.apiErrors" as never }) as any;
ok(localizeApiError(enErr, "en", { code: "NOT_FOUND", error: "Kayıt bulunamadı." }) === "Record not found.", "eşlenmiş kod → ekran dilinde");
ok(localizeApiError(enErr, "en", { code: "SOMETHING_NEW", error: "Danışan bu hesaba ait değil." }) === enErr("generic"), "eşlenmemiş kod + EN → Türkçe metin YAPIŞTIRILMAZ");
ok(localizeApiError(trErr, "tr", { code: "SOMETHING_NEW", error: "Danışan bu hesaba ait değil." }) === "Danışan bu hesaba ait değil.", "TR: sunucu metni bugünkü gibi (regresyon yok)");
ok(withServerDetail(enErr, "en", "Could not save", { error: "Danışan bu hesaba ait değil." }) === "Could not save", "EN önek + Türkçe ayrıntı eklenmez");
ok(withServerDetail(trErr, "tr", "Kaydedilemedi", { error: "Danışan bu hesaba ait değil." }) === "Kaydedilemedi: Danışan bu hesaba ait değil.", "TR: bugünkü 'önek: ayrıntı' biçimi");
// I18N gece QA B-01: kaynak dilde eşlenmiş kod bile sunucu metnini DEĞİŞTİRMEZ (katalog metni farklı olabilir).
ok(localizeApiError(trErr, "tr", { code: "NOT_FOUND", error: "Taş bulunamadı (özel sunucu metni)." }) === "Taş bulunamadı (özel sunucu metni).", "TR + eşlenmiş kod → sunucu metni birebir");
ok(localizeApiError(trErr, "tr", { code: "NOT_FOUND" }) === trErr("codes.NOT_FOUND"), "TR + eşlenmiş kod + sunucu metni yok → katalog metni");
ok(withServerDetail(trErr, "tr", "Kaydedilemedi", { code: "NOT_FOUND", error: "Özel ayrıntı." }) === "Kaydedilemedi: Özel ayrıntı.", "TR önek + eşlenmiş kod → sunucu ayrıntısı birebir");
ok(withServerDetail(enErr, "en", "Could not save", { code: "NOT_FOUND", error: "Kayıt bulunamadı." }) === "Could not save: Record not found.", "EN önek + eşlenmiş kod → ekran dilinde ayrıntı");
ok(apiErrorCode({ code: "drop table" }) === null && apiErrorCode({ code: 5 }) === null, "kod biçimi doğrulanır");

// ── 7. Silme onayı: TR birebir + EN dil-bağımsız ─────────────────────────────
section("7. silme / toplu silme onayı (F0 bulgu 4–5)");
function textsFor(locale: "tr" | "en"): { single: DeleteConfirmTexts; bulk: BulkDeleteTexts; word: string } {
  const t = createTranslator({ locale, messages: getCatalogMessages(locale) as any, namespace: "common.deleteConfirm" as never }) as any;
  return {
    word: t("confirmWord"),
    single: { irreversibleNotice: t("irreversibleNotice"), irreversibleMarkers: [t("irreversibleMarker")], moreRecords: (n: number) => t("moreRecords", { count: n }) },
    bulk: {
      phrase: (c: number) => t("bulk.phrase", { count: c }), deleteAllPhrase: t("bulk.deleteAllPhrase"), defaultNoun: t("bulk.defaultNoun"),
      scope: (c: number, noun: string, all: boolean) => (all ? t("bulk.scopeAll", { count: c, noun }) : t("bulk.scope", { count: c, noun })),
      verbDelete: t("bulk.verbDelete"), verbRemove: t("bulk.verbRemove"), warnIrreversible: t("bulk.warnIrreversible"), warnScope: t("bulk.warnScope"),
      stage1TitleAll: t("bulk.stage1TitleAll"), stage1Title: t("bulk.stage1Title"), continueText: t("bulk.continue"), stage2Title: t("bulk.stage2Title"),
      stage2Message: (ph: string) => t("bulk.stage2Message", { phrase: ph }), requireLabel: (ph: string) => t("bulk.requireLabel", { phrase: ph }),
      stage3TitleIrreversible: t("bulk.stage3TitleIrreversible"), stage3Title: t("bulk.stage3Title"),
      stage3MessageIrreversible: (s: string) => t("bulk.stage3MessageIrreversible", { scope: s }), stage3Message: (s: string) => t("bulk.stage3Message", { scope: s }),
      confirmIrreversible: (c: number) => t("bulk.confirmIrreversible", { count: c }), confirm: (c: number) => t("bulk.confirm", { count: c }), cancelText: t("cancel"),
    },
  };
}
const TR = textsFor("tr"), EN = textsFor("en");
for (const [count, all, irr] of [[3, false, true], [12, true, true], [5, false, false]] as const) {
  const a = buildBulkDeleteStages({ count, deleteAll: all, irreversible: irr, noun: "danışan", detail: "• Ali" });
  const b = buildBulkDeleteStages({ count, deleteAll: all, irreversible: irr, noun: "danışan", detail: "• Ali", texts: TR.bulk });
  ok(JSON.stringify(a) === JSON.stringify(b), `TR katalog metinleri = bugünkü sabitler (count=${count}, tümü=${all}, kalıcı=${irr})`);
}
ok(JSON.stringify(buildBulkDeleteStages({ count: 4 })) === JSON.stringify(buildBulkDeleteStages({ count: 4, texts: TR_BULK_DELETE_TEXTS })), "texts verilmezse Türkçe varsayılan (eski çağıranlar etkilenmez)");
const enStages = buildBulkDeleteStages({ count: 3, noun: "clients", texts: EN.bulk });
ok(enStages.phrase === "DELETE 3 RECORDS" && !/[çğıöşüİ]/.test(JSON.stringify(enStages)), "EN akışında Türkçe yok", enStages);
ok(bulkPhraseMatches("delete 3 records", enStages.phrase) && !bulkPhraseMatches("3 KAYDI SİL", enStages.phrase), "EN ifade normalleştirmesi; TR ifade EN akışını geçemez");
ok(bulkPhraseMatches("3 kaydi sil", buildBulkDeleteStages({ count: 3 }).phrase), "TR: ı/i toleransı korunur");
ok(TR.word === "SİL" && EN.word === "DELETE", "yazarak onay sözcüğü dile göre (SİL / DELETE)");
// Ortak varsayılan kayıt (ConfirmProvider): texts geçmeyen modül çağıranları ekran dilini alır; kayıt kalkınca TR.
setDefaultBulkDeleteTexts(EN.bulk);
const regStages = buildBulkDeleteStages({ count: 4 });
ok(regStages.phrase === "DELETE 4 RECORDS" && bulkPhraseMatches("delete 4 records", regStages.phrase) && !bulkPhraseMatches("4 KAYDI SİL", regStages.phrase), "kayıtlı EN varsayılan: ifade + karşılaştırma kuralı aynı");
setDefaultBulkDeleteTexts(TR.bulk);
ok(JSON.stringify(buildBulkDeleteStages({ count: 4, deleteAll: true })) === JSON.stringify(buildBulkDeleteStages({ count: 4, deleteAll: true, texts: TR_BULK_DELETE_TEXTS })), "kayıtlı TR katalog varsayılanı = bugünkü sabitler (birebir)");
setDefaultBulkDeleteTexts(null);
ok(buildBulkDeleteStages({ count: 4 }).phrase === "4 KAYDI SİL", "kayıt kaldırılınca Türkçe yedek");
const msgTr = composeDeleteMessage({ message: "Kayıt silinecek." }, TR.single);
ok(msgTr === composeDeleteMessage({ message: "Kayıt silinecek." }) && msgTr.endsWith("Bu işlem geri alınamaz."), "TR tekli mesaj birebir aynı");
ok(composeDeleteMessage({ message: "Bu işlem geri alınamaz. Emin misiniz?" }, TR.single) === "Bu işlem geri alınamaz. Emin misiniz?", "TR: uyarı zaten varsa tekrar eklenmez");
const msgEn = composeDeleteMessage({ message: "The record will be deleted." }, EN.single);
ok(msgEn.endsWith("This action cannot be undone.") && !msgEn.includes("geri alınamaz"), "F0 bulgu 4 kapandı: EN mesaja Türkçe uyarı eklenmez");
ok(composeDeleteMessage({ message: "This cannot  be undone, really." }, EN.single) === "This cannot  be undone, really.", "EN işaret boşluk toleranslı tespit edilir");
ok(buildNameListLines(Array.from({ length: 12 }, (_, i) => `K${i}`)).at(-1) === "• ve 2 kayıt daha", "TR 've N kayıt daha' birebir");
ok(buildNameListLines(Array.from({ length: 12 }, (_, i) => `K${i}`), undefined, EN.single.moreRecords).at(-1) === "• and 2 more records", "EN 'and N more records'");
ok(TR_DELETE_CONFIRM_TEXTS.irreversibleNotice === TR.single.irreversibleNotice, "tekli TR varsayılanı katalogla aynı");
// QTM-DY-02 / QTM-DG-05: moreLine vermeyen çağıranlar ConfirmProvider'ın kaydettiği ekran dili varsayılanını alır.
ok([1, 2, 7, 25].every((n) => TR.single.moreRecords(n) === TR_MORE_RECORDS(n)), "TR katalog 'moreRecords' = TR_MORE_RECORDS (birebir)");
setDefaultMoreRecordsLine(EN.single.moreRecords);
ok(buildNameListLines(Array.from({ length: 12 }, (_, i) => `K${i}`), 12).at(-1) === "• and 2 more records", "kayıtlı EN varsayılan: moreLine'sız çağıran İngilizce");
ok(buildNameListLines(Array.from({ length: 12 }, (_, i) => `K${i}`), 12, TR_MORE_RECORDS).at(-1) === "• ve 2 kayıt daha", "açık moreLine kayıtlı varsayılanı ezer");
setDefaultMoreRecordsLine(TR.single.moreRecords);
ok(buildNameListLines(Array.from({ length: 13 }, (_, i) => `K${i}`)).at(-1) === "• ve 3 kayıt daha", "kayıtlı TR katalog varsayılanı birebir");
setDefaultMoreRecordsLine(null);
ok(buildNameListLines(Array.from({ length: 11 }, (_, i) => `K${i}`)).at(-1) === "• ve 1 kayıt daha" && buildNameListLines(["A"], 1).length === 1, "kayıt kaldırılınca Türkçe yedek; ad sayısı kuralı aynı");

// ── 7b. Gönderim zaman aşımı + ortak okuyucu (QTM-DY-01 / QTM-DG-02) ─────────
section("7b. gönderim zaman aşımı kodu + ortak okuyucu + demo kilit kartı metinleri");
{
  const tcTr = createTranslator({ locale: "tr", messages: getCatalogMessages("tr") as any, namespace: "common" as never }) as any;
  const tcEn = createTranslator({ locale: "en", messages: getCatalogMessages("en") as any, namespace: "common" as never }) as any;
  const te = new SubmitTimeoutError();
  ok(submitErrorCode(te) === "SUBMIT_TIMEOUT" && submitErrorCode(new Error("x")) === null && submitErrorCode("x") === null, "zaman aşımı kodu dil-bağımsız; başka hata null");
  const key = submitErrorMessageKey(te);
  ok(key !== null && tcTr(key) === te.message, "TR katalog zaman aşımı metni = SubmitTimeoutError.message (birebir)", key && tcTr(key));
  ok(key !== null && !/[çğıöşüİ]/.test(tcEn(key)) && tcEn(key) !== te.message, "EN zaman aşımı metni Türkçe değil");
  ok(submitErrorMessageKey(new Error("İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.")) === null, "kontrol akışı metne değil türe bağlı");
  const trR = createTranslator({ locale: "tr", messages: getCatalogMessages("tr") as any, namespace: "common.reader" as never }) as any;
  const enR = createTranslator({ locale: "en", messages: getCatalogMessages("en") as any, namespace: "common.reader" as never }) as any;
  const trExpected: Record<string, string> = {
    close: "Kapat", fontSizeGroup: "Yazı boyutu", fontSize: "Yazı Boyutu", decreaseAria: "Yazıyı küçült", decreaseTitle: "Küçült (A-)",
    increaseAria: "Yazıyı büyüt", increaseTitle: "Büyüt (A+)",
  };
  ok(Object.entries(trExpected).every(([k, v]) => trR(k) === v), "TR okuyucu metinleri bugünkü sabitlerle birebir");
  ok(trR("resetAria", { px: 17 }) === "Varsayılan yazı boyutu (17px)" && trR("resetTitle", { px: 17 }) === "Varsayılan (17px)", "TR varsayılan boyut metinleri birebir");
  ok([...Object.keys(trExpected).map((k) => enR(k)), enR("resetAria", { px: 17 }), enR("resetTitle", { px: 17 })].every((v: string) => v && !/[çğıöşüİ]/.test(v)), "EN okuyucu metinleri Türkçe içermez");
  // QTM-DG-09: ortak demo kilit kartı (DemoGate) — TR birebir, EN Türkçe içermez.
  const trG = createTranslator({ locale: "tr", messages: getCatalogMessages("tr") as any, namespace: "common.demo.gate" as never }) as any;
  const enG = createTranslator({ locale: "en", messages: getCatalogMessages("en") as any, namespace: "common.demo.gate" as never }) as any;
  ok(trG("title") === "Demo Ön İzleme" && trG("line1") === "Bu içerik demo hesabında sınırlı gösterilir." && trG("line2") === "Tam sürümde tüm detaylar açık olarak kullanılabilir.", "TR demo kilit kartı metinleri birebir");
  ok(["title", "line1", "line2"].every((k) => enG(k) && !/[çğıöşüİ]/.test(enG(k))), "EN demo kilit kartı Türkçe içermez");
  // A12 (Owner §18): erişim reddi + Oturumlarım + parola göz düğmesi — TR birebir (bugünkü sabitler), EN Türkçe içermez.
  const trA = createTranslator({ locale: "tr", messages: getCatalogMessages("tr") as any, namespace: "auth.ui" as never }) as any;
  const enA = createTranslator({ locale: "en", messages: getCatalogMessages("en") as any, namespace: "auth.ui" as never }) as any;
  const a12Tr: Record<string, string> = {
    "moduleAccess.eyebrow": "Erişim kısıtlı",
    "moduleAccess.session.line1": "Güvenliğiniz için bu cihazdaki oturum kapandı.",
    "moduleAccess.session.line2": "Kaldığınız yerden devam etmek için yeniden giriş yapın.",
    "moduleAccess.membership.line1": "Üyeliğiniz henüz onaylanmadı veya yönetici tarafından pasife alındı.",
    "moduleAccess.membership.line2": "Modüllere erişim için yöneticiniz ile görüşün.",
    "moduleAccess.permission.line1": "Bu modül hesabınızda aktif değil.",
    "moduleAccess.permission.line2": "Lütfen yöneticiniz ile görüşün.",
    "moduleAccess.session.title": "Oturumunuz Sona Erdi", "moduleAccess.membership.title": "Üyeliğiniz Aktif Değil", "moduleAccess.permission.title": "Yetkiniz Bulunmuyor",
    "moduleAccess.signIn": "Giriş Yap", "moduleAccess.backHome": "Ana Panele Dön",
    "sessions.title": "Oturumlarım", "sessions.refresh": "Yenile", "sessions.loading": "Yükleniyor…",
    "sessions.intro": "Kaybolan bir cihaz varsa buradan oturumunu kapatabilirsiniz. Android uygulama oturumu, siz çıkış yapana veya kapatana kadar açık kalır.",
    "sessions.loadFailed": "Oturumlar okunamadı.", "sessions.loadFailedNetwork": "Oturumlar okunamadı. Bağlantınızı kontrol edin.",
    "sessions.revokeFailed": "Oturum kapatılamadı.", "sessions.revokeFailedNetwork": "Oturum kapatılamadı. Bağlantınızı kontrol edin.",
    "sessions.confirmCurrent": "Bu cihazdaki oturumu kapatmak istiyor musunuz? Çıkış yapılacak.",
    "sessions.androidPersistent": "Android uygulama (kalıcı)", "sessions.pending": "Onay bekliyor", "sessions.thisDevice": "Bu cihaz",
    "sessions.kindAndroid": "Android uygulama", "sessions.kindWeb": "Web", "sessions.revoke": "Bu oturumu kapat", "sessions.endReasonDefault": "Kapandı",
    "sessions.endReason.user_logout": "Çıkış yapıldı", "sessions.endReason.owner_self_revoked": "Bu ekrandan kapatıldı",
    "sessions.endReason.expired_idle": "Süre doldu (kullanılmadı)", "sessions.endReason.expired_absolute": "Süre doldu",
    "sessions.endReason.expired_policy_cleanup": "Süre doldu", "sessions.endReason.stale": "Yeni girişte kapandı",
    "sessions.endReason.replaced_same_device": "Aynı cihazda yeniden giriş", "sessions.endReason.owner_denied": "Onay verilmedi",
    "sessions.endReason.pending_expired": "Onay süresi doldu", "sessions.endReason.password_changed": "Parola değişti",
    "sessions.endReason.admin_terminated": "Yönetici kapattı", "sessions.endReason.admin_logout_all": "Yönetici kapattı",
    "sessions.endReason.admin_password_reset": "Parola sıfırlandı",
    "passwordInput.show": "Parolayı göster", "passwordInput.hide": "Parolayı gizle",
  };
  const a12Bad = Object.entries(a12Tr).filter(([k, v]) => trA(k) !== v).map(([k]) => k);
  ok(a12Bad.length === 0, "A12: TR erişim-reddi / Oturumlarım / parola göz metinleri bugünkü sabitlerle birebir", a12Bad);
  ok(trA("sessions.confirmOther", { device: "Chrome · Windows" }) === `"Chrome · Windows" oturumunu kapatmak istiyor musunuz?`
    && trA("sessions.openedAt", { date: "25 Kas 14:30" }) === "Açılış 25 Kas 14:30" && trA("sessions.lastSeenAt", { date: "—" }) === "Son görülme —"
    && trA("sessions.endedSummary", { count: 3 }) === "Son kapanan oturumlar (3)", "A12: TR argümanlı metinler bugünkü şablon dizgileriyle birebir");
  const a12En: string[] = [...Object.keys(a12Tr).map((k) => enA(k) as string), enA("sessions.confirmOther", { device: "X" }), enA("sessions.openedAt", { date: "1" }), enA("sessions.endedSummary", { count: 2 })];
  ok(a12En.every((v) => typeof v === "string" && v.length > 0 && !/[çğıöşüİ]/.test(v)), "A12: EN metinler eksiksiz ve Türkçe karakter içermez");
}

// ── 8. Terminoloji + kanonik kimlik ──────────────────────────────────────────
section("8. terminoloji ve kanonik kimlik");
const trTerms = (tr as any).terms, enTerms = (enRaw as any).terms;
ok(ZODIAC_IDS.every((id) => trTerms.zodiac[id] === (SIGN_LABELS as any)[id]), "TR burç etiketleri = astroloji etiketleri (tek terminoloji)");
ok(BODY_IDS.every((id) => trTerms.body[id] === (BODY_LABELS as any)[id]), "TR gök cismi etiketleri = astroloji etiketleri");
ok([...ZODIAC_IDS.map((i) => enTerms.zodiac[i]), ...BODY_IDS.map((i) => enTerms.body[i]), ...ELEMENT_IDS.map((i) => enTerms.element[i]), ...MOON_PHASE_IDS.map((i) => enTerms.moonPhase[i])].every((v) => typeof v === "string" && v && !/[çğıöşüİ]/.test(v)), "EN terimler eksiksiz ve Türkçe karakter içermez");
ok(ZODIAC_IDS.every((id) => trTerms.zodiac[id] === toLegacyTr("zodiac", id)), "TR etiket = eski DB değeri (clients.burc biçimi korunur)");
ok(fromLegacyTr("zodiac", "Koç") === "aries" && fromLegacyTr("zodiac", "koç") === "aries" && fromLegacyTr("zodiac", "Aries") === null, "eski Türkçe değer → kimlik; EN etiket kimlik DEĞİLDİR");
ok(fromLegacyTr("moonPhase", "Dolunay") === "full_moon" && fromLegacyTr("element", "Ateş") === "fire", "ay evresi / element kimlikleri");
// computeBurc hâlâ Türkçe kanonik değer döndürür ve bu değer kimliğe çevrilebilir (DB değişmedi).
const burc = computeBurc("1990-04-01");
ok(burc === "Koç" && fromLegacyTr("zodiac", burc) === "aries", "clients.burc hesaplaması değişmedi + kimliğe çevrilebilir", burc);

// ── 9. Sağlayıcı dili ────────────────────────────────────────────────────────
section("9. Roxy dil hazırlığı (Owner A4)");
ok(JSON.stringify(providerLanguageFor("roxy_astrology", "en")) === JSON.stringify({ lang: "tr", fallback: true }), "doğrulanmamış dil → tr + fallback işareti (sessiz karışık dil yok)");
ok(providerLanguageFor("roxy_human_design", "en").lang === "en", "HD en kodda kanıtlı");
ok(providerLanguageFor("roxy_astrology", "en", true).lang === "en", "ücretli doğrulama modunda bekleyen dil istenebilir");
ok(withLanguageInCacheKey(["a", "b"], "en") !== withLanguageInCacheKey(["a", "b"], "tr"), "farklı dil → farklı önbellek anahtarı");
let threw = false; try { withLanguageInCacheKey(["a"], "en|x"); } catch { threw = true; }
ok(threw, "önbellek anahtarına geçersiz dil enjekte edilemez");

// ── 10. Çıktı dili ───────────────────────────────────────────────────────────
section("10. rapor / çıktı dili sözleşmesi (Owner A3)");
const fakeReq = (v?: string) => ({ cookies: { get: (n: string) => (n === "NEXT_LOCALE" && v ? { name: n, value: v } : undefined) } }) as any;
process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = "off";
ok(resolveOutputLocale(fakeReq("en")).locale === "tr", "kapı kapalı: rapor dili tr (eski çerez yok sayılır)");
process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = "on";
ok(resolveOutputLocale(fakeReq("en")).documentLang === "en-GB", "kapı açık: rapor dili ekranla aynı (en-GB)");
ok(resolveOutputLocale(fakeReq("xx")).locale === "tr", "geçersiz çerez → tr");
delete process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING;
ok(outputLocaleFor("tr").intlTag === "tr-TR", "tr çıktı etiketi");

console.log(`\n=== i18n birim testleri: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
