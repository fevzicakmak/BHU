# BHU gizlilik politikası — yayın taslağı

**Bu belge nihai olarak yayımlanmış bir politika değildir.** Geliştirici/hak sahibi kimliği, iletişim adresi, geçerlilik tarihi ve son iOS derlemesinin veri akışı doğrulanarak tamamlanmalıdır. Kimliği veya iletişimi bilinmeyen bir taraf adına hukuki taahhüt uydurulmadı.

## 1. Kapsam ve hizmet sağlayıcı

Bu metin BHU'nun native iOS sürümünü kapsar. Mağaza adı BHU olarak seçilmiştir; geliştirici/hizmet sağlayıcı kimliği ve kamuya açık iletişim adresi yayın öncesinde bu bölüme eklenecektir.

Ayrı bir web sürümü kullanıldığında kayıtlar o tarayıcının yerel depolamasında tutulur. Web sitesini sunan barındırma hizmetinin erişim günlükleri ve ağ istekleri, cihazda paketlenmiş iOS sürümünün yerel kayıt akışıyla aynı değildir. Bu taslak, web barındırma hizmeti adına veri işleme taahhüdü vermez.

## 2. Girdiğiniz kayıtlar

Uygulamaya hesap adları ve ilişkileri, gelir/gider türü, tutar, tarih, açıklama, cari/müşteri adı ve seçtiğiniz belge/fotoğraf dosyalarını girebilirsiniz. Kullanım sırasında seçili hesap bilgisi ve teknik kayıt sürümü gibi yerel çalışma bilgileri de tutulur.

“Hesap”, bir kasa veya finansal kayıt grubu anlamındadır; uygulama bir kullanıcı giriş hesabı oluşturmanızı istemez. Banka hesabınıza bağlanmaz ve uygulamaya banka parolası veya ödeme kartı bilgisi girmeniz gerekmez.

Native iOS sürümü için bu verilerin cihazdaki uygulama alanında saklanması tasarlanmıştır. Otomatik tamamlama, kayıtlarınızdan cihaz üzerinde üretilir. Öneri oluşturmak için açıklama veya cari adları harici bir yapay zekâ/arama hizmetine gönderilmez.

## 3. Satın alma

Ücretsiz kullanım bir ana hesabı ve o ana hesabın alt hesaplarını kapsar. İkinci ana hesap için tek seferlik, kalıcı Çoklu Hesap uygulama içi satın alımı sunulur. Abonelik yoktur; alt hesap başına ücret alınmaz.

Satın alma ve geri yükleme işlemleri Apple'ın StoreKit / App Store hizmetleriyle yürütülür. Uygulama, özelliği açabilmek için Apple'ın doğruladığı ürün ve işlem hakkı bilgisini değerlendirir. Uygulama içinde geliştiriciye ödeme kartı bilgisi girilmez. Apple'ın kendi hizmetlerinde işlediği veriler Apple'ın ilgili politika ve koşullarına tabidir.

Uygulamaya ait ayrı bir satın alma doğrulama sunucusu veya kullanıcı hesabı eklenirse bu politika ve App Privacy beyanı yeni veri akışına göre güncellenmelidir. Yerel bir ayar ya da yedek dosyası tek başına satın alma hakkı oluşturmaz.

## 4. Dışa aktarma, içe aktarma ve paylaşım

JSON yedek dosyası hesapları, işlemleri ve ekli belgeleri içerebilir. iOS paylaşım/dosya seçim arayüzünde dosyanın kaydedileceği konumu veya paylaşılacağı uygulamayı siz seçersiniz. Seçtiğiniz üçüncü taraf uygulama veya bulut depolama hizmeti dosyayı kendi koşulları çerçevesinde işleyebilir.

Yazdırma seçeneğini kullanırsanız rapor içeriği iOS'un yazdırma arayüzünde seçtiğiniz yazıcı veya ilgili sistem hizmetiyle işlenebilir. Yazıcıyı ve yazdırma onayını siz seçersiniz.

Dosya/fotoğraf seçicisinin isteğe bağlı kamera ile çekim yolunu kullanırsanız iOS kamera izni isteyebilir. Kamera, siz bu yolu seçmeden arka planda kullanılmak üzere tasarlanmamıştır. Kamera iznini vermemek gelir/gider kayıtlarınızı kullanmanızı engellememelidir.

İçe aktarmak için seçtiğiniz dosya uygulama tarafından okunur ve doğrulanır. Uygulama, siz dosya seçmeden cihazdaki bütün belgeleri taramak üzere tasarlanmamıştır. Yedek yüklemek mevcut kayıtları değiştirebildiğinden ekrandaki önizlemeyi ve yedekleme uyarısını inceleyin.

Dışa aktarılan JSON dosyasının kendisi uygulama tarafından parola ile şifrelenmez. Dosya finansal veya üçüncü kişilere ait bilgiler içeriyorsa yalnızca uygun bir konumda saklayın ve uygun alıcılarla paylaşın.

## 5. Ağ, analiz ve reklam

İncelenen web uygulamasında reklam, kullanıcı takibi veya üçüncü taraf analiz SDK'sı bulunmamaktadır. Hazırlanan iOS sürümünde de bu bileşenlerin kullanılmaması planlanmıştır. Native uygulama dosyaları paket içinde bulunur; kayıt ekranlarını açmak için uzak bir web sitesinin yüklenmesine dayanılmamalıdır.

Apple satın alma doğrulaması, App Store hizmetleri ve işletim sistemi hizmetleri ağ erişimi gerektirebilir. Bu, cihazdaki finansal defterin geliştiriciye otomatik yüklendiği anlamına gelmez. Son derlemeye yeni bir SDK, analiz, hata raporlama veya sunucu hizmeti eklenirse bu bölüm yeniden değerlendirilir.

## 6. Saklama, yedekleme ve silme

Yerel kayıtlar siz uygulama içinden silene, bir yedekle değiştirene veya uygulamanın cihazdaki verilerini kaldırana kadar tutulur. iOS'un “uygulamayı kaldır/offload” ve “uygulamayı sil/delete” işlemleri farklı sonuç verebilir; son sürümün gerçek cihaz testleri ve destek metniyle bu davranış doğrulanmalıdır.

Kayıtları silmek daha önce dışa aktardığınız dosyaları veya üçüncü taraf konumlarına gönderdiğiniz kopyaları silmez. Bu kopyaların silinmesini ilgili konumda siz yönetirsiniz. Uygulama kendi cihazlar arası eşitleme veya geliştiriciye ait otomatik sunucu yedeği sunmaz. İşletim sistemi ayarlarınıza bağlı iPhone/iCloud cihaz yedekleri ayrı olabilir; son native depolama yapılandırmasına göre bu cümle netleştirilmelidir.

## 7. Güvenlik

iOS sürümünde yerel dosyalar için uygulama alanı ve işletim sisteminin veri koruma mekanizmalarının kullanılması planlanmıştır. Bu, dışa aktarılan JSON dosyasına ayrıca uygulama parolası konduğu veya cihazda erişimi olan herkese karşı mutlak koruma sağlandığı anlamına gelmez.

Yerel verilerin yazılması başarısız olursa uygulamanın başarılı kayıt mesajı vermemesi ve açık formu koruması hedeflenir. Düzenli yedek alın; bozuk veya uyumsuz bir yedek yüklenmeden önce doğrulanmalıdır.

## 8. Destek iletişimi

**Yayın öncesi eklenecek:** Hizmet sağlayıcının gerçek adı/unvanı, düzenli takip edilen iletişim adresi ve destek sayfası URL'si.

Destek isterken mümkünse sorun adımlarını ve uygulama/iOS sürümünü paylaşın. Gerçek finansal defterinizi, müşteri belgelerinizi, Apple hesabı parolanızı veya ödeme kartı bilgilerinizi göndermeniz istenmemelidir. Kullanıcının destek için gönüllü gönderdiği bilgiler yalnızca talebi ele almak için işlenmeli; bu bilgiler için saklama ve silme yöntemi hizmet sağlayıcı tarafından belirlenip açıklanmalıdır.

## 9. Değişiklikler

Politika, son veri akışına uygun olarak güncellenir. Nihai yayımlanan metinde geçerlilik tarihi bulunmalıdır. Satın alma, depolama veya üçüncü taraf hizmetlerinin kapsamı değişirse kullanıcıya uygulama ve politika üzerinden açıklanmalıdır.

## Yayın öncesi doldurma kontrolü

- Gerçek geliştirici/hizmet sağlayıcı kimliği ve iletişim bilgisi.
- BHU adının mağaza kullanılabilirliği, geçerlilik tarihi ve herkesçe erişilebilir politika URL'si.
- Son native veri yolu, dosya koruma özelliği ve işletim sistemi yedekleme davranışı.
- Kullanılan tüm SDK'lar ve App Privacy / Privacy Manifest beyanları.
- Destek iletileri için gerçek saklama ve silme düzeni.
