import Image from 'next/image'
import Link from 'next/link'
import { BrandName } from '@/components/brand/brand-name'
import { ProductImage } from '@/components/ui/product-image'
import { SiteProductCard } from '@/components/site/site-product-card'
import { HeroStage } from '@/components/site/hero-stage'
import { ProductRail } from '@/components/site/product-rail'
import { Reveal } from '@/components/site/reveal'
import { GiftFinder } from '@/components/site/gift-finder'
import { slugify } from '@/lib/utils'
import { BUDGET_BANDS, CATALOGUE_COLLECTIONS, PERSONAL_OCCASIONS, productsForOccasion } from '@/lib/catalogue/collections'
import { getPublicCatalogueProducts, getPublicCategories } from '@/lib/catalogue/products'
import { curatePublicHome, homeCategoryTiles } from '@/lib/catalogue/curate'

const ARROW = '→'

const CATEGORY_LINES: Record<string, string> = {
  Drinkware: 'Bottles and tumblers for everyday sipping',
  'Bags & Travel': 'Carry pieces for their next adventure',
  'Tech & Electronics': 'Useful gadgets that actually get used',
  'Desk & Stationery': 'Notebooks, pens and cosy desk finds',
  Apparel: 'Something soft and wearable',
  'Hampers & Gift Sets': 'Ready-to-gift boxes for any occasion',
}

const PERSONAL_COLLECTIONS = CATALOGUE_COLLECTIONS.filter((c) =>
  ['birthday-gifts', 'anniversary-gifts', 'housewarming-gifts', 'thank-you-gifts', 'self-care-gifts'].includes(
    c.slug,
  ),
)

/**
 * The B2C counterpart to PublicHome — same catalogue data, reframed for
 * individual/personal gifting instead of corporate programmes. There is no
 * cart or checkout on this site (it's a request-a-quote catalogue), so the
 * calls to action stay "enquire" rather than pretending there's a buy flow.
 */
export async function PersonalizedHome() {
  const products = await getPublicCatalogueProducts()
  const categories = homeCategoryTiles(await getPublicCategories(), 6)
  const {
    heroProducts,
    categorySamples,
    collectionSamples,
    occasionSamples,
    trending,
    featured,
  } = curatePublicHome(products, categories, PERSONAL_COLLECTIONS, PERSONAL_OCCASIONS)

  const rankedHero = [...products]
    .filter((product) => Boolean(product.image_url?.trim()))
    .sort((a, b) => {
      const rank = (url: string) => {
        if (/square-/i.test(url)) return 3
        if (/\/site\/home-/i.test(url)) return 2
        if (/studio-pack-/i.test(url)) return 1
        return 0
      }
      return rank(b.image_url || '') - rank(a.image_url || '')
    })
  const heroOffset = rankedHero.length > 12 ? 6 : 0
  const heroSlideshow = rankedHero.slice(heroOffset).concat(rankedHero.slice(0, heroOffset))

  const budgetCounts = BUDGET_BANDS.map((band) => ({
    ...band,
    count: products.filter((product) => {
      const price = product.price || 0
      return price >= band.min && price < band.max
    }).length,
  }))

  const occasionVisuals = PERSONAL_OCCASIONS.map((occasion) => ({
    ...occasion,
    sample: occasionSamples.get(occasion.slug) || null,
  }))

  const giftFinderOccasions = PERSONAL_OCCASIONS.map((occasion) => ({
    slug: occasion.slug,
    title: occasion.title,
    products: productsForOccasion(products, occasion),
  }))

  return (
    <div className="bg-white">
      <HeroStage
        products={heroSlideshow.length ? heroSlideshow : heroProducts}
        headlineLines={['Thoughtful gifts,', 'for the people who matter.']}
        subtext="Curated presents for birthdays, anniversaries and every reason to say thank you."
        primaryCta={{ href: '/catalogue', label: 'Explore Gifts' }}
        secondaryCta={{ href: '/wishlist', label: 'My Wishlist' }}
        productHrefBase="/personalized/product"
      />

      {/* Shop by occasion */}
      <section className="bg-white py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="store-eyebrow">Shop by occasion</p>
            <h2 className="store-section-title mt-2">What are you celebrating?</h2>
          </Reveal>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {occasionVisuals.map((occasion, index) => (
              <Reveal key={occasion.slug} delay={(index % 3) * 40}>
                <Link
                  href={occasion.href}
                  className="group flex gap-4 overflow-hidden rounded-md border border-[#E2E8F0] bg-white p-3 transition-shadow hover:shadow-[0_8px_24px_rgba(27,36,48,0.08)] sm:p-4"
                >
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md catalogue-studio-field sm:h-28 sm:w-28">
                    <ProductImage
                      src={occasion.sample?.image_url ?? null}
                      alt={occasion.title}
                      size="sm"
                      fit="contain"
                      fadeEdges
                      className="h-full w-full bg-transparent"
                      imgClassName="catalogue-product-img"
                    />
                  </div>
                  <div className="min-w-0 flex-1 py-1">
                    <p className="font-serif text-xl text-[#1B2430]">{occasion.title}</p>
                    <p className="mt-1 text-sm text-[#5C6570]">{occasion.line}</p>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9C7A33]">
                      Browse {ARROW}
                    </p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Trending */}
      <section className="bg-[#F1F4F9] py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="store-eyebrow">Popular right now</p>
                <h2 className="store-section-title mt-2">Loved by gift-givers.</h2>
              </div>
              <Link href="/catalogue?sort=newest" className="store-link shrink-0">
                View all {ARROW}
              </Link>
            </div>
          </Reveal>
          <div className="mt-8">
            <ProductRail products={trending} hrefBase="/personalized/product" />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="bg-white py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="store-eyebrow">Browse by type</p>
                <h2 className="store-section-title mt-2">Find something for them.</h2>
              </div>
              <Link href="/categories" className="store-link shrink-0">
                All categories {ARROW}
              </Link>
            </div>
          </Reveal>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:gap-5">
            {categories.map((category, index) => {
              const sample = categorySamples.get(category.id) || null
              return (
                <Reveal key={category.id} delay={(index % 3) * 50}>
                  <Link
                    href={`/categories/${slugify(category.name)}`}
                    className="group block overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(27,36,48,0.06)] transition-shadow hover:shadow-[0_8px_24px_rgba(27,36,48,0.08)]"
                  >
                    <div className="relative aspect-square catalogue-studio-field">
                      <ProductImage
                        src={sample?.image_url ?? null}
                        alt={category.name}
                        size="md"
                        fit="contain"
                        fadeEdges
                        className="absolute inset-0 h-full w-full bg-transparent"
                        imgClassName="catalogue-product-img scale-[1.04] transition-transform duration-500 group-hover:scale-[1.06]"
                      />
                    </div>
                    <div className="border-t border-[#E2E8F0] px-3 py-3 text-center sm:px-4 sm:py-4">
                      <p className="font-serif text-lg text-[#1B2430] sm:text-xl">{category.name}</p>
                      {CATEGORY_LINES[category.name] ? (
                        <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#5C6570]">
                          {CATEGORY_LINES[category.name]}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* Gift finder */}
      <section className="bg-white py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <GiftFinder
              occasions={giftFinderOccasions}
              hrefBase="/personalized/product"
              eyebrow="Instant Matcher"
              title="Find the Perfect Gift in Seconds"
              description="Pick an occasion and set a budget to see matching gifts they'll love."
            />
          </Reveal>
        </div>
      </section>

      {/* Shop by price */}
      <section className="bg-[#F1F4F9] py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="store-eyebrow">Shop by budget</p>
            <h2 className="store-section-title mt-2">A gift for every budget.</h2>
          </Reveal>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {budgetCounts.map((band) => (
              <Link
                key={band.id}
                href={`/catalogue?budget=${encodeURIComponent(band.id)}`}
                className="rounded-md border border-[#E2E8F0] bg-white px-4 py-6 text-center transition-shadow hover:shadow-[0_8px_20px_rgba(27,36,48,0.07)]"
              >
                <p className="font-serif text-xl text-[#1B2430]">{band.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Collections */}
      <section className="bg-white py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="store-eyebrow">Curated for you</p>
            <h2 className="store-section-title mt-2">Gift edits worth exploring.</h2>
          </Reveal>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PERSONAL_COLLECTIONS.map((collection, index) => {
              const sample = collectionSamples.get(collection.slug) || null
              return (
                <Reveal key={collection.slug} delay={(index % 3) * 50}>
                  <Link
                    href={`/collections/${collection.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-md border border-[#E2E8F0] bg-white transition-shadow hover:shadow-[0_8px_24px_rgba(27,36,48,0.08)]"
                  >
                    <div className="relative aspect-[5/3] catalogue-studio-field">
                      <ProductImage
                        src={sample?.image_url ?? null}
                        alt={collection.title}
                        size="md"
                        fit="contain"
                        fadeEdges
                        className="absolute inset-0 h-full w-full bg-transparent"
                        imgClassName="catalogue-product-img scale-[1.05]"
                      />
                    </div>
                    <div className="flex flex-1 flex-col px-5 py-5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#5C6570]">{collection.kicker}</p>
                      <p className="mt-2 font-serif text-2xl text-[#1B2430]">{collection.title}</p>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-[#5C6570]">{collection.description}</p>
                      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9C7A33]">
                        Open collection {ARROW}
                      </p>
                    </div>
                  </Link>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* Featured gifts */}
      <section className="bg-[#F1F4F9] py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="store-eyebrow">Handpicked</p>
                <h2 className="store-section-title mt-2">Gifts we love right now.</h2>
              </div>
              <Link href="/catalogue" className="store-link">
                Full catalogue {ARROW}
              </Link>
            </div>
          </Reveal>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {featured.map((product) => (
              <SiteProductCard key={product.id} product={product} hrefBase="/personalized/product" />
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="bg-white py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="store-eyebrow">
              Why gift with <BrandName />
            </p>
            <h2 className="store-section-title mt-2 max-w-xl">Thoughtful, without the hassle.</h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Hand-picked gifts', body: 'A live catalogue organised by occasion, style and budget.' },
              { title: 'Save your favourites', body: 'Build a wishlist and come back to it whenever you like.' },
              { title: 'Personal touches', body: 'Ask about custom notes and packaging when you enquire.' },
              { title: 'Real people, real help', body: 'Tell us who it is for and we will help you choose.' },
            ].map((item) => (
              <div key={item.title} className="border-t border-[#9C7A33]/15 pt-5">
                <p className="font-serif text-xl">{item.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-[#5C6570]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-14 text-center text-white sm:py-20">
        <div className="absolute inset-0">
          <Image src="/site/cta-dark.webp" alt="" fill sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-[#08111A]/86" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/75">Get in touch</p>
            <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl lg:text-5xl">
              Not sure what to pick?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/80">
              Tell us who you are gifting and the occasion, and we will help you find the right thing.
            </p>
            <Link
              href="/request-quote"
              className="mt-8 inline-flex bg-white px-8 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9C7A33]"
            >
              Get in Touch
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
