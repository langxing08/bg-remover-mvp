import './style.css'
import { createEngine } from './engines/index.js'

/* ─── DOM refs ─── */
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

/* ─── State ─── */
let engine = null
let currentResultBlob = null
let currentFileName = ''
let isProcessing = false

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

    showResult()
  } catch (err) {
    console.error('Background removal failed:', err)
    alert(`Failed to remove background: ${err.message || 'Unknown error'}`)
    showUpload()
  } finally {
    isProcessing = false
  }
}

/* ─── UI transitions ─── */
function showUpload() {
  uploadZone.hidden = false
  processing.hidden = true
  result.hidden = true
}

function showProcessing() {
  uploadZone.hidden = true
  processing.hidden = false
  result.hidden = true
  setProgress('Starting...', 0)
}

function showResult() {
  uploadZone.hidden = true
  processing.hidden = true
  result.hidden = false
}

function setProgress(text, pct) {
  progressText.textContent = text
  progressBar.style.width = `${Math.min(pct, 100)}%`
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
downloadBtn.addEventListener('click', () => {
  if (!currentResultBlob) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(currentResultBlob)
  a.download = `${currentFileName}-no-bg.png`
  a.click()
})

/* ─── Reset ─── */
resetBtn.addEventListener('click', () => {
  currentResultBlob = null
  currentFileName = ''
  originalImage.src = ''
  resultImage.src = ''
  showUpload()
})
