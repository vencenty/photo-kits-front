import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '田田洗照片 - 上传照片',
  description: '在线照片冲印服务',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
      <body>{children}</body>
    </html>
  )
}

