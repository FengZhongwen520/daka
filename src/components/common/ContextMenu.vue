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

<style>
.context-menu {
  position: fixed;
  z-index: 9999;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 4px;
  min-width: 120px;
}
</style>
