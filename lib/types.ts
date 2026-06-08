/**
 * 统一类型定义
 * 所有共享类型都应该在这里定义，避免多处重复定义导致的不一致
 */

// ==================== 裁剪相关类型 ====================

/** 裁剪模式类型 */
export type CropMode = 'cover' | 'full' | 'lomo'

/**
 * 简化的裁剪信息（用于 react-easy-crop）
 *
 * 最佳实践：
 * - 保存时：同时保存像素坐标（用于服务端裁剪）和百分比坐标（用于恢复裁剪位置）
 * - 恢复时：使用 croppedAreaPercent（百分比）通过 initialCroppedAreaPercentages 恢复
 * - 官方推荐使用百分比恢复，因为像素值会被四舍五入，可能导致轻微的位置漂移
 */
export interface SimpleCropInfo {
  /** 裁剪起始 X（原图像素） */
  offsetX: number
  /** 裁剪起始 Y（原图像素） */
  offsetY: number
  /** 裁剪宽度（原图像素） */
  cropWidth: number
  /** 裁剪高度（原图像素） */
  cropHeight: number
  /** 原图宽度 */
  sourceWidth: number
  /** 原图高度 */
  sourceHeight: number
  /** 样式类型 */
  styleType: CropMode
  /**
   * 百分比坐标（用于恢复裁剪位置，官方推荐）
   * 格式与 react-easy-crop 的 croppedArea 一致
   */
  croppedAreaPercent?: {
    x: number      // 裁剪区域左上角 X 坐标的百分比
    y: number      // 裁剪区域左上角 Y 坐标的百分比
    width: number  // 裁剪区域宽度的百分比
    height: number // 裁剪区域高度的百分比
  }
}

/**
 * 裁剪信息 - 用于服务端处理
 */
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
  /** 裁剪宽度（px），在未旋转原图坐标系中 */
  cropWidth?: number
  /** 裁剪高度（px），在未旋转原图坐标系中 */
  cropHeight?: number
  /** 旋转角度（仅0/90/180/270°） */
  rotateAngle: number
  /** 原图地址（服务端能访问的路径） */
  originalUrl: string
  /** 样式类型（可选） */
  styleType?: CropMode
  /**
   * 百分比坐标（用于恢复裁剪位置，官方推荐）
   */
  croppedAreaPercent?: {
    x: number
    y: number
    width: number
    height: number
  }
}

// ==================== 编辑状态类型 ====================

/** 编辑状态类型（兼容旧版本） */
export interface EditState {
  mode: CropMode
  scale: number
  x: number
  y: number
  rotation: number
  canvasWidth: number
  canvasHeight: number
}

// ==================== 图片相关类型 ====================

/** 图片类型 */
export interface Image {
  id: string
  specId: number
  originalUrl: string
  thumbnailUrl: string
  filename: string
  width: number
  height: number
  printCount: number
  editState: EditState | null
  cropInfo?: SimpleCropInfo
  isLandscape: boolean
  outputUrl: string
  cropMode: CropMode
  isAdjusted?: boolean
  file?: File
  uploadStatus?: {
    ossUploaded: boolean
    backendSynced: boolean
  }
}

// ==================== 会话相关类型 ====================

/** 会话类型（对应当前编辑的 order_specs 行） */
export interface Session {
  specId: number
  skuId: number
  orderNo: string
  sizeName: string
  targetCount: number
  currentCount: number
  canvasWidth: number
  canvasHeight: number
  unit: string
  ratio: number
  cropDefaultMode?: CropMode
  cropAvailableModes?: CropMode[]
  createdAt: string
}
