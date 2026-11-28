# App Store Türkçe metadata ve gönderim durumu

**28 Kasım 2026 — güncel kayıtlar:** [Son mağaza kontrolü](https://github.com/fevzicakmak/BHU/actions/runs/46122268729) 07:40:23 UTC itibarıyla BHU 1.0 taslağındaki metinleri, kategori/URL’leri, inceleme alanlarını ve **5.1** bağlantısını doğruladı. iPhone/iPad hesap görselleri ve Çoklu Hesap inceleme görseli **COMPLETE**; Non-Consumable ürün **READY_TO_SUBMIT** durumunda. Kayıtlı Türkiye ürün fiyatı **149,99 TRY**; uygulama ve ürün **134 bölgede**, Türkiye açık ve AB ülkeleri kapalıdır.

**Ücretsiz indirme ve yaş:** Uygulamanın indirme fiyatı kaydedilip yeniden okundu: mevcut USA temeli korunarak **1 manuel + 174 otomatik fiyatın tamamı sıfır**, Türkiye de ücretsiz. Yaş anketindeki 26 boş yanıt uygulamanın mevcut özelliklerine göre doldurulup birebir geri okundu; Apple 175 ülke derecesi oluşturdu ve Türkiye için **FOUR_PLUS (4+)** hesapladı. Yaş sonucu zorlanmadı; mevcut yaş/ülke tercihleri korundu.

[28 Kasım canlı build sorgusu](https://github.com/fevzicakmak/BHU/actions/runs/46122271280), **1.0 / 5.1** için `VALID`, `expired=false`, `IN_BETA_TESTING` ve dış test için `READY_FOR_BETA_SUBMISSION` doğruladı. App Privacy beyanının **Publish** durumu API’den görülemiyor; davet teslimi/kabulü, fiziksel cihaz kurulumu ve gerçek satın alma/geri yükleme testleri henüz doğrulanmadı. **App Review gönderimi veya herkese açık yayın yapılmadı.** Kayıtlı `AFTER_APPROVAL` yayın seçeneği değiştirilmedi.

**Durum:** `com.fevzicakmak.bhu` uygulaması ve Non-Consumable `com.fevzicakmak.bhu.multipleaccounts` ürünü API ile doğrulandı. Türkçe mağaza alanları ve build **5.1** bağlantısı kayıtlıdır. 28 Kasım’da ücretsiz indirme fiyatı, yaş yanıtları ve satın alma inceleme görseli de kaydedilip geri okundu; ürün **READY_TO_SUBMIT** durumundadır. Kullanıcı DSA adımını tamamladığını bildirdi; hesap geneli DSA/hukuki doğrulama bu uygulama raporunun kapsamı değildir. Gerçek cihaz/StoreKit kabulü, App Privacy yayını ve inceleme/yayın aşamaları henüz tamamlanmadı.

**27 Kasım önceki mağaza durumu (tarihsel):** [27 Kasım salt okunur mağaza kontrolü 46033077370](https://github.com/fevzicakmak/BHU/actions/runs/46033077370), 16:22 UTC itibarıyla Türkçe ad/alt başlık/açıklama, destek ve gizlilik URL'leri, kategori, telif ve App Review alanlarının kaydını doğruladı; **5.1** sürüme bağlandı. Uygulama ve Çoklu Hesap ürünü **134 bölgede**, **Türkiye açık / AB ülkeleri kapalı**; kaydedilmiş aktif Türkiye ürün fiyatı **149,99 TRY**. Fiyat değiştirilmedi. Birer iPhone **1206×2622** ve iPad **2064×2752** hesap ağacı görseli Apple'da **COMPLETE** işlendi. Bu okuma bütün gönderim koşullarının veya görsel kapsamının tamamlandığını göstermez. IAP ürünü **MISSING_METADATA** durumunda; bu kontrolde satın alma inceleme görseli henüz yoktu.

**27 Kasım TestFlight doğrulaması:** [27 Kasım canlı build sorgusu 46025212781](https://github.com/fevzicakmak/BHU/actions/runs/46025212781/job/140594750047), doğru BHU/bundle/1.0/**5.1** için `VALID`, `expired=false`, `IN_BETA_TESTING` ve dış test için `READY_FOR_BETA_SUBMISSION` doğruladı. Davet teslimi için mevcut destek kaydına takip iletisi gönderildi; kullanıcının daveti posta kutusunda bulunmadı. Davet kabulü/cihaz kurulumu, gerçek StoreKit satın alma/geri yükleme, App Privacy yayını ve yasal son kontroller bekliyor. **App Review gönderimi veya herkese açık yayın tetiklenmedi.**

**İmzalı yükleme kanıtı (18 Kasım):** `c4d09beeb27ef6571210b83f31ce6357a406a2e0` / [yükleme 44312503648](https://github.com/fevzicakmak/BHU/actions/runs/44312503648/job/134829998804), **15/15 Mac testi, 0 hata/0 atlama** ile başarılıydı. Gerçek Apple doğrulama/yükleme yanıtlarında `accepted=true`; iki işlemdeki **90725 SDK bildirimi kabulü engellemedi**. Orijinal IPA artifact'ının yedi günlük saklama süresi 25 Kasım'da sona erdi; bu durum Apple'daki 5.1 build'inin süresinin dolduğu anlamına gelmez.

**Önceki build:** 4.1, 17 Kasım'da hazırdı; [18 Kasım sorgusunda](https://github.com/fevzicakmak/BHU/actions/runs/44312149712/job/134828758919) **Expired** görüldü. Sona erme nedeni doğrulanmadı; güncel kurulum sürümü 5.1'dir.

## Önerilen alanlar

| App Store Connect alanı | Kaydedilen değer / kalan kontrol |
| --- | --- |
| Ad | `BHU` — Türkçe kaydı API'de doğrulandı |
| Alt başlık | `Ana ve alt hesaplarla kasa` |
| Birincil kategori | Eksik kategori alanı kaydedildi ve API'de mevcut; nihai sınıflandırmanın uygunluğu son kontroldedir |
| İkincil kategori | İsteğe bağlı; bu çalışmada kayıtlı olduğu iddia edilmez |
| Birincil dil | Türkçe |
| Yayıncı / hizmet sağlayıcı | Fevzi Çakmak |
| Kamuya açık destek e-postası | fvzckmk35@gmail.com |
| Ücret | Uygulama ücretsiz indirilir; Çoklu Hesap uygulama içi satın alımı ayrı tanımlanır |
| Satın alma türü | Non-Consumable; tek seferlik, kalıcı çoklu ana hesap hakkı |
| Destek URL'si | https://fevzicakmak.github.io/BHU/support.html |
| Gizlilik politikası URL'si | https://fevzicakmak.github.io/BHU/privacy.html |
| Pazarlama URL'si | İsteğe bağlı; bir URL uydurulmadı |
| Telif hakkı | 2026 Fevzi Çakmak |
| Bundle ID / SKU | `com.fevzicakmak.bhu` API'de doğrulandı; `BHU-IOS-001` rehber önerisidir, gerçek SKU bu raporda karşılaştırılmadı |

Bu metinler finansal kayıt takibini anlatır. Uygulamanın banka hesabına bağlandığı, para transfer ettiği, fatura kestiği, vergi beyanı hazırladığı veya resmi muhasebe hizmeti sunduğu iddia edilmez.

## Tanıtım metni

> Gelir ve giderlerinizi ana ve alt hesaplarla takip edin. İlk ana hesap ve alt hesapları ücretsiz. Ek ana hesapları tek seferlik satın alımla açın.

## Açıklama

> BHU, gelir ve giderlerinizi hesaplar halinde düzenlemenize yardımcı olur.
>
> Bir ana hesap oluşturun, ihtiyaç duyduğunuz alt hesapları ekleyin ve işlemlerinizi tarih, tutar, cari ve açıklama bilgileriyle kaydedin. Hesap ağacında sürükleyerek veya dokunarak düzen kurun. Gelir, gider ve bakiye toplamlarını birlikte görün.
>
> • Ana ve alt hesaplarla kasa takibi
> • Gelir/gider kaydı, düzenleme ve filtreleme
> • Geçmiş kayıtlarınızdan cari ve açıklama önerileri
> • İşlemlere belge ve fotoğraf ekleme
> • JSON yedeğini dışa aktarma ve doğrulayarak geri yükleme
> • iOS'ta cihazda yerel kayıt ve paketlenmiş uygulama dosyalarıyla çevrimdışı çalışma
>
> Ücretsiz kullanım bir ana hesabı ve bu ana hesabın alt hesaplarını kapsar. İkinci ana hesabı oluşturmak için tek seferlik Çoklu Hesap satın alımı gerekir. Alt hesaplar için ayrıca ücret alınmaz. Bu bir abonelik değildir. Satın alımlar uygulamadaki “Satın alımları geri yükle” seçeneğiyle yeniden doğrulanabilir.
>
> Verilerinizi düzenli olarak yedekleyin. Cihazlar arasında uygulamaya ait otomatik eşitleme yoktur. Yedek dosyası finansal kayıtlarınızı ve ekli belgelerinizi içerir; paylaşacağınız konumu ve alıcıyı siz seçersiniz.

Bu metinler 27 Kasım'da mağaza sürüm taslağına kaydedildi. Paket içi dosyalar/yerel kayıt teknik olarak incelendi; metin kaydı fiziksel cihazda çevrimdışı kullanım ve dosya paylaşımı kabul testinin tamamlandığını göstermez.

## Anahtar kelime önerisi

`kasa,gelir,gider,bakiye,cari,harcama,hesap,işlem,bütçe,kayıt`

Yayın öncesi App Store Connect alan sınırlarını ve son metnin uzunluğunu kontrol edin. Rakip marka ve desteklenmeyen özellik eklemeyin.

## Uygulama içi satın alma yerelleştirmesi

- Görünen ad: **Çoklu Hesap**.
- Açıklama: **Ek ana hesaplar için kalıcı erişim.**
- Türkçe ürün adı/açıklaması API’de mevcut. Yerelleştirme `PREPARE_FOR_SUBMISSION`, ürün **READY_TO_SUBMIT** durumunda; satın alma inceleme görseli **COMPLETE** olarak doğrulandı.
- 27 Kasım UTC tarihi için kaydedilmiş aktif Türkiye fiyatı **149,99 TRY**, API'de tek geçerli fiyat olarak doğrulandı. Uygulama ve ürün 134 bölgede, Türkiye açık ve AB ülkeleri kapalıdır. Fiyat değiştirilmedi; diğer para birimleri için fiyat uydurulmadı.
- Fiyat, StoreKit ürününden yerel para birimiyle gösterilir. Metinlere sabit veya henüz belirlenmemiş fiyat yazılmaz.
- Paywall, ücretsiz ana hesap/alt hesap hakkını ve satın alımları geri yükleme seçeneğini açıkça gösterir.
- Geliştirme StoreKit yapılandırması gerçek App Store Connect ürününün onaylandığını göstermez.
- Family Sharing, kullanıcı tarafından etkinleştirilip test edilmedikçe mağaza metninde vaat edilmez.

## App Review notları

> Uygulama giriş hesabı gerektirmez. “Hesap”, kullanıcının cihazında tuttuğu kasa/finansal hesap anlamındadır.
>
> Ücretsiz senaryo: İlk ana hesabı oluşturun; bu ana hesabın altına birden fazla alt hesap ekleyin. Gelir/gider oluşturun, filtreleyin ve JSON yedeği dışa aktarın.
>
> Ücretli senaryo: İkinci ana hesabı oluşturmayı deneyin. Çoklu Hesap ekranı açılır. Satın alma Apple StoreKit üzerinden gerçekleştirilir. Ürün tipi Non-Consumable'dır; abonelik veya harici ödeme yönlendirmesi yoktur. “Satın alımları geri yükle” seçeneği bulunur.
>
> Hesap ağacında bir alt hesabı ana seviyeye taşımak veya yedekten ek ana hesaplar yüklemek de aynı yetki kontrolüne tabidir. Mevcut kayıtları görüntülemek, düzenlemek ve dışa aktarmak satın alma ekranına bağlanmaz.
>
> Uygulama banka bağlantısı veya gerçek para transferi yapmaz. “İşlemleri taşı”, mevcut kayıtların hesap bağlantısını değiştirir.

Son Product ID, **1.0 (5.1)** ve gerçek Türkçe arayüz adımlarını içeren [İngilizce inceleme notu](app-review-notes.en.txt) hazırlandı; App Review notları ve iletişim alanları 27 Kasım'da kaydedilip geri okundu. İletişim değerleri bu depoda yayımlanmaz. Yukarıdaki Türkçe metin okunabilir alternatif olarak korunur. Gerçek kişi finansal verisi, kişisel Apple hesabı bilgisi veya gerçek makbuz eklenmez.

## Ekran görüntüleri ve son kapsam kontrolü

27 Kasım'da bir iPhone **1206×2622** (`APP_IPHONE_61`) ve bir iPad **2064×2752** (`APP_IPAD_PRO_3GEN_129`) hesap ağacı görseli Apple'da `COMPLETE` işlendi. Bunlar tüm görsel kapsamının veya App Review kabulünün doğrulandığı anlamına gelmez. 28 Kasım’da gerçek native iPad Çoklu Hesap inceleme görseli de **COMPLETE** olarak doğrulandı; yeniden okuma mevcut görseli kullanarak kopya oluşturulmadığını doğruladı.

Ek çekim ve son kapsam listesi:

1. Ana hesap ve alt hesap ağacı; bir ücretsiz ana hesabın alt hesaplarının gösterimi.
2. Gelir/gider formu ve yerel otomatik tamamlama.
3. Filtrelenmiş işlem listesi ve toplamlar.
4. İşlem belgesi/ayrıntı ekranı.
5. Yerel yedekleme ve iOS paylaşım akışı.
6. Çoklu Hesap ekranı; gerçek mağaza fiyatı ve geri yükleme seçeneği.

Yalnızca son derlemeyi ve örnek verileri kullanın. Son hedef cihaz ailesi ve App Store Connect'in o tarihte istediği ekran boyutlarına göre ekran görüntüsü yükleyin. iPad desteği açık bırakıldıysa iPad düzeni ve ekran görüntüleri de tamamlanmalıdır.
