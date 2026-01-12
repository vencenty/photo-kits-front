import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ==================== 仿射矩阵相关 ====================

/**
 * 仿射变换矩阵
 * 格式: [a, b, c, d, tx, ty]
 * 
 * 矩阵表示:
 * | a  c  tx |
 * | b  d  ty |
 * | 0  0  1  |
 */
export type AffineMatrix = [number, number, number, number, number, number]

/** 单位矩阵（无变换） */
export const IDENTITY_MATRIX: AffineMatrix = [1, 0, 0, 1, 0, 0]

/** 从 scale, rotation, position 创建仿射矩阵 */
export function createAffineMatrix(
  scaleX: number,
  scaleY: number,
  rotation: number, // 角度
  tx: number,
  ty: number
): AffineMatrix {
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  
  return [
    scaleX * cos,   // a
    scaleX * sin,   // b
    -scaleY * sin,  // c
    scaleY * cos,   // d
    tx,             // tx
    ty              // ty
  ]
}

/** 从仿射矩阵解析出 scale, rotation, position */
export function parseAffineMatrix(matrix: AffineMatrix): {
  scaleX: number
  scaleY: number
  rotation: number
  tx: number
  ty: number
} {
  const [a, b, c, d, tx, ty] = matrix
  
  const scaleX = Math.sqrt(a * a + b * b)
  const scaleY = Math.sqrt(c * c + d * d)
  const rotation = Math.atan2(b, a) * (180 / Math.PI)
  
  return { scaleX, scaleY, rotation, tx, ty }
}

// ==================== 照片变换类型 ====================

/** 照片变换信息（使用仿射矩阵）- 用于前端回显 */
export interface PhotoTransform {
  /** 仿射变换矩阵 [a, b, c, d, tx, ty]（兼容旧版本） */
  matrix?: AffineMatrix
  /** 输出宽度（像素） */
  outputWidth: number
  /** 输出高度（像素） */
  outputHeight: number
  /** 原图宽度（像素） */
  sourceWidth: number
  /** 原图高度（像素） */
  sourceHeight: number
  /** 样式类型 */
  styleType: 'center' | 'full' | 'lomo'
  /** 简化参数（新版本，优先使用） */
  rotateAngle?: number // 旋转角度（仅0/90/180/270°）
  scale?: number // 等比例缩放
  translateX?: number // X平移（px）
  translateY?: number // Y平移（px）
  offsetX?: number // 原图坐标系中的X偏移量（px），用于服务端直接裁剪
  offsetY?: number // 原图坐标系中的Y偏移量（px），用于服务端直接裁剪
  canvasWidth?: number // 相纸宽度（mm），用于计算相纸比例
  canvasHeight?: number // 相纸高度（mm），用于计算相纸比例
  originalUrl?: string // 原图地址（服务端能访问的路径）
}

/** 裁剪信息 - 用于服务端处理，只包含服务端需要的字段 */
export interface CropInfo {
  /** 相纸宽度（mm），用于计算相纸比例 */
  canvasWidth: number
  /** 相纸高度（mm），用于计算相纸比例 */
  canvasHeight: number
  /** 原图宽度（像素） */
  sourceWidth: number
  /** 原图高度（像素） */
  sourceHeight: number
  /** 原图坐标系中的X偏移量（px），裁剪起始位置 */
  offsetX: number
  /** 原图坐标系中的Y偏移量（px），裁剪起始位置 */
  offsetY: number
  /** 旋转角度（仅0/90/180/270°） */
  rotateAngle: number
  /** 原图地址（服务端能访问的路径） */
  originalUrl: string
  /** 样式类型（可选） */
  styleType?: 'center' | 'full' | 'lomo'
}

// 编辑状态类型（兼容旧版本）
export interface EditState {
  mode: 'center' | 'full' | 'lomo'
  scale: number
  x: number
  y: number
  rotation: number
  canvasWidth: number
  canvasHeight: number
}

// 图片类型
export interface Image {
  id: string
  sessionId: string
  originalUrl: string
  thumbnailUrl: string
  filename: string
  width: number
  height: number
  printCount: number
  editState: EditState | null
  transform?: PhotoTransform // 仿射变换信息（新版本，用于前端回显）
  cropInfo?: CropInfo // 裁剪信息（用于服务端处理）
  autoRotated?: boolean // 是否自动旋转（横图转竖图）
  file?: File // 前端保存原始文件对象
  // 上传状态跟踪
  uploadStatus?: {
    ossUploaded: boolean // 是否已上传到 OSS
    backendSynced: boolean // 是否已同步到后端
  }
}

// 会话类型
export interface Session {
  id: string
  orderNo: string // 订单号
  sizeId: string
  sizeName: string
  targetCount: number
  currentCount: number
  canvasWidth: number
  canvasHeight: number
  unit: string
  ratio: number
  createdAt: string
}

// 照片尺寸类型
export interface PhotoSize {
  id: string
  name: string
  width: number
  height: number
  unit: string
  ratio: number
  icon?: string           // 图标 emoji
  description?: string    // 描述文字
  recommended?: boolean   // 是否推荐
  badge?: string          // 角标文字
}

interface StoreState {
  // Hydration 状态（用于解决刷新后跳转问题）
  _hasHydrated: boolean
  setHasHydrated: (state: boolean) => void

  // Session 相关
  currentSession: Session | null
  setCurrentSession: (session: Session) => void
  clearSession: () => void

  // Images 相关
  images: Image[]
  addImages: (images: Image[]) => void
  updateImage: (id: string, updates: Partial<Image>) => void
  updateImages: (updates: { id: string; updates: Partial<Image> }[]) => void // 批量更新
  deleteImage: (id: string) => void
  clearImages: () => void

  // Selection (批量编辑)
  selectedIds: string[]
  toggleSelection: (id: string) => void
  selectAll: () => void
  clearSelection: () => void

  // UI State
  isUploading: boolean
  uploadProgress: number
  setUploadProgress: (progress: number) => void
  setIsUploading: (isUploading: boolean) => void
  
  // 全局 API Loading 状态
  apiLoading: boolean
  apiLoadingMessage: string
  setApiLoading: (loading: boolean, message?: string) => void
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Hydration 状态
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      // Session
      currentSession: null,
      setCurrentSession: (session) => set({ currentSession: session }),
      clearSession: () => set({ currentSession: null, images: [], selectedIds: [] }),

      // Images
      images: [],
      addImages: (newImages) =>
        set((state) => ({
          images: [...state.images, ...newImages],
          currentSession: state.currentSession
            ? {
                ...state.currentSession,
                currentCount: state.images.length + newImages.length,
              }
            : null,
        })),
      updateImage: (id, updates) =>
        set((state) => ({
          images: state.images.map((img) =>
            img.id === id ? { ...img, ...updates } : img
          ),
        })),
      // 批量更新图片 - 一次性更新多张图片
      updateImages: (updatesList) =>
        set((state) => {
          const updatesMap = new Map(updatesList.map(u => [u.id, u.updates]))
          return {
            images: state.images.map((img) => {
              const imgUpdates = updatesMap.get(img.id)
              return imgUpdates ? { ...img, ...imgUpdates } : img
            }),
          }
        }),
      deleteImage: (id) =>
        set((state) => ({
          images: state.images.filter((img) => img.id !== id),
          selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
          currentSession: state.currentSession
            ? {
                ...state.currentSession,
                currentCount: state.images.length - 1,
              }
            : null,
        })),
      clearImages: () => set({ images: [] }),

      // Selection
      selectedIds: [],
      toggleSelection: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((selectedId) => selectedId !== id)
            : [...state.selectedIds, id],
        })),
      selectAll: () =>
        set((state) => ({
          selectedIds: state.images.map((img) => img.id),
        })),
      clearSelection: () => set({ selectedIds: [] }),

      // UI State
      isUploading: false,
      uploadProgress: 0,
      setUploadProgress: (progress) => set({ uploadProgress: progress }),
      setIsUploading: (isUploading) => set({ isUploading }),
      
      // 全局 API Loading 状态
      apiLoading: false,
      apiLoadingMessage: '',
      setApiLoading: (loading, message = '') => set({ apiLoading: loading, apiLoadingMessage: message }),
    }),
    {
      name: 'photo-upload-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentSession: state.currentSession,
        // 只保存图片元数据，不保存图片数据（base64太大会导致 QuotaExceededError）
        images: state.images.map(img => ({
          id: img.id,
          sessionId: img.sessionId,
          filename: img.filename,
          width: img.width,
          height: img.height,
          printCount: img.printCount,
          editState: img.editState,
          transform: img.transform, // 保存变换信息（用于恢复编辑状态）
          autoRotated: img.autoRotated, // 保存自动旋转状态
          // 不保存这些大数据:
          // originalUrl: undefined,
          // thumbnailUrl: undefined,
          // file: undefined,
        })),
      }),
      // Hydration 完成后设置标志
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
