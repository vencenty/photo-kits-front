'use client'

import { useRouter } from 'next/navigation'
import { CheckCircle2, Home, Image } from 'lucide-react'
import { useStore } from '@/lib/store'
import { GlobalLoading } from '@/components/GlobalLoading'

export default function SuccessPage() {
  const router = useRouter()
  const currentSession = useStore((state) => state.currentSession)
  const clearSession = useStore((state) => state.clearSession)

  const handleViewImages = () => {
    router.push(`/upload/${currentSession?.sizeId}`)
  }

  const handleBackHome = () => {
    clearSession()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-rose-50 to-orange-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-primary rounded-full blur-xl opacity-50 animate-pulse"></div>
            <div className="relative w-24 h-24 bg-gradient-primary rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-16 h-16 text-white" strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* Success Message */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <h1 className="text-2xl font-bold text-center text-gray-800 mb-3">
            照片提交成功
          </h1>
          <p className="text-center text-gray-600 mb-6">
            工厂即将开始制作
          </p>

          {/* Session Info */}
          {currentSession && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">订单编号</span>
                <span className="font-bold text-pink-500">{currentSession.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">尺寸规格</span>
                <span className="font-medium">{currentSession.sizeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">打印数量</span>
                <span className="font-medium">{currentSession.currentCount} 张</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">提交时间</span>
                <span className="font-medium">
                  {new Date().toLocaleString('zh-CN')}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleViewImages}
              className="w-full py-3 bg-white border-2 border-pink-400 text-pink-500 font-medium rounded-lg shadow-sm hover:bg-pink-50 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Image className="w-5 h-5" />
              查看已上传照片
            </button>
            <button
              onClick={handleBackHome}
              className="w-full py-3 gradient-primary text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Home className="w-5 h-5" />
              返回首页
            </button>
          </div>
        </div>

        {/* Tips */}
        <div className="bg-white/60 backdrop-blur rounded-lg p-4">
          <p className="text-sm text-gray-600 text-center leading-relaxed">
            上传的照片临时保存7天，作为售后凭证，您可输入订单号查询。保存已上传的照片，7日后将自动删除。
          </p>
        </div>
      </div>

      {/* 全局 Loading */}
      <GlobalLoading />
    </div>
  )
}

