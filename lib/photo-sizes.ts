import { PhotoSize } from './store'

/**
 * 照片尺寸配置
 * 
 * 配置说明：
 * - id: 唯一标识符
 * - name: 显示名称
 * - width/height: 尺寸数值
 * - unit: 单位（如 '毫米'）
 * - ratio: 宽高比
 * - icon: 图标 emoji
 * - description: 描述文字
 * - recommended: 是否推荐
 * - badge: 角标文字
 */

export const PHOTO_SIZES: PhotoSize[] = [
  {
    id: 'fujifilm-5inch',
    name: '标准5寸',
    width: 89,
    height: 127,
    unit: '毫米',
    ratio: 7/10,
    icon: '📸',
    description: '经典5寸照片，适合日常留念',
    recommended: true,
    badge: '热门',
  },
  {
    id: 'fujifilm-6inch',
    name: '标准6寸',
    width: 102,
    height: 152,
    unit: '毫米',
    ratio: 2/3,
    icon: '🖼️',
    description: '6寸大照片，细节更清晰',
  },
  {
    id: 'square',
    name: '正方形 (Ins风)',
    width: 100,
    height: 100,
    unit: '毫米',
    ratio: 1,
    icon: '⬜',
    description: 'Instagram风格，时尚潮流',
    badge: '流行',
  },
  {
    id: 'polaroid',
    name: '拍立得尺寸',
    width: 86,
    height: 108,
    unit: '毫米',
    ratio: 86/108,
    icon: '📷',
    description: '复古拍立得，文艺范十足',
  },
]

export function getPhotoSizeById(id: string): PhotoSize | undefined {
  return PHOTO_SIZES.find((size) => size.id === id)
}

