# 安装和运行指南

## 项目已创建完成 ✅

前端项目已经完全创建好，包含以下内容：

### ✅ 已完成的功能

1. **首页（订单查询）** - `app/page.tsx`
   - 订单查询功能
   - 创建新订单入口
   - 精美的 UI 设计

2. **尺寸选择页** - `app/select-size/page.tsx`
   - 多种照片尺寸选择
   - 数量输入
   - 创建上传会话

3. **图片上传页** - `app/upload/[sizeId]/page.tsx`
   - 批量图片上传
   - 图片预览网格
   - 数量调节
   - 批量编辑模式
   - 删除功能

4. **图片编辑器** - `app/edit/[imageId]/page.tsx` + `components/ImageEditor.tsx`
   - 使用 Konva.js 实现
   - 三种裁剪模式：
     * 满版裁剪
     * 打印整图
     * 四周留白（Lomo）
   - 手势操作：拖动、缩放、旋转
   - 保存编辑状态

5. **成功页面** - `app/success/page.tsx`
   - 提交成功提示
   - 订单信息展示
   - 导航操作

6. **状态管理** - `lib/store.ts`
   - Zustand 状态管理
   - 本地持久化
   - 完整的类型定义

7. **工具函数** - `lib/utils.ts`
   - 图片压缩
   - 图片尺寸获取
   - ID 生成
   - 日期格式化

## 📦 安装步骤

### 方式 1: 使用 npm（推荐）

```bash
cd front
npm install
```

### 方式 2: 使用 yarn

```bash
cd front
yarn install
```

### 方式 3: 使用 pnpm

```bash
cd front
pnpm install
```

## 🚀 运行项目

### 开发模式

```bash
npm run dev
# 或
yarn dev
# 或
pnpm dev
```

然后打开浏览器访问 [http://localhost:3000](http://localhost:3000)

### 生产构建

```bash
npm run build
npm start
```

## 📱 功能演示流程

1. **首页**
   - 可以输入订单号查询（功能待实现）
   - 点击"创建新订单"进入尺寸选择

2. **选择尺寸**
   - 选择一种照片尺寸（5寸、6寸、正方形、拍立得）
   - 输入打印数量
   - 确认后进入上传页面

3. **上传照片**
   - 点击"继续上传"选择照片
   - 支持多选
   - 每张照片可以：
     * 调整打印数量（+ / -）
     * 点击"编辑"进入编辑器
     * 点击 X 删除
   - 批量编辑模式：
     * 多选照片
     * 批量删除

4. **编辑照片**
   - 三种模式切换
   - 手势拖动、缩放、旋转
   - 点击"编辑完毕"保存

5. **提交打印**
   - 当上传数量达到目标后可提交
   - 确认提示弹窗
   - 提交成功页面

## 🎨 技术特点

### 响应式设计
- 移动端优先
- 适配各种屏幕尺寸
- 触摸手势优化

### 性能优化
- 图片自动压缩
- 缩略图预览
- 原图保存用于打印
- 状态持久化

### 交互体验
- 流畅的动画
- 即时反馈
- 加载状态
- 错误处理

## 🔧 配置说明

### 照片尺寸配置

在 `lib/photo-sizes.ts` 中可以添加或修改照片尺寸：

```typescript
{
  id: 'custom-size',
  name: '自定义尺寸',
  width: 1800,        // 像素宽度
  height: 1200,       // 像素高度
  displaySize: '15×10cm',
  ratio: 1.5,         // 宽高比
  minCount: 30,       // 最小数量
  price: 0.5,         // 单价（可选）
}
```

### 主题色配置

在 `tailwind.config.ts` 中修改渐变色：

```typescript
backgroundImage: {
  'gradient-primary': 'linear-gradient(135deg, #FFA07A 0%, #FF6B9D 100%)',
}
```

## 📝 编辑状态说明

编辑器保存的状态结构：

```typescript
{
  mode: 'center' | 'full' | 'lomo',  // 裁剪模式
  scale: number,                      // 缩放比例
  x: number,                          // X坐标
  y: number,                          // Y坐标  
  rotation: number,                   // 旋转角度（度）
  canvasWidth: number,                // 画布宽度
  canvasHeight: number                // 画布高度
}
```

这些坐标信息可以在**服务端重放**，使用 sharp 等库生成最终的打印图片。

## 🔄 下一步（后端集成）

当前前端功能完整，待实现的后端部分：

1. **订单查询 API** - `POST /v1/order/init`（body：`{ orderSn, includePhotos? }`，与 detail 入参语义一致）
   - 输入：订单号/手机号
   - 输出：订单信息和 SKU 列表

2. **图片上传 API** - `POST /v1/order/photo/add`
   - 输入：图片文件 + session_id
   - 输出：图片 URL 和 ID
   - 存储到 OSS/S3

3. **编辑状态保存 API** - `PUT /v/order/photo/update`（或批量：`PUT /v1/order/photo/batchUpdate`）
   - 输入：image_id + edit_state
   - 输出：成功状态

4. **提交订单 API** - `POST /v1/order/submit`
   - 输入：session_id
   - 输出：订单 ID
   - 触发服务端图片处理

5. **服务端图片处理**
   - 读取编辑状态
   - 使用 sharp 库重放坐标
   - 生成最终打印图片
   - 发送到打印工厂

## 🐛 已知问题

暂无

## 📄 License

MIT

