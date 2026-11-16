# BHU — Mac olmadan imzalı IPA ve TestFlight

Mac sahibi olmanız gerekmez; derleme GitHub'ın macOS runner'ında yapılır. Mevcut özel CSR/sertifika/P12/profil hazırlığı tamamlandı; aşağıdaki Codespaces yolu gerektiğinde alternatif hazırlık içindir, hazır dosyaları yeniden üretmeniz gerekmez. Aşağıdaki hazırlıklar tarayıcıdaki GitHub Codespaces Linux terminalinden yapılabilir. Bunun için **Codespaces erişimi**, depoda Actions/Secrets yönetme yetkisi, kullanılabilir GitHub macOS Actions runner'ı ve **T4F4D367KQ takımında Apple Certificates, Identifiers & Profiles yetkisi** gerekir. TestFlight yüklemesi ayrıca App Store Connect API anahtarı oluşturma/yükleme yetkisi ister. Yalnız telefonda normal GitHub dosya sayfasını açmak terminal yerine geçmez; Codespaces açıp terminaline erişmelisiniz.

Bu rehber ve workflow hazırlığı Apple hesabınızda sertifika, profil, uygulama veya satın alma ürünü oluşturmaz. Hiçbiri otomatik oluşturulmaz veya iptal edilmez; portal adımlarını hesap sahibi yapar. İmzalı IPA üretimi doğrulandı; CLI çıkış kodu 0, Apple sunucu kabulünü kanıtlamadı. Kullanıcının TestFlight ekranında **No Builds** görünüyor.

Hazırlık kanıtı: `7e5943e2744fc0bb6505236429f45e224fedd28c` kaynağında [Mac CI 43874034746 / job 133322286941](https://github.com/fevzicakmak/BHU/actions/runs/43874034746/job/133322286941) **9/9 sentetik politika/uyumluluk testini, 0 hata ve 0 atlama ile** geçti. Modern AES-256/SHA-256 P12, üretimdeki aynı dönüşüm yardımcısından geçirilerek Mac keychain'e başarıyla alındı; Debug/Release Team/Automatic/Bundle ID ayarları imzalama kapalıyken tekrar doğrulandı. Gerçek Apple sertifikası, profili veya API anahtarı kullanılmadı; bu testler gerçek imzalı archive/export/upload veya Apple hesabına erişim kanıtı değildir.

**Güncel imzalı IPA ve CLI sonucu:** [Mac CI 43945652513 / job 133574498195](https://github.com/fevzicakmak/BHU/actions/runs/43945652513/job/133574498195), kaynak `3be76547d3b5e8c9323cf1e9c44210aaef338cd3` için **10/10 test, 0 hata/0 atlama** ile başarılıdır. Gerçek dağıtım kimliği/profil eşleşmesi, imzalı Archive, 49 arşiv kontrolü, IPA export, derin/sıkı codesign doğrulaması, gömülü profil/Team/Bundle yetkileri ve imzalayan sertifika eşleşmesi geçti. [BHU-AppStore-IPA](https://github.com/fevzicakmak/BHU/actions/runs/43945652513/artifacts/14265645219) içindeki **1.0 / build 3.1** IPA ve özet bağımsız olarak da incelendi; özel anahtar/Secrets veya test içeriği bulunmadı (artifact son erişim: 23 Kasım 2026, 20:05 UTC); `upload_to_testflight=true` çalıştırmasında `altool` doğrulama/yükleme komutları **çıkış kodu 0** verdi; ancak gerçek Apple yanıtı/teslim alındısı çözümlenmediği için **Apple kabulü doğrulanmadı**. Kullanıcının BHU → TestFlight ekranında **No Builds** görünüyor. İşlemenin başladığı, tamamlandığı veya TestFlight hazırlığı doğrulanmış değildir; App Review, gerçek cihaz ve gerçek satın alma kabulü de ayrıca tamamlanmalıdır.

## 1. Apple kayıtlarını tamamlayın

**Güncel gerçek doğrulama hatası:** Mevcut imzalı `1.0 / 3.1` IPA yeniden derlenmeden veya yüklenmeden doğrulatıldı. [Mac doğrulama işi](https://github.com/fevzicakmak/BHU/actions/runs/43952679236/job/133599032266), seçili altool `26.10.1` için belgelenen `--use-old-altool` arayüzünü kullandı; araç çıkış kodu `1`, güvenli hata kodu `-1011` ve sınıf `AUTHENTICATION_FAILED` döndü ([ayıklanmış rapor](https://github.com/fevzicakmak/BHU/actions/runs/43952679236/artifacts/14267543552)). Apple kabulü doğrulanmadı. Sonraki adım aynı App Store Connect API kaydına ait Key ID / Issuer ID / özel `.p8` dosyası eşleşmesini hesap sahibinin kontrol etmesidir; bu hata tek başına hangi alanın yanlış olduğunu kanıtlamaz. Özel anahtar veya Secret değerleri yayımlanmaz.

**TestFlight işleme durumu:** `.github/workflows/testflight-status.yml`, yükleme yapmadan yalnız BHU'nun belirtilen sürüm/build kaydını okumak için hazırlandı. `d43e096` kaynağının [durum kontrolünde](https://github.com/fevzicakmak/BHU/actions/runs/43949331627/job/133587320669) 14 test geçti; Apple API uygulama sorgusunu **HTTP 401** ile reddetti. Bu nedenle `1.0 / 3.1` için işleme veya teste hazır olma sonucu alınmadı. Sonraki kontrol hesap sahibinin **App Store Connect → Apps → BHU → TestFlight** ekranındaki aynı build durumudur; mevcut yükleme sırf bu durum sorgusu başarısız oldu diye tekrarlanmaz.

Team ID **T4F4D367KQ** koddadır. Kullanıcı **com.fevzicakmak.bhu** Bundle ID kaydını ve **BHU** App Store Connect uygulamasını tamamladığını bildirdi. Mevcut **Non-Consumable** ürün **com.fevzicakmak.bhu.multipleaccounts** ve ürün Apple ID'si **6835484249** ekran görüntüsünde görüldü; durum **Prepare for Submission**. Türkçe ad/açıklama **Display Name and Description → Add** üzerinden kaydedildiği bildirildi. Bu kayıtları yeniden oluşturmayın.

Bir ana hesap ve alt hesapları ücretsizdir; ikinci ana hesap için tek seferlik kalıcı hak gerekir. Türkiye hedefi **149,99 TL**; kullanıcı fiyat seçiminde **Next → Confirm** yaptı, ancak ürün ana sayfasındaki son **Save** henüz doğrulanmadı. Fiyat bağımsız Apple API sorgusuyla teyit edilmedi; gerçek arayüz Apple'ın `displayPrice` değerini kullanır.

Kullanıcı BHU, uygulama içi satın alım ve diğer uygulamasından **AB ülkelerini çıkardığını** bildirdi; diğer uygun ülkeler korunur. AB'de dağıtım yapmama gerekçesiyle birleşik ikinci DSA seçeneği için yönerge verildi, fakat kullanıcı son onayı tamamladığını bildirmedi; DSA tamamlanmış sayılmaz. Bölge değişiklikleri bağımsız doğrulanmadı.

Önceki ekran görüntüsünde **Paid Apps Agreement: Active**, **banka: Active**, **W-8BEN: Active** görüldü; yeniden sözleşme veya ürün oluşturmayın. [App Store Connect rehberindeki](app-store-connect-setup.tr.md) son ürün **Save** ve DSA onayı ayrı açık maddelerdir. Sertifika/P12/profil hazırlığı tamamlandı; üç imzalama Secrets kaydının yapıldığı bildirildi. İmzalı IPA doğrulandı ve API Secrets CLI çağrılarında kullanıldı; Apple teslim alındısı/yükleme kabulü, App Store Connect işlemesi, TestFlight hazırlığı ve gerçek satın alma kabulü henüz doğrulanmadı.

## 2. Codespaces'te özel anahtar ve CSR hazırlayın

Mevcut özel anahtar/CSR ve imzalama dosyaları hazır olduğundan bu adımları tekrar uygulamayın; aşağıdaki komutlar alternatif veya ileride gerekebilecek hazırlık içindir.

GitHub'da BHU deposunu açın: **Code → Codespaces → Create codespace on main**. Codespaces terminalinde depo kökünde olun. Aşağıdaki blok anahtar varsa üzerine yazmayı reddeder; bir kez çalıştırın. `openssl`, `python3` ve `gh` komutları kullanılabilir olmalıdır.

```sh
umask 077
mkdir -p .ios-signing
git check-ignore -q .ios-signing/probe || { echo 'Özel klasör Git tarafından yok sayılmıyor; devam etmeyin.' >&2; exit 1; }
test ! -e .ios-signing/distribution.key.pem || { echo 'Özel anahtar zaten var; üzerine yazmayın.' >&2; exit 1; }
openssl req -new -newkey rsa:2048 -sha256 -utf8 \
  -keyout .ios-signing/distribution.key.pem \
  -out .ios-signing/distribution.csr \
  -subj '/CN=Fevzi Çakmak/emailAddress=fvzckmk35@gmail.com/C=TR'
```

OpenSSL özel anahtarı şifrelemek için **PEM passphrase** sorar; giriş görünmez. Güçlü parolayı güvenli saklayın. Komuta veya sohbete yazmayın. `.ios-signing/` Git tarafından yok sayılır; özel anahtarı commit etmeyin. Portalda yükleyeceğiniz tek dosya **distribution.csr** dosyasıdır; `distribution.key.pem` yüklenmez. Codespaces dosya gezgininden CSR'yi indirip Apple portalında seçebilirsiniz.

## 3. Sertifika ve App Store profili alın, P12 oluşturun

1. [Apple Developer → Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list) bölümünde **T4F4D367KQ** takımını seçin. **Certificates → + → Apple Distribution** ile az önceki CSR'yi yükleyin. Mevcut başka sertifikaları iptal etmeyin.
2. Apple'ın verdiği `.cer` dosyasını indirin. Codespaces dosya gezgininde `.ios-signing/` klasörüne yükleyip **distribution.cer** adını verin.
3. **Profiles → + → Distribution → App Store Connect** (arayüzde **App Store** olarak da görünebilir) seçin. App ID `com.fevzicakmak.bhu`, sertifika az önce oluşturduğunuz Apple Distribution sertifikası olsun. Profili oluşturup indirin; `.ios-signing/BHU_AppStore.mobileprovision` adıyla Codespaces'e yükleyin. Development/Ad Hoc profili bu yükleme için uygun değildir.
4. Aynı özel anahtar ve Apple sertifikasını P12'ye dönüştürün:

```sh
openssl x509 -inform DER -in .ios-signing/distribution.cer \
  -out .ios-signing/distribution.cert.pem
openssl pkcs12 -export -inkey .ios-signing/distribution.key.pem \
  -in .ios-signing/distribution.cert.pem \
  -out .ios-signing/distribution.p12 -name 'BHU Apple Distribution' \
  -keypbe AES-256-CBC -certpbe AES-256-CBC -macalg sha256
```

Önce özel anahtarın PEM parolası, ardından yeni P12 **Export Password** sorulur. P12 parolasını boş bırakmayın; GitHub'a eklenecek parola bu **Export Password** değeridir. PEM parolasıyla aynı olmak zorunda değildir. Parolalar OpenSSL'in gizli girişinde kalır; komut geçmişine yazılmaz.

Workflow, modern giriş P12 dosyasını değiştirmeden Mac keychain uyumlu şifreli bir pakete dönüştürür; **aynı özel anahtar, sertifika ve P12 parolası korunur**. Dönüşüm yalnız `0700` izinli geçici klasörde, `0600` izinli geçici PEM üzerinden yapılır; PEM log/artifact'a alınmaz ve başarı/hata durumunda `finally` ile hemen silinir. Giriş P12 hazırlama komutunu değiştirmeyin.

## 4. API anahtarı yalnız TestFlight yüklemesi için

Mevcut CLI denemesinde API Secrets kullanıldı; çıkış kodu 0, Apple kabulü veya API yetkisinin çalıştığı kanıtı değildir. Salt okunur durum sorgusu HTTP 401 döndü; bu bir işleme sonucu değildir. Yeni yüklemeden önce gerçek Apple yanıtı doğrulanmalıdır. Aşağıdaki adımlar alternatif/ilerideki kurulum içindir.

**Yalnız IPA üretmek istiyorsanız bu adımı atlayın.** `upload_to_testflight=false` için API anahtarı gerekmez.

Yükleme yapacaksanız [App Store Connect](https://appstoreconnect.apple.com/) içinde **Users and Access → Integrations → App Store Connect API → Team Keys** bölümünü açın. Menüye erişiminiz ve anahtar oluşturma yetkiniz olmalıdır; gerekirse Account Holder/API yöneticisi hesabında yapılır. Build yükleme yetkisi olan bir Team API anahtarı oluşturun. **Key ID** ve **Issuer ID** bilgilerini kaydedin; tek sefer indirilen `.p8` dosyasını `.ios-signing/AuthKey.p8` adıyla Codespaces'e yükleyin. Issuer ID vermeyen farklı anahtar türünü bu workflow için kullanmayın. API anahtarı Apple parolası veya uygulama içi satın alma ürün kaydı yerine geçmez.

## 5. Dosyaları GitHub Actions Secrets'a ekleyin

Dosyalar ve parolalar **sohbete, kaynak dosyalara veya workflow YAML içine yazılmaz**. Yalnız repository **Settings → Secrets and variables → Actions** alanına eklenir. Aşağıdaki yöntem dosyaları terminale yazdırmadan `gh secret set` standart girdisine gönderir. P12/profil base64, `.p8` ise ham dosya içeriği olur.

Codespaces'in otomatik token'ı repo Secrets yazma yetkisi taşımayabilir. Kendi yetkili GitHub hesabınızla CLI oturumu açın; tarayıcı doğrulamasını GitHub'ın gösterdiği sayfada tamamlayın. Bu komut Codespaces token'ını yalnız bu çağrıda devre dışı bırakır:

```sh
env -u GH_TOKEN -u GITHUB_TOKEN gh auth login --web --scopes repo
```

Aşağıdaki bloğu aynı Codespaces terminalinde çalıştırın. Parolayı sorulduğunda gizli girişe yazın; kodun içine koymayın. TestFlight API bilgilerini eklemek istemiyorsanız son soruda Enter'a basın.

```sh
python3 - <<'PYSET'
import base64
import getpass
from pathlib import Path
import subprocess

folder = Path('.ios-signing')

def ask(prompt):
    print(prompt, end='', flush=True)
    with open('/dev/tty', encoding='utf-8') as terminal:
        return terminal.readline().strip()

def set_secret(name, value):
    subprocess.run(['env', '-u', 'GH_TOKEN', '-u', 'GITHUB_TOKEN',
                    'gh', 'secret', 'set', name, '--repo', 'fevzicakmak/BHU'],
                   input=value, check=True)

for name, filename in (
    ('APPLE_DISTRIBUTION_P12_BASE64', 'distribution.p12'),
    ('APPLE_PROVISIONING_PROFILE_BASE64', 'BHU_AppStore.mobileprovision'),
):
    set_secret(name, base64.b64encode((folder / filename).read_bytes()))
password = getpass.getpass('P12 Export Password (görünmez): ')
if not password:
    raise SystemExit('Boş P12 parolası eklenmedi.')
set_secret('APPLE_DISTRIBUTION_P12_PASSWORD', password.encode('utf-8'))
if ask('TestFlight API anahtarını da ekleyelim mi? [e/H] ').lower() == 'e':
    key_id = ask('App Store Connect Key ID: ')
    issuer_id = ask('App Store Connect Issuer ID: ')
    if not key_id or not issuer_id:
        raise SystemExit('Key ID ve Issuer ID gerekli.')
    set_secret('APP_STORE_CONNECT_KEY_ID', key_id.encode('utf-8'))
    set_secret('APP_STORE_CONNECT_ISSUER_ID', issuer_id.encode('utf-8'))
    set_secret('APP_STORE_CONNECT_PRIVATE_KEY', (folder / 'AuthKey.p8').read_bytes())
print('Secret değerleri yazdırılmadan GitHub’a gönderildi.')
PYSET
```

Repo Secrets sayfasında yalnız anahtar adlarının listelendiğini kontrol edin. `403`/yetki hatası olursa doğru depo ve Secrets yönetme yetkili GitHub oturumunu kontrol edin; gizli değerleri hata mesajına eklemeyin. İş bittiğinde Codespaces'teki özel dosyaları temizlemeden önce gerekli anahtarların şifreli, güvenli kişisel yedeğini koruyun.

## 6. Önce IPA, sonra isteğe bağlı TestFlight

Workflow `main` dalında bulunmalıdır. GitHub deposunda **Actions → iOS Signing and TestFlight → Run workflow** açın; dağıtım için `main` dalını seçin. Başka daldan dağıtım işi çalıştırılmaz. Kaynak [testflight.yml](../../.github/workflows/testflight.yml), yardımcı [ios-signing.mjs](../../scripts/ios-signing.mjs) dosyasıdır; workflow `preflight` kontrolünden sonra `distribute` adımını çalıştırır.

- **İlk deneme:** `upload_to_testflight=false`. P12/parola/profil gerekir; API anahtarı gerekmez. Başarı halinde **BHU-AppStore-IPA** artifact'ından `BHU.ipa` ve gizli bilgi içermeyen `distribution-summary.json` alınır; çıktılar 7 gün saklanır. Runner'daki IPA yolu `ios-distribution/BHU.ipa` olur. Bu, App Store Connect'e yükleme değildir; App Store IPA'sı bir iPhone'a doğrudan dosya olarak kurulum yolu da değildir.
- **Yükleme:** Apple uygulama kaydı ve API Secrets hazır olduğunda `upload_to_testflight=true` seçip manuel çalıştırın. Bu seçim Apple'a gerçek build yüklemesini başlatır; uygulamayı App Store'da yayımlamaz.
- `build_number` isteğe bağlıdır; boşsa `GITHUB_RUN_NUMBER.GITHUB_RUN_ATTEMPT` kullanılır. Dolu girerseniz App Store Connect'te aynı sürüm için daha önce kullanılmamış bir build numarası olmalıdır.

Apple kimlik dosyaları eksikse workflow yükleme yapamaz. Workflow portalda sertifika/profil oluşturmaz, mevcut sertifikayı iptal etmez. Yükleme başarılı olsa da App Store Connect'in build'i işlemesi, gerekli compliance yanıtları ve TestFlight erişimi ayrıca tamamlanır. Gerçek iPhone/iPad'de [kabul planını](testflight-test-plan.md) uygulayın; gerçek satın alma/geri yükleme ve BHU arayüzünden kayıt/yeniden açma sonuçlarını kontrol edin. Son imzalı arşiv yeniden doğrulanır; önceki imzasız CI kanıtı bu yükleme için onay değildir.
