/**
 * Renders the Robust Gifting Solutions brand assets:
 *   public/logo.png            wordmark used in the site header and footer
 *   public/icons/*.png         PWA / favicon monogram tiles
 *
 * Run with: node scripts/generate-brand-assets.mjs
 */
import sharp from 'sharp'

const GREEN = '#1A3022'
const MUTED = '#6B7A6F'
const CREAM = '#FAF7F2'

/** Outlined gift-box mark, drawn at a 0..160 square and scaled by the caller. */
function giftMark(x, y, size, stroke) {
  const s = size / 160
  const t = (n) => (n * s).toFixed(2)
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${stroke}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 66 h116 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-116 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6 z"/>
    <path d="M28 98 v44 a8 8 0 0 0 8 8 h88 a8 8 0 0 0 8 -8 v-44"/>
    <path d="M80 66 v84"/>
    <path d="M80 66 C 80 42, 66 26, 50 26 C 36 26, 30 38, 38 48 C 46 58, 66 64, 80 66 Z"/>
    <path d="M80 66 C 80 42, 94 26, 110 26 C 124 26, 130 38, 122 48 C 114 58, 94 64, 80 66 Z"/>
  </g>`.replace(/\$\{t\}/g, t)
}

async function makeWordmark() {
  const W = 588
  const H = 255
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${giftMark(10, 38, 175, GREEN)}
  <text x="205" y="140" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="400" fill="${GREEN}">Robust</text>
  <text x="208" y="190" font-family="'Segoe UI', Arial, Helvetica, sans-serif" font-size="25" font-weight="500" letter-spacing="6.6" fill="${MUTED}">GIFTING SOLUTIONS</text>
</svg>`
  await sharp(Buffer.from(svg)).png().toFile('public/logo.png')
}

async function makeIcon(size, file) {
  const fontSize = Math.round(size * 0.42)
  const radius = Math.round(size * 0.18)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${GREEN}"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="600" fill="${CREAM}">R</text>
</svg>`
  await sharp(Buffer.from(svg)).png().toFile(file)
}

/** Minimal ICO container wrapping PNG frames (supported by every current browser). */
async function makeFavicon(file, sizes = [16, 32, 48]) {
  const frames = []
  for (const size of sizes) {
    const fontSize = Math.round(size * 0.42)
    const radius = Math.round(size * 0.18)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${GREEN}"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="600" fill="${CREAM}">R</text>
</svg>`
    frames.push({ size, png: await sharp(Buffer.from(svg)).png().toBuffer() })
  }
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)
  const dir = Buffer.alloc(16 * frames.length)
  let offset = 6 + dir.length
  frames.forEach((f, i) => {
    const b = i * 16
    dir.writeUInt8(f.size >= 256 ? 0 : f.size, b)
    dir.writeUInt8(f.size >= 256 ? 0 : f.size, b + 1)
    dir.writeUInt8(0, b + 2)
    dir.writeUInt8(0, b + 3)
    dir.writeUInt16LE(1, b + 4)
    dir.writeUInt16LE(32, b + 6)
    dir.writeUInt32LE(f.png.length, b + 8)
    dir.writeUInt32LE(offset, b + 12)
    offset += f.png.length
  })
  const { writeFile } = await import('node:fs/promises')
  await writeFile(file, Buffer.concat([header, dir, ...frames.map((f) => f.png)]))
}

await makeWordmark()
await makeIcon(192, 'public/icons/icon-192.png')
await makeIcon(512, 'public/icons/icon-512.png')
await makeIcon(180, 'public/icons/apple-touch-icon.png')
await makeIcon(32, 'public/icons/favicon-32.png')
// Next.js app-directory icon conventions (these take precedence over /public)
await makeIcon(32, 'src/app/icon.png')
await makeIcon(180, 'src/app/apple-icon.png')
await makeFavicon('src/app/favicon.ico')
console.log('brand assets written')
