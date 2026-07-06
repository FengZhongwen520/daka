import { ref, watch } from 'vue'
import { updateWidgetPos } from '../db'

export function useWidgetPos(
  widgetId: number | undefined,
  posKey: string,
  defaultX: number,
  defaultY: number,
) {
  const saved = JSON.parse(localStorage.getItem(posKey) || 'null')
  const x = ref(saved?.x ?? defaultX)
  const y = ref(saved?.y ?? defaultY)

  watch([x, y], () => {
    localStorage.setItem(posKey, JSON.stringify({ x: x.value, y: y.value }))
    if (widgetId != null) {
      updateWidgetPos(widgetId, x.value, y.value).catch(() => {})
    }
  })

  return { x, y }
}
