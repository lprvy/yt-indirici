import { saniyeyeCevir, sureYaz } from '/zaman.js';

const $ = (id) => document.getElementById(id);
const el = {
  adresFormu: $('adresFormu'), adres: $('adres'), getir: $('getirDugmesi'),
  ipucu: $('ipucu'), bilgiHatasi: $('bilgiHatasi'), yukleniyor: $('yukleniyor'), kart: $('kart'),
  kucukResim: $('kucukResim'), kucukResimDugmesi: $('kucukResimDugmesi'),
  baslik: $('baslikMetni'), kanal: $('kanal'), toplamSure: $('toplamSure'), sayfa: $('sayfaBaglantisi'),
  onizleme: $('onizleme'), basiAl: $('basiAl'), sonuAl: $('sonuAl'), secimiOynat: $('secimiOynat'),
  basKaydirici: $('basKaydirici'), sonKaydirici: $('sonKaydirici'), dolgu: $('dolgu'),
  basZaman: $('basZaman'), sonZaman: $('sonZaman'), secilen: $('secilenSure'), tumunuSec: $('tumunuSec'),
  kaliteSatiri: $('kaliteSatiri'), kalite: $('kalite'), dosyaAdi: $('dosyaAdi'),
  indir: $('indirDugmesi'), ilerleme: $('ilerleme'), ilerlemeDolgu: $('ilerlemeDolgu'),
  ilerlemeMetni: $('ilerlemeMetni'), indirmeHatasi: $('indirmeHatasi'),
};

const SES_KALITELERI = [320, 256, 192, 128];
const EN_KISA = 0.5;

const durum = { video: null, bas: 0, son: 0, calisiyor: false };
let oynatici = null;
let oynaticiHazir = null;
let durdurmaZamanlayici = null;

// ---------- Video bilgisi ----------

el.adresFormu.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = el.adres.value.trim();
  if (!url) return;
  goster(el.bilgiHatasi, false);
  goster(el.ipucu, false);
  goster(el.kart, false);
  goster(el.yukleniyor, true);
  el.getir.disabled = true;
  try {
    const yanit = await fetch(`/api/bilgi?url=${encodeURIComponent(url)}`);
    const veri = await yanit.json();
    if (!yanit.ok) throw new Error(veri.hata || 'Bilgi alınamadı.');
    videoyuGoster({ ...veri, url });
  } catch (hata) {
    el.bilgiHatasi.textContent = hata.message === 'Failed to fetch'
      ? 'Sunucuya ulaşılamadı. Biraz sonra tekrar dene.' : hata.message;
    goster(el.bilgiHatasi, true);
    goster(el.ipucu, true);
  } finally {
    goster(el.yukleniyor, false);
    el.getir.disabled = false;
  }
});

function videoyuGoster(video) {
  durum.video = video;
  oynaticiyiKapat();
  el.kucukResim.src = video.kucukResim;
  el.baslik.textContent = video.baslik;
  el.kanal.textContent = video.kanal || 'YouTube';
  el.toplamSure.textContent = sureYaz(video.sure);
  el.sayfa.href = video.sayfa;
  el.dosyaAdi.value = video.baslik;

  for (const k of [el.basKaydirici, el.sonKaydirici]) k.max = String(video.sure);
  araligiAyarla(0, video.sure);
  kaliteleriDoldur();
  ilerlemeyiSifirla();
  goster(el.kart, true);
}

// ---------- Aralık seçimi ----------

function sinirla(deger, alt, ust) { return Math.min(ust, Math.max(alt, deger)); }

function araligiAyarla(bas, son, oncelik = 'bas') {
  const sure = durum.video?.sure || 0;
  bas = sinirla(Math.round(bas * 10) / 10, 0, sure);
  son = sinirla(Math.round(son * 10) / 10, 0, sure);
  if (son - bas < EN_KISA) {
    if (oncelik === 'bas') son = Math.min(sure, bas + EN_KISA), bas = Math.min(bas, son - EN_KISA);
    else bas = Math.max(0, son - EN_KISA), son = Math.max(son, bas + EN_KISA);
  }
  durum.bas = bas;
  durum.son = son;

  el.basKaydirici.value = String(bas);
  el.sonKaydirici.value = String(son);
  if (document.activeElement !== el.basZaman) el.basZaman.value = sureYaz(bas);
  if (document.activeElement !== el.sonZaman) el.sonZaman.value = sureYaz(son);
  el.basZaman.classList.remove('gecersiz');
  el.sonZaman.classList.remove('gecersiz');

  const yuzde = (x) => (sure ? (x / sure) * 100 : 0);
  el.dolgu.style.left = `${yuzde(bas)}%`;
  el.dolgu.style.width = `${yuzde(son) - yuzde(bas)}%`;

  const uzunluk = son - bas;
  el.secilen.textContent = `Seçilen: ${sureYaz(uzunluk)} (${Number(uzunluk.toFixed(1))} sn)`;
  dugmeYazisiniGuncelle();
}

el.basKaydirici.addEventListener('input', () => {
  araligiAyarla(Number(el.basKaydirici.value), durum.son, 'bas');
  oynaticidaGit(durum.bas);
});
el.sonKaydirici.addEventListener('input', () => {
  araligiAyarla(durum.bas, Number(el.sonKaydirici.value), 'son');
  oynaticidaGit(durum.son);
});

// İki tutamaç üst üste gelirse, tıklanan yere yakın olan önde dursun.
el.basKaydirici.parentElement.addEventListener('pointerdown', (e) => {
  const kutu = e.currentTarget.getBoundingClientRect();
  const sure = durum.video?.sure || 0;
  const t = ((e.clientX - kutu.left) / kutu.width) * sure;
  const basaYakin = Math.abs(t - durum.bas) <= Math.abs(t - durum.son);
  el.basKaydirici.style.zIndex = basaYakin ? 2 : 1;
  el.sonKaydirici.style.zIndex = basaYakin ? 1 : 2;
});

for (const [girdi, hangisi] of [[el.basZaman, 'bas'], [el.sonZaman, 'son']]) {
  const uygula = () => {
    const deger = saniyeyeCevir(girdi.value);
    if (deger === null) { girdi.classList.add('gecersiz'); return false; }
    if (hangisi === 'bas') araligiAyarla(deger, durum.son, 'bas');
    else araligiAyarla(durum.bas, deger, 'son');
    return true;
  };
  girdi.addEventListener('input', () => {
    girdi.classList.toggle('gecersiz', saniyeyeCevir(girdi.value) === null);
  });
  girdi.addEventListener('change', uygula);
  girdi.addEventListener('blur', () => { girdi.value = sureYaz(hangisi === 'bas' ? durum.bas : durum.son); girdi.classList.remove('gecersiz'); });
  girdi.addEventListener('keydown', (e) => { if (e.key === 'Enter') { uygula(); girdi.select(); } });
}

for (const dugme of document.querySelectorAll('[data-oynat]')) {
  dugme.addEventListener('click', () => {
    const fark = Number(dugme.dataset.fark);
    if (dugme.dataset.oynat === 'bas') { araligiAyarla(durum.bas + fark, durum.son, 'bas'); oynaticidaGit(durum.bas); }
    else { araligiAyarla(durum.bas, durum.son + fark, 'son'); oynaticidaGit(durum.son); }
  });
}
el.tumunuSec.addEventListener('click', () => araligiAyarla(0, durum.video?.sure || 0));

// ---------- Önizleme (YouTube oynatıcısı) ----------

function youtubeApiYukle() {
  if (oynaticiHazir) return oynaticiHazir;
  oynaticiHazir = new Promise((coz, reddet) => {
    if (window.YT?.Player) return coz();
    window.onYouTubeIframeAPIReady = () => coz();
    const betik = document.createElement('script');
    betik.src = 'https://www.youtube.com/iframe_api';
    betik.onerror = () => { oynaticiHazir = null; reddet(new Error('Oynatıcı yüklenemedi.')); };
    document.head.append(betik);
  });
  return oynaticiHazir;
}

el.kucukResimDugmesi.addEventListener('click', async () => {
  if (!el.onizleme.hidden) return oynaticiyiKapat();
  goster(el.onizleme, true);
  try {
    await youtubeApiYukle();
    oynatici = new YT.Player('oynatici', {
      videoId: durum.video.id,
      playerVars: { start: Math.floor(durum.bas), rel: 0, modestbranding: 1, playsinline: 1 },
    });
  } catch (hata) {
    goster(el.onizleme, false);
    el.indirmeHatasi.textContent = hata.message;
    goster(el.indirmeHatasi, true);
  }
});

function oynaticiyiKapat() {
  clearInterval(durdurmaZamanlayici);
  if (oynatici) { try { oynatici.destroy(); } catch {} oynatici = null; }
  const kutu = el.onizleme.querySelector('.oynatici-kutusu');
  kutu.innerHTML = '<div id="oynatici"></div>';
  goster(el.onizleme, false);
}

function oynaticiZamani() {
  return oynatici?.getCurrentTime ? oynatici.getCurrentTime() : null;
}

function oynaticidaGit(saniye) {
  if (oynatici?.seekTo) oynatici.seekTo(saniye, true);
}

el.basiAl.addEventListener('click', () => {
  const t = oynaticiZamani();
  if (t !== null) araligiAyarla(t, durum.son, 'bas');
});
el.sonuAl.addEventListener('click', () => {
  const t = oynaticiZamani();
  if (t !== null) araligiAyarla(durum.bas, t, 'son');
});
el.secimiOynat.addEventListener('click', () => {
  if (!oynatici?.seekTo) return;
  clearInterval(durdurmaZamanlayici);
  oynatici.seekTo(durum.bas, true);
  oynatici.playVideo();
  durdurmaZamanlayici = setInterval(() => {
    const t = oynaticiZamani();
    if (t !== null && t >= durum.son) { oynatici.pauseVideo(); clearInterval(durdurmaZamanlayici); }
  }, 100);
});

// ---------- Biçim ve kalite ----------

function seciliBicim() {
  return document.querySelector('input[name=bicim]:checked').value;
}

function kaliteleriDoldur() {
  const bicim = seciliBicim();
  el.kalite.replaceChildren();
  if (bicim === 'mp4') {
    const kaliteler = durum.video?.kaliteler || [];
    const varsayilan = kaliteler.find((k) => k <= 1080) ?? kaliteler[0];
    for (const k of kaliteler) el.kalite.append(new Option(`${k}p${k > 1080 ? ' (4K/2K)' : ''}`, String(k), false, k === varsayilan));
    el.kalite.append(new Option('En iyi', 'en-iyi', false, !kaliteler.length));
  } else if (bicim === 'mp3') {
    for (const k of SES_KALITELERI) el.kalite.append(new Option(`${k} kbps`, String(k), false, k === 192));
  }
  goster(el.kaliteSatiri, bicim !== 'wav');
  dugmeYazisiniGuncelle();
}

for (const r of document.querySelectorAll('input[name=bicim]')) r.addEventListener('change', kaliteleriDoldur);

function dugmeYazisiniGuncelle() {
  if (durum.calisiyor) return;
  const tamami = durum.bas <= 0 && durum.son >= (durum.video?.sure || 0);
  const parca = tamami ? '' : ` · ${sureYaz(durum.bas)} – ${sureYaz(durum.son)}`;
  el.indir.textContent = `İndir: ${seciliBicim().toUpperCase()}${parca}`;
}

// ---------- İndirme ----------

const DURUM_YAZILARI = {
  hazirlaniyor: 'Hazırlanıyor…',
  indiriliyor: 'İndiriliyor',
  birlestiriliyor: 'Görüntü ve ses birleştiriliyor…',
  isleniyor: 'Kesiliyor / dönüştürülüyor',
  bitti: 'Bitti. Dosya kaydediliyor.',
};

el.indir.addEventListener('click', async () => {
  if (!durum.video || durum.calisiyor) return;
  goster(el.indirmeHatasi, false);
  durum.calisiyor = true;
  el.indir.disabled = true;
  el.indir.textContent = 'Çalışıyor…';
  ilerlemeyiGoster('hazirlaniyor', 0);

  try {
    const yanit = await fetch('/api/indir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: durum.video.url,
        bicim: seciliBicim(),
        kalite: el.kalite.value,
        bas: durum.bas,
        son: durum.son,
        sure: durum.video.sure,
        baslik: el.dosyaAdi.value || durum.video.baslik,
      }),
    });
    const veri = await yanit.json();
    if (!yanit.ok) throw new Error(veri.hata || 'İndirme başlatılamadı.');
    await bitmesiniBekle(veri.id);

    const a = document.createElement('a');
    a.href = `/api/dosya?id=${encodeURIComponent(veri.id)}`;
    document.body.append(a);
    a.click();
    a.remove();
  } catch (hata) {
    el.indirmeHatasi.textContent = hata.message === 'Failed to fetch'
      ? 'Sunucuya ulaşılamadı. Biraz sonra tekrar dene.' : hata.message;
    goster(el.indirmeHatasi, true);
    goster(el.ilerleme, false);
  } finally {
    durum.calisiyor = false;
    el.indir.disabled = false;
    dugmeYazisiniGuncelle();
  }
});

async function bitmesiniBekle(id) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 700));
    const yanit = await fetch(`/api/durum?id=${encodeURIComponent(id)}`);
    const veri = await yanit.json();
    if (!yanit.ok) throw new Error(veri.hata || 'Durum alınamadı.');
    if (veri.durum === 'hata') throw new Error(veri.hata || 'İndirme başarısız oldu.');
    ilerlemeyiGoster(veri.durum, veri.yuzde);
    if (veri.durum === 'bitti') return;
  }
}

function ilerlemeyiGoster(asama, yuzde) {
  goster(el.ilerleme, true);
  const yuzdeli = (asama === 'indiriliyor' || asama === 'isleniyor') && yuzde > 0;
  el.ilerleme.classList.toggle('belirsiz', !yuzdeli && asama !== 'bitti');
  el.ilerlemeDolgu.style.width = `${asama === 'bitti' ? 100 : yuzde}%`;
  const yazi = DURUM_YAZILARI[asama] || asama;
  el.ilerlemeMetni.textContent = yuzdeli ? `${yazi} %${yuzde.toFixed(0)}` : yazi;
}

function ilerlemeyiSifirla() {
  goster(el.ilerleme, false);
  goster(el.indirmeHatasi, false);
}

function goster(eleman, acik) { eleman.hidden = !acik; }
