import { defineConfig, loadEnv } from 'vite'
import { createOrder, captureOrder } from './server/paypal.js'
import { createWebhookHandler } from './server/paypal-webhook.js'

export default defineConfig(({ mode }) => {
  // Load .env so process.env has all vars in configureServer
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
  build: {
    target: 'es2020',
    outDir: 'out',
    sourcemap: false,
  },
  plugins: [
    {
      name: 'api-proxy',
      configureServer(server) {
        // ── /api/remove-bg: forward to remove.bg ──
        server.middlewares.use('/api/remove-bg', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method not allowed')
            return
          }

          const apiKey = process.env.REMOVE_BG_API_KEY
          if (!apiKey) {
            res.statusCode = 500
            res.end('REMOVE_BG_API_KEY not set in local .env')
            return
          }

          try {
            const buffers = []
            for await (const chunk of req) {
              buffers.push(chunk)
            }
            const { image_base64, filename, content_type } = JSON.parse(
              Buffer.concat(buffers).toString()
            )

            const buf = Buffer.from(image_base64, 'base64')
            const formData = new FormData()
            formData.append('size', 'auto')
            formData.append(
              'image_file',
              new Blob([buf], { type: content_type || 'image/png' }),
              filename || 'image'
            )

            const bgResponse = await fetch('https://api.remove.bg/v1.0/removebg', {
              method: 'POST',
              headers: { 'X-Api-Key': apiKey },
              body: formData,
            })

            if (!bgResponse.ok) {
              const errorText = await bgResponse.text()
              res.statusCode = bgResponse.status
              res.end(errorText)
              return
            }

            res.setHeader('Content-Type', 'image/png')
            const bgBody = await bgResponse.arrayBuffer()
            res.end(Buffer.from(bgBody))
          } catch (err) {
            res.statusCode = 500
            res.end(err.message)
          }
        })

        // ── /api/auth/google: redirect to Google OAuth ──
        server.middlewares.use(async (req, res, next) => {
          const path = req.url?.split('?')[0] || ''
          if (path !== '/api/auth/google') { next(); return }
          const redirectUri = `${process.env.APP_URL || 'http://localhost:5173'}/api/auth/google/callback`
          const params = new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid email profile',
            access_type: 'online',
            prompt: 'select_account',
          })
          res.statusCode = 302
          res.setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params}`)
          res.end()
        })

        // ── /api/auth/google/callback: handle OAuth callback ──
        server.middlewares.use('/api/auth/google/callback', async (req, res) => {
          const url = new URL(req.url, `http://${req.headers.host}`)
          const code = url.searchParams.get('code')

          if (!code) {
            res.statusCode = 400
            res.end('Missing authorization code')
            return
          }

          try {
            const redirectUri = `${process.env.APP_URL || 'http://localhost:5173'}/api/auth/google/callback`

            // Exchange code for tokens
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
              }),
            })

            if (!tokenResponse.ok) {
              res.statusCode = 500
              res.end('Token exchange failed')
              return
            }

            const tokens = await tokenResponse.json()

            const userResponse = await fetch(
              'https://www.googleapis.com/oauth2/v2/userinfo',
              { headers: { Authorization: `Bearer ${tokens.access_token}` } }
            )
            const user = await userResponse.json()

            // Create session token (HMAC signed)
            const sessionData = JSON.stringify({
              sub: user.id, email: user.email, name: user.name,
              picture: user.picture, iat: Date.now(),
            })
            const crypto = await import('node:crypto')
            const sig = crypto
              .createHmac('sha256', process.env.SESSION_SECRET || 'dev-secret')
              .update(sessionData)
              .digest('hex')
            const token = `${Buffer.from(sessionData).toString('base64')}.${sig}`

            res.statusCode = 302
            res.setHeader('Location', process.env.APP_URL || 'http://localhost:5173')
            res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`)
            res.end()
          } catch (err) {
            res.statusCode = 500
            res.end(err.message)
          }
        })

        // ── /api/me: get current user from session cookie ──
        server.middlewares.use('/api/me', async (req, res) => {
          res.setHeader('Content-Type', 'application/json')

          const cookieHeader = req.headers.cookie || ''
          const cookies = Object.fromEntries(
            cookieHeader.split(';').filter(Boolean).map(c => {
              const [k, ...v] = c.trim().split('=')
              return [k, v.join('=')]
            })
          )

          const token = cookies.session
          if (!token) {
            res.end(JSON.stringify({ user: null }))
            return
          }

          try {
            const [encodedData, sigHex] = token.split('.')
            const crypto = await import('node:crypto')
            const expectedSig = crypto
              .createHmac('sha256', process.env.SESSION_SECRET || 'dev-secret')
              .update(Buffer.from(encodedData, 'base64').toString('utf8'))
              .digest('hex')

            if (sigHex !== expectedSig) {
              res.end(JSON.stringify({ user: null }))
              return
            }

            const user = JSON.parse(Buffer.from(encodedData, 'base64').toString('utf8'))

            if (Date.now() - user.iat > 86400000) {
              res.end(JSON.stringify({ user: null }))
              return
            }

            res.end(JSON.stringify({ user }))
          } catch {
            res.end(JSON.stringify({ user: null }))
          }
        })

        // ── Helper: extract user ID from session cookie ──
        function extractUserIdFromCookie(cookieHeader) {
          try {
            const cookies = Object.fromEntries(
              cookieHeader.split(';').filter(Boolean).map(c => {
                const [k, ...v] = c.trim().split('=')
                return [k, v.join('=')]
              })
            )
            const token = cookies.session
            if (!token) return 'anonymous'
            const [encodedData] = token.split('.')
            const user = JSON.parse(Buffer.from(encodedData, 'base64').toString('utf8'))
            return user.sub || user.email || 'anonymous'
          } catch {
            return 'anonymous'
          }
        }

        // ── /api/paypal/config: return PayPal Client ID ──
        server.middlewares.use('/api/paypal/config', async (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ clientId: process.env.PAYPAL_CLIENT_ID || '' }))
        })

        // ── /api/paypal/create-order: create a PayPal order ──
        server.middlewares.use('/api/paypal/create-order', async (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }

          try {
            const buffers = []
            for await (const chunk of req) { buffers.push(chunk) }
            const { planId, price } = JSON.parse(Buffer.concat(buffers).toString())

            const planNames = { plus: 'Plus Plan — 30 removals/month', business: 'Business Plan — 150 removals/month' }
            const planName = planNames[planId] || 'Plan'
            const appUrl = process.env.APP_URL || 'http://localhost:5173'
            const userId = extractUserIdFromCookie(req.headers.cookie || '')

            const order = await createOrder(
              process.env.PAYPAL_CLIENT_ID,
              process.env.PAYPAL_CLIENT_SECRET,
              { planId, planName, price, userId, appUrl }
            )

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ id: order.id }))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
        })

        // ── /api/paypal/capture-order: capture an approved order ──
        server.middlewares.use('/api/paypal/capture-order', async (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }

          try {
            const buffers = []
            for await (const chunk of req) { buffers.push(chunk) }
            const { orderId } = JSON.parse(Buffer.concat(buffers).toString())

            const capture = await captureOrder(
              process.env.PAYPAL_CLIENT_ID,
              process.env.PAYPAL_CLIENT_SECRET,
              orderId
            )

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(capture))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
        })

        // ── /api/paypal/webhook: receive PayPal webhook events ──
        const webhookHandler = createWebhookHandler(
          process.env.PAYPAL_CLIENT_ID,
          process.env.PAYPAL_CLIENT_SECRET,
          process.env.PAYPAL_WEBHOOK_ID || ''
        )
        server.middlewares.use('/api/paypal/webhook', webhookHandler)
      },
    },
  ],
  }
})
