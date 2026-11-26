<script setup lang="ts">
defineProps<{
  name: 'projects' | 'wallpaper' | 'layout' | 'help' | 'trash' | 'sun' | 'moon' | 'system' | 'chevron-left' | 'chevron-right'
}>()
</script>

<template>
  <svg
    class="sidebar-icon"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <template v-if="name === 'projects'">
      <path d="M4.5 8.25h15v9.25a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V8.25Z" />
      <path d="M6.5 8.25V6.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1.75" />
      <path d="M8 12.25h8M8 15.75h5" />
    </template>

    <template v-else-if="name === 'wallpaper'">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m6 16 3.75-3.75 2.75 2.75 2.25-2.25L20 17" />
    </template>

    <template v-else-if="name === 'layout'">
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M9.5 4v16M3.5 10h6M9.5 14.5h11" />
    </template>

    <template v-else-if="name === 'help'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.75 9.25a2.35 2.35 0 1 1 3.2 2.18c-.8.35-.95.88-.95 1.57" />
      <path d="M12 16.75h.01" />
    </template>

    <template v-else-if="name === 'trash'">
      <path d="M5.5 7.5h13M9 7.5V5.25h6V7.5M7.5 7.5l.75 11h7.5l.75-11" />
      <path d="M10.25 10.5v5M13.75 10.5v5" />
    </template>

    <template v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
    </template>

    <template v-else-if="name === 'moon'">
      <path d="M19 14.2A7.75 7.75 0 0 1 9.8 5a7.5 7.5 0 1 0 9.2 9.2Z" />
    </template>

    <template v-else-if="name === 'system'">
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M8 20.5h8M12 16.5v4" />
    </template>

    <path
      v-else-if="name === 'chevron-left'"
      d="m14.5 6.5-5.5 5.5 5.5 5.5"
    />
    <path
      v-else
      d="m9.5 6.5 5.5 5.5-5.5 5.5"
    />
  </svg>
</template>

<style scoped>
.sidebar-icon {
  width: 18px;
  height: 18px;
  display: block;
  stroke: currentColor;
  stroke-width: 1.65;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
