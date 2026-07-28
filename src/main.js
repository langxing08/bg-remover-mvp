import './style.css'
import { createEngine } from './engines/index.js'
import {
  initPricingModal,
  openPricingModal,
  closePricingModal,
  updateHeaderBadge,
  hideHeaderBadge,
  getExhaustedHTML,
  getWarningHTML,
  loadUsage,
  saveUsage,
  resetUsage,
} from './pricing.js'
import { startPaypalCheckout, loadSavedPlan, updatePlanUsage, PLAN_INFO } from './paypal.js'

/* ─── DOM refs ─── */

/* ─── DOM refs ─── */
const main = document.querySelector('main')
const uploadZone = document.getElementById('uploadZone')
const fileInput = document.getElementById('fileInput')
const processing = document.getElementById('processing')
const progressText = document.getElementById('progressText')
const progressBar = document.getElementById('progressBar')
const result = document.getElementById('result')
const originalImage = document.getElementById('originalImage')
const resultImage = document.getElementById('resultImage')
const tabOriginal = document.getElementById('tabOriginal')
const tabResult = document.getElementById('tabResult')
const originalPanel = document.getElementById('originalPanel')
const resultPanel = document.getElementById('resultPanel')
const downloadBtn = document.getElementById('downloadBtn')
const resetBtn = document.getElementById('resetBtn')
const imageInfo = document.getElementById('imageInfo')

/* ─── Auth DOM refs ─── */
const loginBtn = document.getElementById('loginBtn')
const logoutBtn = document.getElementById('logoutBtn')
const userInfo = document.getElementById('userInfo')
const userAvatar = document.getElementById('userAvatar')
const userName = document.getElementById('userName')
const pricingBtn = document.getElementById('pricingBtn')
const planBadge = document.getElementById('planBadge')

/* ─── State ─── */
let engine = null
let currentResultBlob = null
let currentFileName = ''
let isProcessing = false

const app = {
  isAuthenticated: false,
  planTier: 'free',     // 'free' | 'plus' | 'business'
  planUsed: 0,          // current cycle usage
  planTotal: 3,         // total for current plan
}

/* ─── Pricing modal init ─── */
initPricingModal()

/* ─── Exhausted zone container (regenerated on tier change) ─── */
let exhaustedEl = null
let exhaustedTier = ''
function ensureExhaustedZone(tier) {
  const currentTier = tier || app.planTier
  // Only rebuild if tier changed or doesn't exist yet
  if (exhaustedEl && exhaustedTier === currentTier && document.body.contains(exhaustedEl)) return

  if (exhaustedEl) exhaustedEl.remove()
  exhaustedTier = currentTier
  const wrapper = document.createElement('div')
  wrapper.innerHTML = getExhaustedHTML(currentTier)
  exhaustedEl = wrapper.firstElementChild
  exhaustedEl.hidden = true
  main.insertBefore(exhaustedEl, processing)
}

/* ─── Helpers ─── */

function isFree() {
  return app.planTier === 'free'
}

function isExhausted() {
  // Block ALL plans when usage reaches their limit
  return app.isAuthenticated && app.planUsed >= app.planTotal
}

function isPlusNearLimit() {
  // Warn when 80% used
  return app.planTier === 'plus' && app.planUsed >= 4
}

function showDefaultView() {
  if (isExhausted()) {
    showExhausted()
  } else {
    showUpload()
  }
}

/* ─── UI transitions ─── */
function showUpload() {
  uploadZone.hidden = false
  if (exhaustedEl) exhaustedEl.hidden = true
  processing.hidden = true
  result.hidden = true
}

function showProcessing() {
  uploadZone.hidden = true
  if (exhaustedEl) exhaustedEl.hidden = true
  processing.hidden = false
  result.hidden = true
  setProgress('Starting...', 0)
}

function showResult() {
  uploadZone.hidden = true
  if (exhaustedEl) exhaustedEl.hidden = true
  processing.hidden = true
  result.hidden = false
}

function showExhausted(tier) {
  ensureExhaustedZone(tier)
  uploadZone.hidden = true
  processing.hidden = true
  result.hidden = true
  exhaustedEl.hidden = false
}

function setProgress(text, pct) {
  progressText.textContent = text
  progressBar.style.width = `${Math.min(pct, 100)}%`
}

/* ─── Result-area extras: callouts ─── */

function clearResultExtras() {
  const existing = result.querySelectorAll('.callout')
  existing.forEach(el => el.remove())
}

function injectCallout(type, data) {
  clearResultExtras()
  const html = getWarningHTML(type, data)
  if (!html) return
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  const calloutEl = wrapper.firstElementChild
  result.appendChild(calloutEl)
  // Wire the "See Plans / Upgrade" button
  const ctaBtn = calloutEl.querySelector('.callout-pricing-btn')
  if (ctaBtn) ctaBtn.addEventListener('click', openPricingModal)
  // Wire the close button
  const closeBtn = calloutEl.querySelector('.callout-close')
  if (closeBtn) closeBtn.addEventListener('click', () => calloutEl.remove())
}

/* ─── Header badge / pricing button ─── */

function updatePlanDisplay() {
  if (app.isAuthenticated) {
    updateHeaderBadge(app.planUsed, app.planTier)
  } else {
    hideHeaderBadge()
  }
}

pricingBtn.addEventListener('click', openPricingModal)

// Also open pricing when clicking the plan badge
planBadge.addEventListener('click', openPricingModal)

/* ─── PayPal: handle plan selection from pricing modal ─── */
document.addEventListener('plan:select', async (e) => {
  const { planId } = e.detail
  console.log('[Plan] Selected:', planId)
  closePricingModal()
  // Small delay to let modal close animation complete
  await new Promise(r => setTimeout(r, 300))
  try {
    await startPaypalCheckout(planId)
  } catch (err) {
    console.error('[Plan] PayPal checkout failed:', err)
  }
})

/* ─── Upload handlers ─── */
uploadZone.addEventListener('click', () => fileInput.click())

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  uploadZone.classList.add('dragover')
})

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover')
})

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault()
  uploadZone.classList.remove('dragover')
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    processImage(file)
  }
})

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) {
    processImage(file)
  }
})

/* ─── Core processing ─── */
async function processImage(file) {
  if (isProcessing) return

  // Block if free user has exhausted attempts
  if (isExhausted()) {
    showExhausted()
    return
  }

  isProcessing = true

  currentFileName = file.name.replace(/\.[^.]+$/, '')
  showProcessing()

  try {
    // Show original image immediately
    const imageUrl = URL.createObjectURL(file)
    originalImage.src = imageUrl

    // Lazy-init engine on first use with progress callback
    if (!engine) {
      setProgress('Initializing AI engine...', 5)
      engine = createEngine(undefined, {
        onProgress: (phase, pct) => {
          setProgress(phase, pct)
        },
      })
    }

    // Remove background via engine abstraction layer
    setProgress('Removing background...', 30)
    const blob = await engine.removeBackground(file)

    // Done — final progress
    setProgress('Finalizing...', 95)

    currentResultBlob = blob
    const resultUrl = URL.createObjectURL(blob)
    resultImage.src = resultUrl

    // Show file info
    const sizeKb = (blob.size / 1024).toFixed(0)
    imageInfo.textContent = `${currentFileName}-no-bg.png (${sizeKb} KB)`

    // Reset to original tab when showing result
    switchTab('original')

    // Prepare result area extras based on auth & plan
    clearResultExtras()

    if (!app.isAuthenticated) {
      // ── Unauthenticated: lock download, show login prompt ──
      downloadBtn.innerHTML = '🔒 Sign in to Download'
      downloadBtn.disabled = false
      // Login prompt appears when they click download
    } else {
      // ── Authenticated: normal download ──
      downloadBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download PNG
      `
      downloadBtn.disabled = false

      // Increment usage for all authenticated users after successful processing
      app.planUsed++
      if (isFree()) {
        saveUsage(app.planUsed)
        // Show warning if this was last free attempt
        const remaining = app.planTotal - app.planUsed
        if (remaining === 1) {
          injectCallout('low-attempt', { remaining: 1 })
        }
      } else {
        // Paid plan — save usage to plan storage
        updatePlanUsage(app.planUsed)
      }
      updatePlanDisplay()

      // Show upgrade suggestion if Plus user is near limit
      if (isPlusNearLimit()) {
        injectCallout('plus-upgrade', { used: app.planUsed, total: app.planTotal })
      }
    }

    showResult()
  } catch (err) {
    console.error('Background removal failed:', err)
    alert(`Failed to remove background: ${err.message || 'Unknown error'}`)
    showDefaultView()
  } finally {
    isProcessing = false
  }
}

/* ─── Pending result persistence (login redirect) ─── */

const PENDING_KEY = 'bg_pending_result'

async function blobToDataURL(blob) {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:${blob.type};base64,${btoa(binary)}`
}

async function savePendingResult() {
  if (!currentResultBlob) return
  const data = {
    fileName: currentFileName,
    resultDataUrl: await blobToDataURL(currentResultBlob),
  }
  // Also save the original image so it's visible after login
  if (originalImage.src && originalImage.src.startsWith('blob:')) {
    try {
      const res = await fetch(originalImage.src)
      data.originalDataUrl = await blobToDataURL(await res.blob())
    } catch { /* original unavailable, result still works */ }
  }
  // Flag that this was already processed — usage should be counted after login
  data.countAsUsage = true
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(data))
}

function restorePendingResult() {
  const raw = sessionStorage.getItem(PENDING_KEY)
  if (!raw) return false
  sessionStorage.removeItem(PENDING_KEY)

  try {
    const { fileName, resultDataUrl, originalDataUrl } = JSON.parse(raw)
    currentFileName = fileName || ''

    // Restore original image if available
    if (originalDataUrl) originalImage.src = originalDataUrl

    // Fetch the data URL to create a blob
    fetch(resultDataUrl)
      .then(r => r.blob())
      .then(blob => {
        currentResultBlob = blob
        resultImage.src = resultDataUrl

        // Show file info
        const sizeKb = (blob.size / 1024).toFixed(0)
        imageInfo.textContent = `${fileName || 'image'}-no-bg.png (${sizeKb} KB)`

        // Update download button for authenticated user
        downloadBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PNG
        `
        downloadBtn.disabled = false

        switchTab('result')
        showResult()
      })
      .catch(() => { /* silently fail, user can re-upload */ })

    // Count this as a used attempt since the image was already processed
    if (countAsUsage) {
      app.planUsed++
      if (isFree()) {
        saveUsage(app.planUsed)
      } else {
        updatePlanUsage(app.planUsed)
      }
      updatePlanDisplay()
    }

    return true
  } catch {
    return false
  }
}

/* ─── Tab switching ─── */
function switchTab(tab) {
  const isOriginal = tab === 'original'

  tabOriginal.classList.toggle('active', isOriginal)
  tabResult.classList.toggle('active', !isOriginal)
  originalPanel.classList.toggle('active', isOriginal)
  resultPanel.classList.toggle('active', !isOriginal)
}

tabOriginal.addEventListener('click', () => switchTab('original'))
tabResult.addEventListener('click', () => switchTab('result'))

/* ─── Download ─── */
downloadBtn.addEventListener('click', async () => {
  if (!app.isAuthenticated) {
    // Save the processed result so it's available after login redirect
    await savePendingResult()
    window.location.href = '/api/auth/google'
    return
  }

  if (!currentResultBlob) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(currentResultBlob)
  a.download = `${currentFileName}-no-bg.png`
  a.click()
})

/* ─── Reset (Remove Another) ─── */
resetBtn.addEventListener('click', () => {
  currentResultBlob = null
  currentFileName = ''
  originalImage.src = ''
  resultImage.src = ''
  clearResultExtras()
  showDefaultView()
})

/* ─── Google Auth ─── */

// Check session on page load
;(async function checkAuth() {
  // Init dev mock first (top-level await breaks Vite's tree-shaking for other imports)
  if (location.search.includes('dev=1')) {
    const { initDevMock } = await import('./dev-panel.js')
    initDevMock()
  } else if (localStorage.getItem('bg_remover_dev_state')) {
    localStorage.removeItem('bg_remover_dev_state')
  }
  try {
    const res = await fetch('/api/me')
    const data = await res.json()
    if (data.user) {
      app.isAuthenticated = true
      userAvatar.src = data.user.picture || ''
      userName.textContent = data.user.name || data.user.email
      loginBtn.hidden = true
      userInfo.hidden = false

      // Load plan info from API (dev mock), saved paid plan, or localStorage
      if (data.plan) {
        app.planTier = data.plan.tier
        app.planUsed = data.plan.used
        app.planTotal = data.plan.total
      } else {
        const savedPlan = loadSavedPlan()
        if (savedPlan) {
          app.planTier = savedPlan.tier
          app.planUsed = savedPlan.used
          // Always derive total from PLAN_INFO (not saved data) so limit changes take effect immediately
          app.planTotal = PLAN_INFO[savedPlan.tier]?.total || savedPlan.total
        } else {
          const usage = loadUsage()
          app.planUsed = usage.used
          app.planTier = 'free'
          app.planTotal = 1
        }
      }
      updatePlanDisplay()

      // If exhausted, show exhausted state instead of upload zone
      if (isExhausted()) {
        showExhausted()
      }

      // Restore pending result from before-login redirect
      restorePendingResult()
    } else {
      app.isAuthenticated = false
      loginBtn.hidden = false
      userInfo.hidden = true
      hideHeaderBadge()
    }
  } catch {
    app.isAuthenticated = false
    loginBtn.hidden = false
    userInfo.hidden = true
    hideHeaderBadge()
  }
})()

loginBtn.addEventListener('click', () => {
  window.location.href = '/api/auth/google'
})

logoutBtn.addEventListener('click', async () => {
  // Clear session cookie by setting it to expire in the past
  // Must match original cookie attributes (Secure, SameSite) to overwrite it
  document.cookie = 'session=; Path=/; Secure; SameSite=Lax; Max-Age=0'
  userInfo.hidden = true
  loginBtn.hidden = false
  app.isAuthenticated = false
  hideHeaderBadge()
  // On logout, reset to upload zone (unless exhausted which requires login)
  showUpload()
})
