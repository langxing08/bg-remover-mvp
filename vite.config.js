import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
  plugins: [
    {
      name: 'api-proxy',
      configureServer(server) {
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
            // Collect JSON body
            const buffers = []
            for await (const chunk of req) {
              buffers.push(chunk)
            }
            const { image_base64, filename, content_type } = JSON.parse(
              Buffer.concat(buffers).toString()
            )

            // Decode base64 → Blob-like buffer
            const buf = Buffer.from(image_base64, 'base64')

            // Build FormData matching the official remove.bg sample:
            //   formData.append("size", "auto");
            //   formData.append("image_file", blob);
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
      },
    },
  ],
})
