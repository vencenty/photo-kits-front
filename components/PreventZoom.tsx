'use client'

import { useEffect } from 'react'

/**
 * 禁止移动端捏合缩放
 * iOS Safari 会忽略 viewport meta 和 touch-action，需用 JS 拦截多指触摸
 */
export function PreventZoom() {
  useEffect(() => {
    const preventPinch = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }

    const preventGesture = (e: Event) => {
      e.preventDefault()
    }

    document.addEventListener('touchmove', preventPinch, { passive: false })
    document.addEventListener('gesturestart', preventGesture)
    document.addEventListener('gesturechange', preventGesture)
    document.addEventListener('gestureend', preventGesture)

    return () => {
      document.removeEventListener('touchmove', preventPinch)
      document.removeEventListener('gesturestart', preventGesture)
      document.removeEventListener('gesturechange', preventGesture)
      document.removeEventListener('gestureend', preventGesture)
    }
  }, [])

  return null
}
