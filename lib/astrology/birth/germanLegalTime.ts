// ATL-P2-07 (2026-10-21): 1893–devir arası ALMAN YÖNETİMİNDEKİ, bugün başka IANA bölgesinde kalan şehirler (SAF; veri + sorgu).
//
// Birincil kaynak: "Gesetz, betreffend die Einführung einer einheitlichen Zeitbestimmung. Vom 12. März 1893" (RGBl. 1893
// Nr. 7, S. 93): §1 "Die gesetzliche Zeit in Deutschland ist die mittlere Sonnenzeit des fünfzehnten Längengrades östlich
// von Greenwich." · §2 yürürlük: yeni saate göre 1 Nisan 1893'ün başladığı an (= 1893-03-31T23:00:00Z).
// IANA tzdata (2026e) bu şehirleri BUGÜNKÜ bölgelerine bağlar (Europe/Warsaw WMT +1:24 → 1915, EET 1918-09-16 → 1922-06;
// Europe/Paris PMT/WET; Europe/Brussels WET 1892–1914; Europe/Copenhagen backzone CMT → 1894 + Danimarka yaz saati;
// Europe/Vilnius WMT/KMT) → bu dönemde Alman yasal saati (Europe/Berlin kuralları: MEZ, 1916–1918 ve 1940–1944 MESZ) değil.
//
// YALNIZ KESİN sınıf: şehir GeoNames kimliğiyle (uygulamanın konum veri seti; serbest koordinat YOK) ve yalnız Alman
// yönetiminin kesin olduğu yerel tarih aralıklarında. Belirsiz dönemler (1893 öncesi, devir sonrası, plebisit / müttefik
// komisyon yönetimi, 1914 Mulhouse Fransız işgali, 1945) tabloda YOK → davranış IANA ile aynı kalır.
// Aralıklar [başlangıç, bitiş): yerel Alman yasal saatiyle 00:00 (tüm sınırlar MEZ = UTC+1 dönemine denk gelir).

export type GermanLegalTimeClass = "DE45" | "DE45_OS" | "DE45_OP" | "PL1918" | "PL1920" | "PL1922" | "FR1918" | "FR1918_MUL" | "BE1918" | "DK1920" | "LT1920";

/** Sınıf → kesin Alman yönetimi aralıkları (yerel tarih, [dahil, hariç)). */
export const GERMAN_LEGAL_TIME_WINDOWS: Readonly<Record<GermanLegalTimeClass, ReadonlyArray<readonly [string, string]>>> = {
  // 1945'e kadar Alman (Silezya, Pomerania, Brandenburg, Doğu Prusya, Grenzmark). 1945 savaş sonu: belirsiz → dışarıda.
  DE45: [["1893-04-01", "1945-01-01"]],
  // Yukarı Silezya plebisit bölgesi (müttefik komisyon 1920-02 → 1922-07): komisyon dönemi belirsiz → boşluk.
  DE45_OS: [["1893-04-01", "1920-01-10"], ["1922-07-11", "1945-01-01"]],
  // Allenstein / Marienwerder plebisit bölgeleri (müttefik komisyon 1920-02 → 1920-08): boşluk.
  DE45_OP: [["1893-04-01", "1920-01-10"], ["1920-08-17", "1945-01-01"]],
  // Posen eyaleti → Polonya (Büyük Polonya ayaklanması 1918-12-27; sonrası belirsiz).
  PL1918: [["1893-04-01", "1918-12-27"]],
  // Batı Prusya / Netze bölgesi / Soldau / Danzig → Polonya ya da Serbest Şehir (Versay yürürlüğü 1920-01-10).
  PL1920: [["1893-04-01", "1920-01-10"]],
  // Doğu Yukarı Silezya → Polonya 1922 (plebisit komisyonu 1920-02'den: belirsiz).
  PL1922: [["1893-04-01", "1920-01-10"]],
  // Elsass-Lothringen → Fransa (ateşkes 1918-11-11; Fransız saatine geçiş 17–22 Kasım 1918, gün gün belirsiz).
  FR1918: [["1893-04-01", "1918-11-11"]],
  // Mulhouse çevresi: 1914-08-07…08-25 kısa Fransız işgali (Fransız saati uygulandı) → boşluk.
  FR1918_MUL: [["1893-04-01", "1914-08-07"], ["1914-08-26", "1918-11-11"]],
  // Eupen (Ren eyaleti) → Belçika (1918-11 sonrası Belçika işgali: saat belirsiz).
  BE1918: [["1893-04-01", "1918-11-11"]],
  // Kuzey Schleswig → Danimarka 1920-06-15 (plebisit komisyonu 1920-01'den: belirsiz).
  DK1920: [["1893-04-01", "1920-01-10"]],
  // Memel → müttefik yönetimi 1920-02-15, Litvanya 1923 (1920-01-10 sonrası belirsiz).
  LT1920: [["1893-04-01", "1920-01-10"]],
};

type Entry = readonly [geonamesId: string, timezone: string, cls: GermanLegalTimeClass, name: string, germanName: string];

/** GeoNames kimliği → (beklenen IANA bölgesi, sınıf). Kimlik + bölge birlikte eşleşmezse tablo uygulanmaz. */
const ENTRIES: ReadonlyArray<Entry> = [
  // ── Polonya · Aşağı Silezya (Prusya Silezya eyaleti; Bogatynia: Saksonya) — 1945'e kadar Alman ──
  ["gn-3081368", "Europe/Warsaw", "DE45", "Wrocław", "Breslau"],
  ["gn-8425987", "Europe/Warsaw", "DE45", "Biskupin-Sępolno-Dąbie-Bartoszowice (Wrocław)", "Breslau"],
  ["gn-8425969", "Europe/Warsaw", "DE45", "Gaj (Wrocław)", "Breslau"],
  ["gn-8425958", "Europe/Warsaw", "DE45", "Gajowice (Wrocław)", "Breslau"],
  ["gn-8425959", "Europe/Warsaw", "DE45", "Gądów-Popowice Południowe (Wrocław)", "Breslau"],
  ["gn-8425970", "Europe/Warsaw", "DE45", "Huby (Wrocław)", "Breslau"],
  ["gn-8425978", "Europe/Warsaw", "DE45", "Karłowice-Różanka (Wrocław)", "Breslau"],
  ["gn-12047636", "Europe/Warsaw", "DE45", "Kozanów (Wrocław)", "Breslau"],
  ["gn-8425972", "Europe/Warsaw", "DE45", "Krzyki-Partynice (Wrocław)", "Breslau"],
  ["gn-8425988", "Europe/Warsaw", "DE45", "Nadodrze (Wrocław)", "Breslau"],
  ["gn-12047617", "Europe/Warsaw", "DE45", "Osiedle Kosmonautów (Wrocław)", "Breslau"],
  ["gn-8425974", "Europe/Warsaw", "DE45", "Osiedle Powstańców Śląskich (Wrocław)", "Breslau"],
  ["gn-8425989", "Europe/Warsaw", "DE45", "Ołbin (Wrocław)", "Breslau"],
  ["gn-8425966", "Europe/Warsaw", "DE45", "Pilczyce-Kozanów-Popowice Północne (Wrocław)", "Breslau"],
  ["gn-8425975", "Europe/Warsaw", "DE45", "Przedmieście Oławskie (Wrocław)", "Breslau"],
  ["gn-13562335", "Europe/Warsaw", "DE45", "Psie Pole (Wrocław)", "Breslau"],
  ["gn-8425982", "Europe/Warsaw", "DE45", "Psie Pole Zawidawie (Wrocław)", "Breslau"],
  ["gn-12047623", "Europe/Warsaw", "DE45", "Rejon placu Grunwaldzkiego (Wrocław)", "Breslau"],
  ["gn-12047644", "Europe/Warsaw", "DE45", "Rejon placu Świętego Macieja (Wrocław)", "Breslau"],
  ["gn-12047628", "Europe/Warsaw", "DE45", "Rejon ulicy Traugutta (Wrocław)", "Breslau"],
  ["gn-12047651", "Europe/Warsaw", "DE45", "Różanka-Polanka (Wrocław)", "Breslau"],
  ["gn-8425986", "Europe/Warsaw", "DE45", "Szczepin (Wrocław)", "Breslau"],
  ["gn-13562332", "Europe/Warsaw", "DE45", "Śródmieście (Wrocław)", "Breslau"],
  ["gn-3103476", "Europe/Warsaw", "DE45", "Bielawa", "Langenbielau"],
  ["gn-3103096", "Europe/Warsaw", "DE45", "Bogatynia", "Reichenau i. Sa."],
  ["gn-3103034", "Europe/Warsaw", "DE45", "Boguszów-Gorce", "Gottesberg"],
  ["gn-3102987", "Europe/Warsaw", "DE45", "Bolesławiec", "Bunzlau"],
  ["gn-3099828", "Europe/Warsaw", "DE45", "Dzierżoniów", "Reichenbach (Eulengebirge)"],
  ["gn-3099213", "Europe/Warsaw", "DE45", "Głogów", "Glogau"],
  ["gn-3097367", "Europe/Warsaw", "DE45", "Jawor", "Jauer"],
  ["gn-3097271", "Europe/Warsaw", "DE45", "Jelcz", "Jeltsch"],
  ["gn-7303641", "Europe/Warsaw", "DE45", "Jelcz Laskowice", "Jeltsch-Laskowitz"],
  ["gn-3097257", "Europe/Warsaw", "DE45", "Jelenia Góra", "Hirschberg"],
  ["gn-3096779", "Europe/Warsaw", "DE45", "Kamienna Góra", "Landeshut"],
  ["gn-3096053", "Europe/Warsaw", "DE45", "Kłodzko", "Glatz"],
  ["gn-3093692", "Europe/Warsaw", "DE45", "Legnica", "Liegnitz"],
  ["gn-3093040", "Europe/Warsaw", "DE45", "Lubań", "Lauban"],
  ["gn-3092931", "Europe/Warsaw", "DE45", "Lubin", "Lüben"],
  ["gn-3090768", "Europe/Warsaw", "DE45", "Nowa Ruda", "Neurode"],
  ["gn-3090170", "Europe/Warsaw", "DE45", "Oleśnica", "Oels"],
  ["gn-3090205", "Europe/Warsaw", "DE45", "Oława", "Ohlau"],
  ["gn-3088435", "Europe/Warsaw", "DE45", "Polkowice", "Polkwitz"],
  ["gn-3084440", "Europe/Warsaw", "DE45", "Strzegom", "Striegau"],
  ["gn-3082707", "Europe/Warsaw", "DE45", "Wałbrzych", "Waldenburg"],
  ["gn-3080231", "Europe/Warsaw", "DE45", "Zgorzelec", "Görlitz (Ost)"],
  ["gn-3081046", "Europe/Warsaw", "DE45", "Ząbkowice Śląskie", "Frankenstein"],
  ["gn-3080074", "Europe/Warsaw", "DE45", "Złotoryja", "Goldberg"],
  ["gn-3084093", "Europe/Warsaw", "DE45", "Świdnica", "Schweidnitz"],
  ["gn-3084084", "Europe/Warsaw", "DE45", "Świebodzice", "Freiburg i. Schl."],
  // ── Lubusz (Brandenburg, Silezya, Posen'in Grenzmark'ta kalan kısmı) — 1945 ──
  ["gn-3098722", "Europe/Warsaw", "DE45", "Gorzów Wielkopolski", "Landsberg (Warthe)"],
  ["gn-3098130", "Europe/Warsaw", "DE45", "Gubin", "Guben (Ost)"],
  ["gn-3095057", "Europe/Warsaw", "DE45", "Kostrzyn nad Odrą", "Küstrin"],
  ["gn-3091969", "Europe/Warsaw", "DE45", "Międzyrzecz", "Meseritz"],
  ["gn-3090764", "Europe/Warsaw", "DE45", "Nowa Sól", "Neusalz (Oder)"],
  ["gn-3084241", "Europe/Warsaw", "DE45", "Sulechów", "Züllichau"],
  ["gn-3085495", "Europe/Warsaw", "DE45", "Słubice", "Frankfurt (Oder)-Dammvorstadt"],
  ["gn-3080165", "Europe/Warsaw", "DE45", "Zielona Góra", "Grünberg i. Schl."],
  ["gn-3084062", "Europe/Warsaw", "DE45", "Świebodzin", "Schwiebus"],
  ["gn-3080644", "Europe/Warsaw", "DE45", "Żary", "Sorau"],
  ["gn-3080944", "Europe/Warsaw", "DE45", "Żagań", "Sagan"],
  // ── Batı Pomerania (Pomerania eyaleti; Wałcz: Grenzmark) — 1945 ──
  ["gn-3103556", "Europe/Warsaw", "DE45", "Białogard", "Belgard"],
  ["gn-3101613", "Europe/Warsaw", "DE45", "Choszczno", "Arnswalde"],
  ["gn-8426082", "Europe/Warsaw", "DE45", "Drzetowo-Grabowo (Szczecin)", "Stettin"],
  ["gn-3098966", "Europe/Warsaw", "DE45", "Goleniów", "Gollnow"],
  ["gn-3098201", "Europe/Warsaw", "DE45", "Gryfice", "Greifenberg"],
  ["gn-3098200", "Europe/Warsaw", "DE45", "Gryfino", "Greifenhagen"],
  ["gn-3095049", "Europe/Warsaw", "DE45", "Koszalin", "Köslin"],
  ["gn-3095795", "Europe/Warsaw", "DE45", "Kołobrzeg", "Kolberg"],
  ["gn-3090558", "Europe/Warsaw", "DE45", "Nowogard", "Naugard"],
  ["gn-3088461", "Europe/Warsaw", "DE45", "Police", "Pölitz"],
  ["gn-3084840", "Europe/Warsaw", "DE45", "Stargard", "Stargard i. Pom."],
  ["gn-3083829", "Europe/Warsaw", "DE45", "Szczecin", "Stettin"],
  ["gn-3083826", "Europe/Warsaw", "DE45", "Szczecinek", "Neustettin"],
  ["gn-3082704", "Europe/Warsaw", "DE45", "Wałcz", "Deutsch Krone"],
  ["gn-3084085", "Europe/Warsaw", "DE45", "Świdwin", "Schivelbein"],
  ["gn-8426094", "Europe/Warsaw", "DE45", "Świerczewo (Szczecin)", "Stettin"],
  ["gn-3083955", "Europe/Warsaw", "DE45", "Świnoujście", "Swinemünde"],
  // ── Pomorskie: Pomerania eyaletinde kalanlar — 1945 ──
  ["gn-3101943", "Europe/Warsaw", "DE45", "Bytów", "Bütow"],
  ["gn-3093739", "Europe/Warsaw", "DE45", "Lębork", "Lauenburg i. Pom."],
  ["gn-3085450", "Europe/Warsaw", "DE45", "Słupsk", "Stolp"],
  ["gn-3082756", "Europe/Warsaw", "DE45", "Ustka", "Stolpmünde"],
  // ── Wielkopolskie: Grenzmark Posen-Westpreußen (Almanya'da kaldı) — 1945 ──
  ["gn-3089033", "Europe/Warsaw", "DE45", "Piła", "Schneidemühl"],
  ["gn-3083185", "Europe/Warsaw", "DE45", "Trzcianka", "Schönlanke"],
  ["gn-3080071", "Europe/Warsaw", "DE45", "Złotów", "Flatow"],
  // ── Doğu Prusya / Batı Prusya, plebisit bölgesi DIŞI — 1945 ──
  ["gn-776337", "Europe/Warsaw", "DE45", "Bartoszyce", "Bartenstein"],
  ["gn-3102677", "Europe/Warsaw", "DE45", "Braniewo", "Braunsberg"],
  ["gn-3099759", "Europe/Warsaw", "DE45", "Elbląg", "Elbing"],
  ["gn-772227", "Europe/Warsaw", "DE45", "Gierłoż", "Görlitz (Ostpr.)"],
  ["gn-769274", "Europe/Warsaw", "DE45", "Kętrzyn", "Rastenburg"],
  ["gn-766307", "Europe/Warsaw", "DE45", "Lidzbark Warmiński", "Heilsberg"],
  // ── Opole: Aşağı Silezya'daki (plebisit DIŞI) — 1945 ──
  ["gn-3102459", "Europe/Warsaw", "DE45", "Brzeg", "Brieg"],
  ["gn-3091141", "Europe/Warsaw", "DE45", "Namysłów", "Namslau"],
  // ── Yukarı Silezya, Almanya'da kalan (plebisit komisyonu dönemi hariç) ──
  ["gn-3099230", "Europe/Warsaw", "DE45_OS", "Gliwice", "Gleiwitz"],
  ["gn-3080985", "Europe/Warsaw", "DE45_OS", "Zabrze", "Hindenburg O.S."],
  ["gn-3101950", "Europe/Warsaw", "DE45_OS", "Bytom", "Beuthen O.S."],
  ["gn-3087628", "Europe/Warsaw", "DE45_OS", "Pyskowice", "Peiskretscham"],
  ["gn-3087584", "Europe/Warsaw", "DE45_OS", "Racibórz", "Ratibor"],
  ["gn-3090048", "Europe/Warsaw", "DE45_OS", "Opole", "Oppeln"],
  ["gn-3084415", "Europe/Warsaw", "DE45_OS", "Strzelce Opolskie", "Groß Strehlitz"],
  ["gn-3096372", "Europe/Warsaw", "DE45_OS", "Kędzierzyn-Koźle", "Heydebreck-Cosel"],
  ["gn-3094788", "Europe/Warsaw", "DE45_OS", "Krapkowice", "Krappitz"],
  ["gn-3096003", "Europe/Warsaw", "DE45_OS", "Kluczbork", "Kreuzburg O.S."],
  ["gn-3090436", "Europe/Warsaw", "DE45_OS", "Nysa", "Neisse"],
  ["gn-3088065", "Europe/Warsaw", "DE45_OS", "Prudnik", "Neustadt O.S."],
  ["gn-3099169", "Europe/Warsaw", "DE45_OS", "Głuchołazy", "Ziegenhals"],
  // ── Allenstein / Marienwerder plebisit bölgeleri (Almanya'da kaldı; komisyon dönemi hariç) ──
  ["gn-763166", "Europe/Warsaw", "DE45_OP", "Olsztyn", "Allenstein"],
  ["gn-3089779", "Europe/Warsaw", "DE45_OP", "Ostróda", "Osterode i. Ostpr."],
  ["gn-757357", "Europe/Warsaw", "DE45_OP", "Szczytno", "Ortelsburg"],
  ["gn-764312", "Europe/Warsaw", "DE45_OP", "Mrągowo", "Sensburg"],
  ["gn-772195", "Europe/Warsaw", "DE45_OP", "Giżycko", "Lötzen"],
  ["gn-762120", "Europe/Warsaw", "DE45_OP", "Pisz", "Johannisburg"],
  ["gn-772621", "Europe/Warsaw", "DE45_OP", "Ełk", "Lyck"],
  ["gn-763291", "Europe/Warsaw", "DE45_OP", "Olecko", "Marggrabowa (Treuburg)"],
  ["gn-3097902", "Europe/Warsaw", "DE45_OP", "Iława", "Deutsch Eylau"],
  ["gn-3092472", "Europe/Warsaw", "DE45_OP", "Malbork", "Marienburg"],
  ["gn-3094086", "Europe/Warsaw", "DE45_OP", "Kwidzyn", "Marienwerder"],
  // ── Posen eyaleti → Polonya (1918-12-27'ye kadar) ──
  ["gn-3088171", "Europe/Warsaw", "PL1918", "Poznań", "Posen"],
  ["gn-3092856", "Europe/Warsaw", "PL1918", "Luboń", "Luban"],
  ["gn-3084130", "Europe/Warsaw", "PL1918", "Swarzędz", "Schwersenz"],
  ["gn-3099112", "Europe/Warsaw", "PL1918", "Gniezno", "Gnesen"],
  ["gn-3081324", "Europe/Warsaw", "PL1918", "Września", "Wreschen"],
  ["gn-3085045", "Europe/Warsaw", "PL1918", "Środa Wielkopolska", "Schroda"],
  ["gn-3085056", "Europe/Warsaw", "PL1918", "Śrem", "Schrimm"],
  ["gn-3095151", "Europe/Warsaw", "PL1918", "Kościan", "Kosten"],
  ["gn-3098625", "Europe/Warsaw", "PL1918", "Gostyń", "Gostyn"],
  ["gn-3097528", "Europe/Warsaw", "PL1918", "Jarocin", "Jarotschin"],
  ["gn-3088848", "Europe/Warsaw", "PL1918", "Pleszew", "Pleschen"],
  ["gn-3094625", "Europe/Warsaw", "PL1918", "Krotoszyn", "Krotoschin"],
  ["gn-3089684", "Europe/Warsaw", "PL1918", "Ostrów Wielkopolski", "Ostrowo"],
  ["gn-3087307", "Europe/Warsaw", "PL1918", "Rawicz", "Rawitsch"],
  ["gn-3093524", "Europe/Warsaw", "PL1918", "Leszno", "Lissa"],
  ["gn-3090452", "Europe/Warsaw", "PL1918", "Nowy Tomyśl", "Neutomischel"],
  ["gn-3083878", "Europe/Warsaw", "PL1918", "Szamotuły", "Samter"],
  ["gn-3090403", "Europe/Warsaw", "PL1918", "Oborniki", "Obornik"],
  ["gn-3082712", "Europe/Warsaw", "PL1918", "Wągrowiec", "Wongrowitz"],
  ["gn-3101680", "Europe/Warsaw", "PL1918", "Chodzież", "Kolmar i. Posen"],
  ["gn-3097872", "Europe/Warsaw", "PL1918", "Inowrocław", "Inowrazlaw (Hohensalza)"],
  // ── Batı Prusya / Netze / Soldau / Danzig (1920-01-10'a kadar) ──
  ["gn-3102014", "Europe/Warsaw", "PL1920", "Bydgoszcz", "Bromberg"],
  ["gn-3099654", "Europe/Warsaw", "PL1920", "Fordon", "Fordon"],
  ["gn-3085172", "Europe/Warsaw", "PL1920", "Solec Kujawski", "Schulitz"],
  ["gn-3091150", "Europe/Warsaw", "PL1920", "Nakło nad Notecią", "Nakel (Netze)"],
  ["gn-3083271", "Europe/Warsaw", "PL1920", "Toruń", "Thorn"],
  ["gn-3101795", "Europe/Warsaw", "PL1920", "Chełmno", "Culm"],
  ["gn-3101787", "Europe/Warsaw", "PL1920", "Chełmża", "Culmsee"],
  ["gn-3098218", "Europe/Warsaw", "PL1920", "Grudziądz", "Graudenz"],
  ["gn-3084074", "Europe/Warsaw", "PL1920", "Świecie", "Schwetz"],
  ["gn-3102627", "Europe/Warsaw", "PL1920", "Brodnica", "Strasburg i. Westpr."],
  ["gn-3084826", "Europe/Warsaw", "PL1920", "Starogard Gdański", "Preußisch Stargard"],
  ["gn-3083426", "Europe/Warsaw", "PL1920", "Tczew", "Dirschau"],
  ["gn-3101672", "Europe/Warsaw", "PL1920", "Chojnice", "Konitz"],
  ["gn-3095126", "Europe/Warsaw", "PL1920", "Kościerzyna", "Berent"],
  ["gn-3096525", "Europe/Warsaw", "PL1920", "Kartuzy", "Karthaus"],
  ["gn-3082473", "Europe/Warsaw", "PL1920", "Wejherowo", "Neustadt i. Westpr."],
  ["gn-3086706", "Europe/Warsaw", "PL1920", "Rumia", "Rahmel"],
  ["gn-3087281", "Europe/Warsaw", "PL1920", "Reda", "Rheda"],
  ["gn-3099424", "Europe/Warsaw", "PL1920", "Gdynia", "Gdingen"],
  ["gn-772748", "Europe/Warsaw", "PL1920", "Działdowo", "Soldau"],
  ["gn-3099434", "Europe/Warsaw", "PL1920", "Gdańsk", "Danzig"],
  ["gn-8426032", "Europe/Warsaw", "PL1920", "Chełm (Gdańsk)", "Danzig-Stolzenberg"],
  ["gn-13100477", "Europe/Warsaw", "PL1920", "Orunia Górna-Gdańsk Południe", "Danzig"],
  ["gn-3089823", "Europe/Warsaw", "PL1920", "Osowa (Gdańsk)", "Danzig-Espenkrug"],
  ["gn-8426039", "Europe/Warsaw", "PL1920", "Piecki-Migowo (Gdańsk)", "Danzig"],
  ["gn-8426041", "Europe/Warsaw", "PL1920", "Przymorze Wielkie (Gdańsk)", "Danzig"],
  ["gn-8426046", "Europe/Warsaw", "PL1920", "Ujeścisko-Łostowice (Gdańsk)", "Danzig"],
  ["gn-3081318", "Europe/Warsaw", "PL1920", "Wrzeszcz (Gdańsk)", "Danzig-Langfuhr"],
  ["gn-8426048", "Europe/Warsaw", "PL1920", "Wrzeszcz Dolny (Gdańsk)", "Danzig-Langfuhr"],
  ["gn-8426050", "Europe/Warsaw", "PL1920", "Wrzeszcz Górny (Gdańsk)", "Danzig-Langfuhr"],
  ["gn-8426045", "Europe/Warsaw", "PL1920", "Środmieście (Gdańsk)", "Danzig"],
  ["gn-3085151", "Europe/Warsaw", "PL1920", "Sopot", "Zoppot"],
  ["gn-3088034", "Europe/Warsaw", "PL1920", "Pruszcz Gdański", "Praust"],
  // ── Doğu Yukarı Silezya → Polonya 1922 (1920-01-10'a kadar) ──
  ["gn-3096472", "Europe/Warsaw", "PL1922", "Katowice", "Kattowitz"],
  ["gn-3101619", "Europe/Warsaw", "PL1922", "Chorzów", "Königshütte"],
  ["gn-3086024", "Europe/Warsaw", "PL1922", "Siemianowice Śląskie", "Laurahütte-Siemianowitz"],
  ["gn-3083988", "Europe/Warsaw", "PL1922", "Świętochłowice", "Schwientochlowitz"],
  ["gn-3086800", "Europe/Warsaw", "PL1922", "Ruda Śląska", "Ruda"],
  ["gn-3091232", "Europe/Warsaw", "PL1922", "Mysłowice", "Myslowitz"],
  ["gn-3082914", "Europe/Warsaw", "PL1922", "Tychy", "Tichau"],
  ["gn-3091831", "Europe/Warsaw", "PL1922", "Mikołów", "Nikolai"],
  ["gn-3093785", "Europe/Warsaw", "PL1922", "Łaziska Górne", "Ober Lazisk"],
  ["gn-3089965", "Europe/Warsaw", "PL1922", "Orzesze", "Orzesche"],
  ["gn-3087705", "Europe/Warsaw", "PL1922", "Pszczyna", "Pleß"],
  ["gn-3103365", "Europe/Warsaw", "PL1922", "Bieruń", "Berun"],
  ["gn-3093708", "Europe/Warsaw", "PL1922", "Lędziny", "Lendzin"],
  ["gn-3086586", "Europe/Warsaw", "PL1922", "Rybnik", "Rybnik"],
  ["gn-3080004", "Europe/Warsaw", "PL1922", "Żory", "Sohrau"],
  ["gn-3081677", "Europe/Warsaw", "PL1922", "Wodzisław Śląski", "Loslau"],
  ["gn-3097391", "Europe/Warsaw", "PL1922", "Jastrzębie Zdrój", "Bad Königsdorff-Jastrzemb"],
  ["gn-3086531", "Europe/Warsaw", "PL1922", "Rydułtowy", "Rydultau"],
  ["gn-3087529", "Europe/Warsaw", "PL1922", "Radlin", "Radlin"],
  ["gn-3095971", "Europe/Warsaw", "PL1922", "Knurów", "Knurow"],
  ["gn-3100974", "Europe/Warsaw", "PL1922", "Czerwionka-Leszczyny", "Czerwionka"],
  ["gn-3089125", "Europe/Warsaw", "PL1922", "Piekary Śląskie", "Deutsch Piekar"],
  ["gn-3087418", "Europe/Warsaw", "PL1922", "Radzionków", "Radzionkau"],
  ["gn-3083440", "Europe/Warsaw", "PL1922", "Tarnowskie Góry", "Tarnowitz"],
  ["gn-3092906", "Europe/Warsaw", "PL1922", "Lubliniec", "Lublinitz"],
  // ── Fransa: Elsass-Lothringen (Bas-Rhin, Haut-Rhin, Moselle) ──
  ["gn-2973783", "Europe/Paris", "FR1918", "Strasbourg", "Straßburg"],
  ["gn-2975446", "Europe/Paris", "FR1918", "Schiltigheim", "Schiltigheim"],
  ["gn-3032551", "Europe/Paris", "FR1918", "Bischheim", "Bischheim"],
  ["gn-3012834", "Europe/Paris", "FR1918", "Illkirch-Graffenstaden", "Illkirch-Grafenstaden"],
  ["gn-2998224", "Europe/Paris", "FR1918", "Lingolsheim", "Lingolsheim"],
  ["gn-3014078", "Europe/Paris", "FR1918", "Haguenau", "Hagenau"],
  ["gn-2975233", "Europe/Paris", "FR1918", "Sélestat", "Schlettstadt"],
  ["gn-3024297", "Europe/Paris", "FR1918", "Colmar", "Colmar"],
  ["gn-2994160", "Europe/Paris", "FR1918", "Metz", "Metz"],
  ["gn-2992402", "Europe/Paris", "FR1918", "Montigny-lès-Metz", "Montigny"],
  ["gn-2972811", "Europe/Paris", "FR1918", "Thionville", "Diedenhofen"],
  ["gn-3013701", "Europe/Paris", "FR1918", "Yutz", "Jeutz"],
  ["gn-3013627", "Europe/Paris", "FR1918", "Hayange", "Hayingen"],
  ["gn-2975964", "Europe/Paris", "FR1918", "Sarreguemines", "Saargemünd"],
  ["gn-3017805", "Europe/Paris", "FR1918", "Forbach", "Forbach"],
  ["gn-2981492", "Europe/Paris", "FR1918", "Saint-Avold", "Sankt Avold"],
  ["gn-2991214", "Europe/Paris", "FR1918_MUL", "Mulhouse", "Mülhausen"],
  ["gn-3012829", "Europe/Paris", "FR1918_MUL", "Illzach", "Illzach"],
  ["gn-2967318", "Europe/Paris", "FR1918_MUL", "Wittenheim", "Wittenheim"],
  ["gn-2978742", "Europe/Paris", "FR1918_MUL", "Saint-Louis", "Sankt Ludwig"],
  // ── Belçika: Eupen ──
  ["gn-2798573", "Europe/Brussels", "BE1918", "Eupen", "Eupen"],
  // ── Danimarka: Kuzey Schleswig ──
  ["gn-2620964", "Europe/Copenhagen", "DK1920", "Haderslev", "Hadersleben"],
  ["gn-2625070", "Europe/Copenhagen", "DK1920", "Aabenraa", "Apenrade"],
  ["gn-2613102", "Europe/Copenhagen", "DK1920", "Sønderborg", "Sonderburg"],
  ["gn-2611497", "Europe/Copenhagen", "DK1920", "Tønder", "Tondern"],
  // ── Litvanya: Memel ──
  ["gn-598098", "Europe/Vilnius", "LT1920", "Klaipėda", "Memel"],
];

export const GERMAN_LEGAL_TIME_LOCATIONS: ReadonlyMap<string, { timezone: string; cls: GermanLegalTimeClass; name: string; germanName: string }> = new Map(
  ENTRIES.map(([id, timezone, cls, name, germanName]) => [id, { timezone, cls, name, germanName }] as const),
);

/** Yerel 00:00 MEZ (UTC+1) → UTC ms. Tüm aralık sınırları MEZ (yaz saati dışı) günlerine denk gelir. */
function mezMidnightUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) - 3_600_000;
}

const WINDOWS_UTC: Readonly<Record<GermanLegalTimeClass, ReadonlyArray<readonly [number, number]>>> = Object.fromEntries(
  Object.entries(GERMAN_LEGAL_TIME_WINDOWS).map(([k, ws]) => [k, ws.map(([a, b]) => [mezMidnightUtcMs(a), mezMidnightUtcMs(b)] as const)]),
) as Record<GermanLegalTimeClass, ReadonlyArray<readonly [number, number]>>;

/** 1893 yasasının yürürlük anı: 1893-04-01 00:00 MEZ = 1893-03-31T23:00:00Z. */
export const GERMAN_LEGAL_TIME_START_UTC_MS = mezMidnightUtcMs("1893-04-01");

/** Konum (GeoNames kimliği + beklenen IANA bölgesi) tablodaysa sınıf kaydı; değilse null. */
export function germanLegalTimeLocation(locationId: unknown, timeZone: unknown): { cls: GermanLegalTimeClass; name: string; germanName: string } | null {
  if (typeof locationId !== "string" || typeof timeZone !== "string") return null;
  const e = GERMAN_LEGAL_TIME_LOCATIONS.get(locationId);
  return e && e.timezone === timeZone ? { cls: e.cls, name: e.name, germanName: e.germanName } : null;
}

/** Bu UTC anı, konumun KESİN Alman yönetimi aralıklarından birinde mi? */
export function inGermanLegalTimeWindow(cls: GermanLegalTimeClass, utcMs: number): boolean {
  return WINDOWS_UTC[cls].some(([a, b]) => utcMs >= a && utcMs < b);
}
