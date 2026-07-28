/* ─── Dev Mock Panel ───
 * 仅在 URL 带 ?dev=1 时激活。
 * 拦截 /api/me 返回 mock 数据，让前端可以在本地测试各用户状态。
 * 不修改任何生产代码路径。
 */

const DEV_STATE_KEY = 'bg_remover_dev_state'

function getDefaultState() {
  return { loggedIn: true, plan: 'free', used: 0 }
}

function loadCurrentUsage() {
  try {
    const raw = localStorage.getItem('bg_remover_usage')
    return raw ? (JSON.parse(raw).used || 0) : 0
  } catch {
    return 0
  }
}

function getDevState() {
  try {
    const raw = localStorage.getItem(DEV_STATE_KEY)
    return raw ? { ...getDefaultState(), ...JSON.parse(raw) } : getDefaultState()
  } catch {
    return getDefaultState()
  }
}

/* ─── Called from main.js before checkAuth ─── */

export function initDevMock() {
  const origFetch = window.fetch.bind(window)

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url

    if (url === '/api/me') {
      const state = getDevState()

      if (!state.loggedIn) {
        return new Response(JSON.stringify({ user: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const total = state.plan === 'free' ? 3 : state.plan === 'plus' ? 30 : 150
      // Use real usage counter from processImage() so it persists across refreshes.
      // Apply handler below clears bg_remover_usage so the panel can reset it.
      const realUsed = loadCurrentUsage()
      const used = Math.max(state.used, realUsed)

      return new Response(
        JSON.stringify({
          user: { id: 'dev-user', name: 'Dev User', email: 'dev@example.com', picture: '' },
          plan: { tier: state.plan, used, total },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return origFetch(input, init)
  }

  // Inject UI after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPanel)
  } else {
    injectPanel()
  }
}

/* ─── Floating Dev Panel ─── */

function injectPanel() {
  const state = getDevState()
  const maxAttempts = state.plan === 'free' ? 3 : state.plan === 'plus' ? 30 : 150

  const container = document.createElement('div')
  container.id = 'devPanelContainer'
  container.innerHTML = `
    <style>
      #devPanelContainer { position:fixed; bottom:20px; right:20px; z-index:9999; font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
      #devPanelToggle { width:44px; height:44px; border-radius:50%; border:2px solid #7c3aed; background:#fff; cursor:pointer; font-size:18px; box-shadow:0 2px 12px rgba(0,0,0,0.15); transition:all 0.2s; display:flex; align-items:center; justify-content:center; }
      #devPanelToggle:hover { background:#f5f3ff; transform:scale(1.05); }
      #devPanelBody { display:none; margin-top:8px; width:250px; background:#fff; border-radius:12px; padding:16px; box-shadow:0 4px 20px rgba(0,0,0,0.15); border:1px solid #e5e7eb; }
      #devPanelContainer.open #devPanelBody { display:block; }
      .dev-title { font-weight:700; font-size:14px; margin-bottom:10px; display:flex; align-items:center; gap:6px; }
      .dev-status { font-size:12px; color:#6b7280; margin-bottom:12px; padding:8px 10px; background:#f3f4f6; border-radius:8px; line-height:1.5; }
      .dev-field { margin-bottom:10px; }
      .dev-field label { display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:4px; }
      .dev-field select,
      .dev-field input[type="range"] { width:100%; margin-top:2px; }
      .dev-field select { padding:5px 8px; border:1px solid #d1d5db; border-radius:6px; font-size:13px; background:#fff; }
      .dev-field input[type="range"] { accent-color:#7c3aed; }
      .dev-used-row { display:flex; justify-content:space-between; font-size:13px; color:#6b7280; margin-top:2px; }
      #devApply { width:100%; margin-top:6px; padding:8px 0; background:#7c3aed; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size:13px; transition:all 0.15s; }
      #devApply:hover { background:#6d28d9; }
      #devResetUsage { margin-top:4px; width:100%; padding:6px 0; background:transparent; color:#6b7280; border:1px solid #d1d5db; border-radius:8px; cursor:pointer; font-size:12px; }
      #devResetUsage:hover { background:#f3f4f6; }
      .dev-badge { font-size:10px; background:#7c3aed; color:#fff; padding:2px 8px; border-radius:10px; }
    </style>
    <button id="devPanelToggle" title="Dev Panel">⚙️</button>
    <div id="devPanelBody">
      <div class="dev-title">🧪 Dev Panel <span class="dev-badge">?dev=1</span></div>
      <div class="dev-status" id="devStatus">
        <div>Auth: ${state.loggedIn ? '✅ Logged in' : '❌ Not logged in'}</div>
        <div>Plan: <strong>${state.plan}</strong> · Used: ${state.used}/${maxAttempts}</div>
      </div>

      <div class="dev-field">
        <label for="devAuth">Auth</label>
        <select id="devAuth">
          <option value="on" ${state.loggedIn ? 'selected' : ''}>Logged in</option>
          <option value="off" ${!state.loggedIn ? 'selected' : ''}>Not logged in</option>
        </select>
      </div>

      <div class="dev-field">
        <label for="devPlan">Plan</label>
        <select id="devPlan">
          <option value="free" ${state.plan === 'free' ? 'selected' : ''}>Free (1 try)</option>
          <option value="plus" ${state.plan === 'plus' ? 'selected' : ''}>Plus (5/month) ⭐</option>
          <option value="business" ${state.plan === 'business' ? 'selected' : ''}>Business (10/month)</option>
        </select>
      </div>

      <div class="dev-field">
        <label>Used: <span id="devUsedLabel">${state.used}</span></label>
        <input type="range" id="devUsed" min="0" max="${maxAttempts}" value="${state.used}">
        <div class="dev-used-row">
          <span>0</span>
          <span id="devUsedMax">${maxAttempts}</span>
        </div>
      </div>

      <button id="devApply">Apply & Reload</button>
      <button id="devResetUsage">Reset usage to 0</button>
    </div>
  `

  document.body.appendChild(container)

  /* ── Event wiring ── */

  const toggle = container.querySelector('#devPanelToggle')
  const body = container.querySelector('#devPanelBody')
  toggle.addEventListener('click', () => container.classList.toggle('open'))

  const authSelect = container.querySelector('#devAuth')
  const planSelect = container.querySelector('#devPlan')
  const usedSlider = container.querySelector('#devUsed')
  const usedLabel = container.querySelector('#devUsedLabel')
  const usedMax = container.querySelector('#devUsedMax')
  const applyBtn = container.querySelector('#devApply')
  const resetBtn = container.querySelector('#devResetUsage')

  function updateUsedRange() {
    const plan = planSelect.value
    const max = plan === 'free' ? 1 : plan === 'plus' ? 5 : 10
    usedSlider.max = max
    usedMax.textContent = max
    if (parseInt(usedSlider.value) > max) {
      usedSlider.value = max
      usedLabel.textContent = max
    }
  }

  planSelect.addEventListener('change', updateUsedRange)
  usedSlider.addEventListener('input', () => {
    usedLabel.textContent = usedSlider.value
  })

  applyBtn.addEventListener('click', () => {
    const newState = {
      loggedIn: authSelect.value === 'on',
      plan: planSelect.value,
      used: parseInt(usedSlider.value),
    }
    localStorage.setItem(DEV_STATE_KEY, JSON.stringify(newState))
    // Clear runtime usage so the new dev state takes effect on reload
    localStorage.removeItem('bg_remover_usage')
    window.location.reload()
  })

  resetBtn.addEventListener('click', () => {
    usedSlider.value = 0
    usedLabel.textContent = '0'
    authSelect.value = 'on'
    planSelect.value = 'free'
    updateUsedRange()
    // Auto-apply
    const newState = { loggedIn: true, plan: 'free', used: 0 }
    localStorage.setItem(DEV_STATE_KEY, JSON.stringify(newState))
    // Clear runtime usage so the new dev state takes effect on reload
    localStorage.removeItem('bg_remover_usage')
    window.location.reload()
  })
}
