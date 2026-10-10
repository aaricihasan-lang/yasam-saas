/**
 * lib/location/server/trExonyms.ts — Türkçe kullanılan yabancı şehir adları (yalnız ARAMA kolaylığı).
 *
 * Her takma ad, global dataset'teki (GeoNames, lib/location/server-data/global-cities.json)
 * TEK bir kayda KİMLİKLE sabitlenir; ülke kodu ve dataset adı da yazılıdır ve modül yüklenirken
 * doğrulanır — uyuşmayan satır SESSİZCE ATLANIR (yanlış şehre/ülkeye eşleşme yerine eşleşme yok).
 * Koordinat / ülke / saat dilimi daima dataset kaydından gelir; burada konum verisi YOKTUR.
 * İsim benzerliğiyle seçim yapılmaz: "Londra" yalnız gn-2643743 (London, GB) kaydını öne alır,
 * Londrina (BR) gibi benzer adlar etkilenmez.
 *
 * Kapsam bilinçli olarak sınırlıdır (yaygın Türkçe exonym'ler); tüm dünya şehirleri taşınmaz.
 * Dataset adıyla aynı yazılan şehirler (Berlin, Paris, Hamburg…) listeye alınmaz — zaten bulunur.
 */

/** [Türkçe ad, dataset kimliği, beklenen ülke kodu, beklenen dataset adı] */
export const TR_EXONYMS: ReadonlyArray<readonly [string, string, string, string]> = [
  // Batı / Orta Avrupa
  ["Londra", "gn-2643743", "GB", "London"],
  ["Edinburg", "gn-2650225", "GB", "Edinburgh"],
  ["Münih", "gn-2867714", "DE", "Munich"],
  ["Nürnberg", "gn-2861650", "DE", "Nuremberg"],
  ["Viyana", "gn-2761369", "AT", "Vienna"],
  ["Zürih", "gn-2657896", "CH", "Zürich"],
  ["Cenevre", "gn-2660646", "CH", "Geneva"],
  ["Brüksel", "gn-2800866", "BE", "Brussels"],
  ["Anvers", "gn-2803138", "BE", "Antwerp"],
  ["Brüj", "gn-2800931", "BE", "Brugge"],
  ["Lahey", "gn-2747373", "NL", "The Hague"],
  ["Marsilya", "gn-2995469", "FR", "Marseille"],
  ["Strazburg", "gn-2973783", "FR", "Strasbourg"],
  ["Lizbon", "gn-2267057", "PT", "Lisbon"],
  ["Barselona", "gn-3128760", "ES", "Barcelona"],
  ["Kopenhag", "gn-2618425", "DK", "Copenhagen"],
  ["Stokholm", "gn-2673730", "SE", "Stockholm"],
  ["Talin", "gn-588409", "EE", "Tallinn"],
  // İtalya
  ["Roma", "gn-3169070", "IT", "Rome"],
  ["Floransa", "gn-3176959", "IT", "Florence"],
  ["Venedik", "gn-3164603", "IT", "Venice"],
  ["Milano", "gn-3173435", "IT", "Milan"],
  ["Napoli", "gn-3172394", "IT", "Naples"],
  ["Torino", "gn-3165524", "IT", "Turin"],
  ["Cenova", "gn-3176219", "IT", "Genoa"],
  // Doğu Avrupa / Balkanlar
  ["Varşova", "gn-756135", "PL", "Warsaw"],
  ["Prag", "gn-3067696", "CZ", "Prague"],
  ["Budapeşte", "gn-3054643", "HU", "Budapest"],
  ["Bükreş", "gn-683506", "RO", "Bucharest"],
  ["Kişinev", "gn-618426", "MD", "Chisinau"],
  ["Kiev", "gn-703448", "UA", "Kyiv"],
  ["Kiyev", "gn-703448", "UA", "Kyiv"],
  ["Moskova", "gn-524901", "RU", "Moscow"],
  ["Sofya", "gn-727011", "BG", "Sofia"],
  ["Filibe", "gn-728193", "BG", "Plovdiv"],
  ["Kırcaali", "gn-729794", "BG", "Kardzhali"],
  ["Belgrad", "gn-792680", "RS", "Belgrade"],
  ["Saraybosna", "gn-3191281", "BA", "Sarajevo"],
  ["Üsküp", "gn-785842", "MK", "Skopje"],
  ["Ohri", "gn-787487", "MK", "Ohrid"],
  ["Manastır", "gn-792578", "MK", "Bitola"],
  ["Kalkandelen", "gn-785082", "MK", "Tetovo"],
  ["Priştine", "gn-786714", "XK", "Pristina"],
  ["Tiran", "gn-3183875", "AL", "Tirana"],
  // Yunanistan / Kıbrıs
  ["Atina", "gn-264371", "GR", "Athens"],
  ["Selanik", "gn-734077", "GR", "Thessaloníki"],
  ["Gümülcine", "gn-735640", "GR", "Komotiní"],
  ["İskeçe", "gn-733840", "GR", "Xánthi"],
  ["Dedeağaç", "gn-736928", "GR", "Alexandroupoli"],
  ["Rodos", "gn-400666", "GR", "Ródos"],
  ["Lefkoşa", "gn-146268", "CY", "Nicosia"],
  ["Gazimağusa", "gn-146617", "CY", "Famagusta"],
  ["Girne", "gn-146412", "CY", "Kyrenia"],
  // Kafkasya / Orta Asya
  ["Tiflis", "gn-611717", "GE", "Tbilisi"],
  ["Batum", "gn-615532", "GE", "Batumi"],
  ["Erivan", "gn-616052", "AM", "Yerevan"],
  ["Bakü", "gn-587084", "AZ", "Baku"],
  ["Gence", "gn-586523", "AZ", "Ganja"],
  ["Şuşa", "gn-147105", "AZ", "Shusha"],
  ["Nahçıvan", "gn-147429", "AZ", "Naxçıvan"],
  ["Taşkent", "gn-1512569", "UZ", "Tashkent"],
  ["Semerkant", "gn-1216265", "UZ", "Samarkand"],
  ["Buhara", "gn-1217662", "UZ", "Bukhara"],
  ["Aşkabat", "gn-162183", "TM", "Ashgabat"],
  ["Bişkek", "gn-1528675", "KG", "Bishkek"],
  ["Duşanbe", "gn-1221874", "TJ", "Dushanbe"],
  // Orta Doğu / Kuzey Afrika
  ["Tahran", "gn-112931", "IR", "Tehran"],
  ["Tebriz", "gn-113646", "IR", "Tabriz"],
  ["Bağdat", "gn-98182", "IQ", "Baghdad"],
  ["Musul", "gn-99072", "IQ", "Mosul"],
  ["Kerkük", "gn-94787", "IQ", "Kirkuk"],
  ["Şam", "gn-170654", "SY", "Damascus"],
  ["Halep", "gn-170063", "SY", "Aleppo"],
  ["Beyrut", "gn-276781", "LB", "Beirut"],
  ["Kudüs", "gn-281184", "IL", "Jerusalem"],
  ["Kahire", "gn-360630", "EG", "Cairo"],
  ["İskenderiye", "gn-361058", "EG", "Alexandria"],
  ["Riyad", "gn-108410", "SA", "Riyadh"],
  ["Mekke", "gn-104515", "SA", "Makkah"],
  ["Medine", "gn-109223", "SA", "Madinah"],
  ["Kuveyt", "gn-285787", "KW", "Kuwait City"],
  ["Abu Dabi", "gn-292968", "AE", "Abu Dhabi"],
  ["Tunus", "gn-2464470", "TN", "Tunis"],
  ["Cezayir", "gn-2507480", "DZ", "Algiers"],
  // Güney / Doğu Asya
  ["Kabil", "gn-1138958", "AF", "Kabul"],
  ["Karaçi", "gn-1174872", "PK", "Karachi"],
  ["Lahor", "gn-1172451", "PK", "Lahore"],
  ["Yeni Delhi", "gn-1261481", "IN", "New Delhi"],
  ["Pekin", "gn-1816670", "CN", "Beijing"],
];
