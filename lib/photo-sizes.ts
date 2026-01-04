import { PhotoSize } from './store'

/**
 * 照片尺寸配置
 * 
 * 配置说明：
 * - id: 唯一标识符
 * - name: 显示名称
 * - width/height: 画布像素尺寸（用于裁剪计算）
 * - displaySize: 显示尺寸（物理尺寸）
 * - ratio: 宽高比
 * - minCount: 建议最小数量
 * - price: 单价（可选）
 * 
 * 样式配置（可选）：
 * - color: 卡片主色调（如 '#FF6B9D'）
 * - bgColor: 卡片背景颜色（如 'bg-pink-50'）
 * - icon: 图标 emoji（如 '📸'）
 * - description: 描述文字
 * - recommended: 是否推荐（显示推荐标签）
 * - badge: 角标文字（如 '热门'、'优惠'）
 */
export const PHOTO_SIZES: PhotoSize[] = [
  {
    id: 'fuji-5',
    name: '标准5寸',
    width: 1500,
    height: 1050,
    displaySize: '12.7×8.9cm',
    ratio: 1.43,
    minCount: 50,
    price: 0.3,
    // 样式配置
    color: '#FF6B9D',
    bgColor: 'bg-pink-50',
    icon: '📸',
    description: '经典5寸照片，适合日常留念',
    recommended: true,
    badge: '热门',
  },
  {
    id: 'fuji-6',
    name: '标准6寸',
    width: 1800,
    height: 1200,
    displaySize: '15.2×10.2cm',
    ratio: 1.5,
    minCount: 50,
    price: 0.5,
    // 样式配置
    color: '#9D5CFF',
    bgColor: 'bg-purple-50',
    icon: '🖼️',
    description: '6寸大照片，细节更清晰',
    recommended: false,
  },
  {
    id: 'square',
    name: '正方形 (Ins风)',
    width: 1200,
    height: 1200,
    displaySize: '10×10cm',
    ratio: 1.0,
    minCount: 30,
    price: 0.6,
    // 样式配置
    color: '#FFA07A',
    bgColor: 'bg-orange-50',
    icon: '⬜',
    description: 'Instagram风格，时尚潮流',
    badge: '流行',
  },
  {
    id: 'polaroid',
    name: '拍立得尺寸',
    width: 800,
    height: 1000,
    displaySize: '8.6×10.8cm',
    ratio: 0.8,
    minCount: 30,
    price: 0.8,
    // 样式配置
    color: '#4ECDC4',
    bgColor: 'bg-teal-50',
    icon: '📷',
    description: '复古拍立得，文艺范十足',
  },
]

export function getPhotoSizeById(id: string): PhotoSize | undefined {
  return PHOTO_SIZES.find((size) => size.id === id)
}

