# Gerçek iOS / TestFlight kabul planı

Ürün adı **BHU**, yayıncı **Fevzi Çakmak**, kamuya açık destek adresi **fvzckmk35@gmail.com** olarak onaylandı. Türkiye Çoklu Hesap güncel hedef fiyatı **149,99 TL**. Kullanıcı fiyat seçiminde **Next → Confirm** yaptığını bildirdi; son ürün **Save**, satış bölgeleri ve gerçek StoreKit fiyatı ayrıca doğrulanmalıdır. Fiyat Apple API ile bağımsız teyit edilmedi; imzalı IPA üretimi doğrulandı, gerçek cihaz ve satın alma kabulü henüz yok.

[Mac CI 43945652513 / job 133574498195](https://github.com/fevzicakmak/BHU/actions/runs/43945652513/job/133574498195), kaynak `3be76547d3b5e8c9323cf1e9c44210aaef338cd3` için **10/10 test, 0 hata/0 atlama** ile başarılıdır. Gerçek dağıtım kimliği/profil eşleşmesi, imzalı Archive, 49 arşiv kontrolü, IPA export, derin/sıkı codesign doğrulaması, gömülü profil/Team/Bundle yetkileri ve imzalayan sertifika eşleşmesi geçti. [BHU-AppStore-IPA](https://github.com/fevzicakmak/BHU/actions/runs/43945652513/artifacts/14265645219) içindeki **1.0 / build 3.1** IPA ve özet bağımsız olarak da incelendi; özel anahtar/Secrets veya test içeriği bulunmadı (artifact son erişim: 23 Kasım 2026, 20:05 UTC); `upload_to_testflight=true` ile Apple `altool` doğrulama ve yüklemesi **16 Kasım 2026, 20:05:12 UTC** itibarıyla başarılı kabul edildi. App Store Connect işlemesinin tamamlandığı ve TestFlight hazırlığı henüz doğrulanmadı (**beklemede**); App Review, gerçek cihaz ve gerçek satın alma kabulü ayrıca tamamlanmalıdır.

## Kapsam ve kayıt formu

Bu plan, otomatik web kontrollerinden ayrıdır. Her çalıştırmada aşağıdaki bilgileri kaydedin:

| Bilgi | Sonuç |
| --- | --- |
| Commit ve uygulama build/sürümü | Test sırasında doldurulacak |
| Xcode ve derleme SDK'sı | Test sırasında doldurulacak |
| Cihaz modeli / iOS sürümü | Test sırasında doldurulacak |
| Kurulum türü | Xcode / TestFlight / güncelleme |
| StoreKit ortamı | Yerel StoreKit config / Sandbox / TestFlight |
| Tester ve tarih | Test sırasında doldurulacak |
| Başarısız adım / ekran kaydı | Varsa eklenecek; gerçek finansal veri kullanılmayacak |

En az bir gerçek iPhone ve bir gerçek iPad kullanın; native hedef şu aşamada iki cihaz ailesini de içerir. Desteklenen en eski iOS sürümüne yakın bir cihaz/simülatör ile güncel iOS sürümünü de kapsayın. Minimum deployment target ile App Store'un yükleme için istediği güncel SDK aynı kavram değildir.

Örnek veri kullanın: `Merkez` ana hesabı, `Şube` ve `Proje` alt hesapları; `Örnek Cari`, bir gelir, bir gider, kısa PDF/metin/fotoğraf eki. Gerçek müşteri belgelerini veya ödeme kartı bilgilerini test kaydı yapmayın.

## A. İlk kurulum ve çevrimdışı açılış

1. Yeni kurulum yapın. Ana sayfa ve hesap oluşturma ekranı uzak site yüklenmesini beklemeden açılmalı.
2. Uygulamayı kapatın, uçak modunu açın ve yeniden başlatın. Paketlenmiş arayüz, birinci ana hesap, alt hesaplar ve yerel işlem kaydı çalışmalı.
3. Uygulamayı force quit yapın ve tekrar açın. Başarılı kaydedilmiş kayıtlar kalmalı.
4. Cihazı kilitleyin/açın ve uygulamaya geri dönün. Yerel dosya erişim hatası varsa kullanıcıya açık hata gösterilmeli; sessiz boş veri kümesine geçilmemeli.
5. Cihaz yeniden başlatıldıktan sonraki ilk açılışı ve ilk kilit açma sonrasını kontrol edin. Veri koruma özelliği okuma hatasını veri silme olarak yorumlamamalı.

## B. Ücretsiz ana hesap ve alt hesaplar

1. İlk ana hesabı oluşturun; ödeme ekranı çıkmamalı.
2. Bu ana hesaba birden fazla alt hesap ve alt seviyeler ekleyin; alt hesap başına ücret çıkmamalı.
3. Gelir ve gider ekleyin; kuruş hassasiyetinde toplamları doğrulayın. `0,10 + 0,20` toplamı `0,30` olmalı.
4. Alt hesabı üst toplamdan çıkarın/geri dahil edin; işlemler kaybolmamalı.
5. İkinci ana hesabı eklemeye çalışın. Çoklu Hesap ekranı açılmalı; ilk ana hesap ve açık form korunmalı.

## C. Satın alma, iptal ve kalıcı hak

1. Ürün adı, tek seferlik satın alma ifadesi, yerel fiyat ve “Satın alımları geri yükle” görünmeli. Abonelik veya alt hesap başına ücret izlenimi verilmemeli.
2. Satın almayı iptal edin. İkinci ana hesap oluşmamalı; mevcut kayıtlar ve taslaklar korunmalı.
3. Pending/Ask to Buy ve hata durumlarını StoreKit test araçlarıyla deneyin. Doğrulanmış başarı olmadan hak açılmamalı.
4. Doğrulanmış satın almayı tamamlayın. İkinci ve sonraki ana hesaplar açılabilmeli; yeniden satın alma zorunluluğu çıkmamalı.
5. Uygulamayı yeniden açın. Kalıcı hak Apple'ın doğrulanmış entitlement bilgisiyle yeniden bulunmalı.
6. Aynı uygun Apple hesabıyla yeni kurulum/ikinci cihaz senaryosunda “Satın alımları geri yükle” çalışmalı. Yalnızca yerel StoreKit config ile görülen başarı gerçek App Store Connect ürününü test etmiş sayılmaz.
7. İnternet yokken yeni ürün/fiyat yüklenememesini deneyin. Sahte fiyat gösterilmemeli ve finansal kayıtlar engellenmemeli. Önceden doğrulanmış hakkın StoreKit'ten elde edilebilme davranışını kaydedin.
8. İade/revocation senaryosunda yeni ek ana hesap açma sınırını kontrol edin. Mevcut kayıtların görüntülenmesi, düzenlenmesi ve dışa aktarılması çalışmaya devam etmeli.
9. Yerel depolamaya `premium=true` benzeri bir değer veya yedek JSON'a sahte lisans alanı eklemek özelliği açmamalı.

## D. Aynı sınırı doğuran diğer hesap işlemleri

Ücretsiz kullanıcıda ilk ana hesap ve alt hesapları varken:

1. Alt hesabı ana seviyeye sürükleyin; ikinci ana hesap oluşacaksa satın alma kontrolü atlanmamalı. İptalde ağaç ve tutarlar önceki halinde kalmalı.
2. Dokunarak hedef seçme ve klavye ile ana seviyeye taşıma yollarında aynı kontrol olmalı.
3. Üst hesabı düzenleyip “Ana hesap” seçin; sonuç ikinci ana hesapsa kontrol uygulanmalı.
4. Çocukları olan bir ana hesabı silme/taşıma akışının birden fazla ana hesap üretebildiği durumları deneyin. İşlem satın alma kontrolünü atlamamalı; iptal veri kaybına yol açmamalı.
5. İki ana hesap içeren yeni bir yedeği önizleyin. Ücretli hakkı açan bir JSON alanı olmamalı; hak gerekiyorsa kayıtların üzerine yazmadan önce kontrol uygulanmalı.
6. Mevcut çoklu ana hesap kayıtlarıyla uygulama açıldığında veya satın alma bilgisi geçici olarak alınamadığında kayıtlar gizlenmemeli/silinmemeli. Yeni ek ana hesap oluşturma ayrıca denetlenmeli.
7. Ücretsiz kurala uyan bir ana hesap + çok sayıda alt hesap yedeği gereksiz ücret istemeden yüklenebilmeli.

## E. Form, autocomplete ve dokunma

1. Tutar, cari, açıklama ve tarih girin. Hesap makinesini açıp sonuç aktarın; diğer alanlar korunmalı.
2. Cari/açıklama önerisini dokunarak ve harici klavyede ok/Enter ile seçin. Seçim işlem kaydetmemeli veya tutarı değiştirmemeli.
3. Türkçe karakter içeren bir cari `İpek Çağrı` gibi kayıtlıyken `ipek cagri` ile bulunmalı. Yeni bir metin yazma serbest olmalı.
4. Hesap/cari/gelir-gider türünü değiştirin; açıklama önerileri doğru bağlama geçmeli, girilen diğer alanlar kendiliğinden silinmemeli.
5. Öneri listesini kaydırın; kaydırma yanlışlıkla öneri seçmemeli. Klavye açılırken liste ve ilgili alan görünür olmalı.
6. Ana/alt hesabı üst alanından sürükleyin. Hedef vurgusu, yakın hedef toleransı ve yatay/dikey otomatik kaydırma çalışmalı.
7. Dokunarak taşıma modunda ağaç normal kaydırılabilmeli; kaydırma taşıma yapmamalı.
8. Escape/İptal ve pointer iptal senaryoları kayıt değiştirmemeli. Geri al doğru ana/alt hesap ilişkisini geri getirmeli.
9. Sistem yazı boyutu/VoiceOver, iPhone yatay ekran, iPad döndürme ve bölünmüş ekran ile temel akışları deneyin. Alanlar, onay düğmeleri ve paylaşım sayfası kullanılabilir kalmalı.

## F. Belgeler ve sistem paylaşımı

1. Dosyalar uygulamasından PDF/metin ve uygun fotoğraf seçin. İptalde boş/bozuk ek oluşmamalı.
2. Büyük, desteklenmeyen ve okunamayan dosyalarda açıklayıcı hata görülmeli; işlem taslağı korunmalı.
3. Bir eki paylaşın/dışa aktarın. iPad paylaşım popover'ı doğru kaynağa bağlanmalı; çökme olmamalı.
4. JSON yedeğini “Dosyalara Kaydet” ile saklayın. Paylaşım iptal edildiğinde “dosya başarıyla kaydedildi” denmemeli.
5. Paylaşım sayfasının tamamlanması, seçilen üçüncü taraf hedefin sonsuza dek dosyayı koruduğu veya geliştiricinin dosyayı aldığı şeklinde yorumlanmamalı.
6. Dosyaya erişim izni/konumu kaybolduğunda kayıtlar ve arayüz korunmalı.

## G. Yedek ve Safari'den native uygulamaya geçiş

1. Mevcut web sürümünü aynı tarayıcı/profilde açın ve JSON yedeği dışa aktarın. Tarayıcı verilerini bu adım tamamlanmadan temizlemeyin.
2. Native uygulamada sistem belge seçicisinden bu JSON'u seçin. Safari ile native uygulamanın otomatik ortak veri alanı kullanmadığını doğrulayın.
3. Hesap/işlem/belge sayıları ve gerekli ücretli ana hesap hakkı yükleme öncesi anlaşılır olmalı.
4. Geçerli yedeği yükleyin; tarih, kuruş tutarları, ekler ve hiyerarşi eşleşmeli. Eski sürüm tutar dönüşümü örneğini de kapsayın.
5. Döngülü hesap, eksik üst hesap, bozuk tarih/tutar, HTML/SVG belge veya hatalı JSON yedeği mevcut dosyayı değiştirmemeli.
6. Önceki yerel kaydı yedekleyip yeni yedekle değiştirin; iptal etme ve başarısız yazma yollarında eski kayıt korunmalı.
7. Dışa aktarıp yeniden içe alınan verinin görünür toplamları aynı olmalı. Satın alma hakkı yedekle aktarılmış sayılmamalı; Apple üzerinden geri yüklenmeli.

## H. Kalıcı kayıt ve güncelleme

1. Native depolama yazma hatası ve 24 MB uygulama kayıt sınırı simülasyonu kullanın. 25 MB yedek ve 32 MB köprü savunma sınırını da ayrı test edin.
2. Native depolama yazma hatası simülasyonu kullanın. Başarı mesajı verilmemeli; taslak ve önceki kayıt korunmalı.
3. Kaydetme sırasında uygulamayı arka plana alın/force quit yapın. Yeniden açılışta önceki veya tamamlanmış yeni geçerli JSON bulunmalı; kısmi dosya sessizce boş veri sayılmamalı.
4. Eski build üzerine yeni build kurun. Kayıtlar ve doğrulanmış Çoklu Hesap hakkı korunmalı.
5. Uygulamayı offload edip geri kurma ve tamamen silip kurma farkını gerçek cihazda kaydedin. Kullanıcıya sunulan destek metni gerçek davranışla uyuşmalı.
6. OS cihaz yedeğine dahil olma davranışını son native dosya ayarlarıyla doğrulayın. Bu durum uygulamaya ait otomatik cihazlar arası eşitleme olarak tanıtılmamalı.


## Kabul ölçütü

- Veri kaybı, sessiz kayıt hatası, yanlış finansal toplam, doğrulanmamış satın almayla açılma veya satın alma hakkı yokken yeni ek ana hesap açma atlatması bulunmamalı.
- Var olan kayıtları görme/düzenleme/dışa aktarma, satın alma doğrulama hatası nedeniyle kilitlenmemeli.
- Tamamlanan testler tarih/build/cihaz/StoreKit ortamıyla kaydedilmeli. Çözümlenmemiş maddeler açıkça bırakılmalı.
- Mağazaya gönderilecek build, kabul edilen build ile aynı olmalı.
