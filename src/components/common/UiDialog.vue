<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  title?: string
  width?: string
  closeOnClickModal?: boolean
}>(), {
  modelValue: false,
  title: '',
  width: '420px',
  closeOnClickModal: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>()

const panelRef = ref<HTMLElement>()

function close() {
  emit('update:modelValue', false)
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) close()
}

watch(() => props.modelValue, async (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) {
    window.addEventListener('keydown', onKeydown)
    await nextTick()
    panelRef.value?.querySelector<HTMLElement>(
      'input, textarea, button, [tabindex]:not([tabindex="-1"])',
    )?.focus()
  } else {
    window.removeEventListener('keydown', onKeydown)
  }
}, { immediate: true })

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-dialog">
      <div
        v-if="modelValue"
        class="ui-dialog-backdrop"
        @mousedown.self="closeOnClickModal && close()"
      >
        <section
          ref="panelRef"
          class="ui-dialog-panel"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          :style="{ width }"
        >
          <header class="ui-dialog-head">
            <h2>{{ title }}</h2>
            <button type="button" class="ui-dialog-close" aria-label="关闭" @click="close">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </header>
          <div class="ui-dialog-body"><slot /></div>
          <footer v-if="$slots.footer" class="ui-dialog-footer"><slot name="footer" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-dialog-backdrop {
  position: fixed;
  z-index: 2400;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 24, 31, 0.34);
  backdrop-filter: blur(6px);
}
.ui-dialog-panel {
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: 0 24px 72px rgba(15, 23, 42, 0.22);
  overflow: hidden;
}
.ui-dialog-head {
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 18px;
  border-bottom: 1px solid var(--color-border);
}
.ui-dialog-head h2 { font-size: 0.9rem; font-weight: 720; }
.ui-dialog-close {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
}
.ui-dialog-close:hover { background: color-mix(in srgb, var(--color-ink) 7%, transparent); color: var(--color-ink); }
.ui-dialog-close svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
.ui-dialog-body { padding: 18px; overflow-y: auto; }
.ui-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--color-border);
}
.ui-dialog-enter-active,
.ui-dialog-leave-active { transition: opacity 160ms ease; }
.ui-dialog-enter-active .ui-dialog-panel,
.ui-dialog-leave-active .ui-dialog-panel { transition: transform 180ms ease, opacity 160ms ease; }
.ui-dialog-enter-from,
.ui-dialog-leave-to { opacity: 0; }
.ui-dialog-enter-from .ui-dialog-panel,
.ui-dialog-leave-to .ui-dialog-panel { transform: translateY(8px) scale(0.99); opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .ui-dialog-enter-active,
  .ui-dialog-leave-active,
  .ui-dialog-enter-active .ui-dialog-panel,
  .ui-dialog-leave-active .ui-dialog-panel { transition-duration: 0.01ms; }
}
</style>
