'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Home, Image, ChevronRight, Loader2 } from 'lucide-react'
import { useStore, Session } from '@/lib/store'
import { GlobalLoading } from '@/components/GlobalLoading'
import { lockOrder, getOrderDetail, submitOrderForProduction } from '@/lib/api'
import type { SpecInfo } from '@/lib/api'
import { getPhotoSizeById } from '@/lib/photo-sizes'
import { isOrderLocked as checkOrderLocked } from '@/lib/constants'
import { BusinessError, ORDER_ERROR } from '@/lib/error-handler'

// 闪光动画样式
const shimmerStyle = `
  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
  @keyframes blink {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
  @keyframes pulse-glow {
    0%, 100% {
      box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
    }
    50% {
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.8), 0 0 30px rgba(239, 68, 68, 0.6);
    }
  }
`

interface SizeSummary {
  id: string
  sizeId: string
  paperName: string
  sizeName: string
  totalPrintCount: number
  imageCount: number
  width: number
  height: number
}

export default function SuccessPage() {
  const router = useRouter()
  const currentSession = useStore((state) => state.currentSession)
  const clearSession = useStore((state) => state.clearSession)
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const clearImages = useStore((state) => state.clearImages)
  const setApiLoading = useStore((state) => state.setApiLoading)
  
  const [allSizes, setAllSizes] = useState<SizeSummary[]>([])
  const [isLoadingSizes, setIsLoadingSizes] = useState(true)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [orderStatus, setOrderStatus] = useState<number | null>(null)
  const [isLocking, setIsLocking] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false) // 确认提交弹窗
  // 后端返回「需要绑定订单号」时置为 true，与 needBindInConfirm 一起控制弹窗内是否展示绑定输入
  const [showBindInConfirm, setShowBindInConfirm] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [bindRelatedInput, setBindRelatedInput] = useState('')
  // 订单详情中的关联淘宝订单号（19 位）；用于判断是否需要先绑定再提交
  const [relatedOrderNoFromDetail, setRelatedOrderNoFromDetail] = useState<string | null>(null)
  // 订单详情中的最后一次提交时间（服务端 submitTime）
  const [submitTime, setSubmitTime] = useState<string | null>(null)

  // 获取订单号
  useEffect(() => {
    // 优先从 currentSession 获取
    if (currentSession?.orderNo) {
      setOrderNumber(currentSession.orderNo)
      return
    }
    
    // 从 localStorage 获取
    const savedOrder = localStorage.getItem('current-order-number')
    if (savedOrder) {
      setOrderNumber(savedOrder)
      return
    }
    
    // 从 sessionId 解析（兼容旧版本）
    if (currentSession?.id) {
      const parts = currentSession.id.split('-')
      if (parts.length > 1) {
        setOrderNumber(parts[0])
      }
    }
  }, [currentSession])

  // 加载订单详情（包含规格列表，不包含照片列表）
  useEffect(() => {
    const loadOrderDetail = async () => {
      if (!orderNumber) {
        setIsLoadingSizes(false)
        return
      }

      setIsLoadingSizes(true)
      try {
        setApiLoading(true, '加载订单详情...')
        // 只获取订单详情和规格列表，不获取照片列表（includePhotos=false）
        const orderDetail = await getOrderDetail(orderNumber, false)
        
        setOrderStatus(orderDetail.status)
        setIsLocked(checkOrderLocked(orderDetail.status))
        setRelatedOrderNoFromDetail(orderDetail.relatedOrderNo ?? null)
        setSubmitTime(orderDetail.submitTime ?? null)
        
        // 从订单详情中获取规格列表
        const specs = orderDetail.specs || []
        
        // 转换为 SizeSummary 格式
        const sizes: SizeSummary[] = specs.map((spec: SpecInfo) => ({
          id: spec.sessionId,
          sizeId: spec.sizeId,
          paperName: spec.paperName,
          sizeName: spec.sizeName,
          totalPrintCount: spec.photoCount || 0,  // 照片数量
          imageCount: spec.photoCount || 0,
          width: spec.canvasWidth,
          height: spec.canvasHeight,
        }))
        
        setAllSizes(sizes)
      } catch (error) {
        console.error('加载订单详情失败:', error)
      } finally {
        setIsLoadingSizes(false)
        setApiLoading(false, '')
      }
    }

    loadOrderDetail()
  }, [orderNumber, setApiLoading])

  // 点击规格跳转到上传页面
  // 注意：不再依赖 getPhotoSizeById 的结果，避免因历史数据或新尺寸未配置导致「点击无反应」
  const handleSelectSize = useCallback((size: SizeSummary) => {
    const currentOrderNo = orderNumber || `ORDER-${Date.now()}`
    const sessionId = `${currentOrderNo}-${size.id}`

    // 构建 session 用于上传页面
    const session: Session = {
      id: sessionId,
      orderNo: currentOrderNo,
      sizeId: size.id,
      sizeName: `${size.paperName} ${size.sizeName}`,
      targetCount: 0,
      currentCount: size.imageCount,
      canvasWidth: size.width,
      canvasHeight: size.height,
      unit: '毫米',
      ratio: size.width / size.height,
      createdAt: new Date().toISOString(),
    }

    setCurrentSession(session)
    clearImages()

    router.push(`/upload?sizeId=${size.id}`)
  }, [orderNumber, setCurrentSession, clearImages, router])

  // 点击「锁定订单，确认制作」：先请求订单详情，若无 relatedOrderNo 则弹窗内先展示绑定淘宝订单号，再提交
  const handleSubmitOrderClick = async () => {
    if (!orderNumber || isLocked) return

    const totalPhotos = allSizes.reduce((sum, size) => sum + size.imageCount, 0)
    if (totalPhotos === 0) {
      alert('订单中没有照片，无法提交！')
      return
    }

    setSubmitError('')
    setBindRelatedInput('')
    setShowBindInConfirm(false)
    try {
      setApiLoading(true, '加载订单信息...')
      const detail = await getOrderDetail(orderNumber, false)
      setRelatedOrderNoFromDetail(detail.relatedOrderNo ?? null)
      setShowSubmitConfirm(true)
    } catch (e) {
      console.error('获取订单详情失败', e)
      alert('获取订单信息失败，请重试')
    } finally {
      setApiLoading(false, '')
    }
  }

  // 弹窗内点击「确认提交」：调用 order/submit；需绑定时传用户输入的 relatedOrderNo，后端返回需绑定时展示错误并保留弹窗
  const handleConfirmSubmitOrder = async () => {
    if (!orderNumber || isLocked) return
    const needBind = needBindInConfirm || showBindInConfirm
    if (needBind && bindRelatedInput.trim().length !== 19) return

    setIsLocking(true)
    setSubmitError('')
    try {
      setApiLoading(true, '提交订单中...')
      const relatedNo = needBind ? bindRelatedInput.trim() : (relatedOrderNoFromDetail || undefined)
      await submitOrderForProduction({
        orderSn: orderNumber,
        receiverName: '',
        ...(relatedNo ? { relatedOrderNo: relatedNo } : {}),
      })
      const orderDetail = await getOrderDetail(orderNumber, false)
      setOrderStatus(orderDetail.status)
      setIsLocked(checkOrderLocked(orderDetail.status))
      setRelatedOrderNoFromDetail(orderDetail.relatedOrderNo ?? null)
      setSubmitTime(orderDetail.submitTime ?? null)
      setShowSubmitConfirm(false)
      setShowBindInConfirm(false)
      setBindRelatedInput('')
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      const code = error instanceof BusinessError ? error.code : 0
      if (
        error instanceof BusinessError &&
        (code === ORDER_ERROR.NEED_BIND_RELATED_ORDER || code === ORDER_ERROR.RELATED_ORDER_INVALID)
      ) {
        setSubmitError(msg || '请绑定 19 位淘宝订单号后再提交')
        setShowBindInConfirm(true)
      } else {
        alert(msg || '提交失败，请重试')
      }
    } finally {
      setIsLocking(false)
      setApiLoading(false, '')
    }
  }

  // 保留原有的锁单功能（备用）
  const handleLockOrder = async () => {
    if (!orderNumber || isLocked) return

    if (!confirm('确认锁单吗？锁单后将无法再编辑订单，只能查看。')) {
      return
    }

    setIsLocking(true)
    try {
      setApiLoading(true, '锁单中...')
      await lockOrder(orderNumber)
      setIsLocked(true)
      setOrderStatus(2) // 状态2表示客户已确认/锁单
      alert('锁单成功！订单已确认，可以开始制作了。')
    } catch (error) {
      console.error('锁单失败:', error)
      alert('锁单失败，请重试')
    } finally {
      setIsLocking(false)
      setApiLoading(false, '')
    }
  }

  const handleViewImages = () => {
    if (currentSession?.sizeId) {
      router.push(`/upload/${currentSession.sizeId}`)
    }
  }

  const handleBackHome = () => {
    clearSession()
    router.push('/')
  }

  // 当前订单号为 11 位手机号且详情中无有效 19 位淘宝订单号时，需在确认弹窗内先绑定
  const needBindInConfirm = Boolean(
    orderNumber &&
    /^\d{11}$/.test(orderNumber) &&
    (!relatedOrderNoFromDetail || relatedOrderNoFromDetail.length !== 19)
  )

  return (
    <>
      <style>{shimmerStyle}</style>
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
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6 ">
          <h1 className="text-2xl font-bold text-center text-gray-800 mb-3">
            照片提交成功
          </h1>
          <p 
            className="text-center text-red-600 font-bold mb-6 px-4 py-3 bg-red-50 border-2 border-red-400 rounded-lg inline-block mx-auto"
            style={{
              animation: 'blink 1.5s ease-in-out infinite, pulse-glow 2s ease-in-out infinite',
            }}
          >
           确认无问题请点击锁单，店铺进入制作流程。锁单后无法修改照片。
          </p>

          {/* 订单信息 */}
          {orderNumber && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">订单编号</span>
                <span className="font-bold text-pink-500">{orderNumber}</span>
              </div>
              {currentSession && (
                <div className="flex justify-between">
                  <span className="text-gray-500">当前规格</span>
                  <span className="font-medium">{currentSession.sizeName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">最后一次提交时间</span>
                <span className="font-medium">
                  {submitTime
                    ? new Date(submitTime).toLocaleString('zh-CN')
                    : '暂无'}
                </span>
              </div>
            </div>
          )}

          {/* 所有规格摘要 */}
          {orderNumber && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                所有规格摘要
                <span className="ml-2 text-xs font-normal text-gray-400">
                  （点击可继续上传）
                </span>
              </h3>
              {isLoadingSizes ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-pink-500 animate-spin mr-2" />
                  <span className="text-sm text-gray-500">加载中...</span>
                </div>
              ) : allSizes.length === 0 ? (
                <div className="text-center py-4 text-sm text-gray-400">
                  暂无规格信息
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {allSizes.map((size) => {
                    const isCurrentSize = currentSession?.sizeId === size.id
                    return (
                      <button
                        key={size.id}
                        onClick={() => handleSelectSize(size)}
                        className={`w-full bg-white border rounded-lg p-3 transition-all active:scale-[0.98] text-left ${
                          isCurrentSize
                            ? 'border-pink-400 bg-pink-50 shadow-sm'
                            : 'border-gray-200 hover:border-pink-300 hover:bg-pink-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-800">
                                {size.paperName}
                              </span>
                              <span className="text-sm font-bold text-pink-500">
                                {size.sizeName}
                              </span>
                              {isCurrentSize && (
                                <span className="px-1.5 py-0.5 bg-pink-100 text-pink-600 text-xs rounded">
                                  刚提交
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400">
                              {size.width}×{size.height}mm
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                              size.totalPrintCount > 0
                                ? 'bg-green-50 text-green-600'
                                : 'bg-gray-100 text-gray-400'
                            }`}>
                              {size.totalPrintCount} 张
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300" />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {isLocked ? (
              <div className="w-full py-3 bg-green-50 border-2 border-green-400 text-green-700 font-medium rounded-lg flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                订单已锁定，正在制作中
              </div>
            ) : (
              <button
                onClick={handleSubmitOrderClick}
                disabled={isLocking || !orderNumber}
                className="w-full py-3 bg-white border-2 border-pink-400 text-pink-500 font-medium rounded-lg shadow-sm hover:bg-pink-50 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLocking ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    提交中...
                  </>
                ) : (
                  <>
                    <Image className="w-5 h-5" />
                    锁定订单，确认制作
                  </>
                )}
              </button>
            )}
           
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

      {/* 确认提交订单弹窗（统一二次确认，需绑定时展示淘宝订单号输入） */}
      {showSubmitConfirm && !isLocked && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-center mb-4">确认订单并提交制作</h3>
            <div className="space-y-3 text-sm text-gray-700 mb-4">
              <p className="text-red-600 font-semibold">
                提交后订单将进入制作流程，<span className="underline">只能查看，无法修改照片和数量</span>。
              </p>
              <p>请仔细检查所有规格、照片数量和裁剪效果是否正确。</p>
              <p className="text-gray-500">如需修改，请先返回上一页，在确认无误后再提交。</p>
            </div>

            {(needBindInConfirm || showBindInConfirm) && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-sm text-amber-800 font-medium mb-2">
                  当前订单为手机号，请先输入19位淘宝订单号以关联本单，便于店铺核对。
                </p>
                {submitError && <p className="text-xs text-red-600 mb-2">{submitError}</p>}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={19}
                  placeholder="请输入 19 位淘宝订单号"
                  value={bindRelatedInput}
                  onChange={(e) => {
                    setBindRelatedInput(e.target.value.replace(/\D/g, '').slice(0, 19))
                    setSubmitError('')
                  }}
                  className="w-full px-4 py-2.5 border-2 border-amber-200 rounded-lg text-base focus:border-amber-500 focus:outline-none"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                disabled={isLocking}
                onClick={() => {
                  setShowSubmitConfirm(false)
                  setShowBindInConfirm(false)
                  setSubmitError('')
                  setBindRelatedInput('')
                }}
                className="flex-1 py-3 border-2 border-gray-200 rounded-full font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                再检查一下
              </button>
              <button
                type="button"
                disabled={
                  isLocking ||
                  ((needBindInConfirm || showBindInConfirm) && bindRelatedInput.trim().length !== 19)
                }
                onClick={handleConfirmSubmitOrder}
                className="flex-1 py-3 bg-pink-500 text-white rounded-full font-medium hover:bg-pink-600 shadow-md disabled:opacity-50 disabled:bg-gray-300 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isLocking ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                确认提交
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

