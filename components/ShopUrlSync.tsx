'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { initShopFromQuery, SHOP_ID_QUERY_KEY } from '@/lib/shop-context';

/** 挂载时从 URL ?shop_id= 初始化店铺上下文 */
export function ShopUrlSync() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const fromUrl = searchParams.get(SHOP_ID_QUERY_KEY);
    if (fromUrl) {
      initShopFromQuery(fromUrl);
    }
  }, [searchParams]);

  return null;
}
