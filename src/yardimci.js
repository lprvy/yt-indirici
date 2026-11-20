// Sunucudan bağımsız, test edilebilir yardımcılar.
import path from 'node:path';
import { saniyeyeCevir, sureYaz } from '../public/zaman.js';

const IZINLI_ALANLAR = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtu.be', 'www.youtu.be',
]);

export function youtubeAdresiMi(metin) {
  if (typeof metin !== 'string' || metin.length > 2000) return false;
  try {
    const u = new URL(metin.trim());
    return (u.protocol === 'https:' || u.protocol === 'http:') &&
      IZINLI_ALANLAR.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export { saniyeyeCevir, sureYaz };

export function dosyaAdiTemizle(ad) {
  const temiz = String(ad ?? '')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 150)
    .trim();
  return temiz || 'video';
}

export function kaliteleriCikar(bicimler) {
  const yukseklikler = new Set();
  for (const b of bicimler ?? []) {
    if (b && b.vcodec && b.vcodec !== 'none' && Number.isInteger(b.height) && b.height > 0) {
      yukseklikler.add(b.height);
    }
  }
  return [...yukseklikler].sort((a, b) => b - a);
}

export const SES_KALITELERI = [320, 256, 192, 128];
export const BICIMLER = ['mp4', 'mp3', 'wav'];

// İstek gövdesini doğrular. Hata varsa { hata }, yoksa { secim } döner.
export function istegiDogrula(govde) {
  const { url, bicim, kalite, bas, son, sure } = govde ?? {};
  if (!youtubeAdresiMi(url)) return { hata: 'Geçerli bir YouTube adresi değil.' };
  if (!BICIMLER.includes(bicim)) return { hata: 'Biçim tanınmadı.' };

  let kaliteDegeri = null;
  if (bicim === 'mp4') {
    if (kalite !== 'en-iyi') {
      kaliteDegeri = Number(kalite);
      if (!Number.isInteger(kaliteDegeri) || kaliteDegeri < 100 || kaliteDegeri > 4320) {
        return { hata: 'Kalite tanınmadı.' };
      }
    }
  } else if (bicim === 'mp3') {
    kaliteDegeri = Number(kalite);
    if (!SES_KALITELERI.includes(kaliteDegeri)) return { hata: 'Ses kalitesi tanınmadı.' };
  }

  const toplamSure = Number(sure);
  const baslangic = saniyeyeCevir(bas);
  const bitis = saniyeyeCevir(son);
  if (baslangic === null || bitis === null) return { hata: 'Zaman aralığı okunamadı.' };
  if (bitis - baslangic < 0.5) return { hata: 'Bitiş, başlangıçtan en az yarım saniye sonra olmalı.' };
  if (Number.isFinite(toplamSure) && toplamSure > 0 && baslangic >= toplamSure) {
    return { hata: 'Başlangıç videonun süresini aşıyor.' };
  }
  const kesilecek = baslangic > 0 || !(Number.isFinite(toplamSure) && toplamSure > 0 && bitis >= toplamSure - 0.05);

  return {
    secim: {
      url: url.trim(), bicim, kalite: kaliteDegeri,
      bas: baslangic, son: bitis, kesilecek,
    },
  };
}

// yt-dlp argümanları. Kabuk kullanılmaz; adres her zaman "--" sonrasına konur.
// Aralık burada istenmez: YouTube, ffmpeg ile yapılan aralık indirmesini çok yavaşlatıyor
// (15 sn'lik parça ~125 sn). Dosya yt-dlp'nin kendi indiricisiyle bütün iner, kesme yerelde yapılır.
export function indirmeArgumanlari(secim, klasor) {
  const arg = [
    '--no-playlist',
    '--newline',
    '--no-mtime',
    '--concurrent-fragments', '4',
    '--progress-template', 'download:YUZDE %(progress._percent_str)s',
    '-o', path.join(klasor, 'kaynak.%(ext)s'),
  ];

  if (secim.bicim === 'mp4') {
    const sirala = secim.kalite ? `res:${secim.kalite},vcodec:h264,acodec:m4a` : 'vcodec:h264,acodec:m4a';
    arg.push('-f', 'bv*+ba/b', '-S', sirala, '--merge-output-format', 'mp4');
  } else {
    arg.push('-f', 'ba/b', '-S', 'acodec:m4a');
  }

  arg.push('--', secim.url);
  return arg;
}

// Yerel ffmpeg işi gerekiyor mu? Kesilmeyen MP4 olduğu gibi gönderilir.
export function ffmpegGerekliMi(secim) {
  return secim.kesilecek || secim.bicim !== 'mp4';
}

export const CIKTI_UZANTISI = { mp4: '.mp4', mp3: '.mp3', wav: '.wav' };

// ffmpeg argümanları: -ss girişten önce olduğu için hızlı atlar; yeniden kodlama sayesinde kesim kare doğruluğunda olur.
export function kesmeArgumanlari(secim, girdi, cikti) {
  const arg = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-nostats', '-progress', 'pipe:1'];
  if (secim.kesilecek) {
    arg.push('-ss', String(secim.bas), '-i', girdi, '-t', String(Math.round((secim.son - secim.bas) * 1000) / 1000));
  } else {
    arg.push('-i', girdi);
  }

  if (secim.bicim === 'mp4') {
    arg.push(
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    );
  } else if (secim.bicim === 'mp3') {
    arg.push('-vn', '-c:a', 'libmp3lame', '-b:a', `${secim.kalite}k`);
  } else {
    arg.push('-vn', '-c:a', 'pcm_s16le');
  }
  arg.push(cikti);
  return arg;
}

export function icerikBasligi(dosyaAdi) {
  const ascii = dosyaAdi.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(dosyaAdi)}`;
}

// Kayan pencereli basit istek sınırlayıcı (IP başına).
export class Sinirlayici {
  constructor(sinir, pencereMs, simdi = () => Date.now()) {
    this.sinir = sinir;
    this.pencereMs = pencereMs;
    this.simdi = simdi;
    this.kayitlar = new Map();
  }

  // İzin varsa true döner ve isteği sayar.
  dene(anahtar) {
    if (!this.sinir) return true;
    const t = this.simdi();
    const liste = (this.kayitlar.get(anahtar) || []).filter((x) => t - x < this.pencereMs);
    if (liste.length >= this.sinir) { this.kayitlar.set(anahtar, liste); return false; }
    liste.push(t);
    this.kayitlar.set(anahtar, liste);
    return true;
  }

  temizle() {
    const t = this.simdi();
    for (const [k, liste] of this.kayitlar) {
      const kalan = liste.filter((x) => t - x < this.pencereMs);
      if (kalan.length) this.kayitlar.set(k, kalan); else this.kayitlar.delete(k);
    }
  }
}

// İstemci IP'si. Vekil (Tailscale Funnel) arkasındaysa X-Forwarded-For'un son değeri vekilin eklediğidir.
export function istemciIp(soketIp, xff, vekileGuven) {
  if (vekileGuven && typeof xff === 'string' && xff.trim()) {
    const son = xff.split(',').map((s) => s.trim()).filter(Boolean).at(-1);
    if (son) return son;
  }
  return soketIp || 'bilinmiyor';
}
