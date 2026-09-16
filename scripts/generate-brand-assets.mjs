/**
 * Renders the Robust Gifting brand assets from the client's real logo
 * (public/logo-source.png — the circular navy/gold "RG" badge from
 * robustgifting.com):
 *   public/logo.png            wordmark used in the site header and footer
 *   public/icons/*.png         PWA / favicon tiles (solid navy bleed)
 *   src/app/icon.png, apple-icon.png, favicon.ico
 *
 * Run with: node scripts/generate-brand-assets.mjs
 */
import sharp from 'sharp'

const NAVY = '#0D1B2A'
const SOURCE = 'public/logo-source.png'

/** Trim the transparent margin around the circular badge, keep transparency. */
async function makeHeaderLogo() {
  const trimmed = await sharp(SOURCE).trim({ threshold: 5 }).toBuffer()
  await sharp(trimmed).resize(600, 600).png().toFile('public/logo.png')
}

/** Composite the badge onto a solid navy square — the standard, safe
 * treatment for favicons/app icons, so the tab/home-screen icon doesn't
 * show a floating circle with dead transparent corners. */
async function makeIcon(size, file) {
  const trimmed = await sharp(SOURCE).trim({ threshold: 5 }).toBuffer()
  const badge = await sharp(trimmed).resize(Math.round(size * 0.92), Math.round(size * 0.92)).toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: NAVY },
  })
    .composite([{ input: badge, gravity: 'center' }])
    .png()
    .toFile(file)
}

/** Minimal ICO container wrapping PNG frames (supported by every current browser). */
async function makeFavicon(file, sizes = [16, 32, 48]) {
  const trimmed = await sharp(SOURCE).trim({ threshold: 5 }).toBuffer()
  const frames = []
  for (const size of sizes) {
    const badge = await sharp(trimmed).resize(Math.round(size * 0.92), Math.round(size * 0.92)).toBuffer()
    const png = await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
      .composite([{ input: badge, gravity: 'center' }])
      .png()
      .toBuffer()
    frames.push({ size, png })
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

await makeHeaderLogo()
await makeIcon(192, 'public/icons/icon-192.png')
await makeIcon(512, 'public/icons/icon-512.png')
await makeIcon(180, 'public/icons/apple-touch-icon.png')
await makeIcon(32, 'public/icons/favicon-32.png')
// Next.js app-directory icon conventions (these take precedence over /public)
await makeIcon(32, 'src/app/icon.png')
await makeIcon(180, 'src/app/apple-icon.png')
await makeFavicon('src/app/favicon.ico')
console.log('brand assets written from public/logo-source.png')
