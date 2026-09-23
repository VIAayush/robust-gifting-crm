import { cookies } from 'next/headers'
import { GIFT_MODE_COOKIE, type GiftMode } from '@/lib/site/gift-mode'

/** Reads the remembered gift mode on shared/neutral pages (catalogue, categories, collections). */
export async function getGiftMode(): Promise<GiftMode> {
  const store = await cookies()
  return store.get(GIFT_MODE_COOKIE)?.value === 'personalized' ? 'personalized' : 'corporate'
}
