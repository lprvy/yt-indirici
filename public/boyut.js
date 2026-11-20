// Boyut tahmini ve büyük dosya uyarısı. Sunucu ve tarayıcı aynı kodu kullanır.

export const MB = 1024 * 1024;
export const WAV_BAYT_SN = 44100 * 2 * 2; // 16 bit stereo

export function boyutYaz(bayt) {
  if (!(bayt > 0)) return '?';
  if (bayt >= 1024 * MB) return `${(bayt / (1024 * MB)).toFixed(1).replace('.', ',')} GB`;
  return `${Math.max(1, Math.round(bayt / MB))} MB`;
}

// Seçime göre tahmin: indirilen kaynak dosya ve hazırlanacak çıktı (bayt, bilinmiyorsa null).
// Kesme işi yerelde yapıldığı için kaynak her zaman videonun tamamıdır.
export function secimBoyutu(boyutlar, bicim, kalite, uzunluk) {
  const b = boyutlar || {};
  if (bicim === 'mp4') {
    const indirilen = b[kalite ?? 'en-iyi'] ?? b['en-iyi'] ?? null;
    return { indirilen, cikti: null };
  }
  const indirilen = b.ses ?? null;
  const sn = Math.max(0, Number(uzunluk) || 0);
  const cikti = bicim === 'wav' ? sn * WAV_BAYT_SN : sn * (Number(kalite) || 192) * 125;
  return { indirilen, cikti };
}

// Sınırı aşan seçim için kullanıcıya gösterilecek metin; sorun yoksa null.
export function boyutUyarisi(tahmin, sinir) {
  if (!sinir || !tahmin) return null;
  const { indirilen, cikti } = tahmin;
  if (indirilen && indirilen > sinir) {
    return `Bu video seçtiğin ayarla yaklaşık ${boyutYaz(indirilen)} tutuyor. ${boyutYaz(sinir)}'tan büyük indirmeleri yapmak istemiyorum: `
      + 'bu sunucu bir evde çalışıyor ve bu kadar büyük bir dosya oradaki internet bağlantısını uzun süre meşgul eder. '
      + 'Daha düşük bir kalite seç ya da yalnızca sesini (MP3) indir. Kısa bir aralık seçmek burada işe yaramaz, '
      + 'çünkü video önce bütün olarak indiriliyor.';
  }
  if (cikti && cikti > sinir) {
    return `Bu aralığın dosyası yaklaşık ${boyutYaz(cikti)} tutuyor. ${boyutYaz(sinir)}'tan büyük dosyaları hazırlamak istemiyorum. `
      + 'MP3 seç ya da daha kısa bir aralık seç.';
  }
  return null;
}
