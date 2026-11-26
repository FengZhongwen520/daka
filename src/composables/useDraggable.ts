import { ref, onUnmounted } from 'vue'

export function useDraggable(
  initialX: number,
  initialY: number,
  getSnapSize: () => number = () => 1,
) {
  const x = ref(initialX)
  const y = ref(initialY)

  let dragging = false
  let startX = 0
  let startY = 0
  let initX = 0
  let initY = 0

  function onDragStart(e: MouseEvent) {
    dragging = true
    startX = e.clientX
    startY = e.clientY
    initX = x.value
    initY = y.value
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragEnd)
  }

  function onDragMove(e: MouseEvent) {
    if (!dragging) return
    const snap = Math.max(1, getSnapSize())
    x.value = Math.round((initX + (e.clientX - startX)) / snap) * snap
    y.value = Math.round((initY + (e.clientY - startY)) / snap) * snap
  }

  function onDragEnd() {
    dragging = false
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)
  }

  onUnmounted(() => {
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)
  })

  return { x, y, onDragStart }
}
