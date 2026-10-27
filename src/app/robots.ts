import type { MetadataRoute } from 'next'
import { siteOrigin } from '@/lib/site/origin'

// Public catalogue pages may be indexed. Signed-in areas, checkout and API routes never should be.
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin()
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/crm/', '/portal/', '/checkout/', '/cart', '/api/', '/login', '/signup', '/set-password', '/reset-password', '/track-order'] }],
    ...(origin ? { sitemap: `${origin}/sitemap.xml`, host: origin } : {}),
  }
}
