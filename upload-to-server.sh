#!/bin/bash

# 上传文件到服务器的脚本
# 使用方法: ./upload-to-server.sh

# ========== 配置区域 ==========
# 请修改以下配置为你的服务器信息
SERVER_USER="your-username"           # 服务器用户名
SERVER_HOST="your-server.com"         # 服务器地址
SERVER_PATH="/path/to/your/app"       # 服务器上的部署路径
# =============================

echo "🚀 开始部署到服务器..."

# 检查是否已构建
if [ ! -d ".next" ]; then
  echo "📦 未找到构建文件，开始构建..."
  npm run build
fi

# 确认上传
read -p "确认上传到 ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH} ? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 已取消"
  exit 1
fi

# 上传文件
echo "📤 上传文件中..."

# 方式一：使用 rsync（推荐，支持断点续传）
if command -v rsync &> /dev/null; then
  rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.next/cache' \
    --exclude '.env.local' \
    --exclude '*.log' \
    .next/standalone/ \
    .next/static/ \
    public/ \
    package.json \
    package-lock.json \
    next.config.js \
    ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/
  
  # 单独上传环境变量文件（如果存在）
  if [ -f ".env.production" ]; then
    echo "📤 上传环境变量文件..."
    scp .env.production ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/.env.production
  fi
else
  # 方式二：使用 scp（如果没有 rsync）
  echo "⚠️  未找到 rsync，使用 scp..."
  
  # 创建临时目录
  TEMP_DIR=$(mktemp -d)
  mkdir -p ${TEMP_DIR}/.next
  
  # 复制文件
  cp -r .next/standalone/* ${TEMP_DIR}/
  cp -r .next/static ${TEMP_DIR}/.next/
  [ -d "public" ] && cp -r public ${TEMP_DIR}/
  cp package.json package-lock.json next.config.js ${TEMP_DIR}/
  [ -f ".env.production" ] && cp .env.production ${TEMP_DIR}/
  
  # 上传
  scp -r ${TEMP_DIR}/* ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/
  
  # 清理
  rm -rf ${TEMP_DIR}
fi

echo "✅ 上传完成！"
echo ""
echo "📝 接下来在服务器上执行："
echo "   ssh ${SERVER_USER}@${SERVER_HOST}"
echo "   cd ${SERVER_PATH}"
echo "   npm install --production"
echo "   node server.js"
echo ""
echo "   或使用 PM2："
echo "   pm2 start server.js --name photo-upload"
