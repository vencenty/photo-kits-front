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

