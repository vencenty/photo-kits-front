/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯静态导出模式
  output: 'export',
  compress: true,
  swcMinify: true,
  productionBrowserSourceMaps: false,
  // 禁用图片优化（静态导出必须）
  images: {
    unoptimized: true,
  },
  // 可选：如果需要部署到子路径，取消下面两行注释
  // basePath: '/your-sub-path',
  // assetPrefix: '/your-sub-path',
  
  // 🎯 生产构建时去除 console 和 debugger
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'], // 保留 console.error 和 console.warn
    } : false,
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
