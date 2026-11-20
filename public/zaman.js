// Tarayıcı ve sunucu ortak kullanır.

// "1:02:03.5", "02:03", "75" ya da "75.2" -> saniye. Geçersizse null.
export function saniyeyeCevir(metin) {
  if (typeof metin === 'number') return Number.isFinite(metin) && metin >= 0 ? metin : null;
  if (typeof metin !== 'string') return null;
  const parcalar = metin.trim().split(':');
  if (parcalar.length < 1 || parcalar.length > 3) return null;
  let toplam = 0;
  for (let i = 0; i < parcalar.length; i++) {
    const p = parcalar[i];
    const sonParca = i === parcalar.length - 1;
    if (!(sonParca ? /^\d+(\.\d+)?$/ : /^\d+$/).test(p)) return null;
    const deger = Number(p);
    if (i > 0 && deger >= 60) return null;
    toplam = toplam * 60 + deger;
  }
  return toplam;
}

// Saniye -> "hh:mm:ss" (ondalık varsa bir basamak).
export function sureYaz(sn) {
  if (!Number.isFinite(sn) || sn < 0) sn = 0;
  const yuvarli = Math.round(sn * 10) / 10;
  const s = Math.floor(yuvarli);
  const ondalik = Math.round((yuvarli - s) * 10);
  const iki = (n) => String(n).padStart(2, '0');
  const metin = `${iki(Math.floor(s / 3600))}:${iki(Math.floor((s % 3600) / 60))}:${iki(s % 60)}`;
  return ondalik ? `${metin}.${ondalik}` : metin;
}
