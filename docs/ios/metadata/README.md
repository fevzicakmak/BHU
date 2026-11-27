# Türkçe mağaza alanlarını kopyalama

Kanonik alanlar [metadata.tr.json](../metadata.tr.json) dosyasındadır. [Onaylı metin taslağındaki](../app-store-metadata.tr.md) ifadeler değiştirilmeden, Markdown alıntı işaretleri çıkarılarak aktarılmıştır. `tr-TR/` altındaki düz metin dosyaları ilgili JSON değerlerinin birebir kopyasıdır; gerektiğinde App Store Connect alanlarına ayrı ayrı aktarılabilir. **27 Kasım 2026’da** Türkçe mağaza metinleri, gizlilik/destek bağlantıları ve inceleme iletişimi mevcut BHU 1.0 taslağına kaydedildi; **5.1** build’i bağlandı. Yüklenen gerçek native iPhone/iPad hesap ekranlarının ikisi de **COMPLETE** durumunda doğrulandı. [Güncel hazırlık denetimi](https://github.com/fevzicakmak/BHU/actions/runs/46033077370) incelemeye gönderim veya yayın değildir.

| Dosya | App Store Connect alanı |
| --- | --- |
| `tr-TR/name.txt` | Uygulama adı |
| `tr-TR/subtitle.txt` | Alt başlık |
| `tr-TR/promotionalText.txt` | Tanıtım metni |
| `tr-TR/description.txt` | Açıklama |
| `tr-TR/keywords.txt` | Anahtar kelimeler |
| `tr-TR/reviewNotes.txt` | Türkçe inceleme notları kopyası |
| [`app-review-notes.en.txt`](../app-review-notes.en.txt) | Taslağa kaydedilen İngilizce inceleme notları |
| `tr-TR/productDisplayName.txt` | Çoklu Hesap ürününün Türkçe görünen adı |
| `tr-TR/productDescription.txt` | Ürünün Türkçe açıklaması |
| `tr-TR/supportURL.txt` | Destek URL'si |
| `tr-TR/privacyPolicyURL.txt` | Gizlilik politikası URL'si |

Yayıncı ve kamuya açık destek e-postası JSON'da ayrıca bulunur. Kullanıcı BHU uygulama kaydını tamamladığını bildirdi; satıcı/yasal bilgiler son gönderimde ayrıca karşılaştırılır.

Türkçe ürün adı/açıklaması API ile kayıtlı olarak doğrulandı. Taslağa kaydedilen İngilizce inceleme notları, ücretsiz kullanım ve **Ayarlar → Çoklu Hesap** yolunu açıklıyor; olmayan giriş hesabı istenmiyor. Özel inceleme iletişim bilgileri bu dosyalarda bulunmaz. Bu dosyalar **incelemeye gönderilmiş veya onaylanmış bir mağaza sürümü değildir**. İmzalı 5.1 build’i ve Apple’daki aktif dahili dağıtımı doğrulandı; TestFlight davetinin teslimi/kabulü, gerçek cihaz kurulumu ve gerçek StoreKit satın alma/geri yükleme kabulü henüz doğrulanmadı. Satın alma inceleme görseli hazırlığı sürüyor; hesap ağacı görselleri onun yerine geçmez. App Privacy, yaş derecelendirme ve son yasal beyanlar ayrıca tamamlanır.

Fiyat, pazarlama metnine sabit yazılmadı. Fiyat ayarı App Store Connect'te yapılır; uygulama Apple'ın yerelleştirilmiş ürün fiyatını gösterir. Kayıtlı Türkiye fiyatı **149,99 TL / TRY** olarak Apple API ile doğrulandı. BHU ve satın alma için AB kapsamının kapalı olduğu okundu; Türkiye iki kayıtta da açılırken diğer bölgeler ve fiyat korundu. Hesap ilerlemesi ve kalan adımlar [kurulum rehberinde](../app-store-connect-setup.tr.md) bulunur.

Alan sınırları kontrol edildi: ad 30, alt başlık 30, tanıtım 170, açıklama 4000, anahtar kelimeler 100 karakter; anahtar kelimeler ayrıca en fazla 100 UTF-8 bayt. Ürün adı 30, ürün açıklaması 45 karakter sınırının içindedir. Metin değiştirilirse JSON ve ilgili `.txt` dosyası birlikte güncellenip sınırlar yeniden kontrol edilmelidir.
