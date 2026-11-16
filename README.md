# BHU

Tarayıcıda çalışan, ana hesap ve alt hesaplarla gelir/gider takibi. Mevcut hesap ağacı, sürükleyerek taşıma ve yerel kullanım düzeni korunur. Backend veya harici servis gerektirmez.


## iOS / App Store hazırlığı

Capacitor 8.6.2 ile iOS 15+ için iPhone ve iPad projesi `ios/` altında bulunur. Web arayüzü ve hesap mantığı korunur; iOS paketi tüm gerekli dosyaları cihazda içerir, bir uzak siteyi açmaz.

```sh
npm ci
npm run ios:sync
npm run ios:open
```

`ios:open` ve iOS arşivi için macOS + Xcode gerekir. CI hem simülatör uygulaması hem fiziksel iOS hedefli imzasız Release arşivi derler. Bunlar App Store'a yüklenebilen imzalı bir IPA değildir.

- Görünen uygulama adı **BHU**. Paket kimliği `com.fevzicakmak.bhu` ve ürün kimliği `com.fevzicakmak.bhu.multipleaccounts`, App Store Connect'te doğrulanacak aday kimliklerdir.
- **Bir ana hesap ve alt hesapları ücretsiz.** İkinci ana hesap, tek seferlik kalıcı **Çoklu Hesap** satın alımını gerektirir. Hedef Türkiye fiyatı **399 TL**; gerçek fiyat App Store Connect'te ayarlanır ve arayüz Apple'ın yerelleştirilmiş fiyatını gösterir.
- Sınır; oluşturma, hiyerarşi değişimi, silmeyle alt hesapların ana seviyeye alınması ve yeni çoklu hesap yedeği yüklemede denetlenir. Mevcut verilerin okunması, düzenlenmesi ve dışa aktarımı kısıtlanmaz. Satın alma doğrulanmadığında veri silinmez.
- Ücretli hak StoreKit 2'nin doğruladığı non-consumable işlemlerden gelir. localStorage'a bir lisans bayrağı yazılmaz. Satın alımları geri yükleme ve iptal/bekleyen onay akışları vardır. Doğrulanmış mevcut satın alımlar çevrimdışı da kullanılabilir.
- iOS kayıtları Application Support altındaki korumalı JSON dosyasına atomik olarak yazılır. Beklenen önceki kayıt eşleşmezse yazma reddedilir. Native kayıt hatasında tarayıcı depolamasına sessiz geçiş yapılmaz.
- Eski aynı-WebView yerel kaydı varsa bir kez doğrulanarak aktarılır, özgün kopya tutulur. **Safari verileri otomatik okunamaz:** Safari'de JSON yedeği indirip iOS uygulamasında Dosyalardan yükleyin.
- Native JSON kayıt üst sınırı 24 MB, dışa/içe aktarma 25 MB, köprü katmanının savunma sınırı 32 MB'dir. Native yedek kompakt JSON olarak üretilir. Dosya paylaşımı iptal edilirse yedek yükleme onayı açılmaz.
- Yedekler/ekler iOS paylaşım menüsüyle dışa aktarılır, yedekler sistem dosya seçicisiyle alınır, hesap raporları iOS yazdırma menüsüne gönderilir. Kamera izni yalnızca kullanıcı fotoğraf çekmeyi seçtiğinde istenir.
- Web demo sürümünün tarayıcı depolaması ve mevcut kullanım davranışı korunur; StoreKit satın alma sistemi iOS içindir.

Mağaza metinleri, yayımlanmış gizlilik/destek sayfaları ve gerçek cihaz kontrol listesi: [iOS yayın hazırlığı](docs/ios/README.md). Yayıncı **Fevzi Çakmak**, herkese açık destek adresi **fvzckmk35@gmail.com** olarak onaylandı; Apple Developer üyeliğinin aktif olduğu hesap sahibi tarafından bildirildi. [Gizlilik](https://fevzicakmak.github.io/BHU/privacy.html) ve [destek](https://fevzicakmak.github.io/BHU/support.html) sayfaları hazırlanmıştır. Team erişimi, gerçek App Store ürünü, dağıtım imzası ve gerçek cihaz/TestFlight kabulü tamamlanmadan uygulama mağazaya gönderilmemelidir. StoreKit test dosyasındaki ürün ve 399 TL örnek fiyat gerçek satış ürünü oluşturmaz.

## Son iOS doğrulama durumu

[CI 43853676076](https://github.com/fevzicakmak/BHU/actions/runs/43853676076), kod `6005053` için 33 Node testi, 45 Chromium senaryosu ve WebKit kontrolünü geçti. SDK 26.2 / arm64 **imzasız Release arşivi** 49 mekanik kontrolü geçti; [arşiv](https://github.com/fevzicakmak/BHU/actions/runs/43853676076/artifacts/14219761788) ve [rapor](https://github.com/fevzicakmak/BHU/actions/runs/43853676076/artifacts/14219262140) mevcut. SDK 26.5 / iPad Pro M5 simülatöründe iki soğuk açılış, gerçek native okuma ve görünür içerik kabulü de başarılı; [ekran görüntüleri ve kanıtlar](https://github.com/fevzicakmak/BHU/actions/runs/43853676076/artifacts/14220931775) elle incelendi.

iPhone için 8 testli native XCTest paketi derlendi, ancak Simulator GUI açma zaman aşımı nedeniyle çalıştırılmadı. GUI açmayı isteğe bağlı yapan yeni yardımcı değişiklik ve UTF-8 baytlarını birebir karşılaştıran native yazma testleri çalışma sonucu bekliyor. Önceki iPhone iki soğuk açılış/okuma kanıtı ayrı tutulur; dağıtım imzası, gerçek cihaz dosya koruması, gerçek StoreKit ve TestFlight kabulü tamamlanmamıştır. Ayrıntılar ve kopyalanabilir mağaza metinleri [iOS yayın dosyalarında](docs/ios/README.md), düz alanlar [metadata JSON kaynağında](docs/ios/metadata.tr.json) bulunur.

## Çalıştırma

Dosyaları bir statik web sunucusundan veya GitHub Pages üzerinden sunun. HTTPS önerilir; modern tarayıcılarda sekmeler arası yazma kilidi HTTPS üzerinde çalışır. Doğrudan `file://` kullanımı önerilmez.

- `index.html`: uygulama kabuğu ve gezinme.
- `styles.css`: responsive arayüz ve hesap ağacı.
- `core.js`: doğrulama, eski veri dönüşümü, kuruş hesabı ve filtreler.
- `native.js`: platform sınırı, atomik iOS kayıt köprüsü, native dosyalar ve doğrulanmış satın alma erişimi.
- `app.js`: arayüz, form taslağı, yerel kayıt, yedekleme ve etkileşimler.
- `drag.js`: fare/dokunmatik/klavye ile hesap taşıma, kenarda otomatik kaydırma ve geri alma.
- `suggestions.js`: yerel önerilerin indekslenmesi, Türkçe eşleştirme ve sıralama.
- `autocomplete.js`: erişilebilir öneri listesi, dokunmatik/klavye seçimi ve hesap araması.

## Günlük kullanım

1. Hesap ağ şemasında ana hesap ve gerekiyorsa alt hesaplar oluşturun.
2. Hesabı seçip **İşlem ekle** ekranını açın. Tutarı virgül veya noktayla doğrudan yazın. Binlik ayırıcı kullanmayın: `1250,50`.
3. Gelir/gider, hedef hesap, tarih ve isteğe bağlı cari/açıklama seçin. Önceki açıklamalar ve hazır öneriler tekrar girişini hızlandırır.
4. **Kaydet ve devam et**, aynı hesap/tarih/türle boş bir sonraki işlem açar. **Ctrl/Cmd+Enter** işlemi kaydeder.
5. Hesap makinesi, hesap seçimi ve uygulama sekmeleri açık taslağı silmez. Taslak bu oturumun belleğindedir; sayfa kapatılırsa kaybolur. Kaydedilmemiş taslakta çıkış uyarısı gösterilir.
6. Tarih, tutar ve arama filtreleri anında uygulanır. İşlemler ekranındaki özet, filtrelenmiş listeyi; diğer ekranlar tüm dönemi gösterir.
7. Hesap kartının üst kısmından veya geniş **⠿** düğmesinden tutup sürükleyin. Yeşil hedefi ve bırakma açıklamasını kontrol edip bırakın. Kenarda bekletince ağaç yatay, sayfa dikey kayar. Fare sabit kalsa da kaydırma sürer.
8. Telefonda **⠿** düğmesine dokunup hedef hesaba dokunarak da taşıyabilirsiniz. Bu modda ağacı normal şekilde kaydırabilirsiniz. **Ana hesap yap** alanı her zaman ekranın altında görünür. **İptal / Escape** taşıma yapmadan çıkar.
9. Klavyede **⠿** düğmesine odaklanıp Enter basın. Oklarla hedef seçin; Home ana seviyeyi, End son uygun hesabı seçer. Enter/Boşluk bırakır, Escape iptal eder. **Düzenle → Üst hesap** seçimi de korunur.
10. Taşıma sonrasında **Geri al** düğmesi 10 saniye gösterilir. Hesap yeniden taşınmışsa eski taşıma üzerine yazılmaz. Kaydetme başarısızsa hiyerarşi değiştirilmez. Alt hesaplar kaynakla birlikte taşınır. Dar boşluklar yakın hedefe çekilir; kendi altına veya 32 seviye sınırının dışına taşıma engellenir.

**İşlemleri taşı**, mevcut kayıtların hesap bağlantısını değiştirir. Yeni gelir/gider oluşturmaz; para havalesi veya çift taraflı muhasebe fişi değildir. Bir hesabın yalnızca kendi işlemleri topluca taşınır, alt hesapların işlemleri taşınmaz.

**Üst hesabın toplamına dahil et** kapalıysa ilgili alt hesap ve onun altındaki hesaplar üst toplamdan hariç tutulur. Kendi ekranlarında kayıtları korunur.

## Otomatik tamamlama

Öneriler yalnızca mevcut yerel kayıtlardan üretilir; bir sunucuya gönderilmez. Yeni bir değer yazmak serbesttir. Öneri seçmek işlem kaydetmez, tutarı/tarihi veya diğer girişleri kendiliğinden değiştirmez.

| Alan | Davranış |
| --- | --- |
| Cari / müşteri | Seçilen hesap ve alt hesaplarındaki geçmiş cariler. Büyük/küçük harf ve gereksiz boşluk tekrarları tek öneri olur. |
| Açıklama | Seçilen hesap, gelir/gider türü ve cari bağlamı kullanılır. Cariyle ilişkili açıklamalar önce gösterilir; hazır açıklamalar da sunulur. |
| İşlem araması | Listelenen hesap kapsamındaki cari ve açıklamalar önerilir. Seçilen ifade aramaya uygulanır. |
| İşlemin hesabı, üst hesap, taşıma hedefi | Seçicinin yanındaki **⌕** düğmesiyle hesap adı aranır. Yerel seçici de çalışmaya devam eder. Üst/alt hesap döngüsü ve kaynak-hedef kısıtları önerilerde korunur. |
| Yeni hesap adı | Mevcut hesap adlarını yeniden doldurmak yerine yeni ad yazılır; tekrar eden adlar doğrulamada engellenir. |
| Tutar, tarih ve filtre tutarları | Yanlış finansal veri doldurmamak için geçmiş değer otomatik seçilmez. Doğrudan tutar girişi, tarih seçici ve gün kısayolları kullanılır. |

- `ipek cagri` gibi Türkçe karakter kullanılmadan yazılan ifadeler de `İpek Çağrı` önerisini bulabilir. Kayıttaki yazım korunur.
- Arama tüm geçmişi tarar; yalnızca son 40 kayıtla sınırlı değildir. Listede en fazla 8 metin veya 30 hesap önerisi gösterilir; daraltmak için yazın.
- Öneriler kullanım sayısı ve güncelliğe göre sıralanır; açıklamalarda cari bağlamı öne çıkar. Öneri indeksi veri/hesap/bağlam değiştiğinde yenilenir, her tuşta geçmiş kayıtlar tekrar işlenmez.
- **↑/↓** ile öneri seçilir, **Enter** ile uygulanır. **Escape** yalnızca önerileri kapatır; açık hesap penceresini kapatmaz. **Tab** metni olduğu gibi bırakır; yeni bir değer zorla seçilmez. Listede etkin öneri yokken ilk Enter listeyi kapatır, işlem kaydetmez.
- Telefonda öneriye dokunabilirsiniz. Listeyi kaydırmak seçim yapmaz. Öneriler odak ve ekran klavyesiyle birlikte konumlanır; **×** ile kapatılabilir.
- Eşleşmeyen hesap metni mevcut hesap seçimini değiştirmez. Hesap gerçekten seçilip işlem onaylanmadan kayıt taşınmaz.

## Kayıt ve veri güvenliği

- Eski `kasa-pro-data-v1` anahtarı korunur. Mevcut veriler otomatik okunur; yalnızca başarılı bir değişiklikte yeni biçime yazılır.
- Sürüm 2, tutarları tam sayı `amountCents` olarak saklar. Eski ondalıklı tutarlar bir kez en yakın kuruşa yuvarlanır. Özgün kayıt oturumda indirilebilir; yeterli alan varsa `kasa-pro-recovery-v1` altında da korunur. Bu ek kopya asıl kaydı engellerse kaldırılır ve ana kayıt yeniden denenir.
- Yazma başarısız olursa uygulamanın kalıcı veri görünümü değiştirilmez, form temizlenmez ve başarı mesajı verilmez. Kullanıcı depolama hatasını görür.
- Sekme başka bir kaydı algılarsa açık taslağı korur. Eski sekmenin yazması engellenir; **Güncel verileri yükle** ile son kayıt alınır. Düzenlenen işlem bu sırada değişmişse eski düzenleme üzerine yazılmaz.
- Web Locks bulunan tarayıcılarda sekmeler arası yazmalar sıraya alınır. Diğer tarayıcılarda yazma öncesi anlık veri karşılaştırması yapılır; tam eşzamanlı yazmalar için aynı garanti sağlanamaz.
- Yedeklerde sürüm, kimlikler, hesap ilişkileri, döngüler, tarih, tutar, işlem türü ve belge içerikleri doğrulanır. Hatalı yedek mevcut veriyi değiştirmez. İçe aktarma öncesi mevcut kaydın indirilmesi istenir.
- Kullanıcı metinleri HTML olarak yorumlanmaz. HTML/SVG ekleri ve harici belge adresleri kabul edilmez. Belgeler gezinme yerine dosya olarak indirilir. CSP ek koruma sağlar.

## Belgeler ve sınırlar

Yerel depolama kotası tarayıcıya göre değişir. Yeni belge başına 1 MB, yeni belge eklenirken toplam belgeler için 2 MB, işlem başına 20 belge sınırı uygulanır. Eski geçerli yedeklerdeki daha büyük belgeler (dosya başına en fazla 8 MB) doğrulanarak okunabilir; yüklemenin başarılı olması için tarayıcıda yeterli alan gerekir. Yedek dosyası üst sınırı 25 MB'dir. Fotoğrafları eklemeden önce küçültün.

En fazla 500 hesap, 32 hiyerarşi seviyesi ve 20.000 işlem desteklenir. Tek işlem 0,01–10.000.000.000 TL arasında olabilir. Güvenli tam sayı sınırını aşan toplamlar reddedilir.

Uygulamanın kendi parola veya yedek şifrelemesi yoktur. Web kayıtları tarayıcı profilinde tutulur; iOS kayıt dosyası işletim sisteminin dosya korumasını kullanır. Dışa aktarılan JSON yedekleri okunabilir metindir. Cihazlar arasında otomatik eşitleme veya sunucu yedeği yoktur. **Ayarlar → Yedek indir** ile düzenli yedek alın. Yedek dosyaları belgeleri de içerir; güvenli saklayın. Tarayıcı verilerini temizlemek web kayıtlarını siler. İndirme başlatıldı mesajı, dosyanın cihazda başarıyla saklandığını doğrulamaz.

## Kontroller

Harici bağımlılık gerektirmeyen veri testleri:

```sh
node --check app.js
node --check core.js
node --check drag.js
node --check suggestions.js
node --check autocomplete.js
node --test tests/*.test.js
```

Tarayıcı senaryoları Python Playwright, Chromium ve WebKit gerektirir:

```sh
python -m pip install playwright==1.62.0
python -m playwright install chromium webkit
python tests/browser.py
python tests/drag.py
python tests/autocomplete.py
python tests/native.py
python tests/webkit.py
```

Yerel `/usr/bin/chromium` varsa kullanılır; `BROWSER_EXECUTABLE` ile değiştirilebilir. Yoksa Playwright'ın kurulu Chromium'u kullanılır. Testler gerçek uygulama dosyalarını yerel HTTP yanıtlarıyla sunar; üretim verilerine dokunmaz. Masaüstü/mobil form, hesap hiyerarşisi, dosya ekleme, kayıt kotası hatası, sekme çakışması, yedek geri yükleme, güvenli metin gösterimi ve eski veri dönüşümünü kontrol eder. Ekran görüntüleri yerel `test-artifacts/` klasörüne yazılır.

GitHub Actions sözdizimi, veri/öneri testleri, masaüstü/mobil kullanım, hesap taşıma ve otomatik tamamlama senaryolarını çalıştırır. Hesap taşıma testleri gerçek dokunma olayları, klavye, hedef toleransı, iptal, geri alma ve imleç sabitken devam eden yatay/dikey kaydırmayı kapsar.

Native JavaScript testleri taklit Capacitor köprüsü kullanır; gerçek iOS dosya koruması veya gerçek Apple ödeme işlemi yaptıklarını göstermez. İmzalı cihaz/TestFlight kontrolleri ayrıca tamamlanmalıdır.

### Native kontrol komutları (macOS + Xcode)

Önce web dosyalarını yeniden paketleyin. Simülatör derlemesi ve isteğe bağlı gerçek native depolama paketi:

```sh
npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -configuration Debug -derivedDataPath ios-build CODE_SIGNING_ALLOWED=NO build
python3 scripts/smoke-ios.py ios-build/Build/Products/Debug-iphonesimulator/App.app \
  com.fevzicakmak.bhu --device-family iPhone --storage-tests --timeout 1200
python3 scripts/smoke-ios.py ios-build/Build/Products/Debug-iphonesimulator/App.app \
  com.fevzicakmak.bhu --device-family iPad --timeout 900
```

`--storage-tests`, native SwiftPM XCTest paketini ayrı test runner sandbox'ında çalıştırır; BHU'nun sentetik kayıt dosyası değiştirilmemelidir. Native dosya yazma/karşılaştırma denetimi gerçek iOS API'lerini kullanır, ancak runner sandbox'ı BHU'nun gerçek cihazdaki saklama alanı veya donanım kilit koruması değildir. Bu paketin mevcut olması başarıyla çalıştığı anlamına gelmez; `.xcresult` ve sonuç JSON'u kabul edilmelidir. Gerçek StoreKit işlemi yapmaz.

Simülatör kontrolü etkin Xcode SDK'sına uygun geçici iPhone/iPad çalışma ortamını seçer. Uygulamanın yalnızca geçici test kopyası yerel ad-hoc imzalanır; Apple dağıtım sertifikası kullanılmaz. Native okuma, sentetik kaydın JavaScript'e dönüşü, görünür içerik ve iki soğuk açılış kontrol edilir. İmzasız Release arşivi ve mekanik incelemesi ayrı çalışır:

```sh
npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -sdk iphoneos -destination 'generic/platform=iOS' \
  -configuration Release -archivePath ios-release/BHU.xcarchive \
  CODE_SIGNING_ALLOWED=NO archive
python3 scripts/check-ios-archive.py ios-release/BHU.xcarchive \
  --output test-artifacts/ios-release/report.json
```

Arşiv kontrolü kimlik/sürüm/debug bayrağı, cihaz ailesi, arm64, ikon, yerel web dosyaları, test içeriği ve privacy manifest dosyalarını inceler. Rapor imza/provisioning, mağaza yüklemesi, gizlilik beyanının hukuki yeterliliği, gerçek cihaz dosya koruması veya gerçek satın alma onayı vermez.
