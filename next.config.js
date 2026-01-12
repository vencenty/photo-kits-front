/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用 standalone 模式，生成最小化的部署文件
  // 注意：不要使用 'export'，因为应用有动态路由和 API 调用
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // 处理 konva 在服务器端的导入问题
  webpack: (config) => {
    // 在所有环境中将 canvas 设为外部模块
    config.externals = [
      ...config.externals,
      { canvas: 'canvas' }
    ]
    return config
  },
}

module.exports = nextConfig
