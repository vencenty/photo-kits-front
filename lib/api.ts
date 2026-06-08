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
  type ApiErrorResponse,
} from './error-handler'
import { OSS_PROXY_DOMAIN, toCdnUrl, toBucketUrl } from './url'
import { isValidOrderSnOrPhone, normalizeOrderOrPhoneInput } from './utils'
import {
  getActiveOrderNo,
  setActiveOrderNo,
  ORDER_NO_HEADER,
  ORDER_CONTEXT_SKIP_PREFIXES,
} from './order-context'
import { getShopHeaders } from './shop-context'

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
  /** 跳过自动注入 X-Order-No（如 init、Admin 接口） */
  skipOrderContext?: boolean
}

function shouldInjectOrderNo(url: string, skipOrderContext?: boolean): boolean {
  if (skipOrderContext || typeof window === 'undefined') return false
  if (ORDER_CONTEXT_SKIP_PREFIXES.some((prefix) => url.startsWith(prefix))) return false
  return !!getActiveOrderNo()
}

/**
 * 统一请求函数
 * 自动处理错误并显示 toast 提示；已 init 的订单自动注入 X-Order-No Header
 */
async function request<T>(url: string, config: RequestConfig = {}): Promise<T> {
  const { params, silent = false, skipOrderContext = false, ...init } = config

  // 构建完整 URL
  let fullUrl = `${API_BASE_URL}${url}`
  if (params) {
    const searchParams = new URLSearchParams(params)
    fullUrl += `?${searchParams.toString()}`
  }

  // 默认请求头（含店铺上下文）
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getShopHeaders(),
    ...(init.headers as Record<string, string> | undefined),
  }

  if (shouldInjectOrderNo(url, skipOrderContext)) {
    headers[ORDER_NO_HEADER] = getActiveOrderNo()
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

// 从 types.ts 重新导出，保持向后兼容
export type { CropInfo } from './types'
import type { CropInfo } from './types'

export interface SpecInfo {
  id: number
  skuId: number
  paperTypeId: number
  paperName: string
  photoSizeId: number
  sizeName: string
  canvasWidth: number
  canvasHeight: number
  photoCount: number
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
  specId: number
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

/** 客户端签名缓存 TTL（服务端默认 30 分钟，此处仅用于合并并发/重复请求） */
const OSS_SIGNATURE_TTL_MS = 5 * 60 * 1000

let ossSignatureCache: { data: OssSignature; expireAt: number } | null = null
let ossSignatureInflight: Promise<OssSignature> | null = null

/**
 * 获取 OSS 上传签名
 * 合并并发与短时间内的重复请求（如 React Strict Mode 双挂载、页面预取 + 上传）
 */
export async function getOssSignature(): Promise<OssSignature> {
  const now = Date.now()
  if (ossSignatureCache && now < ossSignatureCache.expireAt) {
    return ossSignatureCache.data
  }

  if (ossSignatureInflight) {
    return ossSignatureInflight
  }

  ossSignatureInflight = request<OssSignature>('/v1/oss/signature')
    .then((signature) => {
      ossSignatureCache = { data: signature, expireAt: Date.now() + OSS_SIGNATURE_TTL_MS }
      return signature
    })
    .finally(() => {
      ossSignatureInflight = null
    })

  return ossSignatureInflight
}

/** 上传失败等场景可主动清缓存，强制下次重新拉签名 */
export function clearOssSignatureCache(): void {
  ossSignatureCache = null
  ossSignatureInflight = null
}

// ==================== OSS 上传 ====================
export interface UploadOptions {
  /** 订单号（OSS 路径用） */
  orderNo?: string
  /** 规格 ID（order_specs.id，用于 OSS 路径） */
  specId?: number | string
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
  
  if (options?.orderNo) {
    const safeOrderNo = options.orderNo.replace(/[^\w-]/g, '_')
    key = `${key}/${safeOrderNo}`
    
    if (options?.specId !== undefined && options.specId !== '') {
      const safeSpecId = String(options.specId).replace(/[^\w-]/g, '_')
      key = `${key}/${safeSpecId}`
    }
  }
  
  key = `${key}/${filename}`

  console.log('OSS直传开始:', { 
    host: signature.host, 
    key, 
    fileSize: file.size,
    fileName: file.name,
    orderNo: options?.orderNo,
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
 * @deprecated 请从 @/lib/url 导入
 */
export { getImageUrl } from './url'

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
export async function createOrder(): Promise<OrderInfo> {
  return request<OrderInfo>('/v1/order/create', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export interface UpdateOrderParams {
  receiverName?: string
  relatedOrderNo?: string // 关联的淘宝订单号（当 orderNo 为 11 位手机号时用于绑定）
}

/**
 * 更新订单信息（收货人、关联订单号、引导页状态）
 */
export async function updateOrder(params: UpdateOrderParams): Promise<{
  success: boolean
  receiverName: string
  guideViewed: number
}> {
  return request(`/v1/order/update`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export interface OrderDetailResponse {
  orderNo: string
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
 * 获取订单详情（init）
 * init 为特殊接口：body 需携带 orderNo、includePhotos；Header 同步带 X-Order-No 供中间件鉴权
 * @param orderNo 可选；不传时使用 localStorage 中的活跃订单号
 * @param includePhotos 是否包含照片列表，默认 false
 */
export async function getOrderDetail(
  orderNo?: string,
  includePhotos: boolean = false
): Promise<OrderDetailResponse> {
  const normalized = normalizeOrderOrPhoneInput(orderNo ?? getActiveOrderNo())
  if (!isValidOrderSnOrPhone(normalized)) {
    throw new Error('请输入 11 位手机号或 19 位淘宝订单号（请勿在中间加空格或横线）')
  }

  const data = await request<OrderDetailResponse>('/v1/order/init', {
    method: 'POST',
    skipOrderContext: true,
    headers: {
      [ORDER_NO_HEADER]: normalized,
    },
    body: JSON.stringify({
      orderNo: normalized,
      ...(includePhotos ? { includePhotos: true } : {}),
    }),
  })

  setActiveOrderNo(data.orderNo || normalized)
  return data
}

/**
 * 照片详情响应（根据 photo_id 获取单张照片信息）
 */
export interface PhotoDetailResponse {
  photo: PhotoDetail
  orderStatus: number // 订单状态：0-待上传 1-已提交 2-生产中 3-已发货 4-已完成 5-已取消
  orderNo: string
}

/**
 * 获取照片详情（根据 photo_id）
 * 后端路由: GET /api/photo/:photoId
 */
export async function getPhotoDetail(photoId: string): Promise<PhotoDetailResponse> {
  return request<PhotoDetailResponse>('/v1/order/photo/detail', { params: { photoId } })
}

// ==================== 规格相关 ====================

export interface AddSpecParams {
  skuId: number
}

/**
 * 添加规格（仅传 skuId，返回 order_specs.id）
 */
export async function addSpec(params: AddSpecParams): Promise<SpecInfo> {
  return request<SpecInfo>('/v1/order/spec/create', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/**
 * 删除规格
 */
export async function deleteSpec(specId: number): Promise<{ code: number; message: string }> {
  return request<{ code: number; message: string }>('/v1/order/spec/delete', {
    method: 'POST',
    body: JSON.stringify({ id: specId }),
  })
}

export interface ListSpecsResponse {
  specs: SpecInfo[]
}

/**
 * 获取规格列表
 */
export async function listSpecs(): Promise<ListSpecsResponse> {
  return request<ListSpecsResponse>('/v1/order/spec/list')
}

// ==================== 照片相关 ====================

export interface AddPhotoParams {
  specId: number
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
  return request<{ id: number; photoId: string; message: string }>('/v1/order/photo/add', {
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
 * 与服务端 routes.go 一致：PUT /v/order/photo/update（单条更新接口不在 /v1 前缀下）
 * JSON Body：photoId、quantity、cropMode、cropInfo、outputUrl（见 server UpdatePhotoRequest）
 * 发给服务端的 outputUrl 会转为 bucket 源站地址
 */
export async function updatePhoto(params: UpdatePhotoParams): Promise<{ message: string }> {
  const { listThumbUrl: _omit, ...rest } = params
  const body: Omit<UpdatePhotoParams, 'listThumbUrl'> = {
    ...rest,
    outputUrl: params.outputUrl ? toBucketUrl(params.outputUrl) : params.outputUrl,
    cropInfo: params.cropInfo?.originalUrl
      ? { ...params.cropInfo, originalUrl: toBucketUrl(params.cropInfo.originalUrl) }
      : params.cropInfo,
  }
  return request<{ message: string }>('/v/order/photo/update', {
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
  return request<{ updatedCount: number; message: string }>('/v1/order/photo/batchUpdate', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/**
 * 删除照片（支持单个或批量删除）
 */
export async function deletePhotoFromOrder(
  photoIdOrIds: string | string[]
): Promise<{ code: number; message: string }> {
  const photoIds = Array.isArray(photoIdOrIds) ? photoIdOrIds : [photoIdOrIds]
  return request<{ code: number; message: string }>('/v1/order/photo/delete', {
    method: 'POST',
    body: JSON.stringify({ photoIds }),
  })
}

/**
 * 获取照片列表
 */
export async function listPhotos(specId?: number): Promise<{ photos: PhotoDetail[] }> {
  const params: Record<string, string> = {}
  if (specId) params.specId = String(specId)
  return request<{ photos: PhotoDetail[] }>('/v1/order/photo/list', { params })
}

// ==================== 公开 SKU 目录 ====================

export interface PublicPaperType {
  id: number
  name: string
  description: string
  supportedSizeIds: number[]
  sortOrder: number
}

export interface PublicPhotoSize {
  id: number
  name: string
  width: number
  height: number
  aspectRatio: number
  sortOrder: number
}

export interface PublicSkuItem {
  id: number
  paperTypeId: number
  photoSizeId: number
  paperName: string
  paperDescription: string
  sizeName: string
  width: number
  height: number
  aspectRatio: number
  cropDefaultMode: string
  cropAvailableModes: string[]
  unitPrice: number
  sortOrder: number
}

export interface PublicSkuListResponse {
  paperTypes: PublicPaperType[]
  sizes: PublicPhotoSize[]
  skus: PublicSkuItem[]
}

export async function getPublicSkuList(): Promise<PublicSkuListResponse> {
  return request<PublicSkuListResponse>('/v1/sku/list')
}

// ==================== 订单提交相关 ====================

export interface SubmitOrderParams {
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
 */
export async function submitOrderStatus(): Promise<{ message: string }> {
  return request<{ message: string }>('/v1/order/submit', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/**
 * 提交订单制作（新接口）
 */
export interface SubmitOrderForProductionParams {
  receiverName?: string
  relatedOrderNo?: string // 关联的淘宝订单号（当 orderNo 为 11 位手机号时必填）
}

export async function submitOrderForProduction(
  params: SubmitOrderForProductionParams = {}
): Promise<{ message: string }> {
  return request<{ message: string }>('/v1/order/submit', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/**
 * 锁单（客户确认，状态改为生产中/客户已确认）
 */
export async function lockOrder(): Promise<{ message: string }> {
  return submitOrderStatus()
}

// ==================== Admin API ====================

export interface AdminOrderListItem {
  id: number
  orderNo: string
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
  orderNo?: string
}

export interface AdminOrderListResponse {
  list: AdminOrderListItem[]
  total: number
  page: number
  pageSize: number
}

export interface AdminOrderDetailResponse {
  id: number
  orderNo: string
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
    skipOrderContext: true,
    params: {
      page: String(params.page || 1),
      pageSize: String(params.pageSize || 20),
      ...(params.status !== undefined && { status: String(params.status) }),
      ...(params.orderNo && { orderNo: params.orderNo }),
    },
  })
}

/**
 * Admin 订单详情
 */
export async function getAdminOrderDetail(orderNo: string): Promise<AdminOrderDetailResponse> {
  return request<AdminOrderDetailResponse>(`/api/admin/order/detail/${orderNo}`, {
    method: 'GET',
    skipOrderContext: true,
  })
}

/**
 * Admin 删除订单
 */
export async function deleteAdminOrder(orderNo: string): Promise<AdminOrderDeleteResponse> {
  return request<AdminOrderDeleteResponse>(`/api/admin/order/delete/${orderNo}`, {
    method: 'DELETE',
    skipOrderContext: true,
  })
}
