// Yönetim kapısı: YT Bot'u herkese açar ya da kapatır. Yalnızca Tailscale ağından erişilir (compose + tailscale serve).
import http from 'node:http';
import { yonetimIstegiUygunMu } from './yardimci.js';

const KACIS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const kacis = (s) => String(s).replace(/[&<>"']/g, (c) => KACIS[c]);

function sayfa({ acik, calisan, islem, pano }) {
  const renk = acik ? '#22c55e' : '#ef4444';
  const bilgi = islem === 'ac' ? 'YT Bot açıldı.' : islem === 'kapat' ? 'YT Bot kapatıldı.' : '';
  const yenile = islem && pano ? `<meta http-equiv="refresh" content="2;url=${kacis(pano)}">` : '';
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YT Bot ${acik ? 'açık' : 'kapalı'}</title>${yenile}
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;font:16px/1.5 system-ui,"Segoe UI",sans-serif}
.kutu{width:min(420px,calc(100% - 32px));background:#1e293b;border-radius:14px;padding:28px;text-align:center}
.durum{font-size:28px;font-weight:800;color:${renk};margin:6px 0 4px}
.ince{color:#94a3b8;font-size:14px}
.dugmeler{display:flex;gap:10px;margin-top:22px}
.dugmeler a{flex:1;padding:12px;border-radius:10px;text-decoration:none;font-weight:700}
.ac{background:#22c55e;color:#052e16}.kapat{background:#ef4444;color:#fff}
.pasif{opacity:.35;pointer-events:none}
.bilgi{margin-top:14px;color:#fbbf24}
a.pano{display:inline-block;margin-top:18px;color:#94a3b8;font-size:14px}
</style></head><body><div class="kutu">
<div class="ince">YT Bot (herkese açık indirme sitesi)</div>
<div class="durum">${acik ? 'AÇIK' : 'KAPALI'}</div>
<div class="ince">${acik ? `İnternetten erişilebilir. Şu an ${calisan} indirme çalışıyor.` : 'İnternetten girenler "kapalı" sayfası görüyor.'}</div>
<div class="dugmeler">
<a class="ac ${acik ? 'pasif' : ''}" href="/ac">Aç</a>
<a class="kapat ${acik ? '' : 'pasif'}" href="/kapat">Kapat</a>
</div>
${bilgi ? `<div class="bilgi">${bilgi}${pano ? ' Panoya dönülüyor…' : ''}</div>` : ''}
${pano ? `<a class="pano" href="${kacis(pano)}">← Panoya dön</a>` : ''}
</div></body></html>`;
}

export function yonetimSunucusu({ durumuAl, durumuAyarla, calisanSayisi, pano }) {
  return http.createServer(async (req, res) => {
    try {
      const adres = new URL(req.url, 'http://yerel');
      const yol = adres.pathname;
      const basliklar = {
        'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      };

      if (req.method === 'GET' && yol === '/api/durum') {
        res.writeHead(200, { ...basliklar, 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ herkeseAcik: durumuAl(), calisan: calisanSayisi() }));
      }
      if (req.method === 'GET' && (yol === '/ac' || yol === '/kapat')) {
        if (!yonetimIstegiUygunMu(req.headers)) {
          res.writeHead(403, { ...basliklar, 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Bu bağlantı yalnızca doğrudan tıklanarak açılabilir.');
        }
        await durumuAyarla(yol === '/ac');
        res.writeHead(303, { ...basliklar, Location: `/?islem=${yol.slice(1)}` });
        return res.end();
      }
      if (req.method === 'GET' && yol === '/') {
        const istenen = adres.searchParams.get('islem');
        const islem = istenen === 'ac' || istenen === 'kapat' ? istenen : '';
        res.writeHead(200, { ...basliklar, 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(sayfa({ acik: durumuAl(), calisan: calisanSayisi(), islem, pano }));
      }
      res.writeHead(404, { ...basliklar, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bulunamadı.');
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
}
