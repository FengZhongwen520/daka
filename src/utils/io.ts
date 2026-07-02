import { exportAll, importAll } from '../db'
import type { ExportData } from '../types'

export function downloadJSON(data: ExportData, filename?: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `daka-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function readJSONFile(file: File): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as ExportData
        if (!data.version || !Array.isArray(data.projects) || !Array.isArray(data.checkins)) {
          throw new Error('无效的数据格式')
        }
        resolve(data)
      } catch (e) {
        reject(new Error('文件解析失败，请检查文件格式'))
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file)
  })
}

export async function handleExport(): Promise<void> {
  try {
    const data = await exportAll()
    downloadJSON(data)
  } catch (e) {
    console.error('Export failed:', e)
    alert('导出失败')
  }
}

export async function handleImport(file: File): Promise<void> {
  try {
    const data = await readJSONFile(file)
    await importAll(data)
  } catch (e) {
    throw e
  }
}
