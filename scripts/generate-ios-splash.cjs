// Uses the existing local image tooling: npm --prefix .analysis-tools install
const { createCanvas, loadImage } = require('../.analysis-tools/node_modules/@napi-rs/canvas');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
  const logo = await loadImage(path.join(root, 'public', manifest.icons.find(icon => icon.sizes === '512x512').src));
  const screens = [[320,568,2],[375,667,2],[414,736,3],[375,812,3],[414,896,2],[414,896,3],[390,844,3],[393,852,3],[402,874,3],[420,912,3],[428,926,3],[430,932,3],[440,956,3],[768,1024,2],[810,1080,2],[820,1180,2],[834,1112,2],[834,1194,2],[834,1210,2],[1024,1366,2],[1032,1376,2]];
  const directory = path.join(root, 'public/ios-splash');
  await fs.mkdir(directory, { recursive: true });
  const links = [];
  for (const [width, height, scale] of screens) {
    for (const orientation of ['portrait', 'landscape']) {
      const w = (orientation === 'portrait' ? width : height) * scale;
      const h = (orientation === 'portrait' ? height : width) * scale;
      const canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
      ctx.fillStyle = manifest.background_color; ctx.fillRect(0, 0, w, h);
      const size = 96 * scale;
      ctx.drawImage(logo, (w-size)/2, (h-size)/2, size, size);
      const file = `launch-${w}x${h}.png`;
      await fs.writeFile(path.join(directory, file), canvas.toBuffer('image/png'));
      links.push(`    <link rel="apple-touch-startup-image" href="%BASE_URL%ios-splash/${file}" media="screen and (device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: ${orientation})" />`);
    }
  }
  const file = path.join(root, 'index.html');
  let html = await fs.readFile(file, 'utf8');
  const block = `    <!-- ios-splash:start -->\n${links.join('\n')}\n    <!-- ios-splash:end -->`;
  html = html.includes('<!-- ios-splash:start -->') ? html.replace(/    <!-- ios-splash:start -->[\s\S]*?<!-- ios-splash:end -->/, block) : html.replace('  </head>', block + '\n  </head>');
  await fs.writeFile(file, html);
  console.log(`Generated ${links.length} iOS launch images from the Android manifest artwork and background.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
