'use client'

import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from 'react-konva'
import { RotateCcw, Check, Lightbulb } from 'lucide-react'
import type { EditState } from '@/lib/store'
import Konva from 'konva'

interface ImageEditorProps {
  image: {
    id: string
    originalUrl: string
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
  const [mode, setMode] = useState<EditMode>(
    image.editState?.mode || 'center'
  )
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [imageState, setImageState] = useState({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
  })

  const stageRef = useRef<Konva.Stage>(null)
  const imageRef = useRef<Konva.Image>(null)
  const transformerRef = useRef<Konva.Transformer>(null)

  // 计算舞台尺寸
  useEffect(() => {
    const updateStageSize = () => {
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight - 200 // 留出顶部和底部空间

      // 计算舞台尺寸，保持画布宽高比
      const ratio = canvasWidth / canvasHeight
      let stageWidth = windowWidth * 0.9
      let stageHeight = stageWidth / ratio

      if (stageHeight > windowHeight) {
        stageHeight = windowHeight
        stageWidth = stageHeight * ratio
      }

      setStageSize({
        width: Math.floor(stageWidth),
        height: Math.floor(stageHeight),
      })
    }

    updateStageSize()
    window.addEventListener('resize', updateStageSize)
    return () => window.removeEventListener('resize', updateStageSize)
  }, [canvasWidth, canvasHeight])

  // 加载图片
  useEffect(() => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = image.originalUrl
    img.onload = () => {
      setImageObj(img)
    }
  }, [image.originalUrl])

  // 初始化或切换模式时调整图片状态
  useEffect(() => {
    if (!imageObj || stageSize.width === 0) return

    const scale = stageSize.width / canvasWidth
    let newState = { ...imageState }

    if (mode === 'center') {
      // 居中裁剪：图片按短边适配
      const imgRatio = imageObj.width / imageObj.height
      const canvasRatio = canvasWidth / canvasHeight

      if (imgRatio > canvasRatio) {
        // 图片更宽，按高度适配
        newState.scale = (canvasHeight / imageObj.height) * scale
      } else {
        // 图片更高，按宽度适配
        newState.scale = (canvasWidth / imageObj.width) * scale
      }

      // 居中
      newState.x = (stageSize.width - imageObj.width * newState.scale) / 2
      newState.y = (stageSize.height - imageObj.height * newState.scale) / 2
      newState.rotation = 0
    } else if (mode === 'full') {
      // 打印整图：图片完全适配到画布内
      const scaleX = canvasWidth / imageObj.width
      const scaleY = canvasHeight / imageObj.height
      const fitScale = Math.min(scaleX, scaleY)

      newState.scale = fitScale * scale
      newState.x = (stageSize.width - imageObj.width * newState.scale) / 2
      newState.y = (stageSize.height - imageObj.height * newState.scale) / 2
      newState.rotation = 0
    } else if (mode === 'lomo') {
      // Lomo：图片缩小到画布的 85%
      const lomoScale = 0.85
      const scaleX = (canvasWidth * lomoScale) / imageObj.width
      const scaleY = (canvasHeight * lomoScale) / imageObj.height
      const fitScale = Math.min(scaleX, scaleY)

      newState.scale = fitScale * scale
      newState.x = (stageSize.width - imageObj.width * newState.scale) / 2
      newState.y = (stageSize.height - imageObj.height * newState.scale) / 2
      newState.rotation = 0
    }

    setImageState(newState)
  }, [imageObj, mode, stageSize, canvasWidth, canvasHeight])

  // 绑定 Transformer
  useEffect(() => {
    if (imageRef.current && transformerRef.current) {
      transformerRef.current.nodes([imageRef.current])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [imageObj])

  const handleSave = () => {
    if (!imageObj) return

    // 将舞台坐标转换为画布坐标
    const scale = stageSize.width / canvasWidth
    const editState: EditState = {
      mode,
      scale: imageState.scale / scale,
      x: imageState.x / scale,
      y: imageState.y / scale,
      rotation: imageState.rotation,
      canvasWidth,
      canvasHeight,
    }

    onSave(editState)
  }

  const handleReset = () => {
    // 重新触发初始化
    setMode(mode)
  }

  if (!imageObj || stageSize.width === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-white">加载中...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Hint */}
      <div className="absolute top-16 left-0 right-0 z-10 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-start gap-2 text-sm">
          <Lightbulb className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-gray-300">
              可手动放大缩小、旋转、移动位置
            </span>
            <span className="text-red-400 ml-2">
              超出边框部分将被裁剪
            </span>
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex items-center justify-center py-24">
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          style={{
            border: '2px solid #ef4444',
            boxShadow: '0 0 0 8px rgba(255, 255, 255, 0.1)',
          }}
        >
          {/* Background Layer */}
          <Layer>
            <Rect
              x={0}
              y={0}
              width={stageSize.width}
              height={stageSize.height}
              fill="white"
            />
          </Layer>

          {/* Image Layer */}
          <Layer>
            <KonvaImage
              ref={imageRef}
              image={imageObj}
              x={imageState.x}
              y={imageState.y}
              scaleX={imageState.scale}
              scaleY={imageState.scale}
              rotation={imageState.rotation}
              draggable
              onDragEnd={(e) => {
                setImageState({
                  ...imageState,
                  x: e.target.x(),
                  y: e.target.y(),
                })
              }}
              onTransformEnd={(e) => {
                const node = e.target
                setImageState({
                  x: node.x(),
                  y: node.y(),
                  scale: node.scaleX(),
                  rotation: node.rotation(),
                })
              }}
            />
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                // 限制最小尺寸
                if (newBox.width < 50 || newBox.height < 50) {
                  return oldBox
                }
                return newBox
              }}
            />
          </Layer>
        </Stage>
      </div>

      {/* Side Hints */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 text-white text-sm">
        <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
        </svg>
        <div className="writing-mode-vertical text-center">裁剪区域</div>
      </div>

      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 text-white text-sm">
        <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
        </svg>
        <div className="writing-mode-vertical text-center">裁剪区域</div>
      </div>

      {/* Bottom Control Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur border-t border-gray-800">
        <div className="max-w-4xl mx-auto p-4">
          {/* Mode Selector */}
          <div className="flex gap-3 mb-4 justify-center">
            <button
              onClick={() => setMode('center')}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                mode === 'center'
                  ? 'bg-pink-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              居中裁剪
            </button>
            <button
              onClick={() => setMode('full')}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                mode === 'full'
                  ? 'bg-pink-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              打印整图
            </button>
            <button
              onClick={() => setMode('lomo')}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                mode === 'lomo'
                  ? 'bg-pink-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              四周留白
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors flex items-center gap-2"
            >
              <RotateCcw className="w-5 h-5" />
              重置
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-3 gradient-primary text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              编辑完毕
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

