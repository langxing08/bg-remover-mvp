/* ─── Plan Configuration ─── */

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: '',
    attemptsLabel: 'Total 3',
    features: ['HD Output'],
    exclusiveFeatures: [],
    btnText: 'Continue Free',
    btnClass: 'btn-free',
    highlighted: false,
    badgeLabel: '',
  },
  {
    id: 'plus',
    name: 'Plus',
    price: 9,
    period: '/month',
    attemptsLabel: '30 / month',
    features: ['HD Output'],
    exclusiveFeatures: [],
    btnText: 'Upgrade to Plus',
    btnClass: 'btn-primary',
    highlighted: true,
    badgeLabel: '⭐ Recommended',
  },
  {
    id: 'business',
    name: 'Business',
    price: 29,
    period: '/month',
    attemptsLabel: '150 / month',
    features: ['HD Output'],
    exclusiveFeatures: ['Higher Resolution Output', 'Priority Queue'],
    btnText: 'Choose Business',
    btnClass: 'btn-secondary',
    highlighted: false,
    badgeLabel: '',
  },
]

/* ─── Usage Storage (localStorage mock, replace with API later) ─── */

const USAGE_KEY = 'bg_remover_usage'

export function loadUsage() {
  try {
    const raw = localStorage.getItem(USAGE_KEY)
    return raw ? JSON.parse(raw) : { used: 0 }
  } catch {
    return { used: 0 }
  }
}

export function saveUsage(used) {
  localStorage.setItem(USAGE_KEY, JSON.stringify({ used }))
}

export function resetUsage() {
  localStorage.removeItem(USAGE_KEY)
}

/* ─── Plan card builder (shared between modal & exhausted state) ─── */

function buildPlanCard(plan, size = 'normal') {
  const cls = plan.highlighted ? 'plan-card highlighted' : 'plan-card'
  const sizeCls = size === 'large' ? 'plan-card-lg' : ''
  return `
    <div class="${cls} ${sizeCls}">
      ${plan.badgeLabel ? `<div class="plan-badge">${plan.badgeLabel}</div>` : ''}
      <div class="plan-card-header">
        <h3 class="plan-name">${plan.name}</h3>
        <div class="plan-price-row">
          <span class="plan-amount">${plan.price === 0 ? 'Free' : '$' + plan.price}</span>
          ${plan.period ? `<span class="plan-period">${plan.period}</span>` : ''}
        </div>
        <p class="plan-attempts">${plan.attemptsLabel}</p>
      </div>
      <ul class="plan-features">
        ${plan.features.map(f => `<li><span class="feature-check">✅</span> ${f}</li>`).join('')}
        ${plan.exclusiveFeatures.map(f => `<li class="feature-exclusive"><span class="feature-star">✨</span> ${f}</li>`).join('')}
      </ul>
      <button class="plan-cta ${plan.btnClass}" data-plan="${plan.id}">${plan.btnText}</button>
    </div>
  `
}

/* ─── Pricing Modal ─── */

let modalOverlay = null

export function initPricingModal() {
  if (modalOverlay) return

  modalOverlay = document.createElement('div')
  modalOverlay.className = 'pricing-overlay'
  modalOverlay.hidden = true
  modalOverlay.setAttribute('role', 'dialog')
  modalOverlay.setAttribute('aria-modal', 'true')
  modalOverlay.setAttribute('aria-label', 'Choose your plan')

  modalOverlay.innerHTML = `
    <div class="pricing-modal">
      <button class="pricing-close" aria-label="Close pricing">&times;</button>

      <div class="pricing-header">
        <h2 class="pricing-title">Choose Your Plan</h2>
        <p class="pricing-subtitle">Unlock more removals and premium features</p>
      </div>

      <div class="plan-cards">
        ${PLANS.map(p => buildPlanCard(p, 'normal')).join('')}
      </div>

      <div class="feature-table-scroll">
        <table class="feature-table">
          <thead>
            <tr>
              <th class="feature-label-th"></th>
              <th>Free</th>
              <th class="col-plus">Plus</th>
              <th>Business</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="feature-label">Monthly Removals</td>
              <td>Total 3</td>
              <td class="col-plus">30 <span class="unit">/ month</span></td>
              <td>150 <span class="unit">/ month</span></td>
            </tr>
            <tr>
              <td class="feature-label">HD Output</td>
              <td class="check">✓</td>
              <td class="col-plus check">✓</td>
              <td class="check">✓</td>
            </tr>
            <tr>
              <td class="feature-label">Higher Resolution</td>
              <td class="cross">—</td>
              <td class="col-plus cross">—</td>
              <td class="check">✓</td>
            </tr>
            <tr>
              <td class="feature-label">Priority Queue</td>
              <td class="cross">—</td>
              <td class="col-plus cross">—</td>
              <td class="check">✓</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pricing-footer">
        <p class="pricing-note">No credit card required for Free plan</p>
      </div>
    </div>
  `

  // ── Event listeners ──
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closePricingModal()
  })

  modalOverlay.querySelector('.pricing-close').addEventListener('click', closePricingModal)

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay && !modalOverlay.hidden) {
      closePricingModal()
    }
  })

  // CTA button clicks — dispatch custom event so main.js can handle
  modalOverlay.addEventListener('click', (e) => {
    const cta = e.target.closest('.plan-cta')
    if (!cta) return
    e.preventDefault()
    if (cta.dataset.plan === 'free') {
      closePricingModal()
      return
    }
    document.dispatchEvent(new CustomEvent('plan:select', { detail: { planId: cta.dataset.plan } }))
  })

  document.body.appendChild(modalOverlay)
}

// Global CTA click handler — catches clicks outside the modal (e.g. exhausted zone)
document.addEventListener('click', (e) => {
  const cta = e.target.closest('.plan-cta')
  if (!cta) return
  if (modalOverlay && modalOverlay.contains(cta)) return
  if (cta.dataset.plan !== 'free') {
    e.preventDefault()
    document.dispatchEvent(new CustomEvent('plan:select', { detail: { planId: cta.dataset.plan } }))
  }
})

export function openPricingModal() {
  if (!modalOverlay) initPricingModal()
  modalOverlay.hidden = false
  document.body.style.overflow = 'hidden'
}

export function closePricingModal() {
  if (modalOverlay) {
    modalOverlay.hidden = true
    document.body.style.overflow = ''
  }
}

/* ─── Header Plan Badge ─── */

export function updateHeaderBadge(used, tier = 'free') {
  const badge = document.getElementById('planBadge')
  if (!badge) return

  if (tier === 'free') {
    const remaining = Math.max(0, 3 - used)
    badge.textContent = remaining > 0 ? `Free (${used + 1}/3)` : 'Free (Used up)'
    badge.className = 'plan-badge-header'
  } else if (tier === 'plus') {
    badge.textContent = `Plus (${used}/30)`
    badge.className = 'plan-badge-header badge-plus'
  } else if (tier === 'business') {
    badge.textContent = `Business (${used}/150)`
    badge.className = 'plan-badge-header badge-business'
  }

  badge.hidden = false
}

export function hideHeaderBadge() {
  const badge = document.getElementById('planBadge')
  if (badge) badge.hidden = true
}

/* ─── Exhausted State (replaces upload zone) ─── */

export function getExhaustedHTML() {
  // Show only Plus & Business (free is exhausted)
  const paidPlans = PLANS.filter(p => p.id !== 'free')
  return `
    <div id="exhaustedZone" class="exhausted-zone">
      <div class="exhausted-content">
        <h2 class="exhausted-title">You've used all 3 free attempts ✨</h2>
        <p class="exhausted-sub">Upgrade to continue removing backgrounds.</p>
        <div class="plan-cards exhausted-cards">
          ${paidPlans.map(p => buildPlanCard(p, 'large')).join('')}
        </div>
      </div>
    </div>
  `
}

/* ─── Login Prompt (inline, below result) ─── */

export function getLoginPromptHTML() {
  return `
    <div id="loginPrompt" class="login-prompt">
      <div class="login-prompt-body">
        <p class="login-prompt-title">🔒 Sign in to download your image</p>
        <p class="login-prompt-sub">Free users get 3 attempts. No credit card required.</p>
        <button id="promptGoogleBtn" class="btn-google">
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Sign in with Google
        </button>
      </div>
    </div>
  `
}

/* ─── Warning Callouts ─── */

export function getWarningHTML(type, data) {
  if (type === 'low-attempt') {
    const remaining = data.remaining
    return `
      <div class="callout callout-warning">
        <span class="callout-text">⚡ Only ${remaining} free attempt${remaining > 1 ? 's' : ''} remaining!</span>
        <button class="callout-btn callout-pricing-btn">See Plans →</button>
        <button class="callout-close" aria-label="Dismiss">&times;</button>
      </div>
    `
  }

  if (type === 'plus-upgrade') {
    const { used, total } = data
    return `
      <div class="callout callout-info">
        <span class="callout-text">📊 You've used ${used} out of ${total} this month. Upgrade to Business for 150 removals + premium features.</span>
        <button class="callout-btn callout-pricing-btn">Upgrade →</button>
        <button class="callout-close" aria-label="Dismiss">&times;</button>
      </div>
    `
  }

  return ''
}
