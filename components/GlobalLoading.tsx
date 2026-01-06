'use client'

import { useStore } from '@/lib/store'

export function GlobalLoading() {
  const apiLoading = useStore((state) => state.apiLoading)
  const apiLoadingMessage = useStore((state) => state.apiLoadingMessage)

  if (!apiLoading) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-4 min-w-[200px]">
        <div className="w-8 h-8 border-4 border-[#ff4d6d] border-t-transparent rounded-full animate-spin" />
        {apiLoadingMessage && (
          <p className="text-sm text-gray-600">{apiLoadingMessage}</p>
        )}
      </div>
    </div>
  )
}

