'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera } from 'lucide-react'

export default function Home() {
  const [orderNumber, setOrderNumber] = useState('')
  const router = useRouter()

  const handleQuery = () => {
    if (orderNumber.trim()) {
      // TODO: 调用查询API
      alert('查询订单功能待实现')
    }
  }

  const handleCreateNew = () => {
    router.push('/select-size')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-pink-50 to-rose-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-full bg-gradient-primary flex items-center justify-center shadow-lg mb-4 relative">
            <div className="absolute inset-0 rounded-full bg-white/20 animate-pulse"></div>
            <Camera className="w-12 h-12 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">田田洗照片</h1>
        </div>

        {/* 输入框 */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-4">
          <input
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="请输入订单编号或手机号"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all"
          />
          
          {/* 查询按钮 */}
          <button
            onClick={handleQuery}
            className="w-full mt-4 py-3 gradient-primary text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all active:scale-95"
          >
            查询订单
          </button>

          <div className="my-4 flex items-center">
            <div className="flex-1 h-px bg-gray-200"></div>
            <span className="px-4 text-sm text-gray-400">或</span>
            <div className="flex-1 h-px bg-gray-200"></div>
          </div>

          {/* 创建新订单按钮 */}
          <button
            onClick={handleCreateNew}
            className="w-full py-3 bg-white border-2 border-pink-400 text-pink-500 font-medium rounded-lg shadow-md hover:bg-pink-50 transition-all active:scale-95"
          >
            创建新订单
          </button>
        </div>

        {/* 提示文字 */}
        <p className="text-center text-sm text-gray-500 px-4">
          tips：请在订单支付成功分钟后查询制作
        </p>
      </div>
    </div>
  )
}

