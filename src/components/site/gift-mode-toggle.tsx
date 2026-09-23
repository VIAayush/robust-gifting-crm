'use client'

import Link from 'next/link'
import { Heart, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GiftMode } from '@/lib/site/gift-mode'

/**
 * Personalized (B2C) vs Corporate (B2B) mode switch — mirrors the reference
 * site's pill toggle. Takes `mode` as a prop (resolved once by the caller's
 * own useGiftMode() call) instead of calling the hook again itself, so there
 * is a single source of truth for the mode within the header on any given
 * render — avoiding a second, independently-resolved value that could
 * diverge from the server-rendered markup during hydration.
 */
export function GiftModeToggle({ mode }: { mode: GiftMode }) {
  const isPersonalized = mode === 'personalized'

  const pill = 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-[13px]'

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-white p-1 shadow-sm">
      <Link
        href="/personalized"
        className={cn(pill, isPersonalized ? 'bg-[#9C7A33] text-white' : 'text-[#5C6570] hover:text-[#1B2430]')}
      >
        <Heart size={13} className={isPersonalized ? 'fill-current' : ''} />
        Personalized Gifts
      </Link>
      <Link
        href="/"
        className={cn(pill, !isPersonalized ? 'bg-[#9C7A33] text-white' : 'text-[#5C6570] hover:text-[#1B2430]')}
      >
        <Briefcase size={13} />
        Corporate Gifts
      </Link>
    </div>
  )
}
