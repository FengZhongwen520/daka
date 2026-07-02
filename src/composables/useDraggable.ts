import { ref, onUnmounted } from 'vue'

export function useDraggable(initialX: number, initialY: number) {
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
    x.value = initX + (e.clientX - startX)
    y.value = initY + (e.clientY - startY)
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
