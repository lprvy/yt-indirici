import test from 'node:test';
import assert from 'node:assert/strict';
import {
  youtubeAdresiMi, saniyeyeCevir, sureYaz, dosyaAdiTemizle, kaliteleriCikar,
  istegiDogrula, indirmeArgumanlari, icerikBasligi, kesmeArgumanlari, ffmpegGerekliMi,
  Sinirlayici, istemciIp, yonetimIstegiUygunMu,
} from '../src/yardimci.js';

test('YouTube adresleri tanınır, diğerleri reddedilir', () => {
  assert.ok(youtubeAdresiMi('https://www.youtube.com/watch?v=abc'));
  assert.ok(youtubeAdresiMi('https://youtu.be/abc'));
  assert.ok(youtubeAdresiMi('https://music.youtube.com/watch?v=abc'));
  assert.ok(!youtubeAdresiMi('https://evil.com/youtube.com'));
  assert.ok(!youtubeAdresiMi('https://youtube.com.evil.com/'));
  assert.ok(!youtubeAdresiMi('file:///C:/a'));
  assert.ok(!youtubeAdresiMi('--exec calc'));
});

test('zaman çevirme', () => {
  assert.equal(saniyeyeCevir('75'), 75);
  assert.equal(saniyeyeCevir('1:15'), 75);
  assert.equal(saniyeyeCevir('01:02:03.5'), 3723.5);
  assert.equal(saniyeyeCevir('1:60'), null);
  assert.equal(saniyeyeCevir('abc'), null);
  assert.equal(saniyeyeCevir('-3'), null);
  assert.equal(sureYaz(3723.5), '01:02:03.5');
  assert.equal(sureYaz(607), '00:10:07');
});

test('dosya adı temizleme', () => {
  assert.equal(dosyaAdiTemizle('a/b:c*?"<>|'), 'a b c');
  assert.equal(dosyaAdiTemizle('   '), 'video');
  assert.equal(dosyaAdiTemizle('챌린저 탈론'), '챌린저 탈론');
  assert.equal(dosyaAdiTemizle('ad...'), 'ad');
});

test('kaliteler büyükten küçüğe, tekrarsız', () => {
  const bicimler = [
    { vcodec: 'avc1', height: 360 }, { vcodec: 'vp9', height: 1080 },
    { vcodec: 'avc1', height: 360 }, { vcodec: 'none', height: null }, { vcodec: 'images', height: 90 },
  ];
  assert.deepEqual(kaliteleriCikar(bicimler), [1080, 360, 90]);
});

const temel = { url: 'https://youtu.be/abc', bicim: 'mp4', kalite: '720', bas: 10, son: 25.5, sure: 607 };

test('istek doğrulama', () => {
  assert.equal(istegiDogrula(temel).secim.kesilecek, true);
  assert.equal(istegiDogrula({ ...temel, bas: 0, son: 607 }).secim.kesilecek, false);
  assert.ok(istegiDogrula({ ...temel, url: 'https://x.com' }).hata);
  assert.ok(istegiDogrula({ ...temel, bicim: 'exe' }).hata);
  assert.ok(istegiDogrula({ ...temel, kalite: '720; rm' }).hata);
  assert.ok(istegiDogrula({ ...temel, bas: 20, son: 10 }).hata);
  assert.ok(istegiDogrula({ ...temel, bas: 700, son: 800 }).hata);
  assert.ok(istegiDogrula({ ...temel, bicim: 'mp3', kalite: '999' }).hata);
  assert.equal(istegiDogrula({ ...temel, bicim: 'mp3', kalite: '192' }).secim.kalite, 192);
  assert.equal(istegiDogrula({ ...temel, bicim: 'wav', kalite: '' }).secim.kalite, null);
});

test('yt-dlp aralık istemez, dosyayı bütün indirir', () => {
  const mp4 = indirmeArgumanlari(istegiDogrula(temel).secim, 'K');
  assert.deepEqual(mp4.slice(-2), ['--', 'https://youtu.be/abc']);
  assert.ok(!mp4.includes('--download-sections'));
  assert.ok(mp4.includes('res:720,vcodec:h264,acodec:m4a'));
  const mp3 = indirmeArgumanlari(istegiDogrula({ ...temel, bicim: 'mp3', kalite: '320' }).secim, 'K');
  assert.ok(mp3.includes('ba/b') && !mp3.includes('-x'));
});

test('ffmpeg kesme argümanları', () => {
  const kesik = istegiDogrula(temel).secim;
  const a = kesmeArgumanlari(kesik, 'g.mp4', 'c.mp4');
  assert.deepEqual(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 6), ['-ss', '10', '-i', 'g.mp4', '-t', '15.5']);
  assert.ok(a.includes('libx264'));
  assert.equal(a.at(-1), 'c.mp4');

  const tam = istegiDogrula({ ...temel, bas: 0, son: 607 }).secim;
  assert.equal(ffmpegGerekliMi(tam), false);
  assert.ok(!kesmeArgumanlari(tam, 'g', 'c').includes('-ss'));

  const mp3 = istegiDogrula({ ...temel, bicim: 'mp3', kalite: '320', bas: 0, son: 607 }).secim;
  assert.equal(ffmpegGerekliMi(mp3), true);
  assert.ok(kesmeArgumanlari(mp3, 'g', 'c').includes('320k'));
});

test('Content-Disposition Türkçe ve Korece adları taşır', () => {
  const b = icerikBasligi('Şarkı 챌린저.mp4');
  assert.match(b, /^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
  assert.ok(b.includes(encodeURIComponent('Şarkı 챌린저.mp4')));
});

test('sınırlayıcı saatlik sayar ve pencere geçince açar', () => {
  let t = 0;
  const s = new Sinirlayici(2, 1000, () => t);
  assert.ok(s.dene('a'));
  assert.ok(s.dene('a'));
  assert.ok(!s.dene('a'));
  assert.ok(s.dene('b'));
  t = 1001;
  assert.ok(s.dene('a'));
  assert.ok(new Sinirlayici(0, 1000).dene('x'), '0 sınırsız demek');
});

test('istemci IP: vekile yalnızca açıkça güvenilirse XFF okunur', () => {
  assert.equal(istemciIp('172.18.0.1', '1.2.3.4', false), '172.18.0.1');
  assert.equal(istemciIp('172.18.0.1', 'sahte, 5.6.7.8', true), '5.6.7.8');
  assert.equal(istemciIp('172.18.0.1', '', true), '172.18.0.1');
});

// ---------- boyut tahmini ve büyük dosya uyarısı ----------
import { boyutlariCikar, secimBoyutu, boyutUyarisi, boyutYaz, MB } from '../src/yardimci.js';

const SURE = 600;
const ORNEK_BICIMLER = [
  { format_id: '140', vcodec: 'none', acodec: 'mp4a.40.2', filesize: 10 * MB },
  { format_id: '251', vcodec: 'none', acodec: 'opus', filesize: 12 * MB },
  { format_id: '137', vcodec: 'avc1.640028', acodec: 'none', height: 1080, filesize: 700 * MB },
  { format_id: '248', vcodec: 'vp9', acodec: 'none', height: 1080, filesize: 900 * MB },
  { format_id: '136', vcodec: 'avc1.4d401f', acodec: 'none', height: 720, filesize_approx: 300 * MB },
  { format_id: '18', vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', height: 360, tbr: 500 },
  { format_id: 'sb0', vcodec: 'none', acodec: 'none', height: 90 },
];

test('boyut tahmini: h264 görüntü + m4a ses, sınırın altındaki en yüksek kalite', () => {
  const b = boyutlariCikar(ORNEK_BICIMLER, SURE, [1080, 720, 360]);
  assert.equal(b.ses, 10 * MB);
  assert.equal(b[1080], 710 * MB, 'vp9 değil h264 seçilir, ses eklenir');
  assert.equal(b[720], 310 * MB, 'yaklaşık boyut da kullanılır');
  assert.equal(b[360], 500 * 125 * SURE, 'sesli birleşik biçime ses eklenmez, bit hızından hesaplanır');
  assert.equal(b['en-iyi'], 710 * MB);
  assert.equal(boyutlariCikar(ORNEK_BICIMLER, SURE, [], 720)['en-iyi'], 310 * MB, 'sunucu sınırı en iyiye de uygulanır');
  assert.deepEqual(boyutlariCikar(undefined, 0, [720]), { ses: null, 'en-iyi': null, 720: null });
});

test('500 MB üstü uyarı verir, altı vermez, bilinmeyen boyut engellenmez', () => {
  const b = boyutlariCikar(ORNEK_BICIMLER, SURE, [1080, 720]);
  const sinir = 500 * MB;
  const buyuk = boyutUyarisi(secimBoyutu(b, 'mp4', 1080, 30), sinir);
  assert.match(buyuk, /yaklaşık 710 MB/);
  assert.match(buyuk, /500 MB'tan büyük indirmeleri yapmak istemiyorum/);
  assert.equal(boyutUyarisi(secimBoyutu(b, 'mp4', 720, 30), sinir), null);
  assert.equal(boyutUyarisi(secimBoyutu(b, 'mp3', 192, 600), sinir), null);
  assert.equal(boyutUyarisi(secimBoyutu({}, 'mp4', 1080, 30), sinir), null, 'tahmin yoksa yedek fren (yt-dlp) devrede');
  assert.equal(boyutUyarisi(secimBoyutu(b, 'mp4', 1080, 30), 0), null, '0 = sınırsız');
  // WAV çıktısı aralığa bağlı: 90 dakika ~ 908 MB
  const wav = boyutUyarisi(secimBoyutu(b, 'wav', null, 5400), sinir);
  assert.match(wav, /hazırlamak istemiyorum/);
  assert.equal(boyutUyarisi(secimBoyutu(b, 'wav', null, 60), sinir), null);
});

test('boyut yazımı', () => {
  assert.equal(boyutYaz(1.5 * 1024 * MB), '1,5 GB');
  assert.equal(boyutYaz(620 * MB), '620 MB');
  assert.equal(boyutYaz(0), '?');
});

test('yönetim bağlantıları yalnızca doğrudan açılınca çalışır', () => {
  assert.ok(yonetimIstegiUygunMu({}), 'curl gibi başlıksız istek');
  assert.ok(yonetimIstegiUygunMu({ 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'cross-site' }));
  assert.ok(!yonetimIstegiUygunMu({ 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' }), 'img etiketiyle tetikleme');
  assert.ok(!yonetimIstegiUygunMu({ 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }), 'fetch ile tetikleme');
  assert.ok(!yonetimIstegiUygunMu({ 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' }), 'iframe içinde');
});
