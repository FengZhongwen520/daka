<script setup lang="ts">
import { defineAsyncComponent, ref, provide, onMounted } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppCalendar from './components/AppContent.vue'
import FeedbackHost from './components/common/FeedbackHost.vue'
import { getItem, setItem } from './storage'

const AppModal = defineAsyncComponent(() => import('./components/AppModal.vue'))
const WelcomeDialog = defineAsyncComponent(() => import('./components/WelcomeDialog.vue'))

const showModal = ref(false)
const modalMode = ref<'add' | 'edit'>('add')
const editingProjectId = ref<number | null>(null)
const showWelcome = ref(false)

function openAddModal() {
  modalMode.value = 'add'
  editingProjectId.value = null
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

provide('showModal', showModal)
provide('modalMode', modalMode)
provide('editingProjectId', editingProjectId)
provide('openAddModal', openAddModal)
provide('closeModal', closeModal)
provide('openWelcomeGuide', () => {
  showWelcome.value = true
})

// Welcome dialog
onMounted(() => {
  if (!getItem('dake-welcomed')) {
    showWelcome.value = true
    setItem('dake-welcomed', '1')
  }
})

</script>

<template>
  <div class="app-layout">
    <div class="app-body">
      <AppSidebar />
      <AppCalendar />
    </div>
    <AppModal v-if="showModal" />
  </div>
  <WelcomeDialog v-if="showWelcome" v-model="showWelcome" />
  <FeedbackHost />
</template>
