import { watch } from 'vue'
import { useDraggable } from './useDraggable'
import { updateWidgetPos } from '../db'

/**
 * 组合 useDraggable + 位置持久化（localStorage + IndexedDB）
 * 封装 14 个组件中重复的拖拽初始化逻辑
 */
export function useWidgetDrag(
  props: { widgetId?: number; initialX?: number; initialY?: number },
  posKey: string,
  defaultX: number,
  defaultY: number,
  syncToDB = true,
) {
  const savedPos = JSON.parse(localStorage.getItem(posKey) || 'null')
  const { x, y, onDragStart } = useDraggable(
    savedPos?.x ?? props.initialX ?? defaultX,
    savedPos?.y ?? props.initialY ?? defaultY,
  )

  watch([x, y], () => {
    localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value }))
    if (syncToDB && props.widgetId != null) {
      updateWidgetPos(props.widgetId!, x.value, y.value)
    }
  })

  return { x, y, onDragStart }
}
