/**
 * Doğaltaş standart taş adları — YÜKSEK GÜVENLİ görüntü sözlüğü (I18N-F1-R3, D4).
 *
 * Kaynak: C:/YasamSistemi-Kanit/I18N-F1-R3-2026-11-25/DOGALTAS-EN-AD-SOZLUGU.json (I18N-F1-R3 · 2026-11-25).
 * Yalnız `guven = "yuksek"` VE `uzman_onayi_gerekli = false` kayıtlar alındı (227 kayıt); orta/düşük güvenli ve
 * uzman onayı bekleyen kayıtlar bilerek YOK (EN arayüzde Türkçe kalırlar). Parantezli EN adlarda parantez içi takma ada taşındı.
 *
 * Bu dosya YALNIZ GÖSTERİM/ARAMA içindir: saklanan hiçbir ad (stones.stone_name, client_stones, snapshot_name, stok adı,
 * kütüphane name_tr/name_en) bu tabloyla DEĞİŞTİRİLMEZ. `tr` = sözlükteki Türkçe kanonik yazım + kayıtlarda görülen yazımlar.
 * `ambiguousTr`: yazımlardan biri belirsiz Türkçe terim listesinde (Oniks, Ay Taşı, Kehribar…) → otomatik ad eşlemesinde
 * KULLANILMAZ (yalnız aramada aday üretir).
 */
// Her veri satırı "i18n-ignore" ile işaretlidir: kanonik taş adı verisi, arayüz metni değil.

export type StandardStoneNameEntry = {
  readonly id: string;
  readonly en: string;
  readonly enAliases: readonly string[];
  readonly tr: readonly string[];
  readonly ambiguousTr?: true;
};

export const STANDARD_STONE_NAMES: readonly StandardStoneNameEntry[] = [
  { id: "abalone", en: "Abalone", enAliases: ["Paua","Paua Shell"], tr: ["Abalone (Paua Kabuğu)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "adamin", en: "Adamite", enAliases: [], tr: ["Adamin"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "adular", en: "Adularia", enAliases: [], tr: ["Adular"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "agirin", en: "Aegirine", enAliases: ["Acmite"], tr: ["Ağirin"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "aktinolit", en: "Actinolite", enAliases: [], tr: ["Aktinolit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "akuamarin", en: "Aquamarine", enAliases: [], tr: ["Akuamarin"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "albit", en: "Albite", enAliases: [], tr: ["Albit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "alci-gips", en: "Gypsum", enAliases: [], tr: ["Alçı (Jips)","ALÇI (GİPS)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "aleksandrit", en: "Alexandrite", enAliases: [], tr: ["Aleksandrit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "altin", en: "Gold", enAliases: ["Native gold"], tr: ["Altın","ALTIN (GOLD)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "alunit", en: "Alunite", enAliases: [], tr: ["Alünit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "amazonit", en: "Amazonite", enAliases: ["Amazon stone"], tr: ["Amazonit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "ametist", en: "Amethyst", enAliases: [], tr: ["Ametist"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "ametrine", en: "Ametrine", enAliases: ["Bolivianite"], tr: ["Ametrine","AMETRİN"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "ammolit-ammonit", en: "Ammolite and Ammonite", enAliases: ["Korite (ticari)"], tr: ["Ammolit ve Ammonit","AMMOLİT & AMMONİT (KORİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "analsim", en: "Analcime", enAliases: ["Analcite"], tr: ["Analsim","ANALSİM (ANALCİM)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "anatas", en: "Anatase", enAliases: ["Octahedrite"], tr: ["Anatas","ANATAS (ANATAZ)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "andaluzit", en: "Andalusite", enAliases: [], tr: ["Andaluzit","ANDALUZİT (ANDALUSİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "anglezit", en: "Anglesite", enAliases: [], tr: ["Anglesit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "anjelit", en: "Angelite", enAliases: ["Blue anhydrite"], tr: ["Anjelit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "antimonit", en: "Stibnite", enAliases: ["Antimonite"], tr: ["Antimonit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "apatit", en: "Apatite", enAliases: [], tr: ["Apatit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "apofilit", en: "Apophyllite", enAliases: [], tr: ["Apofilit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "aragonit", en: "Aragonite", enAliases: [], tr: ["Aragonit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "astrofilit", en: "Astrophyllite", enAliases: [], tr: ["Astrofilit","ASTROFİLİT (ASTROPHYLLİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "atakamit", en: "Atacamite", enAliases: [], tr: ["Atakamit","ATAKAMİT (ATACAMİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "ates-opal", en: "Fire Opal", enAliases: [], tr: ["Ateş Opal"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "aurikalsit", en: "Aurichalcite", enAliases: [], tr: ["Aurikalsit","AURİCHALSİT (AURİCHALCİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "aventurin", en: "Aventurine", enAliases: ["Aventurine quartz"], tr: ["Aventurin"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "ay-tasi", en: "Moonstone", enAliases: ["Adularia moonstone"], tr: ["Ay Taşı","AYTAŞI"], ambiguousTr: true }, // i18n-ignore: kanonik taş adı verisi
  { id: "azurit", en: "Azurite", enAliases: [], tr: ["Azurit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "azurit-malakit", en: "Azurite-Malachite", enAliases: ["Azurmalachite"], tr: ["Azurit-Malakit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "bakir", en: "Copper", enAliases: ["Native copper"], tr: ["Bakır","BAKIR (KUPFER)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "barit", en: "Baryte", enAliases: ["Barite"], tr: ["Barit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "bazalt-ve-gabro", en: "Basalt and Gabbro", enAliases: [], tr: ["Bazalt ve Gabro"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "benitoit", en: "Benitoite", enAliases: [], tr: ["Benitoit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "beril-ve-akuamarin", en: "Beryl and Aquamarine", enAliases: [], tr: ["Beril ve Akuamarin"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "berillonit", en: "Beryllonite", enAliases: [], tr: ["Berillonit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "berrak-kuvars", en: "Clear Quartz", enAliases: ["Rock Crystal","Quartz crystal"], tr: ["Berrak Kuvars","KRİSTAL KUVARS"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "bizmut", en: "Bismuth", enAliases: ["Wismut"], tr: ["Bizmut","WİSMUT (BİZMUT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "boraks", en: "Borax", enAliases: [], tr: ["Boraks"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "bornit", en: "Bornite", enAliases: ["Peacock ore"], tr: ["Bornit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "brezilyait", en: "Brazilianite", enAliases: [], tr: ["Brezilyait","BREZİLYAİT (BRASİLİANİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "caroit", en: "Charoite", enAliases: [], tr: ["Çaroit","ÇEROİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "danburit", en: "Danburite", enAliases: [], tr: ["Danburit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "datolit", en: "Datolite", enAliases: [], tr: ["Datolit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "diaspor", en: "Diaspore", enAliases: ["Zultanite (ticari, TR)"], tr: ["Diaspor"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "diopsit", en: "Diopside", enAliases: ["Chrome diopside"], tr: ["Diopsit","DİYOPSİT (DİOPSİD)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "dioptaz", en: "Dioptase", enAliases: [], tr: ["Dioptaz","DİYOPTAZ"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "dogal-camlar", en: "Natural Glasses", enAliases: [], tr: ["Doğal Camlar","DOĞAL CAMLAR (NATURGLÄSER)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "dolomit", en: "Dolomite", enAliases: [], tr: ["Dolomit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "dumanli-kuvars", en: "Smoky Quartz", enAliases: [], tr: ["Dumanlı Kuvars"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "dumortiyerit", en: "Dumortierite", enAliases: [], tr: ["Dumortiyerit","DUMORTİERİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "eklojit", en: "Eclogite", enAliases: [], tr: ["Eklojit","EKLOJİT (EKLOGİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "elmas", en: "Diamond", enAliases: [], tr: ["Elmas"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "enstatit", en: "Enstatite", enAliases: [], tr: ["Enstatit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "epidot-ve-unakit", en: "Epidote and Unakite", enAliases: [], tr: ["Epidot ve Unakit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "eritrin", en: "Erythrite", enAliases: ["Cobalt bloom"], tr: ["Eritrin","ERİTRİN (ERYTHRİN)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "eudialit", en: "Eudialyte", enAliases: [], tr: ["Eudialit","EUDİALİT (EUDİALYT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "feldispat", en: "Feldspar", enAliases: [], tr: ["Feldispat","FELDİSPAT (FELDSPAT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "fenakit", en: "Phenakite", enAliases: ["Phenacite"], tr: ["Fenakit","FENAKİT (PHENAKİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "flogopit", en: "Phlogopite", enAliases: [], tr: ["Flogopit","FİLOGOPİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "florit", en: "Fluorite", enAliases: ["Fluorspar"], tr: ["Florit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "fuksit", en: "Fuchsite", enAliases: ["Chrome mica"], tr: ["Fuksit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "fulgurit", en: "Fulgurite", enAliases: [], tr: ["Fulgurit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "gagat", en: "Jet", enAliases: [], tr: ["Gagat","GAGAT (JETT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "galen", en: "Galena", enAliases: ["Galenite"], tr: ["Galen","GALEN (GALENİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "glendonit", en: "Glendonite", enAliases: [], tr: ["Glendonit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "glokofan", en: "Glaucophane", enAliases: [], tr: ["Glokofan","GLOKOFAN (GLAUKOPHAN)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "gnays", en: "Gneiss", enAliases: [], tr: ["Gnays","GNAYS (GNEİS)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "goktasi", en: "Meteorite", enAliases: [], tr: ["Göktaşı"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "granit", en: "Granite", enAliases: [], tr: ["Granit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "gul-kuvars", en: "Rose Quartz", enAliases: [], tr: ["Gül Kuvars","GÜL KUVARS VE PEMBE KUVARS"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "gumus", en: "Silver", enAliases: ["Native silver"], tr: ["Gümüş"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "gunes-tasi", en: "Sunstone", enAliases: ["Aventurine feldspar","Heliolite"], tr: ["Güneş Taşı","GÜNEŞ TAŞI (SONNENSTEİN)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "halit", en: "Halite", enAliases: ["Rock salt"], tr: ["Halit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "hauyn", en: "Haüyne", enAliases: ["Hauyne"], tr: ["Haüyn"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "helidor", en: "Heliodor", enAliases: ["Golden beryl"], tr: ["Helidor"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "hematit", en: "Hematite", enAliases: [], tr: ["Hematit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "hemimorfit", en: "Hemimorphite", enAliases: [], tr: ["Hemimorfit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "herkimer-elmasi", en: "Herkimer Diamond", enAliases: [], tr: ["Herkimer Elması"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "heulandit", en: "Heulandite", enAliases: [], tr: ["Heulandit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "hiddenit", en: "Hiddenite", enAliases: [], tr: ["Hiddenit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "hornblend", en: "Hornblende", enAliases: [], tr: ["Hornblend","HORNBLENDE"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "hovlit", en: "Howlite", enAliases: ["White turquoise (ticari, yanıltıcı)"], tr: ["Hovlit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "ilmenit", en: "Ilmenite", enAliases: [], tr: ["İlmenit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "ilvait", en: "Ilvaite", enAliases: [], tr: ["İlvait"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "inci", en: "Pearl", enAliases: [], tr: ["İnci"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "iyolit", en: "Iolite", enAliases: ["Cordierite","Water sapphire"], tr: ["İyolit","KORDİYERİT (LOLİT) CORDİERİT (LOLİTH)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "jamesonit", en: "Jamesonite", enAliases: [], tr: ["Jamesonit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kalkantit", en: "Chalcanthite", enAliases: [], tr: ["Kalkantit","KALKANİT (CHALKANTHİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kalkopirit", en: "Chalcopyrite", enAliases: [], tr: ["Kalkopirit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kalsedon", en: "Chalcedony", enAliases: [], tr: ["Kalsedon"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kalsit", en: "Calcite", enAliases: [], tr: ["Kalsit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kan-tasi", en: "Bloodstone", enAliases: ["Heliotrope"], tr: ["Kan Taşı","HELİOTROPE"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kaplan-demiri", en: "Tiger Iron", enAliases: [], tr: ["Kaplan Demiri"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kaplan-gozu", en: "Tiger's Eye", enAliases: ["Tiger eye","Tigers Eye"], tr: ["Kaplan Gözü","KAPLAN GÖZÜ (TİGERAUGE)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kar-tanesi-obsidyen", en: "Snowflake Obsidian", enAliases: [], tr: ["Kar Tanesi Obsidyen"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "karneol", en: "Carnelian", enAliases: ["Cornelian"], tr: ["Karneol","KARNELYAN AKİK","KARNELYAN"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "karpuz-turmalin", en: "Watermelon Tourmaline", enAliases: [], tr: ["Karpuz Turmalin"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kasiterit", en: "Cassiterite", enAliases: [], tr: ["Kasiterit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kavansit", en: "Cavansite", enAliases: [], tr: ["Cavansit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kehribar", en: "Amber", enAliases: [], tr: ["Kehribar"], ambiguousTr: true }, // i18n-ignore: kanonik taş adı verisi
  { id: "kernit", en: "Kernite", enAliases: [], tr: ["Kernit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kiastolit", en: "Chiastolite", enAliases: ["Cross stone"], tr: ["Kiastolit","KİASTOLİT (CHİASTOLİTH)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kirmizi-jasper", en: "Red Jasper", enAliases: [], tr: ["Kırmızı Jasper"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "klinoklor", en: "Clinochlore", enAliases: [], tr: ["Klinoklor","KLİNOCHLOR"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "klinoptilolit", en: "Clinoptilolite", enAliases: [], tr: ["Klinoptilolit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "klorit", en: "Chlorite Group", enAliases: ["Chlorites"], tr: ["Kloritler","KLORİTLER (CHLORİTE)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kopal", en: "Copal", enAliases: [], tr: ["Kopal"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kovelin", en: "Covellite", enAliases: ["Covelline"], tr: ["Kovelin","COVELLİN"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kreedit", en: "Creedite", enAliases: [], tr: ["Kreedit","CREEDİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "krizoberil-ve-aleksandrit", en: "Chrysoberyl and Alexandrite", enAliases: ["Chrysoberyl","Cymophane"], tr: ["Krizoberil ve Aleksandrit","(CHRYSOBERYLL VE ALEXANDRİT)","KRİZOBERİL VE ALEXANDRİTE"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "krizokola", en: "Chrysocolla", enAliases: [], tr: ["Krizokola","KRİZOKOL"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "krizopraz", en: "Chrysoprase", enAliases: ["Chrysoprasus"], tr: ["Krizopraz","KRİSOPRAZ"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "krizotil", en: "Chrysotile", enAliases: ["White asbestos"], tr: ["Krizotil","KRİZOTİL (CHRYSOTİL)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "krokoit", en: "Crocoite", enAliases: [], tr: ["Krokoit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kukurt", en: "Sulfur", enAliases: ["Sulphur"], tr: ["Kükürt"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kunzit", en: "Kunzite", enAliases: [], tr: ["Kunzit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kuprit", en: "Cuprite", enAliases: [], tr: ["Kuprit","KUBRİT (CUPRİTE)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kuvars", en: "Quartz", enAliases: [], tr: ["Kuvars"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "kyanit", en: "Kyanite", enAliases: ["Disthene"], tr: ["Kyanit","KYANİT (DİSTHEN)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "labradorit", en: "Labradorite", enAliases: ["Spectrolite (Finlandiya ticari)"], tr: ["Labradorit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "lapis-lazuli", en: "Lapis Lazuli", enAliases: ["Lapis"], tr: ["Lapis Lazuli","LAPİSLAZULİ"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "larimar", en: "Larimar", enAliases: ["Blue pectolite"], tr: ["Larimar"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "lazulit", en: "Lazulite", enAliases: [], tr: ["Lazulit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "lepidolit", en: "Lepidolite", enAliases: [], tr: ["Lepidolit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "libya-col-cami", en: "Libyan Desert Glass", enAliases: [], tr: ["Libya Çöl Camı","LİBYALI ÇÖL CAMI"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "limonit", en: "Limonite", enAliases: [], tr: ["Limonit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "losit", en: "Leucite", enAliases: [], tr: ["Lösit","LEUCİT (LÖSİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "magnezit", en: "Magnesite", enAliases: [], tr: ["Magnezit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "malakit", en: "Malachite", enAliases: [], tr: ["Malakit","MALAHİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "manyetit", en: "Magnetite", enAliases: ["Lodestone"], tr: ["Manyetit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "markasit", en: "Marcasite", enAliases: [], tr: ["Markasit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "mavi-dantel-akik", en: "Blue Lace Agate", enAliases: [], tr: ["Mavi Dantel Akik"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "mavi-kalsedon", en: "Blue Chalcedony", enAliases: [], tr: ["Mavi Kalsedon"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "mercan", en: "Coral", enAliases: [], tr: ["Mercan","MERCAN (KORALLE)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "mimetit", en: "Mimetite", enAliases: [], tr: ["Mimetit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "moldavit", en: "Moldavite", enAliases: ["Vltavín"], tr: ["Moldavit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "molibdenit", en: "Molybdenite", enAliases: [], tr: ["Molibdenit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "mookaite-jasper", en: "Mookaite", enAliases: ["Mookaite Jasper","Mook jasper"], tr: ["Mookaite Jasper","MOOKAİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "moqui", en: "Moqui Marbles", enAliases: ["Moqui balls"], tr: ["Moqui Mermerleri","MOQUİ MARBLES","MOQUİ MERMERLERİ ( MOQUI MARBLES)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "morganit", en: "Morganite", enAliases: ["Pink beryl"], tr: ["Morganit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "nefrit", en: "Nephrite", enAliases: ["Nephrite jade"], tr: ["Nefrit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "obsidyen", en: "Obsidian", enAliases: [], tr: ["Obsidyen"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "ojit", en: "Augite", enAliases: [], tr: ["Ojit","OJİT (AUGİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "oklaz", en: "Euclase", enAliases: [], tr: ["Öklaz","ÖKLAZ (EUKLAS)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "olivin", en: "Olivine", enAliases: [], tr: ["Olivin"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "oniks", en: "Onyx", enAliases: [], tr: ["Oniks"], ambiguousTr: true }, // i18n-ignore: kanonik taş adı verisi
  { id: "oniks-mermer", en: "Onyx Marble", enAliases: ["Banded calcite","Mexican onyx"], tr: ["Oniks Mermer"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "opal", en: "Opal", enAliases: [], tr: ["Opal"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "orpiment", en: "Orpiment", enAliases: ["Auripigment"], tr: ["Auripigment"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "ortoklaz", en: "Orthoclase", enAliases: [], tr: ["Ortoklaz","ORTHOKLAS"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "pektolit", en: "Pectolite", enAliases: [], tr: ["Pektolit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "pembe-turmalin", en: "Pink Tourmaline", enAliases: ["Rubellite (koyu pembe-kırmızı)"], tr: ["Pembe Turmalin"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "peridot", en: "Peridot", enAliases: ["Chrysolite","Olivine (gem)"], tr: ["Peridot","PERİDOT (OLİVİN, KRYSOTİL)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "petalit", en: "Petalite", enAliases: [], tr: ["Petalit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "pietersit", en: "Pietersite", enAliases: ["Tempest stone"], tr: ["Pietersit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "pirit", en: "Pyrite", enAliases: ["Fool's gold"], tr: ["Pirit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "pirolusit", en: "Pyrolusite", enAliases: [], tr: ["Pirolusit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "piromorfit", en: "Pyromorphite", enAliases: [], tr: ["Piromorfit","PİROMORFİT (PYROMORPHİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "pirop", en: "Pyrope", enAliases: ["Pyrope garnet"], tr: ["Pirop","PYROP (Ateşli silah)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "prasem", en: "Prase", enAliases: [], tr: ["Prasem"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "prehnit", en: "Prehnite", enAliases: [], tr: ["Prehnit","PREHMİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "purpurit", en: "Purpurite", enAliases: [], tr: ["Purpurit","MORPURİT (PURPURİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "realgar", en: "Realgar", enAliases: [], tr: ["Realgar"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "rihterit", en: "Richterite", enAliases: [], tr: ["Rihterit","RİCHTERİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "riyolit", en: "Rhyolite", enAliases: [], tr: ["Riyolit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "rodokrozit", en: "Rhodochrosite", enAliases: [], tr: ["Rodokrozit","RODOKROZİT (RHODOKROZİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "rodonit", en: "Rhodonite", enAliases: [], tr: ["Rodonit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "rutil", en: "Rutile", enAliases: [], tr: ["Rutil"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "rutilli-kuvars", en: "Rutilated Quartz", enAliases: ["Rutile quartz","Venus hair"], tr: ["Rutilli Kuvars","RUTİL KUVARS"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "safir", en: "Sapphire", enAliases: [], tr: ["Safir"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "sahin-gozu", en: "Hawk's Eye", enAliases: ["Falcon's eye","Falkenauge"], tr: ["Şahin Gözü","ŞAHİN GÖZÜ (FALKENAUGE)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "sarder", en: "Sard", enAliases: [], tr: ["Sarder"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "sardoniks", en: "Sardonyx", enAliases: [], tr: ["Sardoniks"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "selenit", en: "Selenite", enAliases: [], tr: ["Selenit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "selestit", en: "Celestite", enAliases: ["Celestine"], tr: ["Selestit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "selit", en: "Scheelite", enAliases: [], tr: ["Şelit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "sepiyolit", en: "Sepiolite", enAliases: ["Meerschaum","Lületaşı"], tr: ["Sepiyolit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "septaryen", en: "Septarian", enAliases: ["Septarian nodule","Dragon stone"], tr: ["Septaryen","SEPTERYEN (SEPTARİE)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "serafinit", en: "Seraphinite", enAliases: [], tr: ["Serafinit","SERAPHİNİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "serusit", en: "Cerussite", enAliases: [], tr: ["Serüsit","SERÜSİT (CERUSSİT)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "siderit", en: "Siderite", enAliases: [], tr: ["Siderit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "silimanit", en: "Sillimanite", enAliases: ["Fibrolite"], tr: ["Silimanit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "sitrin", en: "Citrine", enAliases: [], tr: ["Sitrin"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "siyah-obsidyen", en: "Black Obsidian", enAliases: [], tr: ["Siyah Obsidyen","OBSİDYEN (SİYAH)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "siyah-turmalin", en: "Black Tourmaline", enAliases: ["Schorl"], tr: ["Siyah Turmalin","TURMALİN (SİYAH)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "skapolit", en: "Scapolite", enAliases: [], tr: ["Skapolit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "smitsonit", en: "Smithsonite", enAliases: [], tr: ["Smitsonit","SMİTHSONİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "sodalit", en: "Sodalite", enAliases: [], tr: ["Sodalit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "spektrolit", en: "Spectrolite", enAliases: [], tr: ["Spektrolit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "spinel", en: "Spinel", enAliases: [], tr: ["Spinel","SPİNELL"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "staurolit", en: "Staurolite", enAliases: ["Fairy cross"], tr: ["Staurolit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "steatit", en: "Steatite", enAliases: ["Soapstone","Talc"], tr: ["Steatit (Talk)","STEATİT (TALK, SPECKSTEİN)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "stihtit", en: "Stichtite", enAliases: [], tr: ["Stihtit","STİCHTİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "stronsiyanit", en: "Strontianite", enAliases: [], tr: ["Stronsiyanit","STRONTİANİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "sugilit", en: "Sugilite", enAliases: [], tr: ["Sugilit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "sungit", en: "Shungite", enAliases: [], tr: ["Şungit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "tanzanit", en: "Tanzanite", enAliases: [], tr: ["Tanzanit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "taslasmis-odun", en: "Petrified Wood", enAliases: ["Silicified wood","Fossil wood"], tr: ["Taşlaşmış Odun","SİLİSLEŞMİŞ AĞAÇ (VERKİESELTES HOLZ)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "thulit", en: "Thulite", enAliases: [], tr: ["Thulit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "titanit", en: "Titanite", enAliases: ["Sphene"], tr: ["Titanit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "topaz", en: "Topaz", enAliases: [], tr: ["Topaz"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "tremolit", en: "Tremolite", enAliases: [], tr: ["Tremolit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "tugtupit", en: "Tugtupite", enAliases: [], tr: ["Tugtupit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "turkuaz", en: "Turquoise", enAliases: ["Firuze (TR eski)"], tr: ["Turkuaz","TURKUAZ (TÜRKİS)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "turmalinli-kuvars", en: "Tourmalinated Quartz", enAliases: [], tr: ["Turmalinli Kuvars"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "uleksit", en: "Ulexite", enAliases: ["TV stone"], tr: ["Uleksit","ULEXİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "unakit", en: "Unakite", enAliases: ["Epidotized granite"], tr: ["Unakit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "vanadinit", en: "Vanadinite", enAliases: [], tr: ["Vanadinit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "varisit", en: "Variscite", enAliases: [], tr: ["Varisit","VARİSCİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "vezuvyan", en: "Vesuvianite", enAliases: ["Idocrase"], tr: ["Vezüvyan","VESUVİAN"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "villiaumit", en: "Villiaumite", enAliases: [], tr: ["Villiaumit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "vivianit", en: "Vivianite", enAliases: [], tr: ["Vivianit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "volframit", en: "Wolframite", enAliases: [], tr: ["Volframit","WOLFRAMİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "vollastonit", en: "Wollastonite and Bustamite", enAliases: [], tr: ["Vollastonit ve Bustamit","WOLLASTONİT VE BUSTAMİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "vulfenit", en: "Wulfenite", enAliases: [], tr: ["Vulfenit","WULFENİT"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "yakut", en: "Ruby", enAliases: [], tr: ["Yakut"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "yesil-turmalin", en: "Green Tourmaline", enAliases: ["Verdelite"], tr: ["Yeşil Turmalin"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "yosun-akik", en: "Moss Agate", enAliases: [], tr: ["Yosun Akik","MOOSCHAT (YOSUN AKİK)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "zeolit", en: "Zeolites", enAliases: [], tr: ["Zeolitler"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "zinkit", en: "Zincite", enAliases: [], tr: ["Zinkit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "zinober", en: "Cinnabar", enAliases: ["Cinnabarite"], tr: ["Zinober","CİNNABARİT /ZİNOBARİT (ZİNOBER)"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "zirkon", en: "Zircon", enAliases: [], tr: ["Zirkon"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "zoisit", en: "Zoisite", enAliases: [], tr: ["Zoisit"] }, // i18n-ignore: kanonik taş adı verisi
  { id: "zumrut", en: "Emerald", enAliases: [], tr: ["Zümrüt"] }, // i18n-ignore: kanonik taş adı verisi
];
