import { createServer } from 'node:http'
import { handleNewsRequest } from './news-service.mjs'

const port = Number(process.env.NEWS_API_PORT || 8787)
const host = process.env.NEWS_API_HOST || '127.0.0.1'

const server = createServer(async (req, res) => {
  try {
    await handleNewsRequest(req, res)
  } catch (error) {
    console.error('[news-api]', error)
    if (!res.writableEnded) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  }
})

server.listen(port, host, () => {
  console.log(`News API listening on http://${host}:${port}/api/news`)
})
