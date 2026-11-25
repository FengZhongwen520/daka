<script setup lang="ts">
import UiDialog from './UiDialog.vue'
import {
  confirmState,
  dismissToast,
  resolveConfirm,
  toastMessages,
} from '../../utils/feedback'
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast">
        <button
          v-for="item in toastMessages"
          :key="item.id"
          type="button"
          class="toast-item"
          :class="item.type"
          @click="dismissToast(item.id)"
        >
          <span class="toast-dot" />
          <span>{{ item.message }}</span>
        </button>
      </TransitionGroup>
    </div>
  </Teleport>

  <UiDialog
    :model-value="confirmState !== null"
    :title="confirmState?.title"
    width="380px"
    :close-on-click-modal="false"
    @update:model-value="resolveConfirm(false)"
  >
    <p class="confirm-message">{{ confirmState?.message }}</p>
    <template #footer>
      <button type="button" class="ui-button" @click="resolveConfirm(false)">
        {{ confirmState?.cancelText }}
      </button>
      <button
        type="button"
        class="ui-button"
        :class="confirmState?.danger ? 'ui-button-danger' : 'ui-button-primary'"
        @click="resolveConfirm(true)"
      >
        {{ confirmState?.confirmText }}
      </button>
    </template>
  </UiDialog>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  z-index: 3000;
  top: 16px;
  left: 50%;
  width: min(360px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transform: translateX(-50%);
  pointer-events: none;
}
.toast-item {
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  color: var(--color-ink);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.13);
  backdrop-filter: blur(16px);
  cursor: pointer;
  pointer-events: auto;
  font-family: inherit;
  font-size: 0.74rem;
  text-align: left;
}
.toast-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: var(--color-primary); }
.toast-warning .toast-dot { background: var(--status-idle); }
.toast-error .toast-dot { background: var(--color-danger); }
.toast-success .toast-dot { background: var(--color-primary); }
.toast-enter-active,
.toast-leave-active { transition: opacity 160ms ease, transform 180ms ease; }
.toast-enter-from,
.toast-leave-to { opacity: 0; transform: translateY(-6px); }
.confirm-message { color: var(--color-ink-2); font-size: 0.78rem; line-height: 1.65; }
</style>
