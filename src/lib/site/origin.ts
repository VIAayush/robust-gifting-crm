/**
 * The public origin used for the sitemap, robots.txt and absolute links that are generated without a request.
 * Set SITE_URL (for example https://www.example.com) once the custom domain is live; until then the Vercel
 * production URL is used. No domain is ever invented: with neither set this returns null.
 */
export function siteOrigin(): string | null {
  const explicit = (process.env.SITE_URL || '').trim().replace(/\/+$/, '')
  if (/^https:\/\/[^\s/]+$/i.test(explicit)) return explicit
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim()
  return vercel ? `https://${vercel}` : null
}
