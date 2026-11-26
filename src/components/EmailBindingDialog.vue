<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiDialog from './common/UiDialog.vue'
import { getCloudToken, updateCloudUserEmail } from '../storage'
import { requestEmailBinding, verifyEmailBinding } from '../storage/api'
import { notify } from '../utils/feedback'

const props = defineProps<{
  modelValue: boolean
  currentEmail?: string | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  bound: [email: string]
}>()

const email = ref('')
const code = ref('')
const step = ref<'email' | 'code'>('email')
const busy = ref(false)
const error = ref('')
const maskedEmail = ref('')
const canSubmitEmail = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))

watch(() => props.modelValue, (open) => {
  if (!open) return
  email.value = props.currentEmail || ''
  code.value = ''
  step.value = 'email'
  error.value = ''
  maskedEmail.value = ''
})

async function requestCode() {
  if (!canSubmitEmail.value || busy.value) return
  const token = getCloudToken()
  if (!token) {
    error.value = '请先登录'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const result = await requestEmailBinding(token, email.value.trim())
    maskedEmail.value = result.maskedEmail
    step.value = 'code'
    notify('验证码已发送', 'success')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '验证码发送失败'
  } finally {
    busy.value = false
  }
}

async function verifyCode() {
  if (!/^\d{6}$/.test(code.value.trim()) || busy.value) return
  const token = getCloudToken()
  if (!token) {
    error.value = '请先登录'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const result = await verifyEmailBinding(token, email.value.trim(), code.value.trim())
    updateCloudUserEmail(result.email)
    emit('bound', result.email)
    notify('邮箱绑定成功', 'success')
    emit('update:modelValue', false)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '邮箱绑定失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiDialog
    :model-value="modelValue"
    :title="currentEmail ? '更换绑定邮箱' : '绑定邮箱'"
    width="410px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="email-form">
      <p class="email-hint">
        绑定后可以通过邮箱验证码找回密码。邮箱会加密保存在服务端。
      </p>
      <label>
        <span>邮箱</span>
        <input v-model="email" class="ui-input" type="email" autocomplete="email" :disabled="step === 'code'" placeholder="name@example.com" />
      </label>
      <template v-if="step === 'code'">
        <p class="email-hint">验证码已发送到 {{ maskedEmail }}</p>
        <label>
          <span>6 位验证码</span>
          <input v-model="code" class="ui-input email-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" />
        </label>
      </template>
      <p v-if="error" class="email-error">{{ error }}</p>
    </div>
    <template #footer>
      <button type="button" class="ui-button" @click="emit('update:modelValue', false)">取消</button>
      <button
        v-if="step === 'email'"
        type="button"
        class="ui-button ui-button-primary"
        :disabled="!canSubmitEmail || busy"
        @click="requestCode"
      >
        {{ busy ? '发送中…' : '发送验证码' }}
      </button>
      <button
        v-else
        type="button"
        class="ui-button ui-button-primary"
        :disabled="code.length !== 6 || busy"
        @click="verifyCode"
      >
        {{ busy ? '验证中…' : '确认绑定' }}
      </button>
    </template>
  </UiDialog>
</template>

<style scoped>
.email-form { display: flex; flex-direction: column; gap: 14px; }
.email-form label { display: flex; flex-direction: column; gap: 6px; }
.email-form label > span { color: var(--color-ink-2); font-size: .7rem; font-weight: 650; }
.email-hint { color: var(--color-ink-3); font-size: .7rem; line-height: 1.55; }
.email-code { letter-spacing: .35em; font-size: 1rem; font-variant-numeric: tabular-nums; }
.email-error { color: var(--color-danger); font-size: .7rem; }
</style>
