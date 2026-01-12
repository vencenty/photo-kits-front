# 部署文件清单

## 方式一：Standalone 模式（推荐，文件最少）

### 1. 修改 next.config.js

在 `next.config.js` 中添加 `output: 'standalone'`：

```javascript
const nextConfig = {
  output: 'standalone',  // 添加这一行
  images: {
    unoptimized: true,
  },
  // ... 其他配置
}
```

### 2. 构建

```bash
npm run build
```

### 3. 需要上传的文件

上传以下文件/目录到服务器：

```
front/
├── .next/standalone/          # 核心运行文件（必需）
├── .next/static/              # 静态资源（必需）
├── public/                     # 公共资源（如果有）
├── package.json                # 依赖信息（必需）
└── .env.production            # 环境变量（必需，不要上传到 git）
```

**具体操作：**

```bash
# 在服务器上创建目录
mkdir -p /path/to/your/app

# 上传文件（使用 scp 或 rsync）
scp -r .next/standalone/* user@server:/path/to/your/app/
scp -r .next/static user@server:/path/to/your/app/.next/
scp -r public user@server:/path/to/your/app/  # 如果有 public 目录
scp package.json user@server:/path/to/your/app/
scp .env.production user@server:/path/to/your/app/
```

### 4. 在服务器上安装依赖并启动

```bash
cd /path/to/your/app
npm install --production
node server.js
```

---

## 方式二：完整源代码（简单但文件较多）

### 需要上传的文件

```
front/
├── app/                       # 源代码目录
├── components/                # 组件目录
├── lib/                       # 工具库目录
├── public/                    # 公共资源（如果有）
├── .next/                     # 构建输出（必需）
├── node_modules/              # 依赖（或上传后在服务器安装）
├── package.json               # 依赖信息（必需）
├── package-lock.json          # 锁定版本（推荐）
├── next.config.js             # Next.js 配置（必需）
├── tsconfig.json              # TypeScript 配置（必需）
├── tailwind.config.ts         # Tailwind 配置（必需）
├── postcss.config.js          # PostCSS 配置（必需）
└── .env.production           # 环境变量（必需，不要上传到 git）
```

### 上传后操作

```bash
# 在服务器上
cd /path/to/your/app
npm install --production
npm run build  # 如果需要重新构建
npm start
```

---

## 方式三：只上传必要文件（最精简）

### 1. 构建

```bash
npm run build
```

### 2. 需要上传的文件

```
front/
├── .next/                     # 构建输出（必需）
├── public/                     # 公共资源（如果有）
├── package.json                # 依赖信息（必需）
├── package-lock.json           # 锁定版本（推荐）
├── next.config.js              # Next.js 配置（必需）
└── .env.production            # 环境变量（必需）
```

### 3. 在服务器上

```bash
cd /path/to/your/app
npm install --production
npm start
```

---

## 推荐方案对比

| 方式 | 文件大小 | 部署速度 | 推荐度 |
|------|---------|---------|--------|
| Standalone | 最小 | 最快 | ⭐⭐⭐⭐⭐ |
| 完整源代码 | 最大 | 较慢 | ⭐⭐⭐ |
| 必要文件 | 中等 | 中等 | ⭐⭐⭐⭐ |

---

## 快速部署脚本

创建 `upload-to-server.sh`：

```bash
#!/bin/bash

# 配置服务器信息
SERVER_USER="your-username"
SERVER_HOST="your-server.com"
SERVER_PATH="/path/to/your/app"

# 构建
echo "🔨 构建中..."
npm run build

# 上传文件
echo "📤 上传文件中..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next/cache' \
  .next/ \
  public/ \
  package.json \
  package-lock.json \
  next.config.js \
  ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/

# 上传环境变量（单独上传，更安全）
scp .env.production ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/.env.production

echo "✅ 上传完成！"
echo "📝 在服务器上执行: cd ${SERVER_PATH} && npm install --production && npm start"
```

---

## 注意事项

1. **不要上传的文件**：
   - `.env.local`（本地环境变量）
   - `.git/`（Git 仓库）
   - `node_modules/`（在服务器上安装）
   - `.next/cache/`（缓存文件）
   - `*.log`（日志文件）

2. **环境变量**：
   - 确保 `.env.production` 包含正确的 API 地址
   - 不要将 `.env.production` 提交到 Git

3. **权限**：
   - 确保服务器上的文件有正确的读写权限

4. **端口**：
   - 默认端口是 3000
   - 可以通过 `PORT` 环境变量修改
