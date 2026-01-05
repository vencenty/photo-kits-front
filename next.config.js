/** @type {import('next').NextConfig} */
const nextConfig = {
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
