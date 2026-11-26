<script setup lang="ts">
import { ref, watch } from 'vue'
import UiDialog from './common/UiDialog.vue'
import { requestPasswordReset, resetPassword } from '../storage/api'
import { notify } from '../utils/feedback'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const step = ref<'request' | 'reset'>('request')
const email = ref('')
const code = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

watch(() => props.modelValue, (open) => {
  if (!open) return
  step.value = 'request'
  code.value = ''
  password.value = ''
  error.value = ''
})

async function sendCode() {
  if (!email.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await requestPasswordReset(email.value.trim())
    step.value = 'reset'
    notify('如果邮箱已绑定，验证码将发送到该邮箱', 'success')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '验证码发送失败'
  } finally {
    busy.value = false
  }
}

async function confirmReset() {
  if (code.value.length !== 6 || password.value.length < 8 || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await resetPassword(email.value.trim(), code.value.trim(), password.value)
    notify('密码已重置，请重新登录', 'success')
    emit('update:modelValue', false)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '密码重置失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiDialog
    :model-value="modelValue"
    title="找回密码"
    width="410px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="reset-form">
      <p class="reset-hint">输入已绑定的邮箱，系统会发送 6 位一次性验证码。</p>
      <label>
        <span>绑定邮箱</span>
        <input v-model="email" class="ui-input" type="email" autocomplete="email" :disabled="step === 'reset'" placeholder="name@example.com" />
      </label>
      <template v-if="step === 'reset'">
        <label>
          <span>验证码</span>
          <input v-model="code" class="ui-input reset-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" />
        </label>
        <label>
          <span>新密码</span>
          <input v-model="password" class="ui-input" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="至少 8 位" />
        </label>
      </template>
      <p v-if="error" class="reset-error">{{ error }}</p>
    </div>
    <template #footer>
      <button type="button" class="ui-button" @click="emit('update:modelValue', false)">取消</button>
      <button
        v-if="step === 'request'"
        type="button"
        class="ui-button ui-button-primary"
        :disabled="!email.trim() || busy"
        @click="sendCode"
      >{{ busy ? '发送中…' : '发送验证码' }}</button>
      <button
        v-else
        type="button"
        class="ui-button ui-button-primary"
        :disabled="code.length !== 6 || password.length < 8 || busy"
        @click="confirmReset"
      >{{ busy ? '重置中…' : '重置密码' }}</button>
    </template>
  </UiDialog>
</template>

<style scoped>
.reset-form { display: flex; flex-direction: column; gap: 14px; }
.reset-form label { display: flex; flex-direction: column; gap: 6px; }
.reset-form label > span { color: var(--color-ink-2); font-size: .7rem; font-weight: 650; }
.reset-hint { color: var(--color-ink-3); font-size: .7rem; line-height: 1.55; }
.reset-code { letter-spacing: .35em; font-size: 1rem; font-variant-numeric: tabular-nums; }
.reset-error { color: var(--color-danger); font-size: .7rem; }
</style>
