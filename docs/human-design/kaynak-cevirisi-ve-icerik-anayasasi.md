# Human Design Kaynak Çevirisi ve İçerik Editörlüğü Anayasası

> **Durum:** Bağlayıcı / Kilitli
> **Kapsam:** Yaşam Sistemi™ içindeki Human Design profesyonel bilgi sistemi (uzman bilgi bankası, kaynak yönetimi, sadık çeviri, kaynaklandırılmış ana metin, danışan raporu içeriği).
> **Nitelik:** Bu doküman bir özet değildir. Human Design içerik ve çeviri sürecinin kalıcı, uygulanabilir kurallar bütünüdür. Kod, UI metni veya rapor içeriği bu belge ile çelişemez.

Bu belge, geliştirici ve editör tarafından **doğrudan uygulanabilir** olacak biçimde yazılmıştır. Aşağıdaki maddelerin hiçbiri kısaltılamaz, özetlenemez, bilimsel uyarıyla değiştirilemez, yeniden yorumlanamaz veya "daha güvenli görünsün" diye yumuşatılamaz.

---

## 1. Amaç ve Kapsam

Human Design modülü bir harita hesaplama motoru **değildir**. Uzman, Human Design haritasını dışarıdaki bir kaynaktan alır, görseli sisteme yükler ve Tip / Otorite / Profil / Tanımlılık / Merkezler / Kapılar / Kanallar bilgilerini manuel seçer veya girer. Bu ürün kararı kilitlidir.

Bu anayasanın amacı, Human Design bilgi bankasındaki içeriğin:

- kaynağa sadık kalmasını,
- kesinlik derecesini korumasını,
- teknik terminolojisini korumasını,
- her iddianın kaynağını izlenebilir tutmasını,
- farklı görüşleri birbirine karıştırmamasını,
- danışan raporunda kullanılabilecek profesyonel bir ana metne dönüşmesini

garanti etmektir.

Temel ilke: **"Ya doğru bilgi ya hiç."** Buradaki "doğru bilgi" yalnız "bilimsel olarak kanıtlanmış bilgi" demek değildir. Doğru bilgi; kaynağa sadık, kaynağı izlenebilir, doğru katmanda, doğru kesinlik derecesinde ve başka kaynaklarla karıştırılmamış bilgidir.

Her uzman kendi tenant alanında çalışır, kendi Human Design bilgisini yönetir, kendi uzman notlarını yazar ve başka uzmanların özel bilgilerini göremez. Normal Human Design modülünde "admin bilgisi uzmandan üstündür" biçiminde bir içerik hiyerarşisi kurulmaz.

---

## 2. İçerik Katmanlarının Kesin Ayrımı

Aşağıdaki katmanlar **kesinlikle** birbirine karıştırılmaz. Her katman ayrı amaca, ayrı yazım kuralına ve ayrı teknik alana sahiptir.

| Katman | Kısa tanım | Teknik alan (mevcut) |
|---|---|---|
| A. Kaynak Özgün Metni | Kaynağın orijinal dildeki metni | `human_design_knowledge_sources.original_text` |
| B. Sadık Türkçe Çeviri | Özgün metnin eksiksiz, en yakın anlam karşılığı | `human_design_knowledge_sources.faithful_translation_tr` |
| C. Kaynağa Özgü Not | Kaynağın terminolojisi/bağlamı/ekol farkı hakkında ayrı not | `human_design_knowledge_sources.source_specific_note` |
| D. Kaynaklandırılmış Ana Metin | Rapora hazır profesyonel ana metin | `human_design_knowledge_records.content` |
| E. Uzman Notu | Uzmanın kişisel görüşü / gözlemi | `human_design_knowledge_records.expert_notes` |
| F. Haklar ve Kullanım Metadatası | Telif/izin/dağıtım eksenleri | `rights_status`, `permission_reference`, `*_allowed` bayrakları |

**Terminoloji notu:** Kullanıcı arayüzündeki "Kaynaklandırılmış Ana Metin" etiketinin teknik karşılığı `content` alanıdır. Tarihsel olarak bu alanın kullanıcı etiketi **"Editöryal Özet"** idi; bu eski etiket, "özet" ve "serbest editöryal anlatım" çağrışımı yaptığı ve bu anayasanın ilkeleriyle çeliştiği için değiştirilmiştir. Teknik alan adı (`content`) korunmuştur; kolon yeniden adlandırılmamış, migration yapılmamıştır.

---

## 3. Kaynak Özgün Metni (Katman A)

Kaynağın orijinal dilindeki metnidir.

- Değiştirilmez.
- Düzeltilmez.
- Sadeleştirilmez.
- Sansürlenmez.
- Kaynakta hata olduğu düşünülse bile **sessizce düzeltilmez**.

Özgün metin, tüm diğer katmanların doğrulama zeminidir. Bozulursa izlenebilirlik kaybolur.

---

## 4. Sadık Türkçe Çeviri (Katman B)

Özgün metnin Türkçedeki **eksiksiz ve en yakın anlam** karşılığıdır.

Sadık çeviri:

- yorum içermez,
- açıklama içermez,
- sadeleştirme içermez,
- yeni bilgi içermez,
- bilimsel filtre içermez,
- kaynakta olmayan ihtimal içermez,
- kaynakta olmayan kesinlik içermez,
- kaynakta olmayan uyarı içermez,
- kaynağın metafizik veya sağlıkla ilgili ifadelerini yumuşatmaz.

Sadık çevirinin içine Kaynağa Özgü Not, Uzman Notu veya metadata sınıflandırması yazılmaz.

---

## 5. Kaynağa Özgü Not (Katman C)

Kaynağın terminolojisi, bağlamı, diğer kaynaklardan farkı, okul veya ekol özelliği hakkındaki ayrı nottur.

- Bu not sadık çevirinin içine yazılmaz.
- Kaynağın kendi metniymiş gibi sunulmaz.
- Kaynak claim'iyle karıştırılmaz.

---

## 6. Kaynaklandırılmış Ana Metin (Katman D)

Danışan raporunda veya uzman çalışma alanında kullanılabilecek profesyonel ana metindir. Varsayılan danışan raporu metnini bu alan besler.

Bu alan:

- **kısa özet değildir**,
- bilimsel doğrulama alanı değildir,
- farklı kaynakların ortalaması değildir,
- AI'nin serbest yorumu değildir.

Kaynak anlamını korumak için metnin uzun olması gerekiyorsa **uzun yazılır**. Kısa olsun diye anlam taşıyan bilgi budanmaz.

Her önemli cümle için şu soru cevaplanabilmelidir:

> "Bu cümlenin kaynak karşılığı nerede?"

Kaynak karşılığı bulunamayan cümle:

- Kaynaklandırılmış Ana Metne alınamaz,
- Uzman Notuna taşınabilir,
- veya doğrulama bekleyen taslak olarak tutulabilir.

**"Kaynak karşılığı", bilimsel ispat anlamına gelmez.** Kaynak karşılığı; ilgili yazarın, kitabın, eğitimin, pasajın veya sayfanın bu bilgiyi gerçekten ifade etmesi anlamına gelir.

Kaynağa atıf, iddiayı ihtimale dönüştürmez; yalnız iddianın sahibini gösterir. Örneğin "X kaynağına göre 17. Kapı kanser riski taşır." cümlesi iddiayı yumuşatmaz, yalnız kaynağını gösterir.

---

## 7. Uzman Notu (Katman E)

Uzmanın kişisel görüşü, mesleki gözlemi, deneyimi, danışanlarla ilgili yorumu ve kendi çalışma yaklaşımı bu alanda tutulur.

- Uzman notu kaynak bilgisiymiş gibi gösterilemez.
- **Varsayılan olarak rapora otomatik eklenmez.**
- Kaynaklandırılmış Ana Metin ile karıştırılmaz.

---

## 8. Haklar ve Kullanım Metadatası (Katman F)

Aşağıdaki haklar **ayrı ayrı** takip edilir:

- özgün metni saklama,
- sadık çeviri hazırlama ve saklama,
- özel uzman alanında kullanma,
- danışan raporunda kullanma,
- seçili uzmanlara dağıtma,
- kamusal veya ticari kullanım.

Kurallar:

- **Kaynak göstermek, kullanım izni anlamına gelmez.**
- İzin doğrulanmadıysa varsayılan durum: izin bekleniyor / belirsiz / dağıtıma kapalı olmalıdır (default-deny).
- Telif durumu `restricted`, `permission_pending` veya `unknown` iken rapor/uzman/ticari dağıtım bayrakları açılamaz. Bu kural veri katmanında da (CHECK) zorlanır.

---

## 9. Bilgi Kaybı Yasağı

Bu çalışma özet çıkarma değildir. Hiçbir anlam taşıyan bilgi çıkarılamaz.

Korunması gerekenler (sınırlayıcı olmayan liste):

- tanımlar,
- teknik ayrımlar,
- neden-sonuç ilişkileri,
- koşullar,
- istisnalar,
- örnekler,
- sayılar,
- isimler,
- kitap ve kaynak adları,
- sağlık ifadeleri,
- metafizik ifadeler,
- anlam taşıyan tekrarlar,
- kesinlik bildiren kelimeler,
- olumsuzluklar.

---

## 10. Yeniden Yazım Yasağı

"Aynı anlama geliyor" düşüncesiyle farklı cümle kurulamaz. Çünkü yeni cümle:

- kesinliği,
- kapsamı,
- vurguyu,
- nedenselliği,
- teknik anlamı,
- zamanı,
- koşulu

değiştirebilir.

Yeniden yazım, sadık çeviri veya kaynaklandırılmış ana metin için bir yöntem değildir.

---

## 11. Kesinlik Derecesinin Korunması

Kaynakta ne yazıyorsa çeviride ve ana metinde:

- aynı anlam,
- aynı kapsam,
- aynı kesinlik,
- aynı olumsuzluk,
- aynı neden-sonuç ilişkisi,
- aynı teknik terminoloji

korunur.

**Kesin ifade ihtimale çevrilemez. İhtimal ifadesi kesin hükme dönüştürülemez.**

Kesinlik karşılıkları (bağlama göre değerlendirilir, ama kesinlik derecesi değiştirilemez):

| Kaynak | Türkçe |
|---|---|
| is | -dır / -dir |
| causes | neden olur |
| carries a risk | risk taşır |
| indicates | gösterir / işaret eder |
| may | olabilir |
| can | -ebilir / -abilir |
| may be associated | ilişkilendirilebilir |
| often | sıklıkla |
| sometimes | bazen |
| always | her zaman |
| never | hiçbir zaman |

---

## 12. Teknik Terminolojinin Korunması

Human Design teknik terimleri tutarlı biçimde korunur.

| İngilizce | Türkçe |
|---|---|
| Gate | Kapı |
| Channel | Kanal |
| Center | Merkez |
| Authority | Otorite |
| Definition | Tanımlılık |
| Strategy | Strateji |
| Signature | İmza |
| Not-Self | Yanlış-Benlik |

Terminoloji sözlüğü kilitlendikten sonra aynı kavram farklı bölümlerde rastgele başka kelimelerle çevrilemez. Kaynak farklı bir özel adlandırma kullanıyorsa bu fark kayda geçirilir; kaynak sessizce standart terminolojiye dönüştürülmez.

---

## 13. Metafizik ve Enerjetik Bilgilerin Korunması

Human Design içeriği bilimsel tıp kitabı gibi filtrelenmez. Kaynakta bulunan metafizik, enerjetik, geleneksel, ruhsal, psikolojik, aura, frekans, koşullanma, karmasal tema gibi ifadeler bilimsel kanıt bulunmadığı gerekçesiyle:

- çıkarılamaz,
- sansürlenemez,
- yumuşatılamaz,
- başka bir ifadeyle değiştirilemez.

Bilginin bilimsel olarak kanıtlanmış olması, sadık çeviriye veya kaynak kaydına kabul şartı değildir.

---

## 14. Sağlık ve Hastalık İfadelerinin Sansürlenmemesi

Kaynakta bulunan sağlık, hastalık, hastalık riski veya bedensel ifadeler, bilimsel kanıt bulunmadığı gerekçesiyle çıkarılamaz, yumuşatılamaz veya başka bir ifadeye dönüştürülemez.

Bir hastalık adı (örneğin "kanser") genel bir "sağlık hassasiyeti" ifadesine indirgenemez. Kaynakta olmayan yumuşatma, uyarı veya ihtimal eklenemez.

Bilginin bilimsel niteliği ancak **ayrı metadata** ile sınıflandırılabilir (Bölüm 18 ve 24-25); bu sınıflandırma kaynak metnine veya sadık çeviriye eklenmez.

---

## 15. Tek Kaynaklı Bilginin Ele Alınması

Bir bilginin yalnız tek güvenilir kaynakta bulunması, onun otomatik olarak silinmesi anlamına gelmez.

Tek kaynağa ait bilgi:

- kaynağı belirtilerek,
- tek-kaynak veya kaynağa özgü olduğu açıkça işaretlenerek

korunur.

Birden fazla kaynak şartı, yalnız "genel ortak çekirdek" olarak sunulacak bilgiler için değerlendirilir. Tek kaynaklı bilgi, "genel ortak çekirdek" gibi sunulmaz; ama silinmez de.

---

## 16. Farklı Kaynakların Ortalanmaması

Farklı kaynaklar bir araya getirilerek hiçbir kaynakta bulunmayan üçüncü bir anlam oluşturulamaz.

**Yanlış birleşim örneği:**

- Kaynak A: "17. Kapı kanser riski taşır."
- Kaynak B: "17. Kapı sindirim sistemiyle ilişkilidir."
- Yanlış: "17. Kapı genel olarak bazı sağlık hassasiyetleriyle ilişkilendirilebilir."

Bu cümle iki kaynakta da bulunmayan yeni bir anlamdır.

**Doğru sunum:**

> "Kaynak A, 17. Kapının kanser riski taşıdığını belirtir. Kaynak B ise bu kapıyı sindirim sistemiyle ilişkilendirir."

Farklılık ve çelişki korunur.

---

## 17. Çelişkilerin Korunması

Kaynaklar çelişiyorsa çelişki ortadan kaldırılmaz. AI hangi kaynağın kesin doğru olduğuna kendi başına karar veremez.

Ayrı tutulan katmanlar:

- kaynakların ortak çekirdek bilgisi,
- klasik Human Design yaklaşımı,
- modern yorum,
- okul veya ekole özgü yaklaşım,
- tek bir eğitmene ait görüş,
- uzman yorumu.

Çelişki, ortalama alınarak veya bir taraf silinerek değil, her iki kaynak da atfıyla gösterilerek korunur.

---

## 18. Kaynağa Atıf ve Provenans

Her iddia kaynağına kadar izlenebilir olmalıdır. Kaynağa atıf:

- ilgili yazarın, kitabın, eğitimin, pasajın veya sayfanın bilgiyi gerçekten taşıması anlamına gelir,
- bilimsel ispat anlamına **gelmez**,
- iddiayı ihtimale dönüştürmez, yalnız sahibini gösterir.

Provenans (içeriğin kaynak/editöryal niteliği) ile çeviri durumu ayrı eksenlerdir: sadık çeviri bir çeviridir; kaynaklandırılmış ana metin bir üretimdir; ikisi karıştırılmaz.

---

## 19. Eğitim Videosu Editörlüğü

Eğitim videosu konuşması profesyonel nota dönüştürülürken yalnızca:

- bilgi içermeyen hitaplar,
- konuşma dolguları,
- dil sürçmeleri

temizlenebilir.

Bilgi içeren hiçbir unsur (tanım, örnek, sayı, kesinlik, olumsuzluk) bu gerekçeyle çıkarılamaz. Editörlük, bilgi budama aracı değildir.

---

## 20. Bilgi Tekrarları ve Konuşma Dolguları

- Anlam taşıyan bilgi tekrarları özetlenmez veya birleştirilmez; kaynak vurgusu tekrar yoluyla veriliyorsa bu vurgu korunur.
- Yalnız bilgi içermeyen konuşma dolguları (örn. "yani", "işte", "şey") temizlenebilir.
- Tekrarın anlam taşıyıp taşımadığından emin olunamıyorsa tekrar korunur.

---

## 21. Bağlam ve Parça Devamlılığı

Bir metin parçadan parçaya işlenirken bağlam korunur:

- ilk anlam birimi ve son anlam birimi korunur,
- aradaki bütün bilgi birimleri işlenir,
- bir parçanın anlamı, komşu parçaların bağlamı gözetilerek bozulmadan aktarılır,
- parçalar arasında bilgi düşmesi olmaz.

---

## 22. Yapay Geçiş Cümlesi Yasağı

Kaynakta bulunmayan bağlayıcı/geçiş cümleleri ("özetle", "sonuç olarak", "genel olarak", "bilimsel olarak kanıtlanmamış olmakla birlikte") eklenmez. Bu tür cümleler:

- kaynakta olmayan bir kesinlik/belirsizlik ekleyebilir,
- farklı kaynakları örtük olarak ortalayabilir,
- kaynakta olmayan bir yorum getirebilir.

Ana metnin akıcılığı, kaynağa sadakat pahasına yapay geçişlerle sağlanmaz.

---

## 23. Hatalı Olduğu Düşünülen Kaynak İfadeleri

Kaynakta hata olduğu düşünülüyorsa:

- özgün metin değiştirilmez,
- sadık çeviri değiştirilmez,
- sessiz düzeltme yapılmaz.

Gerekirse ayrı bir editör notu, kaynak notu, çelişki kaydı veya uzman değerlendirmesi oluşturulur. Bu not, kaynak metnine karıştırılmaz.

---

## 24. AI'nin Yapabilecekleri

AI şunları yapabilir:

- sadık çeviri taslağı hazırlamak,
- eksik çevrilen unsurları göstermek,
- terminoloji tutarlılığını kontrol etmek,
- kesinlik kaymasını tespit etmek,
- kaynaklar arasındaki farklılıkları karşılaştırmak,
- kaynak karşılığı bulunmayan cümleleri işaretlemek,
- başlık ve paragraf düzeni önermek,
- metadata ve sınıflandırma **adayı** önermek,
- önerisinin hangi kaynak ifadesine dayandığını göstermek,
- belirsizliği raporlamak.

---

## 25. AI'nin Kesinlikle Yapamayacakları

AI şunları yapamaz:

- bilimsel değil diye bilgiyi çıkarmak,
- metafizik bilgiyi sansürlemek,
- hastalık adını yumuşatmak,
- kesin ifadeyi ihtimale çevirmek,
- ihtimali kesinleştirmek,
- kaynakta olmayan uyarı eklemek,
- kaynakta olmayan açıklama eklemek,
- kaynakta olmayan neden-sonuç ilişkisi kurmak,
- kaynağı hatalı bulduğu için düzeltmek,
- farklı kaynakları ortalamak,
- farklı kaynaklardan yeni bir anlam üretmek,
- uzman yorumunu kaynak bilgisi gibi sunmak,
- nihai yayın kararını tek başına vermek.

**AI, kendiliğinden nihai olarak** "bilimsel değildir", "bilimsel araştırma iddiası değildir", "yalnız metafiziktir", "yanlıştır" veya "kanıtsızdır" **hükmü veremez.** Kaynak kendisini bilimsel araştırma, geleneksel bilgi, metafizik öğreti veya başka bir kategori olarak sunuyorsa bu durum doğru biçimde korunur.

Metadata sınıflandırması bir öneridir; nihai sınıflandırma ve yayın kararı kullanıcıya aittir. Metadata hiçbir koşulda Kaynak Özgün Metnine, Sadık Türkçe Çeviriye veya Kaynaklandırılmış Ana Metne **sessizce eklenmez**.

---

## 26. Sadık Çeviri Kabul Kontrolü

Her çeviri şu kapılardan geçmelidir. Herhangi bir kapı başarısızsa çeviri kabul edilmez.

1. İlk anlam birimi korunmuş mu?
2. Son anlam birimi korunmuş mu?
3. Aradaki bütün bilgi birimleri çevrilmiş mi?
4. Bilgi çıkarılmış mı?
5. Yeni bilgi eklenmiş mi?
6. Kesinlik derecesi değişmiş mi?
7. Neden-sonuç ilişkisi değişmiş mi?
8. Olumsuzluk kaybolmuş mu?
9. Teknik terimler korunmuş mu?
10. Hastalık veya sağlık ifadeleri yumuşatılmış mı?
11. Metafizik ifadeler sansürlenmiş mi?
12. Örnekler ve sayılar korunmuş mu?
13. Kişi, eser ve kaynak isimleri korunmuş mu?
14. Anlam taşıyan tekrarlar silinmiş mi?
15. Kaynakta olmayan yorum eklenmiş mi?
16. Kaynakta olmayan belirsizlik eklenmiş mi?
17. Kaynakta olmayan kesinlik eklenmiş mi?

---

## 27. Nihai Bağlayıcı İlkeler

- **"Ya doğru bilgi ya hiç."** Doğru bilgi; kaynağa sadık, kaynağı izlenebilir, doğru katmanda, doğru kesinlik derecesinde ve karıştırılmamış bilgidir. Bu, yalnız "bilimsel olarak kanıtlanmış bilgi" anlamına gelmez.
- Kaynak Özgün Metni, Sadık Türkçe Çeviri, Kaynağa Özgü Not, Kaynaklandırılmış Ana Metin ve Uzman Notu katmanları asla birbirine karıştırılmaz.
- Bilimsel, metafizik, geleneksel, enerjetik, sağlıkla ilgili veya okul özelinde olmak; bir bilgi için eleme ya da yumuşatma gerekçesi değildir.
- Tek güvenilir kaynağa özgü bilgi silinmez; kaynağı belirtilerek korunabilir. Birden fazla kaynak şartı yalnız genel ortak çekirdek olarak sunulacak bilgilerde değerlendirilir.
- Kaynaklar çelişiyorsa üçüncü ve yeni bir ortalama anlam üretilmez; çelişki atfıyla korunur.
- AI çeviri/karşılaştırma/işaretleme yapabilir; nihai sınıflandırma ve **nihai yayın kararı kullanıcıya aittir**.

---

## Ek A — Kesinlik Kayması Örneği

**Kaynak:**

> "15. Kapı aile kapısıdır."

**Doğru aktarım:**

> "15. Kapı aile kapısıdır."

**Yanlış:**

> "15. Kapı aileyle ilişkilendirilebilir."

**Neden yanlış:**

- "aile kapısıdır" **kesin bir tanımdır**; "ilişkilendirilebilir" bu kesin tanımı bir **ihtimale** dönüştürür (kesinlik kayması),
- kaynakta olmayan bir **belirsizlik** ekler,
- "aile kapısı" gibi **teknik/özel bir adlandırmayı** zayıflatır ve genelleştirir.

---

## Ek B — Sağlık İfadesi Örneği

**Kaynak:**

> "17. Kapı kanser riski taşır."

**Sadık aktarım:**

> "17. Kapı kanser riski taşır."

Bu ifade, bilimsel kanıt bulunmadığı gerekçesiyle **çıkarılamaz, yumuşatılamaz veya başka bir ifadeye dönüştürülemez.** Aşağıdaki dönüşümlerin hiçbiri kabul edilemez:

- "bazı sağlık hassasiyetleriyle ilişkilendirilebilir,"
- "bedensel dengesizliklere işaret edebilir,"
- "kanserle bir bağlantısı olabileceği düşünülür,"
- "bilimsel olarak kanıtlanmamış olmakla birlikte…,"
- "enerjetik açıdan hassasiyet oluşturabilir."

Bu dönüşümler; hastalık adını (kanser) yok eder, kesinliği düşürür veya kaynakta olmayan uyarı/ihtimal ekler.

İzin verilen tek ekleme **atıftır** ve iddiayı ihtimale çevirmez:

> "X kaynağına göre 17. Kapı kanser riski taşır."

Bilimsellik durumu ise yalnız **ayrı metadata** ile sınıflandırılabilir; bu sınıflandırma metnin içine karıştırılmaz ve nihai hükmü AI değil kullanıcı verir.
