# Türkçe mağaza alanlarını kopyalama

Kanonik alanlar [metadata.tr.json](../metadata.tr.json) dosyasındadır. [Onaylı metin taslağındaki](../app-store-metadata.tr.md) ifadeler değiştirilmeden, Markdown alıntı işaretleri çıkarılarak aktarılmıştır. `tr-TR/` altındaki düz metin dosyaları ilgili JSON değerlerinin birebir kopyasıdır; App Store Connect alanlarına ayrı ayrı yapıştırılabilir.

| Dosya | App Store Connect alanı |
| --- | --- |
| `tr-TR/name.txt` | Uygulama adı |
| `tr-TR/subtitle.txt` | Alt başlık |
| `tr-TR/promotionalText.txt` | Tanıtım metni |
| `tr-TR/description.txt` | Açıklama |
| `tr-TR/keywords.txt` | Anahtar kelimeler |
| `tr-TR/reviewNotes.txt` | İnceleme notları |
| `tr-TR/productDisplayName.txt` | Çoklu Hesap ürününün Türkçe görünen adı |
| `tr-TR/productDescription.txt` | Ürünün Türkçe açıklaması |
| `tr-TR/supportURL.txt` | Destek URL'si |
| `tr-TR/privacyPolicyURL.txt` | Gizlilik politikası URL'si |

Yayıncı ve kamuya açık destek e-postası JSON'da ayrıca bulunur. Uygulama adının mağaza kullanılabilirliği ve satıcı kaydı App Store Connect'te doğrulanmalıdır.

Bu dosyalar **mağazaya gönderilmiş veya onaylanmış metadata değildir**. Gerçek iPhone/iPad, imzalı build, TestFlight ve gerçek StoreKit satın alma/geri yükleme kabulü tamamlanmalıdır. İnceleme notlarına gönderilecek build numarası ve gerçek ürün kaydına ait son bilgiler eklenmelidir. Yerel StoreKit test sonucu gerçek App Store ürününün hazır olduğunu kanıtlamaz.

Fiyat, pazarlama metnine sabit yazılmadı. Fiyat ayarı App Store Connect'te yapılır; uygulama Apple'ın yerelleştirilmiş ürün fiyatını gösterir. Hesap sahibinin fiyat hedefi ve kurulum adımları [kurulum rehberinde](../app-store-connect-setup.tr.md) bulunur.

Alan sınırları kontrol edildi: ad 30, alt başlık 30, tanıtım 170, açıklama 4000, anahtar kelimeler 100 karakter; anahtar kelimeler ayrıca en fazla 100 UTF-8 bayt. Ürün adı 30, ürün açıklaması 45 karakter sınırının içindedir. Metin değiştirilirse JSON ve ilgili `.txt` dosyası birlikte güncellenip sınırlar yeniden kontrol edilmelidir.
