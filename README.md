# BHU · Kasa Pro

Tarayıcıda çalışan, ana hesap ve alt hesaplarla gelir/gider takibi. Mevcut hesap ağacı, sürükleyerek taşıma ve yerel kullanım düzeni korunur. Backend veya harici servis gerektirmez.

## Çalıştırma

Dosyaları bir statik web sunucusundan veya GitHub Pages üzerinden sunun. HTTPS önerilir; modern tarayıcılarda sekmeler arası yazma kilidi HTTPS üzerinde çalışır. Doğrudan `file://` kullanımı önerilmez.

- `index.html`: uygulama kabuğu ve gezinme.
- `styles.css`: responsive arayüz ve hesap ağacı.
- `core.js`: doğrulama, eski veri dönüşümü, kuruş hesabı ve filtreler.
- `app.js`: arayüz, form taslağı, yerel kayıt, yedekleme ve etkileşimler.

## Günlük kullanım

1. Hesap ağ şemasında ana hesap ve gerekiyorsa alt hesaplar oluşturun.
2. Hesabı seçip **İşlem ekle** ekranını açın. Tutarı virgül veya noktayla doğrudan yazın. Binlik ayırıcı kullanmayın: `1250,50`.
3. Gelir/gider, hedef hesap, tarih ve isteğe bağlı cari/açıklama seçin. Önceki açıklamalar ve hazır öneriler tekrar girişini hızlandırır.
4. **Kaydet ve devam et**, aynı hesap/tarih/türle boş bir sonraki işlem açar. **Ctrl/Cmd+Enter** işlemi kaydeder.
5. Hesap makinesi, hesap seçimi ve uygulama sekmeleri açık taslağı silmez. Taslak bu oturumun belleğindedir; sayfa kapatılırsa kaybolur. Kaydedilmemiş taslakta çıkış uyarısı gösterilir.
6. Tarih, tutar ve arama filtreleri anında uygulanır. İşlemler ekranındaki özet, filtrelenmiş listeyi; diğer ekranlar tüm dönemi gösterir.
7. Hesap hiyerarşisini kartın tutamacıyla veya **Düzenle → Üst hesap** seçimiyle değiştirin. Kartın geri kalan alanı mobilde kaydırma için kullanılabilir.

**İşlemleri taşı**, mevcut kayıtların hesap bağlantısını değiştirir. Yeni gelir/gider oluşturmaz; para havalesi veya çift taraflı muhasebe fişi değildir. Bir hesabın yalnızca kendi işlemleri topluca taşınır, alt hesapların işlemleri taşınmaz.

**Üst hesabın toplamına dahil et** kapalıysa ilgili alt hesap ve onun altındaki hesaplar üst toplamdan hariç tutulur. Kendi ekranlarında kayıtları korunur.

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

Veriler şifrelenmez; cihaz ve tarayıcı profiline erişebilen kişiler bunları okuyabilir. Cihazlar arasında otomatik eşitleme veya sunucu yedeği yoktur. **Ayarlar → Yedek indir** ile düzenli yedek alın. Yedek dosyaları belgeleri de içerir; güvenli saklayın. Tarayıcı verilerini temizlemek kayıtları siler. İndirme başlatıldı mesajı, dosyanın cihazda başarıyla saklandığını doğrulamaz.

## Kontroller

Harici bağımlılık gerektirmeyen veri testleri:

```sh
node --check app.js
node --check core.js
node --test tests/core.test.js
```

Tarayıcı senaryoları Python Playwright ve Chromium gerektirir:

```sh
python -m pip install playwright==1.62.0
python -m playwright install chromium
python tests/browser.py
```

Yerel `/usr/bin/chromium` varsa kullanılır; `BROWSER_EXECUTABLE` ile değiştirilebilir. Yoksa Playwright'ın kurulu Chromium'u kullanılır. Testler gerçek uygulama dosyalarını yerel HTTP yanıtlarıyla sunar; üretim verilerine dokunmaz. Masaüstü/mobil form, hesap hiyerarşisi, dosya ekleme, kayıt kotası hatası, sekme çakışması, yedek geri yükleme, güvenli metin gösterimi ve eski veri dönüşümünü kontrol eder. Ekran görüntüleri yerel `test-artifacts/` klasörüne yazılır.

GitHub Actions sözdizimi, temel veri testleri ve masaüstü/mobil tarayıcı senaryolarını çalıştırır.
