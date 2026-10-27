import Link from 'next/link'
import { getLiveBanners } from '@/lib/site/banners'

/**
 * CRM-managed festival / occasion banners. Renders nothing when there are none live.
 * Images are plain <img> from the https address the team entered (no optimiser proxy), lazy-loaded and
 * size-constrained, so they add no image-transformation or storage egress of their own.
 */
export async function SiteBanners({ surface }: { surface: 'public' | 'portal' }) {
  const banners = await getLiveBanners(surface)
  if (banners.length === 0) return null
  return (
    <section aria-label="Announcements" className="space-y-3">
      {banners.slice(0, 3).map((banner) => {
        const content = (
          <div className="relative flex min-h-[7rem] items-center gap-4 overflow-hidden rounded-md bg-[#0D1B2A] p-5 text-white sm:min-h-[8rem] sm:p-8">
            {banner.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner.image_url} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-40" />
            ) : null}
            <div className="relative min-w-0">
              {banner.occasion ? <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E6C877]">{banner.occasion}</p> : null}
              <h2 className="mt-1 font-serif text-xl sm:text-3xl">{banner.title}</h2>
              {banner.subtitle ? <p className="mt-1 max-w-xl text-sm text-white/85">{banner.subtitle}</p> : null}
              {banner.link_url && banner.cta_label ? (
                <span className="mt-3 inline-flex rounded bg-[#9C7A33] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em]">{banner.cta_label}</span>
              ) : null}
            </div>
          </div>
        )
        if (!banner.link_url) return <div key={banner.id}>{content}</div>
        return banner.link_url.startsWith('/') ? (
          <Link key={banner.id} href={banner.link_url} className="block text-inherit hover:text-inherit">
            {content}
          </Link>
        ) : (
          <a key={banner.id} href={banner.link_url} target="_blank" rel="noopener noreferrer" className="block text-inherit hover:text-inherit">
            {content}
          </a>
        )
      })}
    </section>
  )
}
