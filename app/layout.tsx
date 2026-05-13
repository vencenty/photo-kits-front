import './globals.css'
import { Toaster } from 'sonner'
import { SkuPreloader } from '@/components/SkuPreloader'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <head>
        <title>照片收集工具</title>
        <meta name="description" content="" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
      </head>
      <body>
        <SkuPreloader>{children}</SkuPreloader>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}

