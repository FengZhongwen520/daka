<script setup lang="ts">
defineProps<{
  show: boolean
  x: number
  y: number
}>()

</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="context-menu"
      :style="{ left: x + 'px', top: y + 'px' }"
      @click.stop
    >
      <slot />
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--color-surface);
  backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-pop);
  padding: 4px;
  min-width: 120px;
}
</style>
