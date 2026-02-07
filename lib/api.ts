/**
 * API 请求封装
 */

import { toast } from 'sonner'
import {
  BusinessError,
  SystemError,
  NetworkError,
  isBusinessError,
  isSystemError,
  handleSpecialError,
  reportErrorToMonitoring,
  ORDER_ERROR,
  type ApiErrorResponse,
} from './error-handler'

// API 基础配置
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9999'

// 统一响应类型
interface ApiResponse<T> {
  code?: number
  msg?: string
  message?: string
  data?: T
  // 有些接口直接返回数据，不包装
  [key: string]: unknown
}

// 请求配置
interface RequestConfig extends RequestInit {
  params?: Record<string, string>
  // 是否静默处理错误（不显示 toast）
  silent?: boolean
}

/**
 * 统一请求函数
 * 自动处理错误并显示 toast 提示
 */
async function request<T>(url: string, config: RequestConfig = {}): Promise<T> {
  const { params, silent = false, ...init } = config

  // 构建完整 URL
  let fullUrl = `${API_BASE_URL}${url}`
  if (params) {
    const searchParams = new URLSearchParams(params)
    fullUrl += `?${searchParams.toString()}`
  }

  // 默认请求头
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...init.headers,
  }

  try {
    const response = await fetch(fullUrl, {
      ...init,
      headers,
    })

    // 处理 HTTP 错误状态码
    if (!response.ok) {
      // 尝试解析错误响应
      let errorData: ApiErrorResponse | null = null
      try {
        errorData = await response.json()
      } catch {
        // 无法解析 JSON，使用默认错误信息
      }

      // 如果是业务错误格式，按业务错误处理
      if (errorData && typeof errorData.code === 'number' && errorData.msg) {
        return handleErrorResponse(errorData, silent)
      }

      // HTTP 状态码错误
      throw new NetworkError(`请求失败: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()

    // 成功响应 (code === 0)
    if (result.code === 0 || result.code === undefined) {
      // 如果响应有 data 字段，返回 data 内容；否则返回整个 result
      if (result.data !== undefined) {
        return result.data as T
      }
      return result as T
    }

    // 错误响应
    return handleErrorResponse(
      {
        code: result.code,
        msg: result.msg || result.message || '请求失败',
      },
      silent
    )
  } catch (error) {
    // 网络错误或其他异常
    if (error instanceof NetworkError || error instanceof BusinessError || error instanceof SystemError) {
      throw error
    }

    // 其他类型的错误（如网络断开、超时等）
    const networkError = new NetworkError(
      error instanceof TypeError && error.message.includes('fetch')
        ? '网络异常，请检查网络连接'
        : error instanceof Error
          ? error.message
          : '请求失败，请稍后再试'
    )

    if (!silent) {
      toast.error(networkError.message)
    }

    throw networkError
  }
}

/**
 * 处理错误响应
 */
function handleErrorResponse(errorData: ApiErrorResponse, silent: boolean): never {
  const { code, msg } = errorData

  // 订单过期：不展示 toast，只做统一跳转
  if (code === ORDER_ERROR.ORDER_EXPIRED) {
    handleSpecialError(code, msg)
    throw new BusinessError(code, msg)
  }

  // 业务错误 (10000-49999)
  if (isBusinessError(code)) {
    // 显示 toast 提示
    if (!silent) {
      toast.error(msg)
    }

    // 处理特殊错误码（如跳转页面等）
    handleSpecialError(code, msg)

    // 抛出业务错误
    throw new BusinessError(code, msg)
  }

  // 系统错误 (50000+)
  if (isSystemError(code)) {
    // 显示通用提示（不暴露具体技术错误）
    if (!silent) {
      toast.error('系统繁忙，请稍后再试')
    }

    // 上报到监控系统
    reportErrorToMonitoring(errorData, {
      url: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: new Date().toISOString(),
    })

    // 抛出系统错误
    throw new SystemError(code, msg)
  }

  // 未知错误码，按业务错误处理
  if (!silent) {
    toast.error(msg || '请求失败')
  }
  throw new BusinessError(code, msg)
}

// ==================== 类型定义 ====================

/** 裁剪信息 - 用于服务端处理，只包含服务端需要的字段 */
export interface CropInfo {
  canvasWidth: number // 相纸宽度（mm），用于计算相纸比例
  canvasHeight: number // 相纸高度（mm），用于计算相纸比例
  sourceWidth: number // 原图宽度（像素）
  sourceHeight: number // 原图高度（像素）
  offsetX: number // 原图坐标系中的X偏移量（px），裁剪起始位置
  offsetY: number // 原图坐标系中的Y偏移量（px），裁剪起始位置
  cropWidth: number // 裁剪宽度（像素）
  cropHeight: number // 裁剪高度（像素）
  rotateAngle: number // 旋转角度（仅0/90/180/270°）
  originalUrl: string // 原图地址（服务端能访问的路径）
  styleType?: string // 样式类型（可选）
  // 🎯 百分比坐标（用于恢复裁剪位置，官方推荐）
  croppedAreaPercent?: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface SpecInfo {
  id: number
  sessionId: string
  paperType: string
  paperName: string
  sizeId: string
  sizeName: string
  canvasWidth: number
  canvasHeight: number
  photoCount: number  // 实时统计的照片数量
  photos?: PhotoInfo[]
}

export interface PhotoInfo {
  id: number
  photoId: string
  ossUrl: string
  filename: string
  width: number
  height: number
  styleType: string
  isLandscape: boolean
  sortOrder: number
}

export interface PhotoDetail {
  id: number
  photoId: string
  url: string
  quantity: number
  spec: string
  specId: string
  originalWidth: number
  originalHeight: number
  isLandscape: boolean
  cropMode: string
  takenAt: string
  cropInfo?: CropInfo // 从服务端获取的裁剪信息
  outputUrl?: string  // 处理后的下载URL
  isAdjusted: boolean
}

export interface OssSignature {
  policy: string
  securityToken: string
  signatureVersion: string
  credential: string
  date: string
  signature: string
  host: string
  dir: string
  proxyDomain: string
  cdnDomain: string
}

// ==================== OSS 相关 ====================

/**
 * 获取 OSS 上传签名（每次都从服务端获取，不使用缓存）
 * 避免使用过期或无效的签名导致上传失败
 */
export async function getOssSignature(): Promise<OssSignature> {
  console.log('🔄 从服务器获取 OSS 签名...')
  const signature = await request<OssSignature>('/api/oss/signature')
  console.log('✅ OSS 签名获取成功')
  return signature
}

// 固定代理域名，用于上传后存储的 URL（后端/数据库中的地址）
// const OSS_PROXY_DOMAIN = 'https://oss-proxy.vencenty.cc'
const OSS_PROXY_DOMAIN = 'https://bucket.vencenty.cc'
// const OSS_PROXY_DOMAIN = 'https://photo-kits-storage-hangzhou.oss-cn-hangzhou.aliyuncs.com'

// CDN 域名，用于前端展示时加速访问（将 OSS 域名替换为 CDN）
const IMG_CDN_DOMAIN = 'https://img.vencenty.cc'

/**
 * 将 OSS 图片 URL 转为 CDN URL，用于加速展示
 * 仅替换已知的 OSS 源站域名，其它 URL 原样返回
 */
export function toCdnUrl(url: string): string {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const isOss =
      host === 'bucket.vencenty.cc' ||
      host === 'oss-proxy.vencenty.cc'
    if (isOss) {
      const pathAndSearch = u.pathname + u.search
      return IMG_CDN_DOMAIN + pathAndSearch
    }
  } catch {
    // 非合法 URL 则原样返回
  }
  return url
}

/**
 * 将 CDN/任意 OSS 展示 URL 转回 bucket 源站 URL，用于发给服务端存储
 * 服务端下载用 bucket 地址可避免走 CDN 产生费用
 */
export function toBucketUrl(url: string): string {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const pathAndSearch = u.pathname + u.search
    if (host === 'img.vencenty.cc' || host.endsWith('.aliyuncs.com') || host === 'oss-proxy.vencenty.cc') {
      return OSS_PROXY_DOMAIN + pathAndSearch
    }
  } catch {
    // 非合法 URL 则原样返回
  }
  return url
}

/**
 * 上传选项
 */
export interface UploadOptions {
  /** 订单号 */
  orderSn?: string
  /** 规格ID（使用纯英文/数字，避免中文路径在 Safari 等浏览器中的兼容问题） */
  specId?: string
}

/**
 * 上传文件到 OSS（客户端直传）
 * 流程：
 * 1. 从后端获取 STS 签名（已缓存）
 * 2. 前端直传 OSS（最大化上传性能）
 * 3. 使用代理域名回显图片（稳定访问）
 * 
 * 文件路径规则：
 * - 有订单号和规格名称时：uploads/订单号/规格名称/文件名
 * - 只有订单号时：uploads/订单号/文件名
 * - 都没有时：uploads/文件名
 */
export async function uploadToOss(
  file: File, 
  signature: OssSignature,
  options?: UploadOptions
): Promise<string> {
  // 验证签名数据
  if (!signature.host || !signature.policy || !signature.signature) {
    console.error('OSS签名数据不完整:', signature)
    throw new Error('OSS签名数据不完整')
  }

  const formData = new FormData()
  
  // 生成唯一文件名：时间戳 + 随机字符串
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${ext}`
  
  // 构建上传路径：uploads/订单号/规格ID/文件名
  // 🎯 禁止使用中文，避免 Safari 等浏览器的兼容问题
  const baseDir = signature.dir || 'uploads'
  let key = baseDir
  
  if (options?.orderSn) {
    // 清理订单号中的特殊字符（只保留字母、数字、下划线、横杠）
    const safeOrderSn = options.orderSn.replace(/[^\w-]/g, '_')
    key = `${key}/${safeOrderSn}`
    
    if (options?.specId) {
      // 清理规格ID中的特殊字符（只保留字母、数字、下划线、横杠）
      const safeSpecId = options.specId.replace(/[^\w-]/g, '_')
      key = `${key}/${safeSpecId}`
    }
  }
  
  key = `${key}/${filename}`

  console.log('OSS直传开始:', { 
    host: signature.host, 
    key, 
    fileSize: file.size,
    fileName: file.name,
    orderSn: options?.orderSn,
    specId: options?.specId
  })

  // OSS V4 签名必需的字段（注意顺序和字段名）
  // 参考: https://help.aliyun.com/zh/oss/developer-reference/postobject
  formData.append('key', key)
  formData.append('policy', signature.policy)
  formData.append('x-oss-signature-version', signature.signatureVersion)
  formData.append('x-oss-credential', signature.credential)
  formData.append('x-oss-date', signature.date)
  formData.append('x-oss-security-token', signature.securityToken)
  formData.append('x-oss-signature', signature.signature)  // 注意是 x-oss-signature 不是 signature
  formData.append('file', file)  // file 必须放在最后

  // 直传到 OSS
  const response = await fetch(signature.host, {
    method: 'POST',
    body: formData,
  })

  // OSS 上传成功返回 200 或 204
  if (!response.ok && response.status !== 204) {
    const errorText = await response.text().catch(() => '')
    console.error('OSS上传失败:', response.status, errorText)
    throw new Error(`OSS上传失败: ${response.status}`)
  }
  // 使用固定代理域名回显图片
  const ossUrl = `${OSS_PROXY_DOMAIN}/${key}`
  console.log('OSS上传成功:', ossUrl)
  
  return ossUrl
}

/**
 * 获取图片完整 URL（用于显示，走 CDN 加速）
 */
export function getImageUrl(path: string): string {
  if (!path) return ''
  // 如果已经是完整 URL，转为 CDN URL 后返回
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return toCdnUrl(path)
  }
  // 相对路径：用 CDN 域名拼接
  return `${IMG_CDN_DOMAIN}/${path.replace(/^\//, '')}`
}

// ==================== 订单相关 ====================

export interface OrderInfo {
  id: number
  orderNo: string
  total: number
  status: number
  isSync: number
  createdAt: string
  updatedAt: string
}

/**
 * 创建订单
 */
export async function createOrder(orderNo: string): Promise<OrderInfo> {
  return request<OrderInfo>('/api/order', {
    method: 'POST',
    body: JSON.stringify({ orderNo }),
  })
}

export interface UpdateOrderParams {
  receiverName?: string
  relatedOrderNo?: string // 关联的淘宝订单号（当 orderNo 为 11 位手机号时用于绑定）
}

/**
 * 更新订单信息（收货人、关联订单号、引导页状态）
 * 后端路由: PUT /api/order/:orderNo/update
 * @param orderNo 订单号
 * @param params 可选：receiverName 收货人；relatedOrderNo 19 位淘宝订单号（11 位手机号时绑定）
 */
export async function updateOrder(orderNo: string, params: UpdateOrderParams): Promise<{
  success: boolean
  receiverName: string
  guideViewed: number
}> {
  return request(`/api/order/${orderNo}/update`, {
    method: 'PUT',
    body: JSON.stringify(params),
  })
}

export interface OrderDetailResponse {
  orderId: string
  orderSn: string
  relatedOrderNo?: string // 关联的淘宝订单号（11 位手机号时用户绑定后回显）
  size: string
  style: string
  totalQuantity: number
  totalPrice: number
  shippingFee: number
  status: number
  submitTime: string
  submitDays: number // 从提交时间到当前时间经过的天数（向下取整）
  receiverName: string // 后端 JSON 字段为 receiverName
  guideViewed: number // 是否已查看引导页：0-未查看 1-已查看
  photos?: PhotoDetail[] // 可选，根据 includePhotos 参数决定
  specs?: SpecInfo[] // 规格列表
  createdAt: string
}

/**
 * 获取订单详情
 * 后端路由: GET /api/order/:orderSn
 * @param orderSn 订单号
 * @param includePhotos 是否包含照片列表，默认 false（列表页不需要）
 */
export async function getOrderDetail(orderSn: string, includePhotos: boolean = false): Promise<OrderDetailResponse> {
  const params: Record<string, string> = {}
  if (includePhotos) {
    params.includePhotos = 'true'
  }
  return request<OrderDetailResponse>(`/api/order/${orderSn}`, { params })
}

/**
 * 照片详情响应（根据 photo_id 获取单张照片信息）
 */
export interface PhotoDetailResponse {
  photo: PhotoDetail
  orderStatus: number // 订单状态：0-待上传 1-已提交 2-生产中 3-已发货 4-已完成 5-已取消
  orderSn: string // 订单号
}

/**
 * 获取照片详情（根据 photo_id）
 * 后端路由: GET /api/photo/:photoId
 */
export async function getPhotoDetail(photoId: string): Promise<PhotoDetailResponse> {
  return request<PhotoDetailResponse>(`/api/photo/${photoId}`)
}

// ==================== 规格相关 ====================

export interface AddSpecParams {
  sessionId: string
  paperType: string
  paperName: string
  sizeId: string
  sizeName: string
  canvasWidth: number
  canvasHeight: number
}

/**
 * 添加规格
 * 后端路由: POST /api/order/:orderNo/spec
 */
export async function addSpec(orderNo: string, params: AddSpecParams): Promise<SpecInfo> {
  return request<SpecInfo>(`/api/order/${orderNo}/spec`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/**
 * 删除规格
 * 后端路由: DELETE /api/order/:orderNo/spec/:id
 */
export async function deleteSpec(orderNo: string, specId: number): Promise<{ code: number; message: string }> {
  return request<{ code: number; message: string }>(`/api/order/${orderNo}/spec/${specId}`, {
    method: 'DELETE',
  })
}

export interface ListSpecsResponse {
  specs: SpecInfo[]
}

/**
 * 获取规格列表
 * 后端路由: GET /api/order/:orderNo/specs
 */
export async function listSpecs(orderNo: string): Promise<ListSpecsResponse> {
  return request<ListSpecsResponse>(`/api/order/${orderNo}/specs`)
}

// ==================== 照片相关 ====================

export interface AddPhotoParams {
  orderSn: string
  specId: string
  photoId: string
  url: string
  filename: string
  originalWidth: number
  originalHeight: number
  quantity?: number
  cropMode?: string
  isLandscape?: boolean
  cropInfo?: CropInfo // 用于服务端处理
}

/**
 * 添加照片到订单
 * 后端路由: POST /api/order/photo
 * 发给服务端的 url 会转为 bucket 源站地址
 */
export async function addPhotoToOrder(params: AddPhotoParams): Promise<{ id: number; photoId: string; message: string }> {
  const body: AddPhotoParams = {
    ...params,
    url: toBucketUrl(params.url),
    cropInfo: params.cropInfo?.originalUrl
      ? { ...params.cropInfo, originalUrl: toBucketUrl(params.cropInfo.originalUrl) }
      : params.cropInfo,
  }
  return request<{ id: number; photoId: string; message: string }>('/api/order/photo', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export interface UpdatePhotoParams {
  photoId: string
  quantity?: number
  cropMode?: string
  cropInfo?: CropInfo // 用于服务端处理
  outputUrl?: string
  listThumbUrl?: string
}

/**
 * 更新照片
 * 后端路由: PUT /api/order/photo
 * 发给服务端的 outputUrl 会转为 bucket 源站地址
 */
export async function updatePhoto(params: UpdatePhotoParams): Promise<{ message: string }> {
  const body: UpdatePhotoParams = {
    ...params,
    outputUrl: params.outputUrl ? toBucketUrl(params.outputUrl) : params.outputUrl,
    cropInfo: params.cropInfo?.originalUrl
      ? { ...params.cropInfo, originalUrl: toBucketUrl(params.cropInfo.originalUrl) }
      : params.cropInfo,
  }
  return request<{ message: string }>('/api/order/photo', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export interface BatchUpdatePhotosParams {
  photoIds: string[]
  cropMode?: string
  /** 每张图片的详细更新数据（包含 cropInfo 和 outputUrl） */
  photos?: {
    photoId: string
    cropInfo?: CropInfo
    outputUrl?: string
  }[]
}

/**
 * 批量更新照片
 * 后端路由: PUT /api/order/photos/batch
 * 
 * 支持两种模式：
 * 1. 简单模式：只传 photoIds 和 cropMode，服务端计算裁切坐标
 * 2. 精确模式：传 photos 数组，前端已计算好 cropInfo 和 outputUrl，服务端直接使用
 * 
 * 发给服务端的 URL 会统一转为 bucket 源站地址，避免服务端下载走 CDN 产生费用
 */
export async function batchUpdatePhotos(params: BatchUpdatePhotosParams): Promise<{ updatedCount: number; message: string }> {
  const body: BatchUpdatePhotosParams = {
    photoIds: params.photoIds,
    cropMode: params.cropMode,
    photos: params.photos?.map((p) => ({
      photoId: p.photoId,
      cropInfo: p.cropInfo
        ? {
            ...p.cropInfo,
            originalUrl: p.cropInfo.originalUrl ? toBucketUrl(p.cropInfo.originalUrl) : p.cropInfo.originalUrl,
          }
        : p.cropInfo,
      outputUrl: p.outputUrl ? toBucketUrl(p.outputUrl) : p.outputUrl,
    })),
  }
  return request<{ updatedCount: number; message: string }>('/api/order/photos/batch', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/**
 * 删除照片（支持单个或批量删除）
 * 后端路由: DELETE /api/order/photo
 */
export async function deletePhotoFromOrder(
  photoIdOrIds: string | string[]
): Promise<{ code: number; message: string }> {
  // 兼容单个和批量删除
  const body = Array.isArray(photoIdOrIds)
    ? { photoIds: photoIdOrIds }
    : { photoId: photoIdOrIds }
  
  return request<{ code: number; message: string }>('/api/order/photo', {
    method: 'DELETE',
    body: JSON.stringify(body),
  })
}

/**
 * 获取照片列表
 * 后端路由: GET /api/order/photos
 */
export async function listPhotos(orderSn?: string, specId?: string): Promise<{ photos: PhotoDetail[] }> {
  const params: Record<string, string> = {}
  if (orderSn) params.orderSn = orderSn
  if (specId) params.specId = specId
  return request<{ photos: PhotoDetail[] }>('/api/order/photos', { params })
}

// ==================== 订单提交相关 ====================

export interface SubmitOrderParams {
  orderSn: string
  receiverName?: string
  size?: string
  style?: string
  totalQuantity: number
  total: number
  shippingFee?: number
  submitTime?: string
  watermarkConfig?: {
    enabled: boolean
    text?: string
    fontSize?: number
    opacity?: number
    position?: string
  }
  photos: {
    id: string
    url: string
    quantity: number
    cropInfo?: CropInfo // 用于服务端处理
  }[]
}

/**
 * 提交订单状态更新
 * 后端路由: PUT /api/order/:orderNo/submit
 */
export async function submitOrderStatus(orderNo: string): Promise<{ code: number; message: string }> {
  return request<{ code: number; message: string }>(`/api/order/${orderNo}/submit`, {
    method: 'PUT',
  })
}

/**
 * 提交订单制作（新接口）
 * 功能：将订单状态改为已提交，创建审核记录
 * 后端路由: POST /api/order/submit
 */
export interface SubmitOrderForProductionParams {
  orderSn: string
  receiverName?: string
  relatedOrderNo?: string // 关联的淘宝订单号（当 orderSn 为 11 位手机号时必填）
}

export async function submitOrderForProduction(params: SubmitOrderForProductionParams): Promise<{ message: string }> {
  return request<{ message: string }>('/api/order/submit', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/**
 * 锁单（客户确认，状态改为生产中/客户已确认）
 * 后端路由: PUT /api/order/:orderNo/lock
 * 注意：使用状态2（生产中）表示客户已确认/锁单
 */
export async function lockOrder(orderNo: string): Promise<{ code: number; message: string }> {
  // 使用 submitOrderStatus，但实际应该创建一个新的 lock 接口
  // 暂时使用 submitOrderStatus，后续可以改为专门的 lock 接口
  return request<{ code: number; message: string }>(`/api/order/${orderNo}/submit`, {
    method: 'PUT',
  })
}

// ==================== Admin API ====================

export interface AdminOrderListItem {
  id: number
  orderSn: string
  receiver: string
  totalQuantity: number
  status: number
  syncStatus: number
  submitTime: string
  createdAt: string
  updatedAt: string
}

export interface AdminOrderListRequest {
  page?: number
  pageSize?: number
  status?: number
  orderSn?: string
}

export interface AdminOrderListResponse {
  list: AdminOrderListItem[]
  total: number
  page: number
  pageSize: number
}

export interface AdminOrderDetailResponse {
  id: number
  orderSn: string
  receiver: string
  totalQuantity: number
  status: number
  syncStatus: number
  submitTime: string
  remark: string
  createdAt: string
  updatedAt: string
  photos?: PhotoDetail[]
  specs?: SpecInfo[]
}

export interface AdminOrderDeleteResponse {
  success: boolean
  message: string
}

/**
 * Admin 订单列表
 */
export async function getAdminOrderList(params: AdminOrderListRequest = {}): Promise<AdminOrderListResponse> {
  return request<AdminOrderListResponse>('/api/admin/order/list', {
    method: 'GET',
    params: {
      page: String(params.page || 1),
      pageSize: String(params.pageSize || 20),
      ...(params.status !== undefined && { status: String(params.status) }),
      ...(params.orderSn && { orderSn: params.orderSn }),
    },
  })
}

/**
 * Admin 订单详情
 */
export async function getAdminOrderDetail(orderSn: string): Promise<AdminOrderDetailResponse> {
  return request<AdminOrderDetailResponse>(`/api/admin/order/detail/${orderSn}`, {
    method: 'GET',
  })
}

/**
 * Admin 删除订单
 */
export async function deleteAdminOrder(orderSn: string): Promise<AdminOrderDeleteResponse> {
  return request<AdminOrderDeleteResponse>(`/api/admin/order/delete/${orderSn}`, {
    method: 'DELETE',
  })
}
