import { db, type PhotoReference, type SiteItem, type WidgetInstance } from '../db'
import type { CheckIn, DiaryEntry, Memo, Photo, Project } from '../types'
import {
  getCloudToken,
  getLocalItems,
  removeLocalItem,
  setLocalItem,
} from '../storage'
import { deleteRecord, loadRecords, putRecord } from '../storage/api'

export type SyncDirection = 'local-to-cloud' | 'cloud-to-local'
export type SyncStrategy = 'overwrite' | 'append'

export interface ProjectSummary {
  id: number
  name: string
  source: 'local' | 'cloud'
}

export interface ProjectSyncOptions {
  direction: SyncDirection
  projectIds: number[]
  strategy: SyncStrategy
}

export interface ProjectSyncResult {
  projects: number
  widgets: number
  records: number
  skippedPhotos: number
}

interface ProjectBundle {
  project: Project
  widgets: WidgetInstance[]
  records: Record<string, string>
  checkins: CheckIn[]
  memos: Memo[]
  diaryEntries: DiaryEntry[]
  sites: SiteItem[]
  photoRefs: PhotoReference[]
}

const DOMAIN_KEYS = new Set([
  'domain:projects',
  'domain:widgets',
  'domain:checkins',
  'domain:memos',
  'domain:diary-entries',
  'domain:sites',
  'domain:photo-refs',
])

export async function getProjectSyncCatalog(): Promise<{
  local: ProjectSummary[]
  cloud: ProjectSummary[]
}> {
  const token = requireToken()
  const [localProjects, cloudRecords] = await Promise.all([
    db.projects.toArray(),
    loadRecords(token),
  ])
  const cloudProjects = parseRecordArray<Project>(cloudRecords, 'domain:projects')
  return {
    local: localProjects
      .filter(project => project.id != null)
      .map(project => ({ id: project.id!, name: project.name, source: 'local' })),
    cloud: cloudProjects
      .filter(project => project.id != null)
      .map(project => ({ id: project.id!, name: project.name, source: 'cloud' })),
  }
}

export async function syncProjects(options: ProjectSyncOptions): Promise<ProjectSyncResult> {
  if (options.projectIds.length === 0) return emptyResult()
  const token = requireToken()
  if (options.direction === 'local-to-cloud') {
    return syncLocalToCloud(token, options)
  }
  return syncCloudToLocal(token, options)
}

async function syncLocalToCloud(
  token: string,
  options: ProjectSyncOptions,
): Promise<ProjectSyncResult> {
  const [localBundles, cloudRecords] = await Promise.all([
    buildLocalBundles(options.projectIds),
    loadRecords(token),
  ])
  const recordMap = new Map(cloudRecords.map(record => [record.key, record.value]))
  const projects = parseRecordArray<Project>(cloudRecords, 'domain:projects')
  const widgets = parseRecordArray<WidgetInstance>(cloudRecords, 'domain:widgets')
  const usedWidgetIds = new Set(widgets.map(widget => widget.id).filter((id): id is number => id != null))
  const checkins = parseRecordArray<CheckIn>(cloudRecords, 'domain:checkins')
  const memos = parseRecordArray<Memo>(cloudRecords, 'domain:memos')
  const diaryEntries = parseRecordArray<DiaryEntry>(cloudRecords, 'domain:diary-entries')
  const sites = parseRecordArray<SiteItem>(cloudRecords, 'domain:sites')
  const photoRefs = parseRecordArray<PhotoReference>(cloudRecords, 'domain:photo-refs')
  const removedKeys = new Set<string>()
  let widgetCount = 0
  let recordCount = 0

  let nextProjectId = nextId(projects)
  let nextWidgetId = nextId(widgets)
  let nextCheckinId = nextId(checkins)
  let nextMemoId = nextId(memos)
  let nextDiaryId = nextId(diaryEntries)
  let nextSiteId = nextId(sites)

  for (const bundle of localBundles) {
    const sourceProjectId = bundle.project.id!
    const conflict = projects.some(project => project.id === sourceProjectId)
    const targetProjectId = options.strategy === 'overwrite' && conflict
      ? sourceProjectId
      : nextProjectId++
    const oldWidgets = widgets.filter(widget => widget.projectId === targetProjectId)

    if (options.strategy === 'overwrite' && conflict) {
      removeCloudProjectData(
        targetProjectId,
        oldWidgets,
        widgets,
        checkins,
        memos,
        diaryEntries,
        sites,
        photoRefs,
        recordMap,
        removedKeys,
      )
    }

    const widgetMap = new Map<number, number>()
    for (const widget of bundle.widgets) {
      if (widget.id == null) continue
      const targetWidgetId = options.strategy === 'append'
        || conflict
        || usedWidgetIds.has(widget.id)
        ? nextWidgetId++
        : widget.id
      usedWidgetIds.add(targetWidgetId)
      widgetMap.set(widget.id, targetWidgetId)
      widgets.push({
        ...widget,
        id: targetWidgetId,
        projectId: targetProjectId,
      })
      widgetCount += 1
    }

    const project: Project = { ...bundle.project, id: targetProjectId }
    const projectIndex = projects.findIndex(item => item.id === targetProjectId)
    if (projectIndex >= 0) projects[projectIndex] = project
    else projects.push(project)

    for (const [key, value] of Object.entries(bundle.records)) {
      const targetKey = remapKey(key, sourceProjectId, targetProjectId, widgetMap)
      recordMap.set(targetKey, value)
      recordCount += 1
    }
    const cacheKey = `widgets-cache-${targetProjectId}`
    recordMap.set(cacheKey, JSON.stringify(widgets.filter(widget => widget.projectId === targetProjectId)))

    checkins.push(...bundle.checkins.map(item => ({
      ...item,
      id: nextCheckinId++,
      projectId: targetProjectId,
    })))
    memos.push(...bundle.memos.map(item => ({
      ...item,
      id: nextMemoId++,
      memoKey: remapWidgetKey(item.memoKey, widgetMap),
    })))
    diaryEntries.push(...bundle.diaryEntries.map(item => ({
      ...item,
      id: nextDiaryId++,
      widgetId: remapWidget(item.widgetId, widgetMap),
    })))
    sites.push(...bundle.sites.map(item => ({
      ...item,
      id: nextSiteId++,
      widgetId: remapWidget(item.widgetId, widgetMap),
    })))
    photoRefs.push(...bundle.photoRefs.map(item => ({
      ...item,
      position: remapWidgetKey(item.position, widgetMap),
    })))
  }

  recordMap.set('domain:projects', JSON.stringify(projects))
  recordMap.set('domain:widgets', JSON.stringify(widgets))
  recordMap.set('domain:checkins', JSON.stringify(checkins))
  recordMap.set('domain:memos', JSON.stringify(memos))
  recordMap.set('domain:diary-entries', JSON.stringify(diaryEntries))
  recordMap.set('domain:sites', JSON.stringify(sites))
  recordMap.set('domain:photo-refs', JSON.stringify(photoRefs))

  for (const key of removedKeys) {
    recordMap.delete(key)
    await deleteRecord(token, key)
  }
  for (const [key, value] of recordMap) {
    await putRecord(token, key, value)
  }

  return {
    projects: localBundles.length,
    widgets: widgetCount,
    records: recordCount,
    skippedPhotos: 0,
  }
}

async function syncCloudToLocal(
  token: string,
  options: ProjectSyncOptions,
): Promise<ProjectSyncResult> {
  const [cloudRecords, localProjects, localWidgets] = await Promise.all([
    loadRecords(token),
    db.projects.toArray(),
    db.widgets.toArray(),
  ])
  const allCloud = new Map(cloudRecords.map(record => [record.key, record.value]))
  const cloudProjects = parseRecordArray<Project>(cloudRecords, 'domain:projects')
  const cloudWidgets = parseRecordArray<WidgetInstance>(cloudRecords, 'domain:widgets')
  const cloudCheckins = parseRecordArray<CheckIn>(cloudRecords, 'domain:checkins')
  const cloudMemos = parseRecordArray<Memo>(cloudRecords, 'domain:memos')
  const cloudDiary = parseRecordArray<DiaryEntry>(cloudRecords, 'domain:diary-entries')
  const cloudSites = parseRecordArray<SiteItem>(cloudRecords, 'domain:sites')
  const cloudPhotoRefs = parseRecordArray<PhotoReference>(cloudRecords, 'domain:photo-refs')
  const localKv = getLocalItems()

  let nextProjectId = nextId(localProjects)
  let nextWidgetId = nextId(localWidgets)
  const usedWidgetIds = new Set(
    localWidgets.map(widget => widget.id).filter((id): id is number => id != null),
  )
  let projectCount = 0
  let widgetCount = 0
  let recordCount = 0
  let skippedPhotos = 0

  let nextCheckinId = nextId(await db.checkins.toArray())
  let nextMemoId = nextId(await db.memos.toArray())
  let nextDiaryId = nextId(await db.diaryEntries.toArray())
  let nextSiteId = nextId(await db.sites.toArray())

  for (const sourceProject of cloudProjects) {
    if (sourceProject.id == null || !options.projectIds.includes(sourceProject.id)) continue
    const sourceProjectId = sourceProject.id
    const sourceWidgets = cloudWidgets.filter(widget => widget.projectId === sourceProjectId)
    const conflict = localProjects.some(project => project.id === sourceProjectId)
    const targetProjectId = options.strategy === 'overwrite' && conflict
      ? sourceProjectId
      : nextProjectId++
    const widgetMap = new Map<number, number>()

    const oldWidgets = localWidgets.filter(widget => widget.projectId === targetProjectId)
    if (options.strategy === 'overwrite' && conflict) {
      await removeLocalProjectData(targetProjectId, oldWidgets)
    }

    for (const widget of sourceWidgets) {
      if (widget.id == null) continue
      const targetWidgetId = options.strategy === 'append'
        || conflict
        || usedWidgetIds.has(widget.id)
        ? nextWidgetId++
        : widget.id
      usedWidgetIds.add(targetWidgetId)
      widgetMap.set(widget.id, targetWidgetId)
      await db.widgets.put({
        ...widget,
        id: targetWidgetId,
        projectId: targetProjectId,
      })
      widgetCount += 1
    }
    await db.projects.put({ ...sourceProject, id: targetProjectId })
    projectCount += 1

    for (const key of Object.keys(localKv)) {
      if (keyBelongsToWidget(
        key,
        sourceProjectId,
        new Set(sourceWidgets.map(widget => widget.id).filter((id): id is number => id != null)),
      )) {
        removeLocalItem(key)
      }
    }
    for (const [key, value] of allCloud) {
      if (DOMAIN_KEYS.has(key)) continue
      if (!keyBelongsToWidget(
        key,
        sourceProjectId,
        new Set(sourceWidgets.map(widget => widget.id).filter((id): id is number => id != null)),
      )) continue
      setLocalItem(remapKey(key, sourceProjectId, targetProjectId, widgetMap), value)
      recordCount += 1
    }

    const projectCheckins = cloudCheckins.filter(item => item.projectId === sourceProjectId)
    for (const item of projectCheckins) {
      await db.checkins.put({ ...item, id: nextCheckinId++, projectId: targetProjectId })
    }
    const projectMemos = cloudMemos.filter(item => (
      sourceWidgets.some(widget => item.memoKey === `memo-${widget.id}`)
    ))
    for (const item of projectMemos) {
      await db.memos.put({
        ...item,
        id: nextMemoId++,
        memoKey: remapWidgetKey(item.memoKey, widgetMap),
      })
    }
    for (const item of cloudDiary.filter(item => (
      sourceWidgets.some(widget => item.widgetId === widget.id)
    ))) {
      await db.diaryEntries.put({
        ...item,
        id: nextDiaryId++,
        widgetId: remapWidget(item.widgetId, widgetMap),
      })
    }
    for (const item of cloudSites.filter(item => (
      sourceWidgets.some(widget => item.widgetId === widget.id)
    ))) {
      await db.sites.put({
        ...item,
        id: nextSiteId++,
        widgetId: remapWidget(item.widgetId, widgetMap),
      })
    }
    skippedPhotos += cloudPhotoRefs.filter(item => (
      sourceWidgets.some(widget => item.position === `photo-${widget.id}`)
    )).length
  }

  return {
    projects: projectCount,
    widgets: widgetCount,
    records: recordCount,
    skippedPhotos,
  }
}

async function buildLocalBundles(projectIds: number[]): Promise<ProjectBundle[]> {
  const [projects, widgets, checkins, memos, diaryEntries, sites, photos] = await Promise.all([
    db.projects.toArray(),
    db.widgets.toArray(),
    db.checkins.toArray(),
    db.memos.toArray(),
    db.diaryEntries.toArray(),
    db.sites.toArray(),
    db.photos.toArray(),
  ])
  const allKv = getLocalItems()
  const bundles: ProjectBundle[] = []

  for (const project of projects) {
    if (project.id == null || !projectIds.includes(project.id)) continue
    const projectWidgets = widgets.filter(widget => widget.projectId === project.id)
    const widgetIds = new Set(projectWidgets.map(widget => widget.id!).filter(Boolean))
    const records = Object.fromEntries(
      Object.entries(allKv).filter(([key]) => (
        key === `widgets-cache-${project.id}` || keyBelongsToWidget(key, project.id!, widgetIds)
      )),
    )
    const photoRefs = await createLocalPhotoReferences(photos, projectWidgets)
    bundles.push({
      project,
      widgets: projectWidgets,
      records,
      checkins: checkins.filter(item => item.projectId === project.id),
      memos: memos.filter(item => widgetIds.has(Number(item.memoKey.replace(/^memo-/, '')))),
      diaryEntries: diaryEntries.filter(item => widgetIds.has(item.widgetId)),
      sites: sites.filter(item => widgetIds.has(item.widgetId)),
      photoRefs,
    })
  }
  return bundles
}

async function createLocalPhotoReferences(
  photos: Photo[],
  widgets: WidgetInstance[],
): Promise<PhotoReference[]> {
  const widgetIds = new Set(widgets.map(widget => widget.id).filter((id): id is number => id != null))
  const refs: PhotoReference[] = []
  for (const photo of photos) {
    const matchedId = Array.from(widgetIds).find(id => photo.position === `photo-${id}`)
    if (matchedId == null || !photo.dataUrl) continue
    const existingAsset = await db.localPhotoAssets
      .where('dataUrl')
      .equals(photo.dataUrl)
      .filter(asset => asset.position === photo.position)
      .first()
    const asset = existingAsset || {
      localUrl: `local-photo://${encodeURIComponent(photo.position)}/${createId()}`,
      position: photo.position,
      dataUrl: photo.dataUrl,
      createdAt: photo.createdAt || new Date(),
    }
    if (!existingAsset) await db.localPhotoAssets.add(asset)
    refs.push({
      position: photo.position,
      url: asset.localUrl,
      createdAt: asset.createdAt,
    })
  }
  return refs
}

async function removeLocalProjectData(projectId: number, widgets: WidgetInstance[]): Promise<void> {
  const widgetIds = new Set(widgets.map(widget => widget.id).filter((id): id is number => id != null))
  await db.widgets.where('projectId').equals(projectId).delete()
  await db.checkins.where('projectId').equals(projectId).delete()
  for (const widgetId of widgetIds) {
    await db.memos.where('memoKey').equals(`memo-${widgetId}`).delete()
    await db.diaryEntries.where('widgetId').equals(widgetId).delete()
    await db.sites.where('widgetId').equals(widgetId).delete()
    await db.photos.where('position').equals(`photo-${widgetId}`).delete()
  }
  for (const key of Object.keys(getLocalItems())) {
    if (key === `widgets-cache-${projectId}` || keyBelongsToWidget(key, projectId, widgetIds)) {
      removeLocalItem(key)
    }
  }
}

function removeCloudProjectData(
  projectId: number,
  oldWidgets: WidgetInstance[],
  widgets: WidgetInstance[],
  checkins: CheckIn[],
  memos: Memo[],
  diaryEntries: DiaryEntry[],
  sites: SiteItem[],
  photoRefs: PhotoReference[],
  recordMap: Map<string, string>,
  removedKeys: Set<string>,
) {
  const widgetIds = new Set(oldWidgets.map(widget => widget.id).filter((id): id is number => id != null))
  removeWhereInPlace(widgets, widget => widget.projectId === projectId)
  removeWhereInPlace(checkins, item => item.projectId === projectId)
  removeWhereInPlace(memos, item => widgetIds.has(Number(item.memoKey.replace(/^memo-/, ''))))
  removeWhereInPlace(diaryEntries, item => widgetIds.has(item.widgetId))
  removeWhereInPlace(sites, item => widgetIds.has(item.widgetId))
  removeWhereInPlace(photoRefs, item => (
    Array.from(widgetIds).some(id => item.position === `photo-${id}`)
  ))
  for (const key of recordMap.keys()) {
    if (key === `widgets-cache-${projectId}` || keyBelongsToWidget(key, projectId, widgetIds)) {
      removedKeys.add(key)
    }
  }
}

function keyBelongsToWidget(key: string, projectId: number, widgetIds: Set<number>): boolean {
  if (key === `widgets-cache-${projectId}` || key === `widget-layout-${projectId}`) return true
  for (const widgetId of widgetIds) {
    if (new RegExp(`(?:^|[-:])${widgetId}(?:$|[-:])`).test(key)) return true
  }
  return false
}

function remapKey(
  key: string,
  sourceProjectId: number,
  targetProjectId: number,
  widgetMap: Map<number, number>,
): string {
  if (key === `widgets-cache-${sourceProjectId}`) return `widgets-cache-${targetProjectId}`
  return remapWidgetKey(key, widgetMap)
}

function remapWidgetKey(key: string, widgetMap: Map<number, number>): string {
  const sourceIds = [...widgetMap.keys()]
    .sort((left, right) => String(right).length - String(left).length)
  if (sourceIds.length === 0) return key
  return key.replace(
    new RegExp(`(^|[-:])(${sourceIds.join('|')})(?=$|[-:])`, 'g'),
    (_, prefix: string, sourceId: string) => {
      return prefix + (widgetMap.get(Number(sourceId)) ?? sourceId)
    },
  )
}

function remapWidget(id: number, widgetMap: Map<number, number>): number {
  return widgetMap.get(id) ?? id
}

function parseRecordArray<T>(records: { key: string; value: string }[], key: string): T[] {
  const raw = records.find(record => record.key === key)?.value
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value as T[] : []
  } catch {
    return []
  }
}

function nextId(items: Array<{ id?: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.id ?? 0), 0) + 1
}

function removeWhereInPlace<T>(items: T[], predicate: (item: T) => boolean): void {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) items.splice(index, 1)
  }
}

function requireToken(): string {
  const token = getCloudToken()
  if (!token) throw new Error('项目同步需要先登录云端账号')
  return token
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emptyResult(): ProjectSyncResult {
  return { projects: 0, widgets: 0, records: 0, skippedPhotos: 0 }
}
