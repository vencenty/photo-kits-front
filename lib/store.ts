import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// 编辑状态类型
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
  file?: File // 前端保存原始文件对象
}

// 会话类型
export interface Session {
  id: string
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
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
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
          // 不保存这些大数据:
          // originalUrl: undefined,
          // thumbnailUrl: undefined,
          // file: undefined,
        })),
      }),
    }
  )
)
