import Dexie, { type Table } from 'dexie'
import type { Project, CheckIn, Photo, Memo, DiaryEntry, ExportData } from '../types'
import {
  clearItems,
  flushStorage,
  getAllItems,
  getItem,
  removeItem,
  setItem,
  storageMode,
} from '../storage'

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
export interface LocalPhotoAsset {
  id?: number
  localUrl: string
  position: string
  dataUrl: string
  createdAt: Date
}
export interface PhotoReference {
  id?: number
  position: string
  url: string
  createdAt: Date
}

class DakaDB extends Dexie {
  projects!: Table<Project, number>
  checkins!: Table<CheckIn, number>
  photos!: Table<Photo, number>
  localPhotoAssets!: Table<LocalPhotoAsset, number>
  memos!: Table<Memo, number>
  diaryEntries!: Table<DiaryEntry, number>
  sites!: Table<SiteItem, number>
  widgets!: Table<WidgetInstance, number>
  wallpaper!: Table<{ id?: number; dataUrl: string }, number>

  constructor() {
    super('daka')
    this.version(10).stores({
      projects: '++id, name',
      checkins: '++id, [projectId+date]',
      photos: '++id, position',
      localPhotoAssets: '++id, &localUrl, position, dataUrl',
      memos: '++id, memoKey',
      diaryEntries: '++id, [widgetId+date], widgetId, date, updatedAt',
      sites: '++id, widgetId',
      widgets: '++id, type, projectId',
      wallpaper: '++id',
    })
  }
}

export const db = new DakaDB()

const CLOUD_COLLECTIONS = {
  projects: 'domain:projects',
  checkins: 'domain:checkins',
  photos: 'domain:photo-refs',
  memos: 'domain:memos',
  diaryEntries: 'domain:diary-entries',
  sites: 'domain:sites',
  widgets: 'domain:widgets',
  wallpaper: 'domain:wallpaper',
} as const

function cloudCollection<T>(key: string): T[] {
  const raw = getItem(key)
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value as T[] : []
  } catch {
    return []
  }
}

function writeCloudCollection<T>(key: string, value: T[]): void {
  setItem(key, JSON.stringify(value))
}

function nextNumericId(items: Array<{ id?: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.id ?? 0), 0) + 1
}

// Project CRUD
export async function getProjects(): Promise<Project[]> {
  if (storageMode.value === 'cloud') return cloudCollection<Project>(CLOUD_COLLECTIONS.projects)
  return db.projects.toArray()
}

export async function addProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<number> {
  if (storageMode.value === 'cloud') {
    const projects = cloudCollection<Project>(CLOUD_COLLECTIONS.projects)
    const id = nextNumericId(projects)
    projects.push({ ...project, id, createdAt: new Date() })
    writeCloudCollection(CLOUD_COLLECTIONS.projects, projects)
    return id
  }
  return db.projects.add({ ...project, createdAt: new Date() })
}

export async function updateProject(id: number, data: Partial<Project>): Promise<number> {
  if (storageMode.value === 'cloud') {
    const projects = cloudCollection<Project>(CLOUD_COLLECTIONS.projects)
    const index = projects.findIndex(project => project.id === id)
    if (index < 0) return 0
    projects[index] = { ...projects[index], ...data, id }
    writeCloudCollection(CLOUD_COLLECTIONS.projects, projects)
    return 1
  }
  return db.projects.update(id, data)
}

export async function deleteProject(id: number): Promise<void> {
  if (storageMode.value === 'cloud') {
    writeCloudCollection(
      CLOUD_COLLECTIONS.projects,
      cloudCollection<Project>(CLOUD_COLLECTIONS.projects).filter(project => project.id !== id),
    )
    writeCloudCollection(
      CLOUD_COLLECTIONS.checkins,
      cloudCollection<CheckIn>(CLOUD_COLLECTIONS.checkins).filter(checkin => checkin.projectId !== id),
    )
    return
  }
  await db.checkins.where('projectId').equals(id).delete()
  await db.projects.delete(id)
}

// CheckIn CRUD
export async function getCheckIns(projectId: number, year: number, month: number): Promise<CheckIn[]> {
  if (storageMode.value === 'cloud') {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    return cloudCollection<CheckIn>(CLOUD_COLLECTIONS.checkins)
      .filter(checkin => checkin.projectId === projectId && checkin.date.startsWith(prefix))
  }
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return db.checkins
    .where('projectId')
    .equals(projectId)
    .filter(c => c.date.startsWith(prefix))
    .toArray()
}

export async function toggleCheckIn(projectId: number, date: string): Promise<boolean> {
  if (storageMode.value === 'cloud') {
    const checkins = cloudCollection<CheckIn>(CLOUD_COLLECTIONS.checkins)
    const index = checkins.findIndex(checkin => checkin.projectId === projectId && checkin.date === date)
    if (index >= 0) {
      checkins.splice(index, 1)
      writeCloudCollection(CLOUD_COLLECTIONS.checkins, checkins)
      return false
    }
    checkins.push({
      id: nextNumericId(checkins),
      projectId,
      date,
      createdAt: new Date(),
    })
    writeCloudCollection(CLOUD_COLLECTIONS.checkins, checkins)
    return true
  }
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
  if (storageMode.value === 'cloud') {
    const reference = cloudCollection<PhotoReference>(CLOUD_COLLECTIONS.photos)
      .find(photo => photo.position === key)
    if (!reference) return null
    const asset = await db.localPhotoAssets.where('localUrl').equals(reference.url).first()
    return asset ? {
      position: key,
      dataUrl: asset.dataUrl,
      url: reference.url,
      createdAt: reference.createdAt,
    } : {
      position: key,
      url: reference.url,
      createdAt: reference.createdAt,
    }
  }
  const photo = await db.photos.where('position').equals(key).first()
  return photo || null
}

export async function savePhoto(key: string, dataUrl: string): Promise<void> {
  if (storageMode.value === 'cloud') {
    const photos = await getPhotos(key)
    await savePhotos(key, photos.includes(dataUrl) ? photos : [...photos, dataUrl])
    return
  }
  const existing = await db.photos.where('position').equals(key).first()
  if (existing) {
    await db.photos.update(existing.id!, { dataUrl, createdAt: new Date() })
  } else {
    await db.photos.add({ position: key as any, dataUrl, createdAt: new Date() })
  }
}

export async function deletePhoto(key: string): Promise<void> {
  if (storageMode.value === 'cloud') {
    writeCloudCollection(
      CLOUD_COLLECTIONS.photos,
      cloudCollection<PhotoReference>(CLOUD_COLLECTIONS.photos).filter(photo => photo.position !== key),
    )
    await db.localPhotoAssets.where('position').equals(key).delete()
    return
  }
  await db.photos.where('position').equals(key).delete()
}

export async function getPhotos(key: string): Promise<string[]> {
  if (storageMode.value === 'cloud') {
    const references = cloudCollection<PhotoReference>(CLOUD_COLLECTIONS.photos)
      .filter(photo => photo.position === key)
    if (references.length === 0) return []
    const assets = await db.localPhotoAssets.where('position').equals(key).toArray()
    const dataByUrl = new Map(assets.map(asset => [asset.localUrl, asset.dataUrl]))
    return references
      .map(reference => dataByUrl.get(reference.url))
      .filter((url): url is string => Boolean(url))
  }
  return (await db.photos.where('position').equals(key).toArray())
    .map(photo => photo.dataUrl)
    .filter((url): url is string => Boolean(url))
}

export async function savePhotos(key: string, dataUrls: string[]): Promise<void> {
  if (storageMode.value === 'cloud') {
    const currentAssets = await db.localPhotoAssets.where('position').equals(key).toArray()
    const assetByData = new Map(currentAssets.map(asset => [asset.dataUrl, asset]))
    const updatedAssets: LocalPhotoAsset[] = []
    const references: PhotoReference[] = []
    for (const dataUrl of dataUrls) {
      let asset = assetByData.get(dataUrl)
      if (!asset) {
        const localUrl = `local-photo://${encodeURIComponent(key)}/${createLocalAssetId()}`
        asset = { localUrl, position: key, dataUrl, createdAt: new Date() }
      }
      updatedAssets.push(asset)
      references.push({
        position: key,
        url: asset.localUrl,
        createdAt: asset.createdAt,
      })
    }
    const keptUrls = new Set(updatedAssets.map(asset => asset.localUrl))
    const removedIds = currentAssets
      .filter(asset => !keptUrls.has(asset.localUrl) && asset.id != null)
      .map(asset => asset.id!)
    if (removedIds.length > 0) await db.localPhotoAssets.bulkDelete(removedIds)
    await db.localPhotoAssets.bulkPut(updatedAssets)
    const others = cloudCollection<PhotoReference>(CLOUD_COLLECTIONS.photos)
      .filter(photo => photo.position !== key)
    writeCloudCollection(CLOUD_COLLECTIONS.photos, [...others, ...references])
    return
  }
  await db.photos.where('position').equals(key).delete()
  for (const dataUrl of dataUrls) {
    await db.photos.add({ position: key, dataUrl, createdAt: new Date() })
  }
}

// Memo CRUD
export async function getMemo(memoKey: string): Promise<Memo | null> {
  if (storageMode.value === 'cloud') {
    return cloudCollection<Memo>(CLOUD_COLLECTIONS.memos)
      .find(memo => memo.memoKey === memoKey) || null
  }
  const memo = await db.memos.where('memoKey').equals(memoKey).first()
  return memo || null
}

export async function saveMemo(memoKey: string, data: Omit<Memo, 'id' | 'createdAt'>): Promise<void> {
  if (storageMode.value === 'cloud') {
    const memos = cloudCollection<Memo>(CLOUD_COLLECTIONS.memos)
    const existing = memos.find(memo => memo.memoKey === memoKey)
    if (existing) {
      Object.assign(existing, data, { createdAt: new Date() })
    } else {
      memos.push({ ...data, memoKey, id: nextNumericId(memos), createdAt: new Date() })
    }
    writeCloudCollection(CLOUD_COLLECTIONS.memos, memos)
    return
  }
  const existing = await db.memos.where('memoKey').equals(memoKey).first()
  if (existing) {
    await db.memos.update(existing.id!, { ...data, createdAt: new Date() })
  } else {
    await db.memos.add({ ...data, memoKey: memoKey as any, createdAt: new Date() })
  }
}

// Sites (bookmark grid)
export async function getSites(widgetId: number, source?: BookmarkSource): Promise<SiteItem[]> {
  if (storageMode.value === 'cloud') {
    const items = cloudCollection<SiteItem>(CLOUD_COLLECTIONS.sites)
      .filter(site => site.widgetId === widgetId && (!source || (site.source ?? 'custom') === source))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.id ?? 0) - (b.id ?? 0))
    return items
  }
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
  if (storageMode.value === 'cloud') {
    const items = cloudCollection<SiteItem>(CLOUD_COLLECTIONS.sites)
    const order = items
      .filter(site => site.widgetId === widgetId && (site.source ?? 'custom') === source)
      .reduce((max, site) => Math.max(max, site.order ?? -1), -1) + 1
    items.push({
      id: nextNumericId(items),
      url,
      title,
      widgetId,
      source,
      order,
      createdAt: new Date(),
    })
    writeCloudCollection(CLOUD_COLLECTIONS.sites, items)
    return
  }
  const order = await nextSiteOrder(widgetId, source)
  await db.sites.add({ url, title, widgetId, source, order, createdAt: new Date() })
}
export async function addSiteItems(
  items: { url: string; title: string }[],
  widgetId: number,
  source: BookmarkSource = 'custom',
): Promise<void> {
  if (items.length === 0) return
  if (storageMode.value === 'cloud') {
    const sites = cloudCollection<SiteItem>(CLOUD_COLLECTIONS.sites)
    let nextId = nextNumericId(sites)
    let order = sites
      .filter(site => site.widgetId === widgetId && (site.source ?? 'custom') === source)
      .reduce((max, site) => Math.max(max, site.order ?? -1), -1) + 1
    const createdAt = new Date()
    for (const item of items) {
      sites.push({
        ...item,
        id: nextId++,
        widgetId,
        source,
        order: order++,
        createdAt,
      })
    }
    writeCloudCollection(CLOUD_COLLECTIONS.sites, sites)
    return
  }
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
  if (storageMode.value === 'cloud') {
    const sites = cloudCollection<SiteItem>(CLOUD_COLLECTIONS.sites)
    const site = sites.find(item => item.id === id)
    if (site) Object.assign(site, data)
    writeCloudCollection(CLOUD_COLLECTIONS.sites, sites)
    return
  }
  await db.sites.update(id, data)
}
export async function reorderSiteItems(items: SiteItem[]): Promise<void> {
  if (storageMode.value === 'cloud') {
    const sites = cloudCollection<SiteItem>(CLOUD_COLLECTIONS.sites)
    const byId = new Map(items.map((item, order) => [item.id, order]))
    for (const site of sites) {
      const order = byId.get(site.id)
      if (order != null) site.order = order
    }
    writeCloudCollection(CLOUD_COLLECTIONS.sites, sites)
    return
  }
  await db.transaction('rw', db.sites, async () => {
    for (const [order, item] of items.entries()) {
      if (item.id != null && item.order !== order) await db.sites.update(item.id, { order })
    }
  })
}
export async function removeSiteItem(id: number): Promise<void> {
  if (storageMode.value === 'cloud') {
    writeCloudCollection(
      CLOUD_COLLECTIONS.sites,
      cloudCollection<SiteItem>(CLOUD_COLLECTIONS.sites).filter(site => site.id !== id),
    )
    return
  }
  await db.sites.delete(id)
}
export async function clearSites(widgetId: number, source?: BookmarkSource): Promise<void> {
  if (storageMode.value === 'cloud') {
    writeCloudCollection(
      CLOUD_COLLECTIONS.sites,
      cloudCollection<SiteItem>(CLOUD_COLLECTIONS.sites)
        .filter(site => site.widgetId !== widgetId || (source && (site.source ?? 'custom') !== source)),
    )
    return
  }
  const collection = db.sites.where('widgetId').equals(widgetId)
  await (source
    ? collection.filter(site => (site.source ?? 'custom') === source)
    : collection
  ).delete()
}

// Widget instances
export async function getWidgets(projectId: number): Promise<WidgetInstance[]> {
  if (storageMode.value === 'cloud') {
    return cloudCollection<WidgetInstance>(CLOUD_COLLECTIONS.widgets)
      .filter(widget => widget.projectId === projectId)
  }
  return db.widgets.where('projectId').equals(projectId).toArray()
}
export async function addWidget(type: string, x: number, y: number, projectId: number): Promise<number> {
  if (storageMode.value === 'cloud') {
    const widgets = cloudCollection<WidgetInstance>(CLOUD_COLLECTIONS.widgets)
    const id = nextNumericId(widgets)
    widgets.push({ id, type, x, y, projectId })
    writeCloudCollection(CLOUD_COLLECTIONS.widgets, widgets)
    return id
  }
  return db.widgets.add({ type, x, y, projectId })
}
export async function removeWidget(id: number): Promise<void> {
  if (storageMode.value === 'cloud') {
    writeCloudCollection(
      CLOUD_COLLECTIONS.widgets,
      cloudCollection<WidgetInstance>(CLOUD_COLLECTIONS.widgets).filter(widget => widget.id !== id),
    )
    return
  }
  await db.widgets.delete(id)
}
export async function updateWidgetPos(id: number, x: number, y: number): Promise<void> {
  if (storageMode.value === 'cloud') {
    const widgets = cloudCollection<WidgetInstance>(CLOUD_COLLECTIONS.widgets)
    const widget = widgets.find(item => item.id === id)
    if (widget) Object.assign(widget, { x, y })
    writeCloudCollection(CLOUD_COLLECTIONS.widgets, widgets)
    return
  }
  await db.widgets.update(id, { x, y })
}
export async function updateWidgetZ(id: number, zIndex: number): Promise<void> {
  if (storageMode.value === 'cloud') {
    const widgets = cloudCollection<WidgetInstance>(CLOUD_COLLECTIONS.widgets)
    const widget = widgets.find(item => item.id === id)
    if (widget) widget.zIndex = zIndex
    writeCloudCollection(CLOUD_COLLECTIONS.widgets, widgets)
    return
  }
  await db.widgets.update(id, { zIndex })
}
export async function updateWidgetsLayout(items: WidgetInstance[]): Promise<void> {
  if (storageMode.value === 'cloud') {
    const widgets = cloudCollection<WidgetInstance>(CLOUD_COLLECTIONS.widgets)
    const byId = new Map(items.map(item => [item.id, item]))
    for (const widget of widgets) {
      const update = byId.get(widget.id)
      if (update) Object.assign(widget, { x: update.x, y: update.y, zIndex: update.zIndex })
    }
    writeCloudCollection(CLOUD_COLLECTIONS.widgets, widgets)
    return
  }
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
  if (storageMode.value === 'cloud') {
    return getItem('domain:wallpaper-value') || ''
  }
  const record = await db.wallpaper.toCollection().first()
  return record?.dataUrl || ''
}
export async function saveWallpaper(dataUrl: string): Promise<void> {
  if (storageMode.value === 'cloud') {
    if (dataUrl) setItem('domain:wallpaper-value', dataUrl)
    else removeItem('domain:wallpaper-value')
    return
  }
  await db.wallpaper.clear()
  if (dataUrl) await db.wallpaper.add({ dataUrl })
}

// Diary CRUD
export async function getDiaryEntries(widgetId: number): Promise<DiaryEntry[]> {
  if (storageMode.value === 'cloud') {
    return cloudCollection<DiaryEntry>(CLOUD_COLLECTIONS.diaryEntries)
      .filter(entry => entry.widgetId === widgetId)
  }
  return db.diaryEntries.where('widgetId').equals(widgetId).toArray()
}

export async function getDiaryEntry(widgetId: number, date: string): Promise<DiaryEntry | null> {
  if (storageMode.value === 'cloud') {
    return cloudCollection<DiaryEntry>(CLOUD_COLLECTIONS.diaryEntries)
      .find(entry => entry.widgetId === widgetId && entry.date === date) || null
  }
  return await db.diaryEntries.where({ widgetId, date }).first() || null
}

export async function saveDiaryEntry(
  id: number | undefined,
  data: Omit<DiaryEntry, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<number> {
  if (storageMode.value === 'cloud') {
    const entries = cloudCollection<DiaryEntry>(CLOUD_COLLECTIONS.diaryEntries)
    const existing = id != null
      ? entries.find(entry => entry.id === id)
      : entries.find(entry => entry.widgetId === data.widgetId && entry.date === data.date)
    if (existing) {
      Object.assign(existing, data, { updatedAt: new Date() })
      writeCloudCollection(CLOUD_COLLECTIONS.diaryEntries, entries)
      return existing.id ?? 0
    }
    const nextId = nextNumericId(entries)
    entries.push({ ...data, id: nextId, createdAt: new Date(), updatedAt: new Date() })
    writeCloudCollection(CLOUD_COLLECTIONS.diaryEntries, entries)
    return nextId
  }
  const now = new Date()
  const existing = id != null
    ? await db.diaryEntries.get(id)
    : await db.diaryEntries.where({ widgetId: data.widgetId, date: data.date }).first()
  if (existing?.id != null) {
    await db.diaryEntries.update(existing.id, { ...data, updatedAt: now })
    return existing.id
  }
  return db.diaryEntries.add({ ...data, createdAt: now, updatedAt: now })
}

export async function deleteDiaryEntry(id: number): Promise<void> {
  if (storageMode.value === 'cloud') {
    writeCloudCollection(
      CLOUD_COLLECTIONS.diaryEntries,
      cloudCollection<DiaryEntry>(CLOUD_COLLECTIONS.diaryEntries)
        .filter(entry => entry.id !== id),
    )
    return
  }
  await db.diaryEntries.delete(id)
}

// Import / Export
export async function exportAll(): Promise<ExportData> {
  const projects = storageMode.value === 'cloud'
    ? cloudCollection<Project>(CLOUD_COLLECTIONS.projects)
    : await db.projects.toArray()
  const checkins = storageMode.value === 'cloud'
    ? cloudCollection<CheckIn>(CLOUD_COLLECTIONS.checkins)
    : await db.checkins.toArray()
  const photos = storageMode.value === 'cloud'
    ? cloudCollection<PhotoReference>(CLOUD_COLLECTIONS.photos)
    : await db.photos.toArray()
  const memos = storageMode.value === 'cloud'
    ? cloudCollection<Memo>(CLOUD_COLLECTIONS.memos)
    : await db.memos.toArray()
  const diaryEntries = storageMode.value === 'cloud'
    ? cloudCollection<DiaryEntry>(CLOUD_COLLECTIONS.diaryEntries)
    : await db.diaryEntries.toArray()
  const sites = storageMode.value === 'cloud'
    ? cloudCollection<SiteItem>(CLOUD_COLLECTIONS.sites)
    : await db.sites.toArray()
  const widgets = storageMode.value === 'cloud'
    ? cloudCollection<WidgetInstance>(CLOUD_COLLECTIONS.widgets)
    : await db.widgets.toArray()
  const wallpaperRows = storageMode.value === 'cloud'
    ? [{ dataUrl: getItem('domain:wallpaper-value') || '' }]
    : await db.wallpaper.toArray()
  const lsData = getAllItems()
  return { version: 3, exportedAt: new Date().toISOString(), projects, checkins, photos, memos, diaryEntries, sites, widgets, wallpaper: wallpaperRows, lsData }
}

export async function importAll(data: ExportData): Promise<void> {
  await clearAllData()
  await Promise.all([
    storageMode.value === 'cloud' ? Promise.resolve() : db.checkins.clear(),
    storageMode.value === 'cloud' ? Promise.resolve() : db.projects.clear(),
    storageMode.value === 'cloud' ? Promise.resolve() : db.photos.clear(),
    storageMode.value === 'cloud' ? Promise.resolve() : db.memos.clear(),
    storageMode.value === 'cloud' ? Promise.resolve() : db.diaryEntries.clear(),
    storageMode.value === 'cloud' ? Promise.resolve() : db.sites.clear(),
    storageMode.value === 'cloud' ? Promise.resolve() : db.widgets.clear(),
    storageMode.value === 'cloud' ? Promise.resolve() : db.wallpaper.clear(),
  ])
  if (storageMode.value === 'cloud') {
    writeCloudCollection(CLOUD_COLLECTIONS.projects, data.projects)
    writeCloudCollection(CLOUD_COLLECTIONS.checkins, data.checkins)
    writeCloudCollection(CLOUD_COLLECTIONS.photos, data.photos || [])
    writeCloudCollection(CLOUD_COLLECTIONS.memos, data.memos || [])
    writeCloudCollection(CLOUD_COLLECTIONS.diaryEntries, data.diaryEntries || [])
    writeCloudCollection(CLOUD_COLLECTIONS.sites, data.sites || [])
    writeCloudCollection(CLOUD_COLLECTIONS.widgets, data.widgets || [])
    const wallpaper = data.wallpaper?.[0]?.dataUrl
    if (wallpaper) setItem('domain:wallpaper-value', wallpaper)
  } else {
    for (const p of data.projects) await db.projects.add(p)
    for (const c of data.checkins) await db.checkins.add(c)
    if (data.photos) {
      for (const photo of data.photos) {
        if (photo.dataUrl) await db.photos.add(photo as Photo)
      }
    }
    if (data.memos) for (const m of data.memos) await db.memos.add(m)
    if (data.diaryEntries) for (const entry of data.diaryEntries) await db.diaryEntries.add(entry)
    if (data.sites) for (const s of data.sites) await db.sites.add(s)
    if (data.widgets) for (const w of data.widgets) await db.widgets.add(w)
    if (data.wallpaper) for (const wp of data.wallpaper) await db.wallpaper.add(wp)
  }
  if (data.lsData) {
    for (const [key, val] of Object.entries(data.lsData)) {
      setItem(key, val)
    }
  }
  if (storageMode.value === 'cloud') await flushStorage()
}

export async function clearAllData(): Promise<void> {
  clearItems()
  if (storageMode.value === 'cloud') {
    await db.localPhotoAssets.clear()
    await flushStorage()
    return
  }
  await Promise.all([
    db.projects.clear(),
    db.checkins.clear(),
    db.photos.clear(),
    db.localPhotoAssets.clear(),
    db.memos.clear(),
    db.diaryEntries.clear(),
    db.sites.clear(),
    db.widgets.clear(),
    db.wallpaper.clear(),
  ])
}

function createLocalAssetId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
