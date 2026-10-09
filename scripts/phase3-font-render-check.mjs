import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107', fonts = JSON.parse(fs.readFileSync('config/versioned-fonts.json', 'utf8'));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await b.newPage(); await p.goto(base, { waitUntil: 'domcontentloaded' });
  const records = [];
  for (const font of fonts) {
    const response = await p.request.get(base + font.src); assert.equal(response.status(), 200);
    assert.match(response.headers()['cache-control'], /max-age=31536000.*immutable/);
    const results = await p.evaluate(async font => {
      const a = new FontFace('phase3-original', `url("${font.original}")`), b = new FontFace('phase3-woff2', `url("${font.src}")`);
      await Promise.all([a.load(), b.load()]); document.fonts.add(a); document.fonts.add(b);
      const texts = ['Xe Lướt Toàn Trung — Khám phá xe nổi bật', 'Giới thiệu · Tuyển dụng · Tiện ích · Phụ kiện ô tô',
        'Định giá xe của tôi: 338.000.000 ₫ — 0777393913', 'ă â ê ô ơ ư đ Á Ế Ộ Ờ Ữ Ứ ỵ ỹ',
        'Tiếng Việt chuẩn hóa: a\u0306\u0301 e\u0302\u0309 o\u031b\u0323', '中文 日本語 العربية русский ไทย हिन्दी'];
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 100; const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const samples = [];
      for (const size of [15, 19, 28, 38]) for (const weight of [400, 700]) for (const text of texts) {
        const draw = family => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.font = `${weight} ${size}px ${family}`; ctx.fillStyle = '#14213a'; ctx.fillText(text, 10, 60);
          return { pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: ctx.measureText(text).width }; };
        const x = draw('phase3-original'), y = draw('phase3-woff2'); let changed = 0;
        for (let i = 0; i < x.pixels.length; i++) if (x.pixels[i] !== y.pixels[i]) changed++;
        samples.push({ size, weight, text, changedPixels: changed, beforeWidth: x.width, afterWidth: y.width });
      }
      document.fonts.delete(a); document.fonts.delete(b); return samples;
    }, font);
    assert(results.every(r => r.changedPixels === 0 && r.beforeWidth === r.afterWidth), font.family);
    records.push({ family: font.family, cache: response.headers()['cache-control'], samples: results }); console.log(`PASS ${font.family}: 48 text samples, identical raster and metrics, immutable cache`);
  }
  fs.writeFileSync('../toi-uu-hieu-suat-website/phase-3/font-browser-check.json', JSON.stringify(records, null, 2));
} finally { await b.close(); }
