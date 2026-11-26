import type { IncomingMessage, ServerResponse } from 'node:http'

export interface NewsItem {
  id: string
  title: string
  url: string
  source: string
  sourceKind: string
  summary: string
  publishedAt: string | null
}

export interface NewsSourceResult {
  id: string
  name: string
  kind: string
  items: NewsItem[]
  errors: string[]
}

export interface NewsResponse {
  updatedAt: string
  sources: Record<string, NewsSourceResult>
}

export function collectNews(sourceIds?: string[], signal?: AbortSignal): Promise<NewsResponse>
export function handleNewsRequest(req: IncomingMessage, res: ServerResponse): Promise<void>
