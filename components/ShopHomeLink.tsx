'use client'

import Link from 'next/link'
import { withShopQuery } from '@/lib/shop-context'

export function ShopHomeLink({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link href={withShopQuery('/')} className={className}>
      {children}
    </Link>
  )
}
