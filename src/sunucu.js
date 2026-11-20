// YT İndirici sunucusu.
// Varsayılan: yalnızca bu bilgisayar (127.0.0.1). Herkese açık kurulumda ayarlar ortam değişkenleriyle verilir (bkz. compose.yaml).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  youtubeAdresiMi, kaliteleriCikar, istegiDogrula, indirmeArgumanlari,
  dosyaAdiTemizle, icerikBasligi, ffmpegGerekliMi, kesmeArgumanlari, CIKTI_UZANTISI,
  Sinirlayici, istemciIp, boyutlariCikar, secimBoyutu, boyutUyarisi, MB,
} from './yardimci.js';
import { yonetimSunucusu } from './yonetim.js';

const ortam = (ad, varsayilan) => (process.env[ad] === undefined || process.env[ad] === '' ? varsayilan : process.env[ad]);
const sayi = (ad, varsayilan) => Number(ortam(ad, varsayilan));

const PORT = sayi('PORT', 8765);
const HOST = ortam('HOST', '127.0.0.1');
const VEKILE_GUVEN = ortam('VEKILE_GUVEN', '0') === '1';
const EN_FAZLA_ESZAMANLI = sayi('EN_FAZLA_ESZAMANLI', 3);
const KISI_BASI_ESZAMANLI = sayi('KISI_BASI_ESZAMANLI', 0); // 0 = sınırsız
const SAATLIK_INDIRME = sayi('SAATLIK_INDIRME', 0);
const SAATLIK_BILGI = sayi('SAATLIK_BILGI', 0);
const EN_UZUN_VIDEO_SN = sayi('EN_UZUN_VIDEO_SN', 0);
const EN_YUKSEK_KALITE = sayi('EN_YUKSEK_KALITE', 0);
const EN_BUYUK_DOSYA = ortam('EN_BUYUK_DOSYA', '');
// Tahmini boyutu bunu aşan indirmeler hiç başlatılmaz (MB, 0 = sınırsız).
const EN_BUYUK_BOYUT = sayi('EN_BUYUK_BOYUT_MB', 500) * MB;
const JS_MOTORU = ortam('JS_MOTORU', 'node');
// Yönetim kapısı (aç/kapat). 0 ise açılmaz. Yalnızca Tailscale ağına açılmalı.
const YONETIM_PORT = sayi('YONETIM_PORT', 0);
const DURUM_DOSYASI = ortam('DURUM_DOSYASI', '');
const PANO_ADRESI = ortam('PANO_ADRESI', '');

const KOK = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GENEL = path.join(KOK, 'public');
const GECICI = ortam('GECICI', path.join(os.tmpdir(), 'yt-indirici'));
const YTDLP = ortam('YTDLP', 'yt-dlp');
const FFMPEG = ortam('FFMPEG', 'ffmpeg');
const IS_OMRU_MS = 60 * 60 * 1000;
const BILGI_OMRU_MS = 30 * 60 * 1000;

const STATIK = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/stil.css': ['stil.css', 'text/css; charset=utf-8'],
  '/uygulama.js': ['uygulama.js', 'text/javascript; charset=utf-8'],
  '/zaman.js': ['zaman.js', 'text/javascript; charset=utf-8'],
  '/boyut.js': ['boyut.js', 'text/javascript; charset=utf-8'],
};

const GUVENLIK_BASLIKLARI = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

const isler = new Map();
let herkeseAcik = true;
const bilgiOnbellegi = new Map(); // url -> { veri, zaman }
const indirmeSiniri = new Sinirlayici(SAATLIK_INDIRME, 60 * 60 * 1000);
const bilgiSiniri = new Sinirlayici(SAATLIK_BILGI, 60 * 60 * 1000);

function jsonGonder(res, kod, veri) {
  res.writeHead(kod, { ...GUVENLIK_BASLIKLARI, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(veri));
}

function govdeOku(req, sinir = 10_000) {
  return new Promise((coz, reddet) => {
    let veri = '';
    req.setEncoding('utf8');
    req.on('data', (p) => {
      veri += p;
      if (veri.length > sinir) { reddet(new Error('Gövde çok büyük')); req.destroy(); }
    });
    req.on('end', () => { try { coz(JSON.parse(veri || '{}')); } catch { reddet(new Error('JSON okunamadı')); } });
    req.on('error', reddet);
  });
}

function hataSatiri(stderr) {
  const satirlar = stderr.split(/\r?\n/).filter((s) => s.includes('ERROR'));
  const son = satirlar.at(-1) || stderr.trim().split(/\r?\n/).at(-1) || 'Bilinmeyen hata';
  return son.replace(/^ERROR:\s*/, '').slice(0, 400);
}

function ytdlpOrtakArgumanlar() {
  return JS_MOTORU && JS_MOTORU !== 'yok' ? ['--js-runtimes', JS_MOTORU] : [];
}

function ytdlpCalistir(argumanlar, zamanAsimi) {
  return new Promise((coz) => {
    const cocuk = spawn(YTDLP, [...ytdlpOrtakArgumanlar(), ...argumanlar], { windowsHide: true });
    let cikti = '';
    let hata = '';
    const zamanlayici = setTimeout(() => cocuk.kill(), zamanAsimi);
    cocuk.stdout.on('data', (p) => { if (cikti.length < 50_000_000) cikti += p; });
    cocuk.stderr.on('data', (p) => { hata += p; if (hata.length > 100_000) hata = hata.slice(-50_000); });
    cocuk.on('error', (e) => { clearTimeout(zamanlayici); coz({ kod: -1, cikti, hata: `yt-dlp çalıştırılamadı: ${e.message}` }); });
    cocuk.on('close', (kod) => { clearTimeout(zamanlayici); coz({ kod, cikti, hata }); });
  });
}

// Video bilgisini getirir; 30 dk önbellekte tutar. Hata varsa { hata, kod } döner.
async function videoBilgisi(url) {
  const onceki = bilgiOnbellegi.get(url);
  if (onceki && Date.now() - onceki.zaman < BILGI_OMRU_MS) return { veri: onceki.veri };

  const { kod, cikti, hata } = await ytdlpCalistir(['-J', '--no-playlist', '--no-warnings', '--', url], 90_000);
  if (kod !== 0) return { hata: hataSatiri(hata), kod: 502 };

  let bilgi;
  try { bilgi = JSON.parse(cikti); } catch { return { hata: 'Video bilgisi okunamadı.', kod: 502 }; }
  if (bilgi.is_live || bilgi.live_status === 'is_upcoming') return { hata: 'Canlı yayınlar desteklenmiyor.', kod: 400 };

  let kaliteler = kaliteleriCikar(bilgi.formats);
  if (EN_YUKSEK_KALITE) kaliteler = kaliteler.filter((k) => k <= EN_YUKSEK_KALITE);

  const veri = {
    id: bilgi.id,
    baslik: bilgi.title || 'video',
    kanal: bilgi.channel || bilgi.uploader || '',
    sure: Number(bilgi.duration) || 0,
    kucukResim: bilgi.thumbnail || '',
    sayfa: bilgi.webpage_url || url,
    kaliteler,
    enUzunSure: EN_UZUN_VIDEO_SN || 0,
    boyutlar: boyutlariCikar(bilgi.formats, Number(bilgi.duration) || 0, kaliteler, EN_YUKSEK_KALITE),
    enBuyukBoyut: EN_BUYUK_BOYUT,
  };
  bilgiOnbellegi.set(url, { veri, zaman: Date.now() });
  return { veri };
}

function sureSiniriHatasi(sure) {
  if (EN_UZUN_VIDEO_SN && sure > EN_UZUN_VIDEO_SN) {
    return `Bu sunucuda en fazla ${Math.round(EN_UZUN_VIDEO_SN / 60)} dakikalık videolar indirilebilir.`;
  }
  return null;
}

async function bilgiGetir(req, res, adres, ip) {
  const url = (adres.searchParams.get('url') || '').trim();
  if (!youtubeAdresiMi(url)) return jsonGonder(res, 400, { hata: 'Geçerli bir YouTube adresi yapıştır.' });
  if (!bilgiOnbellegi.has(url) && !bilgiSiniri.dene(ip)) {
    return jsonGonder(res, 429, { hata: 'Çok fazla istek. Biraz sonra tekrar dene.' });
  }

  const { veri, hata, kod } = await videoBilgisi(url);
  if (hata) return jsonGonder(res, kod, { hata });
  jsonGonder(res, 200, veri);
}

function calisanIsler() {
  return [...isler.values()].filter((i) => i.durum !== 'bitti' && i.durum !== 'hata');
}

async function indirmeBaslat(req, res, ip) {
  let govde;
  try { govde = await govdeOku(req); } catch (e) { return jsonGonder(res, 400, { hata: e.message }); }
  if (!youtubeAdresiMi(govde?.url)) return jsonGonder(res, 400, { hata: 'Geçerli bir YouTube adresi değil.' });

  const calisan = calisanIsler();
  if (KISI_BASI_ESZAMANLI && calisan.filter((i) => i.ip === ip).length >= KISI_BASI_ESZAMANLI) {
    return jsonGonder(res, 429, { hata: 'Önceki indirmen bitmeden yenisini başlatamazsın.' });
  }
  if (calisan.length >= EN_FAZLA_ESZAMANLI) {
    return jsonGonder(res, 429, { hata: 'Sunucu şu an meşgul. Birkaç dakika sonra tekrar dene.' });
  }

  // Süreyi tarayıcıya değil, sunucunun kendi bilgisine göre değerlendir.
  const { veri, hata: bilgiHatasi, kod } = await videoBilgisi(govde.url.trim());
  if (bilgiHatasi) return jsonGonder(res, kod, { hata: bilgiHatasi });
  const sureHatasi = sureSiniriHatasi(veri.sure);
  if (sureHatasi) return jsonGonder(res, 400, { hata: sureHatasi });

  const { hata, secim } = istegiDogrula({ ...govde, sure: veri.sure });
  if (hata) return jsonGonder(res, 400, { hata });
  if (EN_YUKSEK_KALITE && secim.bicim === 'mp4' && (!secim.kalite || secim.kalite > EN_YUKSEK_KALITE)) {
    secim.kalite = EN_YUKSEK_KALITE;
  }

  // Çok büyük indirmeleri baştan reddet (saatlik hakkı harcamadan).
  const boyutHatasi = boyutUyarisi(secimBoyutu(veri.boyutlar, secim.bicim, secim.kalite, secim.son - secim.bas), EN_BUYUK_BOYUT);
  if (boyutHatasi) return jsonGonder(res, 413, { hata: boyutHatasi });

  if (!indirmeSiniri.dene(ip)) {
    return jsonGonder(res, 429, { hata: `Saatte en fazla ${SAATLIK_INDIRME} indirme yapılabilir. Biraz sonra tekrar dene.` });
  }

  const id = crypto.randomUUID();
  const klasor = path.join(GECICI, id);
  await fsp.mkdir(klasor, { recursive: true });

  const is = {
    id, ip, klasor, durum: 'hazirlaniyor', yuzde: 0, hata: '', dosya: '',
    ad: dosyaAdiTemizle(govde.baslik || veri.baslik), olusturma: Date.now(), cocuk: null,
  };
  isler.set(id, is);

  const argumanlar = [...ytdlpOrtakArgumanlar(), ...indirmeArgumanlari(secim, klasor)];
  if (EN_BUYUK_DOSYA) argumanlar.splice(argumanlar.indexOf('--'), 0, '--max-filesize', EN_BUYUK_DOSYA);
  const cocuk = spawn(YTDLP, argumanlar, { windowsHide: true });
  is.cocuk = cocuk;
  let stderr = '';
  let artik = '';

  cocuk.stdout.setEncoding('utf8');
  cocuk.stdout.on('data', (p) => {
    artik += p;
    const satirlar = artik.split(/\r?\n/);
    artik = satirlar.pop();
    for (const satir of satirlar) {
      const yuzde = satir.match(/YUZDE\s+([\d.]+)%/);
      if (yuzde) { is.durum = 'indiriliyor'; is.yuzde = Math.min(100, Number(yuzde[1])); continue; }
      if (/^\[(download|youtube|info)\]/.test(satir) && is.durum === 'hazirlaniyor') is.durum = 'indiriliyor';
      if (/^\[(Merger|FixupM3u8|VideoRemuxer)\]/.test(satir)) is.durum = 'birlestiriliyor';
      if (/File is larger than max-filesize/.test(satir)) is.boyutAsildi = true;
    }
  });
  cocuk.stderr.on('data', (p) => { stderr += p; if (stderr.length > 100_000) stderr = stderr.slice(-50_000); });
  cocuk.on('error', (e) => { is.durum = 'hata'; is.hata = `yt-dlp çalıştırılamadı: ${e.message}`; });
  cocuk.on('close', async (kodu) => {
    is.cocuk = null;
    if (is.durum === 'hata' || !isler.has(id)) return;
    if (kodu !== 0) { is.durum = 'hata'; is.hata = hataSatiri(stderr); return; }
    try {
      const dosyalar = (await fsp.readdir(klasor)).filter((d) => d.startsWith('kaynak.') && !/\.(part|ytdl|temp)$/.test(d));
      if (!dosyalar.length) {
        throw new Error(is.boyutAsildi ? 'Video bu sunucu için çok büyük. Daha düşük kalite seç.' : 'İndirilen dosya bulunamadı.');
      }
      const kaynak = path.join(klasor, dosyalar[0]);

      if (ffmpegGerekliMi(secim)) {
        const cikti = path.join(klasor, `sonuc${CIKTI_UZANTISI[secim.bicim]}`);
        await ffmpegCalistir(is, kesmeArgumanlari(secim, kaynak, cikti), secim.son - secim.bas);
        fsp.rm(kaynak, { force: true }).catch(() => {});
        is.dosya = cikti;
      } else {
        is.dosya = kaynak;
      }
      if (!isler.has(id)) return;
      is.yuzde = 100;
      is.durum = 'bitti';
    } catch (e) {
      is.durum = 'hata';
      is.hata = e.message;
    }
  });

  jsonGonder(res, 200, { id });
}

function ffmpegCalistir(is, argumanlar, sure) {
  return new Promise((coz, reddet) => {
    is.durum = 'isleniyor';
    is.yuzde = 0;
    const cocuk = spawn(FFMPEG, argumanlar, { windowsHide: true });
    is.cocuk = cocuk;
    let stderr = '';
    cocuk.stdout.setEncoding('utf8');
    cocuk.stdout.on('data', (p) => {
      const m = [...p.matchAll(/out_time_us=(\d+)/g)].at(-1);
      if (m && sure > 0) is.yuzde = Math.min(99, (Number(m[1]) / 1e6 / sure) * 100);
    });
    cocuk.stderr.on('data', (p) => { stderr += p; if (stderr.length > 50_000) stderr = stderr.slice(-20_000); });
    cocuk.on('error', (e) => reddet(new Error(`ffmpeg çalıştırılamadı: ${e.message}`)));
    cocuk.on('close', (kod) => {
      is.cocuk = null;
      if (kod === 0) coz();
      else reddet(new Error(`Kesme başarısız: ${hataSatiri(stderr) || kod}`));
    });
  });
}

function durumGonder(res, adres) {
  const is = isler.get(adres.searchParams.get('id'));
  if (!is) return jsonGonder(res, 404, { hata: 'İş bulunamadı.' });
  jsonGonder(res, 200, { durum: is.durum, yuzde: is.yuzde, hata: is.hata });
}

async function isiSil(is) {
  isler.delete(is.id);
  if (is.cocuk) is.cocuk.kill();
  await fsp.rm(is.klasor, { recursive: true, force: true }).catch(() => {});
}

async function dosyaGonder(res, adres) {
  const is = isler.get(adres.searchParams.get('id'));
  if (!is || is.durum !== 'bitti') return jsonGonder(res, 404, { hata: 'Dosya hazır değil.' });

  const uzanti = path.extname(is.dosya);
  const { size } = await fsp.stat(is.dosya);
  res.writeHead(200, {
    ...GUVENLIK_BASLIKLARI,
    'Content-Type': 'application/octet-stream',
    'Content-Length': size,
    'Content-Disposition': icerikBasligi(is.ad + uzanti),
    'Cache-Control': 'no-store',
  });
  const akis = fs.createReadStream(is.dosya);
  akis.pipe(res);
  res.on('close', () => { akis.destroy(); isiSil(is); });
}

async function statikGonder(res, yol) {
  const [dosya, tur] = STATIK[yol];
  const icerik = await fsp.readFile(path.join(GENEL, dosya));
  res.writeHead(200, { ...GUVENLIK_BASLIKLARI, 'Content-Type': tur, 'Cache-Control': 'no-cache' });
  res.end(icerik);
}

async function durumuYukle() {
  if (!DURUM_DOSYASI) return;
  try {
    herkeseAcik = JSON.parse(await fsp.readFile(DURUM_DOSYASI, 'utf8')).herkeseAcik !== false;
  } catch {
    herkeseAcik = true;
  }
}

async function durumuAyarla(acik) {
  herkeseAcik = acik;
  if (!acik) for (const is of [...isler.values()]) isiSil(is);
  if (DURUM_DOSYASI) {
    await fsp.writeFile(DURUM_DOSYASI, JSON.stringify({ herkeseAcik: acik, degisti: new Date().toISOString() }))
      .catch((e) => console.error('Durum dosyası yazılamadı:', e.message));
  }
  console.log(`YT Bot herkese ${acik ? 'AÇILDI' : 'KAPATILDI'} (${new Date().toISOString()})`);
}

const KAPALI_SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YT Bot kapalı</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0d;color:#f1f1f4;
font:16px/1.5 system-ui,"Segoe UI",sans-serif;text-align:center;padding:16px}h1{font-size:24px;margin:0 0 8px}p{color:#a9a9b3;margin:0}
span{color:#ffc21a}</style></head><body><div><h1><span>YT</span> Bot şu an kapalı</h1><p>Daha sonra tekrar dene.</p></div></body></html>`;

function kapaliGonder(res, yol) {
  if (yol.startsWith('/api/')) return jsonGonder(res, 503, { hata: 'YT Bot şu an kapalı. Daha sonra tekrar dene.' });
  res.writeHead(503, { ...GUVENLIK_BASLIKLARI, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '3600' });
  res.end(KAPALI_SAYFA);
}

// Başka sitelerin bu sunucuya tarayıcı üzerinden istek atmasını engelle: köken, sayfanın kendi adresi olmalı.
function kokenUygunMu(req) {
  const koken = req.headers.origin;
  if (!koken) return true;
  try {
    const k = new URL(koken);
    return k.host === req.headers.host || k.host === req.headers['x-forwarded-host'];
  } catch {
    return false;
  }
}

const sunucu = http.createServer(async (req, res) => {
  try {
    const adres = new URL(req.url, 'http://yerel');
    const yol = adres.pathname;
    if (req.method === 'GET' && yol === '/saglik') {
      return jsonGonder(res, 200, { durum: 'iyi', herkeseAcik, durumYazisi: herkeseAcik ? 'AÇIK' : 'KAPALI', calisan: calisanIsler().length });
    }
    if (!herkeseAcik) return kapaliGonder(res, yol);
    if (yol.startsWith('/api/') && !kokenUygunMu(req)) return jsonGonder(res, 403, { hata: 'İzin yok.' });
    const ip = istemciIp(req.socket.remoteAddress, req.headers['x-forwarded-for'], VEKILE_GUVEN);

    if (req.method === 'GET' && STATIK[yol]) return await statikGonder(res, yol);
    if (req.method === 'GET' && yol === '/api/bilgi') return await bilgiGetir(req, res, adres, ip);
    if (req.method === 'POST' && yol === '/api/indir') return await indirmeBaslat(req, res, ip);
    if (req.method === 'GET' && yol === '/api/durum') return durumGonder(res, adres);
    if (req.method === 'GET' && yol === '/api/dosya') return await dosyaGonder(res, adres);
    jsonGonder(res, 404, { hata: 'Bulunamadı.' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) jsonGonder(res, 500, { hata: 'Sunucu hatası.' });
    else res.destroy();
  }
});

// Eski işleri, önbelleği ve sayaçları temizle.
setInterval(() => {
  const simdi = Date.now();
  for (const is of isler.values()) if (simdi - is.olusturma > IS_OMRU_MS) isiSil(is);
  for (const [url, k] of bilgiOnbellegi) if (simdi - k.zaman > BILGI_OMRU_MS) bilgiOnbellegi.delete(url);
  indirmeSiniri.temizle();
  bilgiSiniri.temizle();
}, 5 * 60 * 1000).unref();

await fsp.rm(GECICI, { recursive: true, force: true }).catch(() => {});
await fsp.mkdir(GECICI, { recursive: true });
await durumuYukle();

let yonetim = null;
if (YONETIM_PORT) {
  yonetim = yonetimSunucusu({
    durumuAl: () => herkeseAcik,
    durumuAyarla,
    calisanSayisi: () => calisanIsler().length,
    pano: PANO_ADRESI,
  });
  yonetim.listen(YONETIM_PORT, HOST, () => console.log(`Yönetim kapısı: ${YONETIM_PORT} (herkese açık: ${herkeseAcik ? 'evet' : 'hayır'})`));
}

for (const sinyal of ['SIGINT', 'SIGTERM']) {
  process.on(sinyal, () => {
    for (const is of isler.values()) is.cocuk?.kill();
    yonetim?.close();
    sunucu.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

sunucu.listen(PORT, HOST, () => {
  console.log(`YT İndirici çalışıyor: http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`);
  if (HOST === '127.0.0.1') console.log('Kapatmak için bu pencerede Ctrl+C.');
});
