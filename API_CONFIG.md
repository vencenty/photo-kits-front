# API 地址配置指南

## 修改接口地址

### 方法一：使用环境变量文件（推荐）

#### 1. 创建环境变量文件

在 `front` 目录下创建 `.env.production` 文件（生产环境）：

```bash
# 生产环境 API 地址
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

或者创建 `.env.local` 文件（本地开发，优先级更高）：

```bash
# 本地开发 API 地址
NEXT_PUBLIC_API_URL=http://localhost:8888
```

#### 2. 修改地址

编辑 `.env.production` 文件，将 `https://api.yourdomain.com` 替换为你的实际线上 API 地址，例如：

```bash
NEXT_PUBLIC_API_URL=https://api.example.com
# 或
NEXT_PUBLIC_API_URL=http://192.168.1.100:8888
```

#### 3. 重新构建

```bash
npm run build
```

### 方法二：直接修改代码（不推荐，仅用于临时测试）

如果只是临时测试，可以直接修改 `front/lib/api.ts` 文件：

```typescript
// 修改第 6 行
const API_BASE_URL = 'https://api.yourdomain.com'  // 直接写死地址
```

**注意**：这种方式不推荐，因为每次修改都需要改代码。

## 环境变量优先级

Next.js 环境变量的优先级（从高到低）：

1. `.env.local` - 本地开发（所有环境，会被 git 忽略）
2. `.env.production` - 生产环境（仅 `npm run build` 时）
3. `.env.development` - 开发环境（仅 `npm run dev` 时）
4. `.env` - 所有环境
5. 代码中的默认值 - `http://localhost:8888`

## 验证配置

构建后，可以通过以下方式验证：

1. **查看构建输出**：
```bash
npm run build
# 查看构建日志，确认使用了正确的环境变量
```

2. **检查浏览器控制台**：
   - 打开浏览器开发者工具
   - 查看 Network 标签
   - 检查 API 请求的 URL 是否正确

3. **临时测试**：
```bash
# 临时设置环境变量并构建
NEXT_PUBLIC_API_URL=https://api.yourdomain.com npm run build
```

## 常见问题

### Q: 修改后还是使用旧地址？
A: 确保：
1. 环境变量文件名正确（`.env.production` 用于生产环境）
2. 变量名正确（`NEXT_PUBLIC_API_URL`，注意大小写）
3. 重新构建了项目（`npm run build`）
4. 清除了浏览器缓存

### Q: 开发环境和生产环境使用不同地址？
A: 创建两个文件：
- `.env.local` - 开发环境（`npm run dev` 时使用）
- `.env.production` - 生产环境（`npm run build` 时使用）

### Q: 如何确认当前使用的 API 地址？
A: 在浏览器控制台输入：
```javascript
console.log(process.env.NEXT_PUBLIC_API_URL)
```

## 快速配置脚本

```bash
#!/bin/bash
# 快速设置生产环境 API 地址

read -p "请输入线上 API 地址: " API_URL

cat > .env.production << EOF
NEXT_PUBLIC_API_URL=${API_URL}
EOF

echo "✅ 已设置 API 地址为: ${API_URL}"
echo "📦 请运行: npm run build"
```
