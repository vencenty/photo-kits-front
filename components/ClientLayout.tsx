'use client'

import { GlobalLoading } from './GlobalLoading'

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <GlobalLoading />
    </>
  )
}

