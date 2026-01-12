#!/bin/bash

# 部署脚本
# 使用方法: ./deploy.sh [环境]
# 环境: dev, test, prod (默认: prod)

ENV=${1:-prod}

echo "🚀 开始部署到 $ENV 环境..."

# 根据环境设置不同的 API 地址
case $ENV in
  dev)
    export NEXT_PUBLIC_API_URL=http://localhost:8888
    ;;
  test)
    export a=https://api-test.yourdomain.com
    ;;
  prod)
    export NEXT_PUBLIC_API_URL=https://api.yourdomain.com
    ;;
  *)
    echo "❌ 未知环境: $ENV"
    echo "使用方法: ./deploy.sh [dev|test|prod]"
    exit 1
    ;;
esac

echo "📦 API 地址: $NEXT_PUBLIC_API_URL"

# 检查是否安装了依赖
if [ ! -d "node_modules" ]; then
  echo "📥 安装依赖..."
  npm install
fi

# 构建
echo "🔨 开始构建..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ 构建失败！"
  exit 1
fi

echo "✅ 构建完成！"

# 检查 PM2 是否安装
if ! command -v pm2 &> /dev/null; then
  echo "⚠️  PM2 未安装，请先安装: npm install -g pm2"
  echo "📝 或者手动启动: npm start"
  exit 0
fi

# 使用 PM2 启动
echo "🚀 启动应用..."
pm2 restart photo-upload || pm2 start npm --name "photo-upload" -- start

echo "✅ 部署完成！"
echo "📊 查看状态: pm2 status"
echo "📋 查看日志: pm2 logs photo-upload"
