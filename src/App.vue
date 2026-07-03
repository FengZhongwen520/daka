<script setup lang="ts">
import { ref, provide } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppCalendar from './components/AppCalendar.vue'
import AppModal from './components/AppModal.vue'

const showModal = ref(false)
const modalMode = ref<'add' | 'edit'>('add')
const editingProjectId = ref<number | null>(null)

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
</script>

<template>
  <div class="app-layout">
    <div class="app-body">
      <AppSidebar />
      <AppCalendar />
    </div>
    <AppModal v-if="showModal" />
  </div>
</template>
