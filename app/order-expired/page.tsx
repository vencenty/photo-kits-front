import Link from 'next/link'

export default function OrderExpiredPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-slate-50 to-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-3xl font-bold">
            !
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            订单已超出查询有效期
          </h1>
          <p className="text-sm text-gray-600">
            为了保护您的隐私与数据安全，超过一定时间的订单将不再提供在线查看与重新上传功能。
          </p>
        </div>

        <div className="space-y-3 text-sm text-gray-700 mb-6">
          <p>
            如果您已经收到成品或问题已处理完成，本页面无需再做任何操作，感谢您的使用。
          </p>
          <p>
            如您在使用中遇到问题，或需要协助，请通过
            <span className="font-semibold text-orange-500"> 店铺客服 </span>
            联系我们，并提供您的订单号，我们会尽快为您处理。
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/"
            className="block w-full py-3 text-center bg-gradient-to-r from-pink-500 to-orange-400 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all active:scale-95"
          >
            返回首页重新查询
          </Link>
          <p className="text-xs text-gray-500 text-center">
            温馨提示：如需再次打印照片，建议重新下单并按照指引上传新的照片文件。
          </p>
        </div>
      </div>
    </div>
  )
}

