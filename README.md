# YT İndirici

YouTube videolarını seçtiğin kalitede ve istediğin saniye aralığında indiren basit bir web uygulaması.

**Canlı:** https://archlinux.tail33ab38.ts.net:8443

## Özellikler

- Bağlantıyı yapıştır, video bilgisi ve küçük resim gelsin
- **Saniye aralığı:** çift tutamaçlı kaydırıcı, elle zaman yazma (`1:23.5`), ±1 sn ince ayar
- **Önizleme:** videoyu sayfada oynat, "başı/sonu şu ana al" ile aralığı izleyerek seç
- **Kalite:** videoda hangi çözünürlükler varsa onlar listelenir. MP3 için 128–320 kbps
- Biçimler: MP4 (H.264 + AAC), MP3, WAV
- Kesim kare doğruluğunda yapılır (yeniden kodlanır)

## Nasıl çalışır

Node sunucusu [yt-dlp](https://github.com/yt-dlp/yt-dlp) ile dosyayı indirir, [ffmpeg](https://ffmpeg.org) ile seçilen aralığı keser. npm bağımlılığı yoktur.

Dosya önce bütün olarak indirilir, sonra yerelde kesilir. YouTube'dan doğrudan aralık çekmek (`--download-sections`) çok yavaş: 15 sn'lik bir parça ~125 sn sürüyor. Bu yöntemle aynı parça ~20 sn'de hazır oluyor.

## Kendi bilgisayarında çalıştırma

Gerekenler: Node.js 20+, `yt-dlp`, `ffmpeg`.

```bash
npm start            # http://127.0.0.1:8765
npm test             # birim testleri
```

Windows'ta `baslat.bat` dosyasına çift tıklaman yeterli.

## Sunucuda çalıştırma (Docker)

```bash
docker compose up -d --build   # 127.0.0.1:8085
```

Sınırlar `compose.yaml` içindeki ortam değişkenleriyle ayarlanır:

| Değişken | Anlamı |
|---|---|
| `EN_FAZLA_ESZAMANLI` | Sunucuda aynı anda çalışan iş sayısı |
| `KISI_BASI_ESZAMANLI` | Kişi başı aynı anda iş |
| `SAATLIK_INDIRME`, `SAATLIK_BILGI` | Kişi başı saatlik sınırlar |
| `EN_UZUN_VIDEO_SN` | Bundan uzun videolar reddedilir |
| `EN_YUKSEK_KALITE` | En yüksek çözünürlük (ör. 1080) |
| `EN_BUYUK_BOYUT_MB` | Tahmini boyutu bunu aşan indirmeler uyarıyla reddedilir (varsayılan `500`, `0` = sınırsız). Kalite listesinde her seçeneğin yaklaşık boyutu görünür |
| `EN_BUYUK_DOSYA` | yt-dlp için yedek boyut sınırı (ör. `500M`): tahmin tutmazsa indirmeyi durdurur |
| `VEKILE_GUVEN` | `1` ise istemci IP'si `X-Forwarded-For` başlığından okunur |

## Not

Kişisel kullanım içindir. Telif hakkı olan içerikleri indirirken hak sahiplerine saygı göster. DRM'li içerik ve canlı yayın desteklenmez.
