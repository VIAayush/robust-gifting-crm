'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Heart, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import { equivalentPath, type GiftMode } from '@/lib/site/gift-mode'
import { writeGiftModeCookie } from '@/components/site/use-gift-mode'

/**
 * Personalized (B2C) vs Corporate (B2B) switch. Takes `mode` from the header's
 * single useGiftMode() call so it can't disagree with the rest of the header.
 * Switching keeps you on the same kind of page (catalogue to catalogue,
 * product to product); shared pages stay put and just change mode.
 */
export function GiftModeToggle({ mode }: { mode: GiftMode }) {
  const router = useRouter()
  const pathname = usePathname() || '/'
  const isPersonalized = mode === 'personalized'

  const pill = 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-[13px]'

  const switchTo = (target: GiftMode) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    if (target === mode) return
    writeGiftModeCookie(target)
    const next = equivalentPath(target, pathname, window.location.search)
    if (next === `${pathname}${window.location.search}`) router.refresh()
    else router.push(next)
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-white p-1 shadow-sm">
      <Link
        href={equivalentPath('personalized', pathname)}
        onClick={switchTo('personalized')}
        aria-current={isPersonalized ? 'true' : undefined}
        className={cn(pill, isPersonalized ? 'bg-[#9C7A33] text-white' : 'text-[#5C6570] hover:text-[#1B2430]')}
      >
        <Heart size={13} className={isPersonalized ? 'fill-current' : ''} />
        Personalized Gifts
      </Link>
      <Link
        href={equivalentPath('corporate', pathname)}
        onClick={switchTo('corporate')}
        aria-current={!isPersonalized ? 'true' : undefined}
        className={cn(pill, !isPersonalized ? 'bg-[#9C7A33] text-white' : 'text-[#5C6570] hover:text-[#1B2430]')}
      >
        <Briefcase size={13} />
        Corporate Gifts
      </Link>
    </div>
  )
}
