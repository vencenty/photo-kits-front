/**
 * API 请求封装
 */

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
}

/**
 * 统一请求函数
 */
async function request<T>(url: string, config: RequestConfig = {}): Promise<T> {
  const { params, ...init } = config

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

  const response = await fetch(fullUrl, {
    ...init,
    headers,
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const result = await response.json()

  // go-zero 使用 utils.OkResponse 包装响应
  // 响应格式: { code: 0, msg: "success", data: {...} }
  if (result.code !== undefined && result.code !== 0) {
    throw new Error(result.msg || result.message || '请求失败')
  }

  // 如果响应有 data 字段，返回 data 内容；否则返回整个 result
  if (result.data !== undefined) {
    return result.data as T
  }

  return result as T
}

// ==================== 类型定义 ====================

/** 照片变换信息 - 用于前端回显 */
export interface PhotoTransform {
  matrix?: number[] // 兼容旧版本
  outputWidth: number // 前端显示宽度（像素）
  outputHeight: number // 前端显示高度（像素）
  sourceWidth: number // 原图宽度（像素）
  sourceHeight: number // 原图高度（像素）
  styleType?: string // 样式类型
  // 变换参数（用于前端回显）
  rotateAngle?: number // 旋转角度（仅0/90/180/270°）
  scale?: number // 等比例缩放
  translateX?: number // X平移（px）
  translateY?: number // Y平移（px）
  originalUrl?: string // 原图地址
}

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
  photoCount: number
  printCount: number
  photos?: PhotoInfo[]
}

export interface PhotoInfo {
  id: number
  photoId: string
  ossUrl: string
  filename: string
  width: number
  height: number
  printCount: number
  styleType: string
  isLandscape: boolean
  transform?: PhotoTransform
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
  transform?: PhotoTransform
  cropInfo?: CropInfo // 从服务端获取的裁剪信息
  outputUrl?: string  // 处理后的下载URL
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

// OSS 签名缓存配置
const OSS_SIGNATURE_CACHE_KEY = 'oss-signature-cache'
const OSS_SIGNATURE_CACHE_DURATION = 30 * 60 * 1000 // 30分钟

interface OssSignatureCache {
  signature: OssSignature
  timestamp: number
}

/**
 * 获取 OSS 上传签名（带缓存）
 */
export async function getOssSignature(): Promise<OssSignature> {
  // 检查缓存
  const cached = getCachedSignature()
  if (cached) {
    console.log('✅ 使用缓存的 OSS 签名')
    return cached
  }

  console.log('🔄 从服务器获取新的 OSS 签名...')
  // 从服务器获取新签名
  const signature = await request<OssSignature>('/api/oss/signature')

  // 缓存签名
  setCachedSignature(signature)
  console.log('💾 OSS 签名已缓存（30分钟内有效）')

  return signature
}

/**
 * 获取缓存的 OSS 签名
 */
function getCachedSignature(): OssSignature | null {
  // 只在客户端使用缓存
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(OSS_SIGNATURE_CACHE_KEY)
    if (!cached) return null

    const cache: OssSignatureCache = JSON.parse(cached)
    const now = Date.now()

    // 检查是否过期
    if (now - cache.timestamp > OSS_SIGNATURE_CACHE_DURATION) {
      localStorage.removeItem(OSS_SIGNATURE_CACHE_KEY)
      return null
    }

    return cache.signature
  } catch (error) {
    console.warn('读取 OSS 签名缓存失败:', error)
    if (typeof window !== 'undefined') {
      localStorage.removeItem(OSS_SIGNATURE_CACHE_KEY)
    }
    return null
  }
}

/**
 * 缓存 OSS 签名
 */
function setCachedSignature(signature: OssSignature): void {
  // 只在客户端缓存
  if (typeof window === 'undefined') return

  try {
    const cache: OssSignatureCache = {
      signature,
      timestamp: Date.now()
    }
    localStorage.setItem(OSS_SIGNATURE_CACHE_KEY, JSON.stringify(cache))
  } catch (error) {
    console.warn('缓存 OSS 签名失败:', error)
  }
}

/**
 * 清除 OSS 签名缓存
 */
export function clearOssSignatureCache(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(OSS_SIGNATURE_CACHE_KEY)
  } catch (error) {
    console.warn('清除 OSS 签名缓存失败:', error)
  }
}

/**
 * 获取 OSS 签名缓存信息（调试用）
 */
export function getOssSignatureCacheInfo(): { cached: boolean, age: number, expiresIn: number } | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(OSS_SIGNATURE_CACHE_KEY)
    if (!cached) return null

    const cache: OssSignatureCache = JSON.parse(cached)
    const now = Date.now()
    const age = now - cache.timestamp
    const expiresIn = OSS_SIGNATURE_CACHE_DURATION - age

    return {
      cached: true,
      age,
      expiresIn
    }
  } catch (error) {
    return null
  }
}

// 固定代理域名，用于图片回显
const OSS_PROXY_DOMAIN = 'https://oss-proxy.vencenty.cc'

/**
 * 上传文件到 OSS（客户端直传）
 * 流程：
 * 1. 从后端获取 STS 签名（已缓存）
 * 2. 前端直传 OSS（最大化上传性能）
 * 3. 使用代理域名回显图片（稳定访问）
 */
export async function uploadToOss(file: File, signature: OssSignature): Promise<string> {
  // 验证签名数据
  if (!signature.host || !signature.policy || !signature.signature) {
    console.error('OSS签名数据不完整:', signature)
    throw new Error('OSS签名数据不完整')
  }

  const formData = new FormData()
  
  // 生成唯一文件名：时间戳 + 随机字符串
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${ext}`
  
  // 上传目录，如果 dir 为空则使用默认目录
  const uploadDir = signature.dir || 'uploads'
  const key = `${uploadDir}/${filename}`

  console.log('OSS直传开始:', { 
    host: signature.host, 
    key, 
    fileSize: file.size,
    fileName: file.name 
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
 * 获取图片完整 URL（用于显示）
 */
export function getImageUrl(path: string): string {
  if (!path) return ''
  // 如果已经是完整 URL，直接返回
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path
  }
  // 拼接代理域名
  return `${OSS_PROXY_DOMAIN}/${path}`
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

export interface OrderDetailResponse {
  orderId: string
  orderSn: string
  size: string
  style: string
  totalQuantity: number
  totalPrice: number
  shippingFee: number
  status: number
  submitTime: string
  receiverName: string
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
  transform?: PhotoTransform // 用于前端回显
  cropInfo?: CropInfo // 用于服务端处理
}

/**
 * 添加照片到订单
 * 后端路由: POST /api/order/photo
 */
export async function addPhotoToOrder(params: AddPhotoParams): Promise<{ id: number; photoId: string; message: string }> {
  return request<{ id: number; photoId: string; message: string }>('/api/order/photo', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export interface UpdatePhotoParams {
  photoId: string
  quantity?: number
  cropMode?: string
  transform?: PhotoTransform // 用于前端回显
  cropInfo?: CropInfo // 用于服务端处理
  outputUrl?: string
  listThumbUrl?: string
}

/**
 * 更新照片
 * 后端路由: PUT /api/order/photo
 */
export async function updatePhoto(params: UpdatePhotoParams): Promise<{ message: string }> {
  return request<{ message: string }>('/api/order/photo', {
    method: 'PUT',
    body: JSON.stringify(params),
  })
}

export interface BatchUpdatePhotosParams {
  photoIds: string[]
  cropMode?: string
  transform?: PhotoTransform
}

/**
 * 批量更新照片
 * 后端路由: PUT /api/order/photos/batch
 */
export async function batchUpdatePhotos(params: BatchUpdatePhotosParams): Promise<{ updatedCount: number; message: string }> {
  return request<{ updatedCount: number; message: string }>('/api/order/photos/batch', {
    method: 'PUT',
    body: JSON.stringify(params),
  })
}

/**
 * 删除照片
 * 后端路由: DELETE /api/order/photo
 */
export async function deletePhotoFromOrder(photoId: string): Promise<{ code: number; message: string }> {
  return request<{ code: number; message: string }>('/api/order/photo', {
    method: 'DELETE',
    body: JSON.stringify({ photoId }),
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
    transform?: PhotoTransform // 用于前端回显
    cropInfo?: CropInfo // 用于服务端处理
  }[]
}

/**
 * 提交订单（照片批量提交）
 * 后端路由: POST /api/photo/submit
 */
export async function submitOrder(params: SubmitOrderParams): Promise<{ orderId: string; orderSn: string; message: string }> {
  return request<{ orderId: string; orderSn: string; message: string }>('/api/photo/submit', {
    method: 'POST',
    body: JSON.stringify(params),
  })
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
