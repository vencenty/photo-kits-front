/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯静态导出模式
  output: 'export',
  // 性能优化
  compress: true,
  swcMinify: true,
  productionBrowserSourceMaps: false,
  // 禁用图片优化（静态导出必须）
  images: {
    unoptimized: true,
  },
  // 生产环境移除 console.log
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'], // 保留 console.error 和 console.warn
    } : false,
  },
  // 可选：如果需要部署到子路径，取消下面两行注释
  // basePath: '/your-sub-path',
  // assetPrefix: '/your-sub-path',
}

module.exports = nextConfig
