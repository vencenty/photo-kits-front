#!/bin/bash

# 静态站点构建脚本
# 使用方法: ./deploy.sh [环境]
# 环境: dev, test, prod (默认: prod)

ENV=${1:-prod}

echo "🚀 开始构建静态站点 ($ENV 环境)..."

# 根据环境设置不同的 API 地址
case $ENV in
  dev)
    export NEXT_PUBLIC_API_URL=http://localhost:8888
    ;;
  test)
    export NEXT_PUBLIC_API_URL=https://api-test.yourdomain.com
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

# 构建静态站点
echo "🔨 开始构建..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ 构建失败！"
  exit 1
fi

echo "✅ 构建完成！"
echo "📁 静态文件位于: ./out/"
echo ""
echo "📝 Nginx 配置示例："
echo "-----------------------------------"
echo "server {"
echo "  listen 80;"
echo "  server_name your-domain.com;"
echo "  root /path/to/your/project/out;"
echo "  index index.html;"
echo ""
echo "  # 支持客户端路由"
echo "  location / {"
echo "    try_files \$uri \$uri/ \$uri.html /index.html;"
echo "  }"
echo ""
echo "  # 静态资源缓存"
echo "  location /_next/static/ {"
echo "    add_header Cache-Control \"public, max-age=31536000, immutable\";"
echo "  }"
echo "}"
echo "-----------------------------------"
echo ""
echo "💡 本地测试: npx serve out"
