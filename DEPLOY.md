# 打包和部署指南

## 环境变量配置

### 1. 创建环境变量文件

在 `front` 目录下创建 `.env.local` 文件（生产环境）或 `.env.production` 文件：

```bash
# 生产环境 API 地址
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# OSS 代理域名（可选，如果不设置会使用默认值）
# NEXT_PUBLIC_OSS_PROXY_DOMAIN=https://oss-proxy.yourdomain.com
```

### 2. 环境变量说明

- `NEXT_PUBLIC_API_URL`: 后端 API 服务地址
  - 开发环境：`http://localhost:8888`
  - 生产环境：`https://api.yourdomain.com`（替换为你的实际 API 地址）

- `NEXT_PUBLIC_OSS_PROXY_DOMAIN`: OSS 图片代理域名（可选）
  - 默认值：`https://oss-proxy.vencenty.cc`
  - 用于图片访问的代理域名

> **注意**：`NEXT_PUBLIC_` 前缀是 Next.js 的要求，这样变量才能在客户端代码中使用。

## 打包步骤

### 1. 安装依赖

```bash
cd front
npm install
# 或
yarn install
# 或
pnpm install
```

### 2. 配置环境变量

创建 `.env.production` 文件并设置生产环境的配置：

```bash
# 后端 API 地址（必填）
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# OSS 代理域名（可选）
NEXT_PUBLIC_OSS_PROXY_DOMAIN=https://oss-proxy.yourdomain.com
```

### 3. 构建生产版本

```bash
npm run build
# 或
yarn build
# 或
pnpm build
```

构建完成后，会在 `.next` 目录生成优化后的生产版本。

### 4. 启动生产服务器

```bash
npm start
# 或
yarn start
# 或
pnpm start
```

默认会在 `http://localhost:3000` 启动。

## 部署方式

### 方式一：使用 PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start npm --name "photo-upload" -- start

# 查看状态
pm2 status

# 查看日志
pm2 logs photo-upload

# 停止应用
pm2 stop photo-upload

# 重启应用
pm2 restart photo-upload
```

### 方式二：使用 Docker

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

构建和运行：

```bash
docker build -t photo-upload-front .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=https://api.yourdomain.com photo-upload-front
```

### 方式三：使用 Nginx 反向代理

1. 构建应用：
```bash
npm run build
npm start
```

2. 配置 Nginx：

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 环境变量配置示例

### 开发环境（.env.local）

```env
NEXT_PUBLIC_API_URL=http://localhost:8888
```

### 生产环境（.env.production）

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_OSS_PROXY_DOMAIN=https://oss-proxy.yourdomain.com
```

### 测试环境（.env.test）

```env
NEXT_PUBLIC_API_URL=https://api-test.yourdomain.com
```

## 注意事项

1. **环境变量命名**：必须以 `NEXT_PUBLIC_` 开头才能在客户端使用
2. **API 地址**：确保生产环境的 API 地址支持跨域（CORS）
3. **HTTPS**：生产环境建议使用 HTTPS
4. **端口**：默认端口是 3000，可以通过 `PORT` 环境变量修改

## 快速部署脚本

创建 `deploy.sh`：

```bash
#!/bin/bash

# 设置生产环境 API 地址
export NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# 构建
npm run build

# 启动（使用 PM2）
pm2 restart photo-upload || pm2 start npm --name "photo-upload" -- start
```

使用：

```bash
chmod +x deploy.sh
./deploy.sh
```
