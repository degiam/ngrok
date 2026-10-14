
const express = require('express')
const path = require('node:path')
const httpProxy = require('http-proxy')
const serverless = require('serverless-http')

const app = express()

const TARGET = process.env.TARGET_URL

if (!TARGET) {
  throw new Error('Environment variable TARGET_URL belum diatur.')
}

const TARGET_ORIGIN = new URL(TARGET).origin
const PUBLIC_DIR = path.resolve(process.cwd(), 'public')
const OFFLINE_PAGE = path.join(PUBLIC_DIR, 'index.html')
const OFFLINE_IMAGE = path.join(PUBLIC_DIR, 'img.avif')

const proxy = httpProxy.createProxyServer({
  target: TARGET,
  changeOrigin: true,
  secure: true,
  xfwd: true,
  selfHandleResponse: true,
})

// Tambahkan header khusus ngrok dan minta respons tanpa kompresi.
proxy.on('proxyReq', (proxyReq) => {
  proxyReq.setHeader('ngrok-skip-browser-warning', '1')
  proxyReq.setHeader('accept-encoding', 'identity')
})

const excludedHeaders = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]

function copyHeaders(proxyRes, res, rewriteHtml = false) {
  for (const [name, value] of Object.entries(proxyRes.headers)) {
    const key = name.toLowerCase()

    if (excludedHeaders.includes(key)) continue

    if (
      rewriteHtml &&
      [
        'content-length',
        'content-encoding',
        'etag',
        'content-md5',
      ].includes(key)
    ) {
      continue
    }

    if (value !== undefined) {
      res.setHeader(name, value)
    }
  }

  res.statusCode = proxyRes.statusCode || 200
}

function sendOfflinePage(res) {
  res.setHeader('Cache-Control', 'no-store')
  return res.sendFile(OFFLINE_PAGE, (error) => {
    if (error && !res.headersSent && !res.destroyed) {
      res.status(500).send('Halaman offline tidak dapat ditampilkan.')
    }
  })
}

function sendOfflineImage(res) {
  res.setHeader('Cache-Control', 'no-store')
  return res.sendFile(OFFLINE_IMAGE, (error) => {
    if (error && !res.headersSent && !res.destroyed) {
      res.status(404).send('Gambar offline tidak ditemukan.')
    }
  })
}


function handleProxyError(error, req, res) {
  console.error('Ngrok proxy error:', error.message)

  if (!res || res.destroyed || res.writableEnded) return

  if (res.headersSent) {
    res.destroy()
    return
  }

  const isPageRequest =
    req?.method === 'GET' &&
    (
      req.path === '/' ||
      req.path.endsWith('/') ||
      /\.(html|php)$/i.test(req.path) ||
      !/\.[a-z0-9]{1,10}$/i.test(req.path)
    )

  if (isPageRequest) {
    sendOfflinePage(res)
    return
  }

  res.status(502)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end('Target tidak dapat diakses.')
}

proxy.on('error', handleProxyError)

proxy.on('proxyRes', (proxyRes, req, res) => {
  const status = proxyRes.statusCode || 200
  const contentType = proxyRes.headers['content-type'] || ''
  const encoding = proxyRes.headers['content-encoding']

  // HEAD dan status tertentu tidak boleh memiliki body respons.
  if (
    req.method === 'HEAD' ||
    status === 204 ||
    status === 304 ||
    (status >= 100 && status < 200)
  ) {
    copyHeaders(proxyRes, res)
    res.end()
    return
  }

  const isHtml =
    contentType.includes('text/html') &&
    (!encoding || encoding === 'identity') &&
    status !== 206

  proxyRes.on('error', (error) => {
    handleProxyError(error, req, res)
  })

  // CSS, JavaScript, gambar, dan respons non-HTML diteruskan apa adanya.
  if (!isHtml) {
    copyHeaders(proxyRes, res)
    proxyRes.pipe(res)
    return
  }

  // HTML perlu dibaca terlebih dahulu untuk menyisipkan tag base.
  const chunks = []

  proxyRes.on('data', (chunk) => {
    chunks.push(chunk)
  })

  proxyRes.on('end', () => {
    if (res.destroyed || res.writableEnded) return

    let html = Buffer.concat(chunks).toString('utf8')

    const PUBLIC_ORIGIN = 'https://ngrok.degiam.my.id'
    const basePath = req.path.endsWith('/')
      ? req.path
      : req.path.substring(0, req.path.lastIndexOf('/') + 1)

    const baseTag = `<base href="${TARGET_ORIGIN}${basePath}">`

    // Ubah navigasi HTML dan PHP agar tetap memakai domain publik.
    html = html.replace(/<a\b[^>]*>/gi, (tag) => {
      return tag.replace(
        /\bhref\s*=\s*(["'])(.*?)\1/i,
        (match, quote, href) => {
          if (
            !href ||
            href.startsWith('#') ||
            href.startsWith('//') ||
            /^[a-z][a-z\d+.-]*:/i.test(href)
          ) {
            return match
          }

          try {
            // Pertahankan direktori halaman saat menyelesaikan URL relatif.
            const currentUrl = new URL(req.path, `${PUBLIC_ORIGIN}/`)
            const url = new URL(href, currentUrl)

            // Hanya ubah link menuju file HTML atau PHP.
            const isHtmlOrPhp = /\.(html|php)$/i.test(url.pathname)
            const isDirectory = url.pathname.endsWith('/')

            if (!isHtmlOrPhp && !isDirectory) {
              return match
            }

            return `href=${quote}${url.href}${quote}`
          } catch {
            return match
          }
        },
      )
    })

    // Aset relatif tetap menggunakan origin ngrok.
    if (/<base\b[^>]*>/i.test(html)) {
      html = html.replace(/<base\b[^>]*>/i, baseTag)
    } else if (/<head\b[^>]*>/i.test(html)) {
      html = html.replace(
        /<head\b[^>]*>/i,
        (head) => `${head}\n${baseTag}`,
      )
    } else {
      html = `${baseTag}\n${html}`
    }

    copyHeaders(proxyRes, res, true)
    res.setHeader('Content-Length', Buffer.byteLength(html))
    res.end(html)
  })
})

async function isOnline() {
  try {
    const response = await fetch(TARGET, {
      headers: {
        'ngrok-skip-browser-warning': '1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    })

    const online = response.ok

    // Tidak perlu mengunduh seluruh body hanya untuk mengecek status.
    await response.body?.cancel()

    return online
  } catch {
    return false
  }
}

function proxyRequest(req, res) {
  proxy.web(req, res)
}

app.get('/check', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ online: await isOnline() })
})

app.get('/img.avif', async (req, res) => {
  if (await isOnline()) {
    return proxyRequest(req, res)
  }

  return sendOfflineImage(res)
})

app.get('/', async (req, res) => {
  if (!(await isOnline())) {
    return sendOfflinePage(res)
  }

  return proxyRequest(req, res)
})

app.use(async (req, res, next) => {
  const isPageRequest =
    req.method === 'GET' &&
    (
      req.path === '/' ||
      req.path.endsWith('/') ||
      /\.(html|php)$/i.test(req.path) ||
      !/\.[a-z0-9]{1,10}$/i.test(req.path)
    )

  if (!isPageRequest) {
    return next()
  }

  if (!(await isOnline())) {
    return sendOfflinePage(res)
  }

  return proxyRequest(req, res)
})

app.use((req, res, next) => {
  console.log(
    new Date().toISOString(),
    req.method,
    req.originalUrl,
    'Referer:',
    req.get('referer') || '-',
    'User-Agent:',
    req.get('user-agent') || '-',
  )

  next()
})

// Rute lainnya, termasuk aset, tetap diteruskan ke ngrok.
app.use((req, res) => {
  proxyRequest(req, res)
})

module.exports.handler = serverless(app, {
  basePath: '/.netlify/functions/server',
  binary: ['image/*'],
})
