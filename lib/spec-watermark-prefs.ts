/** 客户按订单规格自行选择是否添加日期水印（localStorage 持久化） */

const STORAGE_KEY = 'upload_spec_watermark_prefs'

type PrefsMap = Record<string, boolean>

function prefKey(orderNo: string, specId: number): string {
  return `${orderNo}:${specId}`
}

function readPrefs(): PrefsMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PrefsMap) : {}
  } catch {
    return {}
  }
}

function writePrefs(prefs: PrefsMap): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore quota errors
  }
}

export function getSpecWatermarkPref(orderNo: string, specId: number): boolean {
  if (!orderNo || !specId) return false
  return !!readPrefs()[prefKey(orderNo, specId)]
}

export function setSpecWatermarkPref(orderNo: string, specId: number, enabled: boolean): void {
  if (!orderNo || !specId) return
  const prefs = readPrefs()
  const key = prefKey(orderNo, specId)
  if (enabled) {
    prefs[key] = true
  } else {
    delete prefs[key]
  }
  writePrefs(prefs)
}
