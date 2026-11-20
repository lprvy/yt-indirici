import test from 'node:test';
import assert from 'node:assert/strict';
import {
  youtubeAdresiMi, saniyeyeCevir, sureYaz, dosyaAdiTemizle, kaliteleriCikar,
  istegiDogrula, indirmeArgumanlari, icerikBasligi, kesmeArgumanlari, ffmpegGerekliMi,
  Sinirlayici, istemciIp,
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
