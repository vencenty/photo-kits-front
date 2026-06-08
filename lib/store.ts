import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CropInfo, EditState, Image, Session, SimpleCropInfo } from './types'

// 重新导出类型以保持向后兼容
export type { CropInfo, EditState, Image, Session, SimpleCropInfo }

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
  
  // 缓存管理
  lastFetchTime: number | null // 最后一次从服务器加载数据的时间戳
  setLastFetchTime: (time: number) => void
  shouldRefetch: () => boolean // 判断是否需要重新从服务器获取数据
  forceRefetch: () => void // 强制标记需要刷新（清空缓存时间戳）

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
        set((state) => {
          const newImages = state.images.filter((img) => img.id !== id)
          return {
            images: newImages,
            selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
            currentSession: state.currentSession
              ? {
                  ...state.currentSession,
                  currentCount: newImages.length,
                }
              : null,
          }
        }),
      clearImages: () => set({ images: [] }),
      
      // 缓存管理
      lastFetchTime: null,
      setLastFetchTime: (time) => set({ lastFetchTime: time }),
      shouldRefetch: () => {
        const state = get()
        // 如果从未获取过数据，需要获取
        if (!state.lastFetchTime) return true
        // 如果没有 images 数据，需要获取
        if (state.images.length === 0) return true
        // 如果距离上次获取超过 5 分钟，需要刷新（防止数据过期）
        const CACHE_DURATION = 5 * 60 * 1000 // 5 分钟
        const now = Date.now()
        return now - state.lastFetchTime > CACHE_DURATION
      },
      // 🚀 强制标记需要刷新（清空缓存时间戳）
      forceRefetch: () => set({ lastFetchTime: null }),

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
        // 持久化 images 数据(排除 file 对象以减小存储空间)
        // images: state.images.map(img => {
        //   const { file, ...imageWithoutFile } = img
        //   return imageWithoutFile
        // }),
        // 持久化最后获取时间，用于判断缓存是否过期
        lastFetchTime: state.lastFetchTime,
      }),
      // Hydration 完成后设置标志
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
      // 版本控制，如果数据结构变化可以增加版本号清除旧缓存
      version: 3,
      // 只合并已持久化字段，忽略旧缓存里可能存在的 apiLoading 等已废弃键
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as Partial<
          Pick<StoreState, 'currentSession' | 'lastFetchTime'>
        >
        return {
          ...currentState,
          ...(p.currentSession !== undefined ? { currentSession: p.currentSession } : {}),
          ...(p.lastFetchTime !== undefined ? { lastFetchTime: p.lastFetchTime } : {}),
        }
      },
    }
  )
)
