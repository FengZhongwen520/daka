import { computed, onBeforeUnmount, onMounted, reactive, watch, type Ref } from 'vue'

export interface PhotoCropView {
  x: number
  y: number
  zoom: number
}

interface CropGeometry {
  imageWidth: number
  imageHeight: number
  overflowX: number
  overflowY: number
  offsetX: number
  offsetY: number
}

export function usePhotoCropGeometry(
  stageRef: Ref<HTMLElement | undefined>,
  view: () => PhotoCropView,
) {
  const stageSize = reactive({ width: 0, height: 0 })
  const naturalSize = reactive({ width: 0, height: 0 })
  let resizeObserver: ResizeObserver | undefined

  function measureStage() {
    const stage = stageRef.value
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    stageSize.width = rect.width
    stageSize.height = rect.height
  }

  function observeStage() {
    resizeObserver?.disconnect()
    if (!stageRef.value) return
    resizeObserver?.observe(stageRef.value)
    measureStage()
  }

  onMounted(() => {
    resizeObserver = new ResizeObserver(measureStage)
    observeStage()
  })

  watch(stageRef, observeStage, { flush: 'post' })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
  })

  const geometry = computed<CropGeometry>(() => {
    const stageWidth = stageSize.width
    const stageHeight = stageSize.height
    const imageWidth = naturalSize.width
    const imageHeight = naturalSize.height
    if (stageWidth <= 0 || stageHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
      return {
        imageWidth: 0,
        imageHeight: 0,
        overflowX: 0,
        overflowY: 0,
        offsetX: 0,
        offsetY: 0,
      }
    }

    const coverScale = Math.max(stageWidth / imageWidth, stageHeight / imageHeight)
    const zoom = Math.min(3, Math.max(1, view().zoom))
    const renderedWidth = imageWidth * coverScale * zoom
    const renderedHeight = imageHeight * coverScale * zoom
    const overflowX = Math.max(0, renderedWidth - stageWidth)
    const overflowY = Math.max(0, renderedHeight - stageHeight)
    const x = Math.min(100, Math.max(0, view().x))
    const y = Math.min(100, Math.max(0, view().y))

    return {
      imageWidth: renderedWidth,
      imageHeight: renderedHeight,
      overflowX,
      overflowY,
      offsetX: (x / 100 - 0.5) * overflowX,
      offsetY: (y / 100 - 0.5) * overflowY,
    }
  })

  const imageStyle = computed(() => {
    const current = geometry.value
    if (current.imageWidth <= 0 || current.imageHeight <= 0) {
      return {
        width: '100%',
        height: '100%',
        transform: 'translate3d(-50%, -50%, 0)',
      }
    }
    return {
      width: `${current.imageWidth}px`,
      height: `${current.imageHeight}px`,
      transform: `translate3d(calc(-50% + ${current.offsetX}px), calc(-50% + ${current.offsetY}px), 0)`,
    }
  })

  function onImageLoad(event: Event) {
    const image = event.currentTarget as HTMLImageElement
    naturalSize.width = image.naturalWidth
    naturalSize.height = image.naturalHeight
    measureStage()
  }

  return {
    imageStyle,
    overflowX: computed(() => geometry.value.overflowX),
    overflowY: computed(() => geometry.value.overflowY),
    onImageLoad,
  }
}
