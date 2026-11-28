/**
 * Şifa Rehberi F3 testleri — onaylı F2 prototipinin SENTETİK örnek çalışma alanı (data.js seed() ile aynı içerik).
 * Gerçek kayıt değildir; yalnız izole test projesindeki ZZ test kullanıcısına yazılır. Görsel: testte PNG yüklenir.
 */
const T = "2026-11-22T09:30:00.000Z";
const T0 = "2026-11-18T14:05:00.000Z";
const T1 = "2026-11-21T10:40:00.000Z";
const note = (id, title, html, cls, createdAt, updatedAt, extra = {}) => ({ id, title, html, cls, sources: [], images: [], boxes: [], createdAt, updatedAt, deletedAt: null, ...extra });
const p = (t) => `<p>${t}</p>`;

export function seedState() {
  return {
    topics: [
      { id: "t-akciger", title: "Akciğer", createdAt: T, deletedAt: null },
      { id: "t-migren", title: "Migren", createdAt: T, deletedAt: null },
      { id: "t-oksuruk", title: "Şiddetli Öksürük", createdAt: T, deletedAt: null },
      { id: "t-carpinti", title: "Çarpıntı", createdAt: T, deletedAt: null },
      { id: "t-ishal", title: "İshal", createdAt: T, deletedAt: null },
      { id: "t-odem", title: "Ödem", createdAt: T, deletedAt: null },
      { id: "t-uyku", title: "Uyku Bozukluğu", createdAt: T, deletedAt: null },
      { id: "t-cilt", title: "Cilt Kuruluğu", createdAt: T, deletedAt: null },
      { id: "t-dalak", title: "Dalak", createdAt: T, deletedAt: null },
      { id: "t-eski", title: "Eski Deneme Konusu", createdAt: T, deletedAt: "2026-11-20T10:00:00.000Z" },
    ],
    nodes: [
      { id: "n-bronsit", rootId: "t-akciger", parentId: null, title: "Bronşit", templateKey: null, order: 1, deletedAt: null },
      { id: "n-astim", rootId: "t-akciger", parentId: null, title: "Astım", templateKey: null, order: 2, deletedAt: null },
      { id: "n-alveol", rootId: "t-akciger", parentId: "n-bronsit", title: "Akut Bronşit", templateKey: null, order: 1, deletedAt: null },
      { id: "n-ak-uyg", rootId: "t-akciger", parentId: null, title: "Uygulamalar / Yöntemler", templateKey: "grup:uygulamalar", order: 0, deletedAt: null },
      { id: "n-ak-bitkisel", rootId: "t-akciger", parentId: "n-ak-uyg", title: "Bitkisel Yöntemler", templateKey: "konu:bitkisel", order: 0, deletedAt: null },
      { id: "n-ok-bitkisel-g", rootId: "t-oksuruk", parentId: null, title: "Uygulamalar / Yöntemler", templateKey: "grup:uygulamalar", order: 0, deletedAt: null },
      { id: "n-ok-bitkisel", rootId: "t-oksuruk", parentId: "n-ok-bitkisel-g", title: "Bitkisel Yöntemler", templateKey: "konu:bitkisel", order: 0, deletedAt: null },
      { id: "n-mig-tetik", rootId: "t-migren", parentId: null, title: "Tetikleyiciler", templateKey: null, order: 1, deletedAt: null },
      { id: "n-eski-alt", rootId: "t-akciger", parentId: null, title: "Silinmiş Deneme Başlığı", templateKey: null, order: 9, deletedAt: "2026-11-21T08:00:00.000Z", deleteBatch: "b-eski-alt" },
    ],
    notes: {
      "t-akciger": [note("g-ak1", "Genel bakış", p("Akciğer sağlığıyla ilgili genel araştırma notlarım. Solunum yolları, mevsim geçişleri ve bağışıklık."), "uzman", T0, T)],
      "n-bronsit": [
        note("g-br1", "Bronşit nedir?", p("Bronşit, bronş tüplerinin iltihaplanmasıdır. Kuru ve balgamlı öksürükle seyredebilir.") + p("Kış aylarında sıklaşır; ılık buhar ve bol sıvı rahatlatıcıdır."), "bilimsel", T0, T, {
          sources: [
            { id: "s1", title: "Acute bronchitis: a review", authors: "Örnek A., Deneme B.", year: "2019", doi: "10.1001/jama.2019.0001", url: "" },
            { id: "s2", title: "Solunum yolu hastalıklarında bitkisel destek", authors: "", year: "2021", doi: "", url: "https://ornek.example/bitkisel" },
          ],
          images: [{ id: "g1", src: "png:bronsit", caption: "Bronş yapısı — sentetik örnek görsel" }],
        }),
        note("g-br2", "Danışan gözlemleri", p("Gece öksürüğünde başın yüksekte tutulması rahatlama sağladı (sentetik örnek)."), "uzman", T1, T1),
      ],
      "n-ak-bitkisel": [note("g-bk1", "Zencefil ve kekik", p("Zencefil ve kekik çayı geleneksel olarak kullanılır. Taze zencefil rendelenip ılık suyla demlenir."), "geleneksel", T0, T)],
      "n-ok-bitkisel-g": [note("g-okg1", "Eski grup notu", p("Öksürükte genel uygulama gözlemlerim (grup başlığına yazılmış eski not)."), "uzman", T0, T)],
      "n-ok-bitkisel": [note("g-ok1", "Ihlamur karışımı", p("Ihlamur ve zencefil karışımı. Bal ile tatlandırılabilir."), "geleneksel", T0, T)],
      "n-mig-tetik": [note("g-mg1", "Tetikleyici günlüğü", p("Uykusuzluk, açlık ve parlak ışık tetikleyici olabilir. Günlük tutmak faydalı."), "uzman", T0, T)],
      "t-carpinti": [note("g-cr1", "Magnezyum okumaları", p("Kalp ritmi ve magnezyum ilişkisi üzerine okumalar."), "bilimsel", T0, T)],
    },
    links: [{ a: "t-akciger", b: "t-oksuruk" }],
  };
}
