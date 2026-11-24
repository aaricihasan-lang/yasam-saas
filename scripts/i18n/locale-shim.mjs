/**
 * I18N-F1-R1 — süreç düzeyinde VARSAYILAN YEREL AYAR zorlaması (yalnız testler; `node --import`).
 *
 * Neden: Windows'ta LANG / LC_ALL ortam değişkenleri Node'un Intl varsayılanını DEĞİŞTİRMİYOR (F1'de ölçüldü:
 * A=tr-TR, B=tr-TR). Hesaplama değişmezliği testi bu yüzden varsayılan yerel ayarı işletim sisteminden bağımsız
 * olarak zorlar: I18N_TEST_DEFAULT_LOCALE verilirse, yerel ayar argümanı VERİLMEDEN çağrılan bütün Intl
 * kurucuları ve yerel ayara duyarlı String/Date/Number yöntemleri o yerel ayarla çalışır.
 * (Linux CI'da ayrıca LANG/LC_ALL de farklı verilir; ICU tam olduğu için orada işletim sistemi yolu da sınanır.)
 * Ürün koduna ETKİSİ YOKTUR — yalnız `--import` ile yüklenen test süreçlerinde etkindir.
 */
const L = process.env.I18N_TEST_DEFAULT_LOCALE;
if (L) {
  for (const name of ["DateTimeFormat", "NumberFormat", "Collator", "PluralRules", "RelativeTimeFormat", "ListFormat", "DisplayNames", "Segmenter"]) {
    const Orig = Intl[name];
    if (typeof Orig !== "function") continue;
    const Wrapped = function (locales, options) {
      return new Orig(locales === undefined ? L : locales, options);
    };
    Wrapped.prototype = Orig.prototype;
    Wrapped.supportedLocalesOf = Orig.supportedLocalesOf.bind(Orig);
    Intl[name] = Wrapped;
  }
  const wrap = (proto, method, idx) => {
    const orig = proto[method];
    proto[method] = function (...args) {
      if (args[idx] === undefined) args[idx] = L;
      return orig.apply(this, args);
    };
  };
  wrap(Date.prototype, "toLocaleString", 0);
  wrap(Date.prototype, "toLocaleDateString", 0);
  wrap(Date.prototype, "toLocaleTimeString", 0);
  wrap(Number.prototype, "toLocaleString", 0);
  wrap(BigInt.prototype, "toLocaleString", 0);
  wrap(Array.prototype, "toLocaleString", 0);
  wrap(String.prototype, "localeCompare", 1);
  wrap(String.prototype, "toLocaleUpperCase", 0);
  wrap(String.prototype, "toLocaleLowerCase", 0);
}
