# 田田洗照片 - 前端项目

这是一个照片上传和编辑的 Web 应用，使用 Next.js 14 构建。

## 功能特性

- 📸 订单查询和创建
- 📏 多种照片尺寸选择（5寸、6寸、正方形、拍立得等）
- 🖼️ 批量图片上传
- ✂️ 图片编辑（缩放、旋转、移动）
- 🎨 三种裁剪模式：满版裁剪、打印整图、四周留白（Lomo）
- 📱 移动端优化

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **图片编辑**: Konva.js + react-konva
- **状态管理**: Zustand
- **图标**: Lucide React

## 快速开始

### 安装依赖

```bash
npm install
```

### 运行开发服务器

```bash
npm run dev
```

打开浏览器访问 [http://localhost:3000](http://localhost:3000)

### 构建生产版本

```bash
npm run build
npm start
```

## 项目结构

```
front/
├── app/                      # Next.js 应用目录
│   ├── page.tsx             # 首页（订单查询）
│   ├── select-size/         # 尺寸选择页
│   ├── upload/[sizeId]/     # 图片上传页
│   ├── edit/[imageId]/      # 图片编辑页
│   └── success/             # 提交成功页
├── components/              # React 组件
│   └── ImageEditor.tsx     # 图片编辑器组件
├── lib/                     # 工具库
│   ├── store.ts            # Zustand 状态管理
│   ├── photo-sizes.ts      # 照片尺寸配置
│   └── utils.ts            # 工具函数
└── public/                  # 静态资源
```

## 核心功能说明

### 1. 照片尺寸配置

在 `lib/photo-sizes.ts` 中定义了多种照片尺寸规格：
- 富士标准5寸 (12.7×8.9cm)
- 富士标准6寸 (15.2×10.2cm)
- 正方形 (10×10cm)
- 拍立得尺寸 (8.6×10.8cm)

### 2. 图片编辑器

使用 Konva.js 实现的交互式图片编辑器，支持：
- 手势拖动、缩放、旋转
- 三种裁剪模式切换
- 实时预览效果
- 保存编辑状态（坐标信息）

### 3. 编辑状态保存

编辑器保存以下信息：
```typescript
{
  mode: 'center' | 'full' | 'lomo',  // 裁剪模式
  scale: number,                      // 缩放比例
  x: number,                          // X坐标
  y: number,                          // Y坐标
  rotation: number,                   // 旋转角度
  canvasWidth: number,                // 画布宽度
  canvasHeight: number                // 画布高度
}
```

这些坐标信息可以在服务端重放，生成最终的打印图片。

## 开发说明

### 状态管理

使用 Zustand 进行全局状态管理，状态会自动持久化到 localStorage：
- `currentSession`: 当前上传会话信息
- `images`: 已上传的图片列表
- `selectedIds`: 批量编辑时选中的图片ID

### 样式系统

使用 Tailwind CSS，自定义了主题色和渐变效果：
- 主色调：粉色到橙色渐变
- 工具类：`gradient-primary`

## 下一步

目前前端功能已完成，后续需要：
1. 实现后端 API 接口
2. 图片上传到云存储
3. 服务端根据编辑状态重放生成打印图片
4. 订单系统集成

## License

MIT

---

## 📋 代码风格与规范

### 技术栈

| 分类 | 技术 | 说明 |
|------|------|------|
| 框架 | Next.js 14 | App Router 模式 |
| 语言 | TypeScript | 严格模式 (strict: true) |
| 样式 | Tailwind CSS | 移动端优先响应式设计 |
| 状态管理 | Zustand | 支持 localStorage 持久化 |
| 图片编辑 | Konva.js + react-konva | Canvas 图片编辑器 |
| 图标 | Lucide React | 线性图标库 |
| 通知 | Sonner | Toast 通知 |

### 项目结构规范

```
front/
├── app/                      # Next.js App Router 页面
│   ├── page.tsx             # 首页（订单查询）
│   ├── layout.tsx           # 根布局
│   ├── globals.css          # 全局样式 + Tailwind
│   ├── select-size/         # 尺寸选择
│   ├── upload/              # 图片上传
│   ├── edit/                # 图片编辑
│   └── error.tsx            # 错误边界
├── components/              # 通用组件
│   ├── ImageEditor.tsx     # 图片编辑器
│   ├── PhotoPreviewCard.tsx # 照片预览卡片
│   ├── ClientLayout.tsx    # 客户端布局
│   └── GlobalLoading.tsx   # 全局 Loading
├── lib/                     # 工具库
│   ├── store.ts            # Zustand 状态管理
│   ├── api.ts              # API 请求封装
│   ├── utils.ts            # 工具函数
│   ├── error-handler.ts    # 统一错误处理
│   ├── image-config.ts     # 图片配置
│   └── photo-sizes.ts      # 照片尺寸配置
└── public/                  # 静态资源
```

### 代码风格

#### 1. 组件规范

```tsx
// ✅ 正确：使用 'use client' 声明客户端组件
'use client'

import { useState, useCallback } from 'react'
import { SomeIcon } from 'lucide-react'
import type { ImageType } from '@/lib/store'

interface Props {
  image: ImageType
  onSave: (data: SaveData) => void
}

// ✅ 正确：使用 function 声明 + export default
export default function ImageEditor({ image, onSave }: Props) {
  const [mode, setMode] = useState<string>('cover')

  // ✅ 正确：使用 useCallback 优化回调
  const handleSave = useCallback(() => {
    onSave({ mode })
  }, [mode, onSave])

  return <div>...</div>
}
```

#### 2. TypeScript 类型规范

```typescript
// ✅ 正确：使用 interface 定义组件 Props
interface ImageEditorProps {
  image: ImageType
  canvasWidth: number
  onSave: (saveData: SaveData) => void
}

// ✅ 正确：使用 type 定义联合类型/工具类型
type EditMode = 'cover' | 'full' | 'lomo'

// ✅ 正确：详细的 JSDoc 注释
/**
 * 生成照片唯一 ID
 * @returns 24位十六进制字符串
 */
export function generatePhotoId(): string { ... }
```

#### 3. 状态管理规范 (Zustand)

```typescript
// ✅ 正确：清晰的接口定义和状态分组
interface StoreState {
  // Hydration 状态
  _hasHydrated: boolean
  setHasHydrated: (state: boolean) => void

  // Session 相关
  currentSession: Session | null
  setCurrentSession: (session: Session) => void

  // Images 相关
  images: Image[]
  addImages: (images: Image[]) => void
  updateImage: (id: string, updates: Partial<Image>) => void
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      // ...实现
    }),
    {
      name: 'photo-upload-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
```

#### 4. API 请求规范

```typescript
// ✅ 正确：统一的错误处理和类型定义
export interface ApiResponse<T> {
  code?: number
  msg?: string
  data?: T
}

export class BusinessError extends Error {
  code: number
  msg: string
  constructor(code: number, msg: string) { ... }
}

// ✅ 正确：完整的函数文档注释
/**
 * 获取订单详情
 * @param orderNo 订单号
 * @param includePhotos 是否包含照片列表
 * @returns 订单详情响应
 */
export async function getOrderDetail(
  orderNo: string,
  includePhotos: boolean = false
): Promise<OrderDetailResponse> { ... }
```

#### 5. 样式规范

```tsx
// ✅ 正确：使用 Tailwind 类名，响应式前缀
<div className="px-4 py-3 md:py-2 md:px-6">
  <button className="text-sm md:text-xs font-medium">
    按钮
  </button>
</div>

// ✅ 正确：使用 Tailwind 工具类合并
import { cn } from '@/lib/utils'

<div className={cn(
  "flex items-center gap-2",
  isActive && "bg-pink-500 text-white"
)}>
```

#### 6. CSS 工具类约定

```css
/* globals.css 中定义的工具类 */
@layer utilities {
  .gradient-primary { ... }        /* 主题渐变 */
  .writing-mode-vertical { ... }  /* 竖排文字 */
  .safe-area-inset-bottom { ... } /* 安全区域适配 */
  .hide-scrollbar { ... }         /* 隐藏滚动条 */
  .desktop-hover { ... }          /* 桌面端悬停效果 */
}
```

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `ImageEditor.tsx` |
| 工具文件 | camelCase | `useImagePreload.ts` |
| 类型/接口 | PascalCase | `ImageType`, `CropInfo` |
| 常量 | SCREAMING_SNAKE_CASE | `ORDER_STATUS` |
| 函数 | camelCase | `generatePhotoId()` |
| CSS 类名 | kebab-case (Tailwind) | `bg-pink-500` |

### Git 提交规范

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式（不影响功能）
refactor: 重构
perf: 性能优化
test: 测试
chore: 构建/工具变更
```

### 开发检查清单

- [ ] `npm run lint` 通过
- [ ] `npm run build` 构建成功
- [ ] TypeScript 无编译错误
- [ ] 移动端响应式正常
- [ ] API 错误处理完善
- [ ] 关键函数有 JSDoc 注释

