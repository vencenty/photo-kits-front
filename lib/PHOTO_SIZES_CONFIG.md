# 照片尺寸配置说明

## 📁 配置文件位置

`lib/photo-sizes.ts`

## 🎯 如何添加新尺寸

在 `PHOTO_SIZES` 数组中添加新的配置对象：

```typescript
{
  // 必填字段
  id: 'custom-7',              // 唯一标识符（英文+数字）
  name: '7寸照片',             // 显示名称
  width: 2100,                 // 画布宽度（像素）
  height: 1500,                // 画布高度（像素）
  displaySize: '17.8×12.7cm',  // 物理尺寸显示
  ratio: 1.4,                  // 宽高比（width/height）
  minCount: 50,                // 建议最小数量
  
  // 可选字段 - 价格
  price: 0.8,                  // 单价（元）
  
  // 可选字段 - 样式配置
  color: '#FF6B9D',           // 主题色（十六进制颜色）
  bgColor: 'bg-pink-50',      // 卡片背景色（Tailwind类名）
  icon: '📸',                  // 图标（emoji）
  description: '描述文字',     // 简短描述
  recommended: true,           // 是否显示"推荐"标签
  badge: '热门',               // 角标文字（与recommended二选一）
}
```

## 🎨 样式配置详解

### 1. color（主题色）
- 格式：`'#RRGGBB'`（十六进制颜色）
- 作用：
  - 价格文字颜色
  - 图标背景底色
  - 悬停边框颜色
- 示例：`'#FF6B9D'`（粉色）、`'#9D5CFF'`（紫色）

### 2. bgColor（背景颜色）
- 格式：Tailwind CSS 类名
- 作用：整个卡片的背景色
- 可选值：
  - `'bg-pink-50'` - 浅粉色
  - `'bg-purple-50'` - 浅紫色
  - `'bg-orange-50'` - 浅橙色
  - `'bg-blue-50'` - 浅蓝色
  - `'bg-green-50'` - 浅绿色
  - `'bg-red-50'` - 浅红色
  - `'bg-teal-50'` - 浅青色
  - `'bg-yellow-50'` - 浅黄色
  - `'bg-indigo-50'` - 浅靛蓝色
  - `'bg-white'` - 白色（默认）

### 3. icon（图标）
- 格式：emoji 字符
- 作用：在卡片左侧显示大图标
- 推荐图标：
  - `'📸'` - 相机
  - `'🖼️'` - 相框
  - `'⬜'` - 正方形
  - `'📷'` - 拍立得相机
  - `'🎨'` - 艺术
  - `'✨'` - 星星
  - `'💝'` - 礼物
  - `'🌈'` - 彩虹
  - `'🎭'` - 艺术面具

### 4. description（描述）
- 格式：字符串（建议10-20字）
- 作用：在标题下方显示简短描述
- 示例：`'经典5寸照片，适合日常留念'`

### 5. recommended（推荐标签）
- 格式：`true` 或 `false`
- 作用：在卡片右上角显示红色"推荐"标签
- 注意：与 `badge` 冲突，二选一

### 6. badge（角标文字）
- 格式：字符串（建议2-4字）
- 作用：在卡片右上角显示自定义角标
- 示例：`'热门'`、`'优惠'`、`'新品'`、`'流行'`
- 注意：与 `recommended` 冲突，二选一

## 📋 完整示例

### 示例1：热门推荐款

```typescript
{
  id: 'fuji-5',
  name: '富士标准5寸',
  width: 1500,
  height: 1050,
  displaySize: '12.7×8.9cm',
  ratio: 1.43,
  minCount: 50,
  price: 0.3,
  color: '#FF6B9D',
  bgColor: 'bg-pink-50',
  icon: '📸',
  description: '经典5寸照片，适合日常留念',
  recommended: true,  // 显示"推荐"标签
}
```

### 示例2：时尚流行款

```typescript
{
  id: 'square',
  name: '正方形 (Ins风)',
  width: 1200,
  height: 1200,
  displaySize: '10×10cm',
  ratio: 1.0,
  minCount: 30,
  price: 0.6,
  color: '#FFA07A',
  bgColor: 'bg-orange-50',
  icon: '⬜',
  description: 'Instagram风格，时尚潮流',
  badge: '流行',  // 显示"流行"角标
}
```

### 示例3：简约款（最少配置）

```typescript
{
  id: 'classic-6',
  name: '经典6寸',
  width: 1800,
  height: 1200,
  displaySize: '15.2×10.2cm',
  ratio: 1.5,
  minCount: 50,
  price: 0.5,
  // 不配置样式，使用默认样式
}
```

## 🎨 配色方案推荐

### 暖色系
- 粉色：`color: '#FF6B9D'` + `bgColor: 'bg-pink-50'`
- 橙色：`color: '#FFA07A'` + `bgColor: 'bg-orange-50'`
- 红色：`color: '#FF5555'` + `bgColor: 'bg-red-50'`

### 冷色系
- 蓝色：`color: '#4A90E2'` + `bgColor: 'bg-blue-50'`
- 紫色：`color: '#9D5CFF'` + `bgColor: 'bg-purple-50'`
- 青色：`color: '#4ECDC4'` + `bgColor: 'bg-teal-50'`

### 中性色系
- 绿色：`color: '#50C878'` + `bgColor: 'bg-green-50'`
- 靛蓝：`color: '#6366F1'` + `bgColor: 'bg-indigo-50'`

## ⚙️ 技术参数说明

### width 和 height（画布尺寸）
- 单位：像素（px）
- 作用：用于图片编辑器的画布大小和最终裁剪计算
- 建议：根据实际打印DPI计算
  - 5寸（12.7×8.9cm）@ 300DPI ≈ 1500×1050px
  - 6寸（15.2×10.2cm）@ 300DPI ≈ 1800×1200px

### ratio（宽高比）
- 计算方式：`width / height`
- 作用：图片编辑器使用此比例显示画布
- 示例：
  - 1.43（5寸横版）
  - 1.5（6寸横版）
  - 1.0（正方形）
  - 0.8（竖版）

### minCount（最小数量）
- 单位：张
- 作用：
  - 在弹窗中作为建议数量
  - 可作为业务逻辑的最小起订量

## 🔄 修改后的操作

1. **编辑配置文件**：修改 `lib/photo-sizes.ts`
2. **保存文件**：Next.js 会自动热重载
3. **刷新页面**：查看效果

不需要重启服务器！

## 📝 注意事项

1. **id 必须唯一**：不能与其他尺寸重复
2. **price 保留两位小数**：用于显示准确价格
3. **color 使用十六进制**：确保浏览器兼容性
4. **bgColor 使用 Tailwind 类名**：保持样式一致性
5. **描述文字不要太长**：建议20字以内
6. **推荐和角标二选一**：避免重复显示

## 🚀 快速添加新尺寸

复制以下模板，修改参数即可：

```typescript
{
  id: 'YOUR-ID',
  name: '你的尺寸名称',
  width: 0000,
  height: 0000,
  displaySize: '00×00cm',
  ratio: 0.0,
  minCount: 50,
  price: 0.0,
  color: '#000000',
  bgColor: 'bg-gray-50',
  icon: '📸',
  description: '这里是描述文字',
},
```

## 💡 提示

- 可以添加任意多个尺寸配置
- 顺序就是显示顺序
- 不需要的字段可以删除（除了必填字段）
- 修改配置后立即生效，无需重启

---

更多问题请参考 `lib/photo-sizes.ts` 中的实际配置示例。

