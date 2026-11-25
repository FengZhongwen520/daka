import { ref } from 'vue'

export type FeedbackType = 'success' | 'warning' | 'error' | 'info'

export interface ToastMessage {
  id: number
  type: FeedbackType
  message: string
}

export interface ConfirmState {
  title: string
  message: string
  confirmText: string
  cancelText: string
  danger: boolean
}

export const toastMessages = ref<ToastMessage[]>([])
export const confirmState = ref<ConfirmState | null>(null)

let toastId = 0
let confirmResolver: ((value: boolean) => void) | null = null

export function notify(message: string, type: FeedbackType = 'info') {
  const id = ++toastId
  toastMessages.value.push({ id, type, message })
  window.setTimeout(() => dismissToast(id), 2600)
}

export function dismissToast(id: number) {
  toastMessages.value = toastMessages.value.filter(item => item.id !== id)
}

export function askConfirm(
  message: string,
  title = '请确认',
  options: {
    confirmText?: string
    cancelText?: string
    danger?: boolean
  } = {},
): Promise<boolean> {
  if (confirmResolver) confirmResolver(false)
  confirmState.value = {
    title,
    message,
    confirmText: options.confirmText || '确定',
    cancelText: options.cancelText || '取消',
    danger: options.danger ?? false,
  }
  return new Promise(resolve => {
    confirmResolver = resolve
  })
}

export function resolveConfirm(value: boolean) {
  confirmState.value = null
  const resolve = confirmResolver
  confirmResolver = null
  resolve?.(value)
}
