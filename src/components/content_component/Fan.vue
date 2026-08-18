<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const stateKey = `fan-state${props.widgetId != null ? '-' + props.widgetId : ''}`

// Power & speed — persisted
const savedState = JSON.parse(localStorage.getItem(stateKey) || 'null')
const powered = ref(savedState?.powered ?? true)
const speed = ref(savedState?.speed ?? 2)
watch([powered, speed], () => localStorage.setItem(stateKey, JSON.stringify({ powered: powered.value, speed: speed.value })))

const speeds = [
  { level: 1, label: '1', bladeDuration: 1.0, oscDuration: 5.0 },
  { level: 2, label: '2', bladeDuration: 0.5, oscDuration: 3.0 },
  { level: 3, label: '3', bladeDuration: 0.25, oscDuration: 2.0 },
]

const currentSpeed = computed(() => speeds[speed.value - 1])

// Title
const savedTitle = JSON.parse(localStorage.getItem('fan-title') || 'null')
const title = ref(savedTitle ?? '🌀 电风扇')
watch(title, (v) => localStorage.setItem('fan-title', JSON.stringify(v)))

// Drag
const posKey = `fan-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 600, 120, false)

// Persist speed
const savedSpeed = localStorage.getItem('fan-speed')
if (savedSpeed) speed.value = Number(savedSpeed) || 2
watch(speed, (v) => localStorage.setItem('fan-speed', String(v)))
</script>

<template>
  <div class="fan-widget widget-card" :style="{ left: x + 'px', top: y + 'px' }">
    <!-- Drag bar -->
    <DragBar variant="header" :on-drag-start="onDragStart" v-model:title="title" :editable="true" title-placeholder="🌀 电风扇">
      <button
        class="fan-power-btn"
        :class="{ on: powered }"
        @click="powered = !powered"
        :title="powered ? '关闭' : '开启'"
      >
        {{ powered ? '⏻' : '⏻' }}
      </button>
    </DragBar>

    <!-- Fan scene -->
    <div class="fan-scene">
      <div
        class="fan-unit"
        :class="{ off: !powered }"
        :style="{
          '--blade-duration': currentSpeed.bladeDuration + 's',
          '--osc-duration': currentSpeed.oscDuration + 's',
        }"
      >
        <!-- Fan head + cage + blades (pure CSS via pseudo-elements) -->
        <div class="fan-head"></div>
      </div>
    </div>

    <!-- Speed controls -->
    <div class="fan-controls">
      <button
        v-for="s in speeds"
        :key="s.level"
        class="fan-speed-btn"
        :class="{ active: speed === s.level }"
        @click="speed = s.level"
      >
        {{ s.label }} 档
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ===== CSS Variables from original SCSS ===== */
/* $b (base teal): #a4e2e2, dark: #7fc7c7, light: #c9f0f0 */
/* $br (beige): #b9ab7d */
/* $r (coral): #f06864 */

.fan-widget {
  position: absolute;
  width: 280px;
  z-index: 56;
  display: flex;
  flex-direction: column;
}

.fan-power-btn {
  margin-left: auto;
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--color-border);
  background: var(--color-surface-soft);
  cursor: pointer;
  font-size: 10px;
  color: var(--color-ink-3);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
  padding: 0;
  line-height: 1;
}
.fan-power-btn.on {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  box-shadow: 0 0 8px color-mix(in srgb, var(--color-primary) 40%, transparent);
}
.fan-power-btn:hover { transform: scale(1.1); }

/* Scene — contains the fan */
.fan-scene {
  height: 300px;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 95%, rgba(0,0,0,0.06) 0%, transparent 60%),
    linear-gradient(to bottom, rgba(0,0,0,0.01) 0%, rgba(0,0,0,0.03) 100%);
}

/* Fan unit — positioning wrapper */
.fan-unit {
  position: absolute;
  left: 50%;
  top: 35%;
  transform-style: preserve-3d;
}

/* Fan head — the circular cage + stand */
.fan-head {
  width: 130px;
  height: 130px;
  border-radius: 50%;
  position: relative;
  transform-style: preserve-3d;
  transform-origin: 50% 150% -50px;
  background:
    /* horizontal cage wires */
    linear-gradient(
      to right,
      transparent calc(50% - 1px),
      #e8e8e8 calc(50% - 1px),
      #e8e8e8 calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 50% 50% / 112px 112px no-repeat,
    /* vertical cage wires */
    linear-gradient(
      to bottom,
      transparent calc(50% - 1px),
      #e8e8e8 calc(50% - 1px),
      #e8e8e8 calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 50% 50% / 73px 73px no-repeat,
    /* center hub rings */
    radial-gradient(
      circle at center,
      transparent 22px,
      #e8e8e8 22px,
      #ccc 23px,
      transparent 23px,
      transparent 36px,
      #e8e8e8 36px,
      #ccc 37px,
      transparent 37px,
      transparent 52px
    ),
    /* outer cage ring */
    radial-gradient(
      circle at center,
      #ccc,
      #f5f5f5 52px,
      #a4e2e2 52px,
      #a4e2e2 57px,
      #7fc7c7 57px
    );
  animation: fan-oscillate var(--osc-duration, 3s) ease-in-out infinite alternate;
}

/* Animation states */
.fan-unit.off .fan-head {
  animation-play-state: paused;
}
.fan-unit.off .fan-head:before {
  animation-play-state: paused;
}
.fan-unit.off .fan-head:after {
  animation-play-state: paused;
}

/* Stand — :after pseudo-element */
.fan-head:after {
  content: '';
  position: absolute;
  transform-style: preserve-3d;
  transform-origin: 50% 100% 10px;
  width: 100%;
  height: 200px;
  top: 0;
  background:
    /* top connector */
    radial-gradient(
      circle at top,
      #e8e8e8,
      #ccc 6px,
      #999 6px,
      #7fc7c7 6.5px,
      transparent 8px
    ) 50% 145px / 20px 20px no-repeat,
    /* pole */
    linear-gradient(
      to right,
      transparent calc(50% - 6px),
      #ccc calc(50% - 6px),
      #e8e8e8,
      #ccc calc(50% + 6px),
      transparent calc(50% + 7px)
    ) 100% 50% / 100% 100px no-repeat,
    /* base top */
    radial-gradient(ellipse at bottom, #c9f0f0, #a4e2e2 50%, transparent 50%) 50%
      calc(100% - 30px) / 62px 50px no-repeat,
    /* base mid */
    radial-gradient(ellipse at center, #c9f0f0, #a4e2e2 50%, transparent 50%) 50%
      calc(100% - 15px) / 62px 30px no-repeat,
    /* base bottom shadow */
    radial-gradient(ellipse at center, #7fc7c7 65%, transparent 50%) 50%
      175px / 130px 15px no-repeat,
    /* pole fill */
    linear-gradient(to top, #a4e2e2 15px, transparent 10px) 50% calc(50% - 8px) /
      calc(100% - 10px) 100% no-repeat,
    /* base bottom edge */
    radial-gradient(ellipse at center, #a4e2e2 65%, transparent 50%) 50% 190px / 130px
      15px no-repeat;
  animation: fan-stand-osc var(--osc-duration, 3s) ease-in-out infinite alternate;
}

/* Spinning blades — :before pseudo-element */
.fan-head:before {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background:
    /* center cap rings */
    radial-gradient(
      circle at center,
      transparent 22px,
      #e8e8e8 22px,
      #ccc 23px,
      transparent 23px,
      transparent 36px,
      #e8e8e8 36px,
      #ccc 37px,
      transparent 37px,
      transparent 52px,
      #e8e8e8 52px,
      #ccc 53px,
      transparent 53px
    ),
    /* center knob */
    radial-gradient(circle at center, #ccc, #e0e0e0 13px, transparent 13px),
    /* blade 1 (vertical-ish) */
    linear-gradient(
      85deg,
      transparent calc(50% - 5px),
      #ccc calc(50% - 5px),
      #ccc calc(50% + 5px),
      transparent calc(50% + 5px)
    ) 50% / 100% 75% no-repeat,
    /* blade 2 (vertical-ish opposite) */
    linear-gradient(
      -85deg,
      transparent calc(50% - 5px),
      #ccc calc(50% - 5px),
      #ccc calc(50% + 5px),
      transparent calc(50% + 5px)
    ) 50% / 100% 75% no-repeat,
    /* blade 3 (horizontal-ish) */
    linear-gradient(
      5deg,
      transparent calc(50% - 5px),
      #ccc calc(50% - 5px),
      #ccc calc(50% + 5px),
      transparent calc(50% + 5px)
    ) 50% / 75% 100% no-repeat,
    /* blade 4 (horizontal-ish opposite) */
    linear-gradient(
      -5deg,
      transparent calc(50% - 5px),
      #ccc calc(50% - 5px),
      #ccc calc(50% + 5px),
      transparent calc(50% + 5px)
    ) 50% / 75% 100% no-repeat,
    /* blade tip rounds */
    radial-gradient(circle at bottom, #ccc 10px, transparent 10px) 50% 0px / 18px 18px no-repeat,
    radial-gradient(circle at top, #ccc 10px, transparent 10px) 50% 100% / 18px 18px no-repeat,
    radial-gradient(circle at right, #ccc 10px, transparent 10px) 0% 50% / 18px 18px no-repeat,
    radial-gradient(circle at left, #ccc 10px, transparent 10px) 100% 50% / 18px 18px no-repeat;
  animation: fan-spin var(--blade-duration, 0.5s) linear infinite;
  border-radius: 50%;
}

/* Oscillation animation */
@keyframes fan-oscillate {
  from {
    transform: translate(-65px, -50px) rotateY(-22deg);
    box-shadow:
      10px 0 0 #a4e2e2,
      15px 15px 20px -15px #c9f0f0,
      30px 15px 0 -15px #93d3d3;
  }
  to {
    transform: translate(-65px, -50px) rotateY(22deg);
    box-shadow:
      -10px 0 0 #a4e2e2,
      -15px 15px 20px -15px #c9f0f0,
      -30px 15px 0 -15px #93d3d3;
  }
}

@keyframes fan-stand-osc {
  from {
    transform: translateZ(-60px) rotateY(28deg);
  }
  to {
    transform: translateZ(-60px) rotateY(-28deg);
  }
}

/* Blade spin */
@keyframes fan-spin {
  from {
    transform: scale(0.9) translateZ(26px) rotate(0deg);
  }
  to {
    transform: scale(0.9) translateZ(26px) rotate(360deg);
  }
}

/* Controls */
.fan-controls {
  display: flex;
  gap: 6px;
  padding: 6px 14px 10px;
  justify-content: center;
}
.fan-speed-btn {
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--color-border);
  background: var(--color-surface-soft);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-ink-2);
  font-family: inherit;
  transition: all 0.2s;
}
.fan-speed-btn:hover {
  background: var(--color-surface);
  border-color: var(--color-ink-3);
}
.fan-speed-btn.active {
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
  color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-soft);
}
</style>
