import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
  // Local dev proxy for /api/remove-bg → remove.bg
  // In production, Cloudflare Pages Function handles this.
  plugins: [
    {
      name: 'api-proxy',
      configureServer(server) {
        // Use node built-in fetch (Node 18+)
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
            // Collect the multipart form data from the incoming request
            const buffers = []
            for await (const chunk of req) {
              buffers.push(chunk)
            }
            const body = Buffer.concat(buffers)
            const contentType = req.headers['content-type']

            // Forward to remove.bg
            const bgResponse = await fetch('https://api.remove.bg/v1.0/removebg', {
              method: 'POST',
              headers: {
                'X-Api-Key': apiKey,
                'Content-Type': contentType,
              },
              body,
            })

            if (!bgResponse.ok) {
              const errorText = await bgResponse.text()
              res.statusCode = bgResponse.status
              res.end(errorText)
              return
            }

            // Stream the response back
            res.setHeader('Content-Type', 'image/png')
            const bgBody = await bgResponse.arrayBuffer()
            res.end(Buffer.from(bgBody))
          } catch (err) {
            res.statusCode = 500
            res.end(err.message)
          }
        })
      },
    },
  ],
})
