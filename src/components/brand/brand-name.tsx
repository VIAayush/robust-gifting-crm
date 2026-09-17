import { cn } from '@/lib/utils'

/** Brand wordmark used everywhere. */
export function BrandName({
  className,
  as: Tag = 'span',
}: {
  className?: string
  as?: 'span' | 'h1' | 'p' | 'div'
}) {
  return (
    <Tag
      className={cn('font-serif font-normal not-italic tracking-normal', className)}
      style={{ fontWeight: 400, fontStyle: 'normal' }}
    >
      Robust Gifting
    </Tag>
  )
}
