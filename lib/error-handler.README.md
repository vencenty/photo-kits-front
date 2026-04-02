# 错误处理机制使用指南

## 📋 概述

前端已实现统一的错误处理机制，根据服务端返回的错误码自动进行分类处理：

- **业务错误 (10000-49999)**: 自动 toast 提示用户，显示服务端返回的错误信息
- **系统错误 (50000+)**: 自动 toast 提示"系统繁忙，请稍后再试"，并上报监控系统
- **网络错误**: 自动 toast 提示"网络异常，请检查网络连接"

## 🎯 错误码分类

### 业务错误 (10000-49999)
- ✅ 自动显示 toast 提示
- ✅ 使用服务端返回的 `msg` 字段
- ✅ 可以配置特殊处理逻辑（如跳转页面）

### 系统错误 (50000+)
- ⚠️ 显示通用提示："系统繁忙，请稍后再试"
- 📊 自动上报到监控系统（生产环境）
- 🔒 不暴露具体技术错误给用户

### 网络错误
- 🌐 显示提示："网络异常，请检查网络连接"
- 🔄 可以添加重试逻辑

## 📝 使用方法

### 基础使用

```typescript
import { getOrderDetail } from '@/lib/api'

// 正常调用，错误会自动处理
async function loadOrder() {
  try {
    const order = await getOrderDetail('ORDER123')
    // 处理成功逻辑
  } catch (error) {
    // 错误已经自动 toast 提示了
    // 这里可以做一些额外的处理，比如跳转页面
    if (error instanceof BusinessError && error.code === 10001) {
      // 订单不存在，可能需要跳转
    }
  }
}
```

### 静默处理错误

某些场景下，你可能不想显示 toast（比如批量操作时）：

```typescript
import { request } from '@/lib/api'

// 使用 silent 选项
const result = await request('/v1/some-endpoint', {
  method: 'POST',
  body: JSON.stringify(data),
  silent: true, // 不显示 toast
})
```

### 添加特殊错误码处理

在 `lib/error-handler.ts` 的 `specialErrorHandlers` 数组中添加：

```typescript
const specialErrorHandlers: SpecialErrorHandler[] = [
  {
    code: 10001, // 订单不存在
    handler: (msg: string) => {
      if (typeof window !== 'undefined') {
        // 跳转到首页
        window.location.href = '/'
      }
    },
  },
  {
    code: 10002, // 订单已锁定
    handler: (msg: string) => {
      // 可以跳转到订单详情页
      // router.push(`/order/${orderSn}`)
    },
  },
  // ... 其他错误码
]
```

## 🔧 特殊错误码处理示例

参考 `lib/error-handler.example.ts` 文件，里面包含了各种处理场景的示例：

1. **跳转页面**: 订单不存在时跳转首页
2. **显示确认框**: 需要用户确认的操作
3. **记录日志**: 保存错误日志到本地
4. **调用其他 API**: 错误发生时记录用户行为

## 📊 错误监控

系统错误会自动上报到监控系统（生产环境）。目前是控制台输出，可以集成 Sentry：

```typescript
// 在 lib/error-handler.ts 的 reportErrorToMonitoring 函数中
import * as Sentry from '@sentry/nextjs'

Sentry.captureException(error, { extra: context })
```

## 🎨 Toast 配置

Toast 使用 `sonner` 库，已在 `app/layout.tsx` 中配置：

```tsx
<Toaster position="top-center" richColors />
```

可以修改位置和样式，参考 [sonner 文档](https://sonner.emilkowal.ski/)

## ⚠️ 注意事项

1. **业务错误会自动 toast**，不需要在每个调用处手动提示
2. **系统错误统一提示**，不暴露技术细节给用户
3. **特殊错误码处理**需要在 `error-handler.ts` 中配置
4. **静默模式**适用于批量操作等场景
5. **错误上报**只在生产环境生效

## 🚀 最佳实践

1. **业务层代码保持简洁**：不需要大量 try-catch
2. **特殊错误集中处理**：在 `error-handler.ts` 中统一配置
3. **错误信息友好**：服务端返回的错误信息要用户友好
4. **监控系统集成**：生产环境建议集成 Sentry 等监控平台
