'use client'

import { useState } from 'react'
import { RotateCcw, Check, Lightbulb } from 'lucide-react'
import type { EditState } from '@/lib/store'

interface ImageEditorProps {
  image: {
    id: string
    originalUrl: string
    thumbnailUrl: string
    width: number
    height: number
    editState: EditState | null
  }
  canvasWidth: number
  canvasHeight: number
  onSave: (editState: EditState) => void
  onCancel: () => void
}

type EditMode = 'center' | 'full' | 'lomo'

export default function ImageEditor({
  image,
  canvasWidth,
  canvasHeight,
  onSave,
  onCancel,
}: ImageEditorProps) {
  const [mode, setMode] = useState<EditMode>(image.editState?.mode || 'center')

  // 计算相纸比例
  const paperRatio = canvasWidth / canvasHeight

  const handleSave = () => {
    const editState: EditState = {
      mode,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      canvasWidth,
      canvasHeight,
    }
    onSave(editState)
  }

  const handleReset = () => {
    setMode('center')
  }

  // 根据模式获取图片样式
  const getImageStyle = () => {
    if (mode === 'center') {
      return 'object-cover'
    } else if (mode === 'full') {
      return 'object-contain'
    } else {
      return 'object-contain p-4'
    }
  }

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Hint */}
      <div className="px-4 py-3 pt-20">
        <div className="flex items-start gap-2 text-sm">
          <Lightbulb className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-gray-300">选择裁剪模式预览效果</span>
            <span className="text-red-400 ml-2">超出边框部分将被裁剪</span>
          </div>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div 
          className="relative bg-white overflow-hidden"
          style={{
            width: '90%',
            maxWidth: '400px',
            aspectRatio: `${paperRatio}`,
            border: '3px solid #ef4444',
          }}
        >
          {mode === 'lomo' ? (
            <div className="absolute inset-0 p-3 bg-white">
              <img
                src={image.thumbnailUrl || image.originalUrl}
                alt="preview"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <img
              src={image.thumbnailUrl || image.originalUrl}
              alt="preview"
              className={`absolute inset-0 w-full h-full ${getImageStyle()}`}
            />
          )}
        </div>
      </div>

      {/* Side Hints */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 text-red-400 text-xs">
        <span>✂</span>
        <span className="writing-mode-vertical">裁剪区域</span>
        <span>✂</span>
      </div>

      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 text-red-400 text-xs">
        <span>✂</span>
        <span className="writing-mode-vertical">裁剪区域</span>
        <span>✂</span>
      </div>

      {/* Bottom Control Bar */}
      <div className="bg-gray-900 border-t border-gray-800 p-4">
        {/* Mode Selector */}
        <div className="flex gap-3 mb-4 justify-center">
          <button
            onClick={() => setMode('center')}
            className={`px-5 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${
              mode === 'center'
                ? 'bg-pink-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span className="w-4 h-4 border-2 rounded-sm flex items-center justify-center">
              {mode === 'center' && <span className="w-2 h-2 bg-white rounded-sm"></span>}
            </span>
            居中裁剪
          </button>
          <button
            onClick={() => setMode('full')}
            className={`px-5 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${
              mode === 'full'
                ? 'bg-pink-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span className="w-4 h-4 border-2 rounded-sm flex items-center justify-center">
              {mode === 'full' && <span className="w-2 h-2 bg-white rounded-sm"></span>}
            </span>
            打印整图
          </button>
          <button
            onClick={() => setMode('lomo')}
            className={`px-5 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${
              mode === 'lomo'
                ? 'bg-pink-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span className="w-4 h-4 border-2 rounded-sm flex items-center justify-center">
              {mode === 'lomo' && <span className="w-2 h-2 bg-white rounded-sm"></span>}
            </span>
            四周留白
          </button>
        </div>

        {/* Action Buttons */}
        <button
          onClick={handleSave}
          className="w-full py-3 gradient-primary text-white rounded-full font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" />
          编辑完毕
        </button>
      </div>
    </div>
  )
}
