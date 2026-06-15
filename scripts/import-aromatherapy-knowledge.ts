#!/usr/bin/env npx tsx
/**
 * Aromaterapi Bilgi Bankası Import Scripti
 *
 * Kaynak: Aromaterapi.xlsx
 *   - Genel Bilgi sekmesi → 5 makale
 *   - Uçucu Yağ Elde Etme Yöntemleri → 4 makale
 *   - Uçucu Yağların Etki Mekanizması → boş, import yok
 *
 * Kullanım:
 *   npx tsx scripts/import-aromatherapy-knowledge.ts --dry
 *   npx tsx scripts/import-aromatherapy-knowledge.ts --write
 */

import * as path from "path";
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";

// -------------------------------------------------------
// .env.local yükle
// -------------------------------------------------------
function loadEnvLocal(): void {
  const p = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

const DRY = !process.argv.includes("--write");

// -------------------------------------------------------
// Makale verisi — Excel içeriğinden derlendi
// -------------------------------------------------------

type ArticleInput = {
  tenant_id: null;
  category: string;
  sort_order: number;
  title: string;
  summary: string;
  content: string;
  source: string;
  is_active: true;
};

const ARTICLES: ArticleInput[] = [

  // ── Genel Bilgi sekmesi ──────────────────────────────────────

  {
    tenant_id: null,
    category: "genel",
    sort_order: 1,
    title: "Uçucu Yağ Nedir?",
    summary:
      "Bitkilerden elde edilen, oda sıcaklığında sıvı halde olan, uçucu ve kuvvetli kokulu doğal bir ürün. Esansiyel yağ ya da eterik yağ olarak da bilinir.",
    content: `Uçucu yağ, bitkilerden elde edilen, oda sıcaklığında sıvı halde olan, kolaylıkla uçucu olan, genellikle renksiz veya açık sarı renkli, kuvvetli kokulu, doğal bir üründür. Güzel kokulu olmasından dolayı esansiyel yağ ya da eterik yağ da denilmektedir.

Bazı bitkiler var ki, yaradışlarında aynı anda iki önemli özellik bir arada bulunuyor. Bu bitkilerden hem buhar distilasyonu ile uçucu yağ üretilebiliyor, hem de soğuk pres yöntemiyle sabit yağ üretilebiliyor.

Bu bitkiler; Babçi, Çemen otu, Ebegümeci, Greyfurt, Hardal, Havuç, Kahve, Karahalile, Kinoa, Limon, Mandalina, Menengiç, Misk Adaçayı, Pamuk, Portakal, Sakız Ağacı, Sığla, Sığırkuyruğu, Soğan, Üzerlik ve Yabani İğde örnek olarak verilebilir.`,
    source: "Aromaterapi.xlsx — Genel Bilgi",
    is_active: true,
  },

  {
    tenant_id: null,
    category: "kimyasal-bilesimler",
    sort_order: 1,
    title: "Temel Kimyasal Bileşenler",
    summary:
      "Uçucu yağlardaki terpenler, fenoller, esterler, aldehitler ve ketonlar — her bileşenin terapötik rolleri ve etki mekanizmaları.",
    content: `Uçucu yağların temel bileşenleri arasında terpenler, fenoller, esterler, aldehitler ve ketonlar sayılabilir. Bu bileşenlerin her biri uçucu yağlara özgü kokuyu ve terapötik özelliklerini belirler.

Terpenler
Uçucu yağların en büyük kısmını oluşturan terpenler, bitkilerin büyüme ve gelişimi için çok önemlidir. Limonene, pinen ve linalool gibi terpenler, antiseptik, anti-inflamatuar ve antioksidan özelliklere sahiptir.

Fenoller
Karvakrol, timol ve eugenol gibi fenoller, güçlü antibakteriyel, antifungal ve antiviral özelliklere sahiptir. Bu bileşenler, solunum yolu enfeksiyonları ve cilt problemlerinde sıklıkla kullanılır.

Esterler
Linalil asetat, benzil benzoat gibi esterler, genellikle tatlı ve meyvemsi bir kokuya sahiptir. Bu bileşenler kas gevşetici, yatıştırıcı ve anti-enflamatuar özelliklere sahiptir.

Aldehitler
Sitral, sinamaldehit gibi aldehitler, güçlü bir kokuya ve antiseptik özelliğe sahiptir. Bu bileşenler, sinir sistemini uyarıcı ve anti-inflamatuar etkileriyle bilinir.

Ketonlar
Kamfor, menton gibi ketonlar, güçlü bir kokuya sahip olup antiseptik, analjezik ve anti-inflamatuar özelliklere sahiptir.`,
    source: "Aromaterapi.xlsx — Genel Bilgi",
    is_active: true,
  },

  {
    tenant_id: null,
    category: "etki-mekanizmasi",
    sort_order: 1,
    title: "Vücut Sistemi Etkileri",
    summary:
      "Sinir sistemi, endokrin sistem ve bağışıklık sistemi üzerindeki etkileri — uçucu yağların fizyolojik etki mekanizması.",
    content: `Uçucu yağların vücut üzerindeki etkileri, bileşimlerindeki kimyasal maddelerin ve kullanım yöntemlerinin bir kombinasyonudur. Bu etkiler, genellikle sinir sistemi, endokrin ve bağışıklık sistemi üzerinde gerçekleşir.

Sinir Sistemi
Aromatik yağlar koku reseptörlerini uyardığında duygusal durum, uyku, stres ve anksiyete gibi psikolojik süreçler üzerinde düzenleyici etkileri olur. Lavanta yağı gibi bazı yağlar sakinleştirici ve uykuyu düzenleyici etkiler gösterirken, nane yağı gibi diğerleri uyarıcı ve enerji verici etkiler gösterebilir.

Endokrin Sistem
Uçucu yağlar, hormon dengesini etkileyerek vücuttaki çeşitli fizyolojik süreçleri düzenleyebilir. Örneğin; bazı uçucu yağlar kortizol seviyesini düşürerek stresin azaltılmasına yardımcı olur.

Bağışıklık Sistemi
Uçucu yağlar, antibakteriyel, antiviral ve antifungal özellikleri sayesinde bağışıklık sistemini güçlendirir ve enfeksiyonlara karşı koruma sağlar. Okaliptus, nane ve tarçın yağları bağışıklık sistemini güçlendirmeye yardımcı olur. Bu yağlar difüzörde kullanılabilir veya banyo suyuna eklenebilir.`,
    source: "Aromaterapi.xlsx — Genel Bilgi",
    is_active: true,
  },

  {
    tenant_id: null,
    category: "klinik-uygulama",
    sort_order: 1,
    title: "Fiziksel Sağlık Uygulamaları",
    summary:
      "Ağrı yönetimi, solunum yolu rahatsızlıkları ve cilt problemleri için önerilen yağlar ve uygulama yöntemleri.",
    content: `Uçucu yağlar, çeşitli fiziksel sağlık sorunlarında tamamlayıcı bir destek olarak kullanılabilir.

Ağrı Yönetimi (Migren, Kas Ağrıları)
Lavanta, papatya, biberiye ve okaliptüs yağları sıklıkla kullanılır. Bu yağlar masaj yoluyla ağrıyan bölgeye uygulanabilir veya difüzörde buharlaştırılabilir.

Solunum Yolu Rahatsızlıkları (Astım, Bronşit)
Okaliptüs, nane, lavanta ve anason yağları, buhar banyolarında veya difüzörde kullanılarak solunum yollarını açmaya yardımcı olabilir.

Cilt Problemleri (Egzema, Akne)
Çay ağacı, lavanta, papatya ve nergis yağları, antiseptik ve anti-inflamatuar özellikleri sayesinde cilt problemlerine iyi gelir. Bu yağlar, taşıyıcı yağlarla karıştırılarak doğrudan cilde uygulanabilir.`,
    source: "Aromaterapi.xlsx — Genel Bilgi",
    is_active: true,
  },

  {
    tenant_id: null,
    category: "klinik-uygulama",
    sort_order: 2,
    title: "Psikolojik Sağlık Uygulamaları",
    summary:
      "Stres ve anksiyete yönetimi, uyku bozuklukları, depresyon ve odaklanma güçlüğü için aromaterapi protokolleri.",
    content: `Uçucu yağlar, psikolojik sağlığı destekleme konusunda güçlü bir etki alanına sahiptir.

Stres ve Anksiyete Yönetimi
Lavanta, bergamot, ylang ylang ve sandal ağacı yağları, sakinleştirici ve rahatlatıcı etkileriyle stres ve anksiyeteyi azaltmaya yardımcı olur. Bu yağlar difüzörde kullanılabilir veya masaj yağlarına eklenebilir.

Uyku Bozuklukları
Lavanta, papatya, ylang ylang ve sandal ağacı yağları, uyku kalitesini artırmaya ve uykuya dalmayı kolaylaştırmaya yardımcı olur. Bu yağlar yastıklara birkaç damla damlatılarak veya difüzörde kullanılarak uygulanabilir.

Depresyon
Bergamot, ylang ylang ve portakal yağları, depresyon belirtilerini hafifletmeye yardımcı olur. Bu yağlar, aromatik masaj veya aromatik banyo yoluyla kullanılabilir.

Odaklanma ve Konsantrasyon Güçlüğü
Biberiye, bergamot ve limon yağları, zihni canlandırıcı ve odaklanmayı artırıcı etkileriyle bilinir. Bu yağlar çalışma ortamında difüzörde kullanılabilir.`,
    source: "Aromaterapi.xlsx — Genel Bilgi",
    is_active: true,
  },

  // ── Elde Etme Yöntemleri sekmesi ────────────────────────────

  {
    tenant_id: null,
    category: "elde-etme",
    sort_order: 1,
    title: "Distilasyon Yöntemleri",
    summary:
      "Buhar ve su yardımıyla uçucu yağları bitkisel materyalden ayıran yöntemler — en yaygın kullanılan uçucu yağ üretim teknikleri.",
    content: `Distilasyon, buhar veya suyun yardımıyla uçucu yağları bitkisel materyalden ayıran en yaygın yöntem grubudur.

Su Distilasyonu
Bitki materyali doğrudan suya batırılır ve kaynatılır. Buharla birlikte yükselen uçucu yağ, soğutucuda yoğunlaşarak ayrılır.

Buhar Distilasyonu
Bitkinin altından geçirilen buhar, uçucu yağı taşır. En yaygın kullanılan distilasyon yöntemidir. Lavanta, gül, biberiye gibi pek çok yağ bu yöntemle elde edilir.

Hidrodifüzyon
Buhar, bitki materyalinin üstünden verilir. Yerçekimi etkisiyle yağ aşağı doğru akar. Geleneksel buhar distilasyonuna kıyasla daha hızlı işlem süresi sağlar.

Vakum Distilasyonu
Düşürülmüş basınçla daha düşük sıcaklıkta distilasyon yapılır. Isıya duyarlı bileşenlerin bozulmasını önler.

Fraksiyonel Distilasyon
Farklı kaynama noktalarına sahip bileşenleri ayrı ayrı toplamak için kullanılır. Yüksek saflıkta fraksiyonlar elde edilir.

Su-Buhar Distilasyon
Su ve buharın birlikte kullanıldığı karma bir yöntemdir. Bazı bitkilerde verimi artırır.

Mikrodalga Destekli Distilasyon
Mikrodalga enerjisiyle bitki hücrelerinin hızla ısıtılıp yağın açığa çıkarılması sağlanır. Geleneksel yöntemlere göre daha kısa süre gerektirir.

Distilasyon Fermantasyon
Hasat öncesi veya sonrasında kısmen fermente edilen materyalden distilasyon yapılır. Enzimatik işlemler bazı yağların verimini ve kalitesini artırır.`,
    source: "Aromaterapi.xlsx — Uçucu Yağ Elde Etme Yöntemleri",
    is_active: true,
  },

  {
    tenant_id: null,
    category: "elde-etme",
    sort_order: 2,
    title: "Ekstraksiyon Yöntemleri",
    summary:
      "Maserasyon, infüzyon, perkolasyon, anfloraj ve dekoksiyon — çözücü veya yağ ortamı kullanarak aromatik bileşenlerin elde edilmesi.",
    content: `Ekstraksiyon yöntemleri, çözücü veya yağ ortamı kullanarak aromatik bileşenlerin bitkiden ayrılmasını sağlar.

Maserasyon
Bitki materyali taşıyıcı yağ içinde belirli bir süre bekletilir. Bitki bileşenleri yağa geçer. En eski ve doğal yöntemlerden biridir. Aynısefa, lavanta ve papatya gibi bitkiler için sıkça kullanılır.

İnfüzyon
Maserasyon gibi ancak genellikle daha kısa süreli ve ısıtma içerebilir. Çiçek, yaprak gibi nazik bitki parçaları için tercih edilir.

Perkolasyon
Çözücü, bitki materyalinin içinden yavaşça geçirilir. Sürekli taze çözücü kullanımı sayesinde yüksek verim elde edilir.

Anfloraj
Kokusuz yağ veya yağla kaplanmış cam plakaların üzerine taze çiçekler yerleştirilir. Çiçeklerden salınan uçucu bileşenler yağa geçer. Isıya duyarlı hassas çiçekler (yasemin, manolya, tuberöz) için tercih edilen geleneksel bir yöntemdir.

Dekoksiyon
Bitki materyali suda kaynatılır. Genellikle kök, kabuk ve sert parçalar için kullanılır.`,
    source: "Aromaterapi.xlsx — Uçucu Yağ Elde Etme Yöntemleri",
    is_active: true,
  },

  {
    tenant_id: null,
    category: "elde-etme",
    sort_order: 3,
    title: "Mekanik Yöntemler",
    summary:
      "Isı veya kimyasal madde kullanmaksızın fiziksel baskıyla uçucu yağ elde etme — narenciye kabuklarında yaygın.",
    content: `Mekanik yöntemler, ısı veya kimyasal madde kullanmaksızın fiziksel baskıyla uçucu yağın elde edilmesidir. Özellikle narenciye kabuklarından yağ elde etmede yaygın olarak kullanılır.

Sıkma Yöntemi (Soğuk Pres)
Meyve kabuğu veya tohum, pres makinesiyle fiziksel baskıya tabi tutulur. Isı uygulanmaz; bu nedenle narenciye yağlarının (limon, portakal, bergamot) doğal aroması ve bileşimi korunur. Elde edilen yağ, distilasyon yağlarından farklı olarak uçucu olmayan maddeleri de içerebilir.

Çizme Yöntemi (Scarification)
Meyve kabuğu pürüzlü bir yüzeye sürtülerek uçucu yağ kesecikleri çizilir ve kırılır. Geleneksel bir yöntemdir; özellikle Akdeniz ülkelerinde küçük ölçekli üretimde kullanılır.`,
    source: "Aromaterapi.xlsx — Uçucu Yağ Elde Etme Yöntemleri",
    is_active: true,
  },

  {
    tenant_id: null,
    category: "elde-etme",
    sort_order: 4,
    title: "Gelişmiş Ekstraksiyon Yöntemleri",
    summary:
      "Basınçlı, mikrodalga destekli, süperkritik CO₂ ve ultrason destekli yöntemler — modern teknoloji ile yüksek saflık ve verim.",
    content: `Gelişmiş yöntemler, geleneksel yöntemlerle elde edilemeyen saflık ve verim düzeylerine ulaşmak için modern teknoloji kullanır.

Basınçla Ekstraksiyon (BSE)
Yüksek basınç altında çözücü kullanılarak gerçekleştirilen ekstraksiyon yöntemidir. Daha hızlı ve verimli sonuçlar sağlar.

Mikrodalga Destekli Solvent Ekstraksiyonu (MAE)
Mikrodalga enerjisi, çözücünün bitki hücrelerine penetrasyonunu hızlandırır. Kısa sürede yüksek verim elde edilir ve çözücü tüketimi azalır.

Süperkritik Akışkan Ekstraksiyonu (SFE)
CO₂ gibi gazlar, kritik sıcaklık ve basınç üzerinde "süperkritik" hale getirilir. Hem sıvı hem gaz özelliği taşıyan bu ortam mükemmel bir çözücü görevi görür. Çözücü kalıntısı bırakmayan, son derece saf ekstraktlar üretir. Gıda, kozmetik ve ilaç endüstrisinde yaygın kullanılır.

Ultrasan Destekli Ekstraksiyon (SAE)
Ultrasonik dalgalar bitki hücrelerine nüfuz ederek uçucu yağın daha hızlı çözücüye geçmesini sağlar. Daha düşük sıcaklıkta ve kısa sürede verimli ekstraksiyon yapılır.`,
    source: "Aromaterapi.xlsx — Uçucu Yağ Elde Etme Yöntemleri",
    is_active: true,
  },
];

// -------------------------------------------------------
// Dry-run çıktısı
// -------------------------------------------------------
function printDryRun(): void {
  const HR = "═".repeat(68);
  console.log(`\n${HR}`);
  console.log(`📚 Aromaterapi Bilgi Bankası Import — DRY-RUN`);
  console.log(HR);
  console.log(`  Toplam makale: ${ARTICLES.length}`);

  const byCat: Record<string, string[]> = {};
  for (const a of ARTICLES) {
    if (!byCat[a.category]) byCat[a.category] = [];
    byCat[a.category]!.push(a.title);
  }

  for (const [cat, titles] of Object.entries(byCat)) {
    console.log(`\n  Kategori: ${cat}`);
    for (const t of titles) console.log(`    ✅ ${t}`);
  }

  console.log(`\n  Detaylar:`);
  for (const a of ARTICLES) {
    console.log(`\n  ─── ${a.title} ───`);
    console.log(`    category   : ${a.category}  (sort: ${a.sort_order})`);
    console.log(`    summary    : ${a.summary.slice(0, 80)}…`);
    console.log(`    content    : ${a.content.length} karakter`);
    console.log(`    source     : ${a.source}`);
  }

  console.log(`\n${HR}`);
  console.log(`⚠️  DRY-RUN — production'a yazılmadı.`);
  console.log(`   Gerçek import: npx tsx scripts/import-aromatherapy-knowledge.ts --write`);
  console.log(`${HR}\n`);
}

// -------------------------------------------------------
// Production insert
// -------------------------------------------------------
async function insertAll(): Promise<void> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Supabase env vars eksik");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const HR = "═".repeat(68);
  console.log(`\n${HR}`);
  console.log(`📚 Aromaterapi Bilgi Bankası Import — ⚡ YAZMA MODU`);
  console.log(HR);

  // Önceki paylaşımlı kayıtları temizle (idempotent)
  const { error: delErr } = await sb
    .from("aromatherapy_knowledge_articles")
    .delete()
    .is("tenant_id", null);
  if (delErr) { console.error("Temizleme hatası:", delErr.message); process.exit(1); }
  console.log("  Önceki paylaşımlı kayıtlar temizlendi.");

  const { data, error } = await sb
    .from("aromatherapy_knowledge_articles")
    .insert(ARTICLES)
    .select("id, title");

  if (error) { console.error("Insert hatası:", error.message); process.exit(1); }

  console.log(`  Eklenen: ${data?.length ?? 0} makale ✅`);
  for (const r of data ?? []) console.log(`    ✅ ${r.title as string}`);

  // Doğrulama
  const { count } = await sb
    .from("aromatherapy_knowledge_articles")
    .select("*", { count: "exact", head: true })
    .is("tenant_id", null);
  console.log(`\n  DB doğrulama — toplam paylaşımlı kayıt: ${count ?? 0}`);
  console.log(`${HR}\n`);
}

// -------------------------------------------------------
// Çalıştır
// -------------------------------------------------------
if (DRY) {
  printDryRun();
} else {
  insertAll().catch(e => { console.error("Fatal:", e); process.exit(1); });
}
