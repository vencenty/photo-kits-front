'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App Error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-pink-50 to-rose-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">出错了</h2>
        <p className="text-sm text-gray-500 mb-6">
          {error.message || '页面加载时发生错误，请重试'}
        </p>
        <button
          onClick={() => reset()}
          className="w-full py-3 bg-[#ff4d6d] text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          重试
        </button>
      </div>
    </div>
  )
}
