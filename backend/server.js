import cors from 'cors'
import express from 'express'
import { config } from './src/config.js'
import { isServiceConfigured } from './src/services/processor.js'
import { photoRouter } from './src/routes/photo.routes.js'

const app = express()

// CORS — allows the frontend (Vite dev server or any origin) to call the API.
app.use(cors({ origin: true, methods: ['GET', 'POST'] }))
app.use(express.json({ limit: '1mb' }))

// Health check — handy for smoke tests and serverless cold starts.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', serviceReady: isServiceConfigured() })
})

// API routes.
app.use('/api', photoRouter)

// JSON 404 for unknown API routes — deliberately generic: no reflection
// of the requested path, so nothing can be inferred about internals.
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' })
})

// Central error handler — never leaks a stack trace or upstream details.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[potobut] error:', err.message)
  const status = err.status || 500
  res.status(status).json({
    error: status === 500 ? 'Internal server error.' : err.message,
  })
})

app.listen(config.port, () => {
  console.log(`✅ Potobut backend running on http://localhost:${config.port}`)
  console.log(
    isServiceConfigured()
      ? '   Photo service: ready ✓'
      : '   ⚠️ Photo service NOT configured — check the credentials in backend/.env',
  )
})
