import Dexie, { type Table } from 'dexie'
import type { Project, CheckIn, Photo, Memo, DiaryEntry, ExportData } from '../types'

export type BookmarkSource = 'custom' | 'imported'
export interface SiteItem {
  id?: number
  url: string
  title: string
  widgetId: number
  source?: BookmarkSource
  order?: number
  createdAt: Date
}
export interface WidgetInstance {
  id?: number
  type: string
  x: number
  y: number
  projectId: number
  zIndex?: number
}

class DakaDB extends Dexie {
  projects!: Table<Project, number>
  checkins!: Table<CheckIn, number>
  photos!: Table<Photo, number>
  memos!: Table<Memo, number>
  diaryEntries!: Table<DiaryEntry, number>
  sites!: Table<SiteItem, number>
  widgets!: Table<WidgetInstance, number>
  wallpaper!: Table<{ id?: number; dataUrl: string }, number>

  constructor() {
    super('daka')
    this.version(9).stores({
      projects: '++id, name',
      checkins: '++id, [projectId+date]',
      photos: '++id, position',
      memos: '++id, memoKey',
      diaryEntries: '++id, [widgetId+date], widgetId, date, updatedAt',
      sites: '++id, widgetId',
      widgets: '++id, type, projectId',
      wallpaper: '++id',
    })
  }
}

export const db = new DakaDB()

// Project CRUD
export async function getProjects(): Promise<Project[]> {
  return db.projects.toArray()
}

export async function addProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<number> {
  return db.projects.add({ ...project, createdAt: new Date() })
}

export async function updateProject(id: number, data: Partial<Project>): Promise<number> {
  return db.projects.update(id, data)
}

export async function deleteProject(id: number): Promise<void> {
  await db.checkins.where('projectId').equals(id).delete()
  await db.projects.delete(id)
}

// CheckIn CRUD
export async function getCheckIns(projectId: number, year: number, month: number): Promise<CheckIn[]> {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return db.checkins
    .where('projectId')
    .equals(projectId)
    .filter(c => c.date.startsWith(prefix))
    .toArray()
}

export async function toggleCheckIn(projectId: number, date: string): Promise<boolean> {
  const existing = await db.checkins.where({ projectId, date }).first()
  if (existing) {
    await db.checkins.delete(existing.id!)
    return false
  } else {
    await db.checkins.add({ projectId, date, createdAt: new Date() })
    return true
  }
}

// Photo CRUD
export async function getPhoto(key: string): Promise<Photo | null> {
  const photo = await db.photos.where('position').equals(key).first()
  return photo || null
}

export async function savePhoto(key: string, dataUrl: string): Promise<void> {
  const existing = await db.photos.where('position').equals(key).first()
  if (existing) {
    await db.photos.update(existing.id!, { dataUrl, createdAt: new Date() })
  } else {
    await db.photos.add({ position: key as any, dataUrl, createdAt: new Date() })
  }
}

export async function deletePhoto(key: string): Promise<void> {
  await db.photos.where('position').equals(key).delete()
}

// Memo CRUD
export async function getMemo(memoKey: string): Promise<Memo | null> {
  const memo = await db.memos.where('memoKey').equals(memoKey).first()
  return memo || null
}

export async function saveMemo(memoKey: string, data: Omit<Memo, 'id' | 'createdAt'>): Promise<void> {
  const existing = await db.memos.where('memoKey').equals(memoKey).first()
  if (existing) {
    await db.memos.update(existing.id!, { ...data, createdAt: new Date() })
  } else {
    await db.memos.add({ ...data, memoKey: memoKey as any, createdAt: new Date() })
  }
}

// Sites (bookmark grid)
export async function getSites(widgetId: number, source?: BookmarkSource): Promise<SiteItem[]> {
  const collection = db.sites.where('widgetId').equals(widgetId)
  let items = await (source
    ? collection.filter(site => (site.source ?? 'custom') === source).toArray()
    : collection.toArray())

  if (items.some(item => !Number.isInteger(item.order))) {
    items.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    items = items.map((item, order) => ({ ...item, order }))
    await db.sites.bulkPut(items)
  }

  return items.sort((a, b) => {
    const aOrder = Number.isInteger(a.order) ? a.order! : null
    const bOrder = Number.isInteger(b.order) ? b.order! : null
    if (aOrder != null && bOrder != null) return aOrder - bOrder || (a.id ?? 0) - (b.id ?? 0)
    if (aOrder != null) return -1
    if (bOrder != null) return 1
    return (a.id ?? 0) - (b.id ?? 0)
  })
}
async function nextSiteOrder(widgetId: number, source: BookmarkSource): Promise<number> {
  const items = await db.sites
    .where('widgetId')
    .equals(widgetId)
    .filter(site => (site.source ?? 'custom') === source)
    .toArray()
  return items.reduce((max, site) => Math.max(max, site.order ?? -1), -1) + 1
}
export async function addSiteItem(
  url: string,
  title: string,
  widgetId: number,
  source: BookmarkSource = 'custom',
): Promise<void> {
  const order = await nextSiteOrder(widgetId, source)
  await db.sites.add({ url, title, widgetId, source, order, createdAt: new Date() })
}
export async function addSiteItems(
  items: { url: string; title: string }[],
  widgetId: number,
  source: BookmarkSource = 'custom',
): Promise<void> {
  if (items.length === 0) return
  const createdAt = new Date()
  const startOrder = await nextSiteOrder(widgetId, source)
  await db.sites.bulkAdd(
    items.map((item, index) => ({
      ...item,
      widgetId,
      source,
      order: startOrder + index,
      createdAt,
    })),
  )
}
export async function updateSiteItem(id: number, data: Partial<Pick<SiteItem, 'url' | 'title'>>): Promise<void> {
  await db.sites.update(id, data)
}
export async function reorderSiteItems(items: SiteItem[]): Promise<void> {
  await db.transaction('rw', db.sites, async () => {
    for (const [order, item] of items.entries()) {
      if (item.id != null && item.order !== order) await db.sites.update(item.id, { order })
    }
  })
}
export async function removeSiteItem(id: number): Promise<void> {
  await db.sites.delete(id)
}
export async function clearSites(widgetId: number, source?: BookmarkSource): Promise<void> {
  const collection = db.sites.where('widgetId').equals(widgetId)
  await (source
    ? collection.filter(site => (site.source ?? 'custom') === source)
    : collection
  ).delete()
}

// Widget instances
export async function getWidgets(projectId: number): Promise<WidgetInstance[]> {
  return db.widgets.where('projectId').equals(projectId).toArray()
}
export async function addWidget(type: string, x: number, y: number, projectId: number): Promise<number> {
  return db.widgets.add({ type, x, y, projectId })
}
export async function removeWidget(id: number): Promise<void> {
  await db.widgets.delete(id)
}
export async function updateWidgetPos(id: number, x: number, y: number): Promise<void> {
  await db.widgets.update(id, { x, y })
}
export async function updateWidgetZ(id: number, zIndex: number): Promise<void> {
  await db.widgets.update(id, { zIndex })
}
export async function updateWidgetsLayout(items: WidgetInstance[]): Promise<void> {
  await db.transaction('rw', db.widgets, async () => {
    for (const item of items) {
      if (item.id != null) {
        await db.widgets.update(item.id, { x: item.x, y: item.y, zIndex: item.zIndex })
      }
    }
  })
}

// Wallpaper
export async function getWallpaper(): Promise<string> {
  const record = await db.wallpaper.toCollection().first()
  return record?.dataUrl || ''
}
export async function saveWallpaper(dataUrl: string): Promise<void> {
  await db.wallpaper.clear()
  if (dataUrl) await db.wallpaper.add({ dataUrl })
}

// Import / Export
export async function exportAll(): Promise<ExportData> {
  const projects = await db.projects.toArray()
  const checkins = await db.checkins.toArray()
  const photos = await db.photos.toArray()
  const memos = await db.memos.toArray()
  const diaryEntries = await db.diaryEntries.toArray()
  const sites = await db.sites.toArray()
  const widgets = await db.widgets.toArray()
  const wallpaperRows = await db.wallpaper.toArray()
  // Include all localStorage data
  const lsData: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) lsData[key] = localStorage.getItem(key) || ''
  }
  return { version: 3, exportedAt: new Date().toISOString(), projects, checkins, photos, memos, diaryEntries, sites, widgets, wallpaper: wallpaperRows, lsData }
}

export async function importAll(data: ExportData): Promise<void> {
  await Promise.all([
    db.checkins.clear(), db.projects.clear(), db.photos.clear(),
    db.memos.clear(), db.diaryEntries.clear(), db.sites.clear(), db.widgets.clear(), db.wallpaper.clear(),
  ])
  for (const p of data.projects) await db.projects.add(p)
  for (const c of data.checkins) await db.checkins.add(c)
  if (data.photos) for (const ph of data.photos) await db.photos.add(ph)
  if (data.memos) for (const m of data.memos) await db.memos.add(m)
  if (data.diaryEntries) for (const entry of data.diaryEntries) await db.diaryEntries.add(entry)
  if (data.sites) for (const s of data.sites) await db.sites.add(s)
  if (data.widgets) for (const w of data.widgets) await db.widgets.add(w)
  if (data.wallpaper) for (const wp of data.wallpaper) await db.wallpaper.add(wp)
  // Restore localStorage data
  if (data.lsData) {
    for (const [key, val] of Object.entries(data.lsData)) {
      try { localStorage.setItem(key, val) } catch { /* skip */ }
    }
  }
}
