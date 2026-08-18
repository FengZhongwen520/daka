<script setup lang="ts">
import { ref, nextTick } from 'vue'

const props = withDefaults(defineProps<{
  variant: 'header' | 'overlay'
  onDragStart: (e: MouseEvent) => void
  title?: string
  editable?: boolean
  titlePlaceholder?: string
}>(), {
  variant: 'header',
  editable: false,
  titlePlaceholder: '',
})

const emit = defineEmits<{
  'update:title': [value: string]
}>()

// Editable title
const editing = ref(false)
const titleInput = ref<HTMLInputElement>()
const draftTitle = ref('')

function startEdit() {
  if (!props.editable) return
  draftTitle.value = props.title || ''
  editing.value = true
  nextTick(() => titleInput.value?.focus())
}

function saveEdit() {
  editing.value = false
  const trimmed = draftTitle.value.trim()
  if (trimmed) {
    emit('update:title', trimmed)
  } else {
    emit('update:title', props.titlePlaceholder)
  }
}

function onTitleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') saveEdit()
  if (e.key === 'Escape') {
    editing.value = false
  }
}
</script>

<template>
  <!-- Header variant: always visible, flex row -->
  <div
    v-if="variant === 'header'"
    class="drag-bar drag-bar--header"
    @mousedown="onDragStart"
  >
    <input
      v-if="editable && editing"
      ref="titleInput"
      v-model="draftTitle"
      class="drag-bar__title-input"
      @blur="saveEdit"
      @keydown="onTitleKeydown"
      @mousedown.stop
    />
    <span
      v-else
      class="drag-bar__title"
      :class="{ 'drag-bar__title--editable': editable }"
      @dblclick="startEdit"
    >{{ title }}</span>
    <div v-if="$slots.default" class="drag-bar__actions" @mousedown.stop>
      <slot />
    </div>
  </div>

  <!-- Overlay variant: hidden, absolute positioned, only ⋮⋮ dots -->
  <div
    v-else
    class="drag-bar drag-bar--overlay"
    @mousedown="onDragStart"
  >
    <span class="drag-bar__dots">⋮⋮</span>
  </div>
</template>

<style scoped>
/* ======= Shared ======= */
.drag-bar {
  user-select: none;
}

/* ======= Header variant ======= */
.drag-bar--header {
  height: 26px;
  background: rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  cursor: grab;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.drag-bar--header:active {
  cursor: grabbing;
}
html.dark .drag-bar--header {
  background: rgba(255, 255, 255, 0.06);
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.drag-bar__title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-ink-2);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.drag-bar__title--editable {
  cursor: pointer;
}
.drag-bar__title--editable:hover {
  color: var(--color-ink);
}

.drag-bar__title-input {
  width: 120px;
  font-size: 0.78rem;
  font-weight: 700;
  border: 1.5px solid var(--color-primary);
  border-radius: 4px;
  padding: 1px 4px;
  outline: none;
  font-family: inherit;
  background: var(--color-surface);
}

.drag-bar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

/* ======= Overlay variant ======= */
.drag-bar--overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 22px;
  background: rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 60;
  border-radius: 6px 6px 0 0;
}
.drag-bar--overlay:active {
  cursor: grabbing;
  background: rgba(0, 0, 0, 0.14);
}
html.dark .drag-bar--overlay {
  background: rgba(255, 255, 255, 0.08);
}
html.dark .drag-bar--overlay:active {
  background: rgba(255, 255, 255, 0.14);
}

.drag-bar__dots {
  color: var(--color-ink-3);
  font-size: 16px;
  letter-spacing: 4px;
  user-select: none;
}
</style>
