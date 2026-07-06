import { ref } from 'vue'

// 全局单例 — 同时只有一个菜单
let activeInstance: { close: () => void } | null = null

/**
 * 右键菜单 composable
 * - onContextMenu(e) 设置坐标并显示
 * - closeMenu() 关闭
 * - 全局单例，打开新菜单自动关闭旧菜单
 */
export function useContextMenu() {
  const showMenu = ref(false)
  const menuX = ref(0)
  const menuY = ref(0)

  const instance = { close }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault()
    if (activeInstance && activeInstance !== instance) activeInstance.close()
    menuX.value = e.clientX
    menuY.value = e.clientY
    showMenu.value = true
    activeInstance = instance
    setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0)
  }

  function close() {
    showMenu.value = false
    if (activeInstance === instance) activeInstance = null
  }

  function closeMenu() {
    close()
  }

  return { showMenu, menuX, menuY, onContextMenu, closeMenu }
}
