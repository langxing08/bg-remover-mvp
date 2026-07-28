/* ─── Frontend PayPal Integration ───
 * Dynamically loads the PayPal JS SDK and handles the checkout flow.
 * Plan:select events from the pricing modal trigger PayPal here.
 */

/**
 * Load PayPal SDK script dynamically.
 * Returns a promise that resolves when the script is loaded.
 */
function loadPayPalSDK(clientId) {
  return new Promise((resolve, reject) => {
    // Avoid double-loading
    if (window.paypal) {
      resolve(window.paypal)
      return
    }
    // Check if a script tag is already being added
    if (document.querySelector('script[src*="paypal.com/sdk/js"]')) {
      const check = () => {
        if (window.paypal) return resolve(window.paypal)
        setTimeout(check, 200)
      }
      check()
      return
    }

    const script = document.createElement('script')
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture`
    script.async = true
    script.onload = () => resolve(window.paypal)
    script.onerror = () => reject(new Error('Failed to load PayPal SDK'))
    document.head.appendChild(script)
  })
}

/**
 * Container where the PayPal button is rendered.
 * Created once and reused.
 */
let checkoutContainer = null

function ensureContainer() {
  if (checkoutContainer && document.body.contains(checkoutContainer)) return checkoutContainer

  const el = document.createElement('div')
  el.id = 'paypalCheckout'
  el.className = 'paypal-checkout-overlay'
  el.hidden = true
  el.innerHTML = `
    <div class="paypal-checkout-modal">
      <button class="paypal-checkout-close" aria-label="Close">&times;</button>
      <h3 class="paypal-checkout-title">Complete Your Purchase</h3>
      <p class="paypal-checkout-plan" id="paypalPlanName"></p>
      <p class="paypal-checkout-price" id="paypalPlanPrice"></p>
      <div id="paypalButtonContainer" class="paypal-button-container"></div>
      <p class="paypal-checkout-note">You will be redirected to PayPal to complete your payment.</p>
    </div>
  `
  document.body.appendChild(el)
  checkoutContainer = el

  // Close button
  el.querySelector('.paypal-checkout-close').addEventListener('click', () => {
    el.hidden = true
    document.body.style.overflow = ''
  })

  // Click backdrop to close
  el.addEventListener('click', (e) => {
    if (e.target === el) {
      el.hidden = true
      document.body.style.overflow = ''
    }
  })

  return el
}

/**
 * Show the PayPal checkout modal.
 */
function showCheckout(planId, planName, price) {
  const el = ensureContainer()
  el.querySelector('#paypalPlanName').textContent = planName
  el.querySelector('#paypalPlanPrice').textContent = `$${price} USD`
  el.hidden = false
  document.body.style.overflow = 'hidden'
  return el
}

function hideCheckout() {
  if (checkoutContainer) {
    checkoutContainer.hidden = true
    document.body.style.overflow = ''
  }
}

/**
 * Show a success message after payment.
 */
function showSuccess(planId, planName) {
  hideCheckout()

  const el = document.createElement('div')
  el.className = 'paypal-success-overlay'
  el.innerHTML = `
    <div class="paypal-success-modal">
      <div class="paypal-success-icon">✅</div>
      <h3>Payment Successful!</h3>
      <p>You are now on the <strong>${planName}</strong> plan.</p>
      <p class="paypal-success-sub">Enjoy your premium features.</p>
      <button id="paypalSuccessBtn" class="btn btn-primary">Continue</button>
    </div>
  `
  document.body.appendChild(el)
  document.body.style.overflow = 'hidden'

  el.querySelector('#paypalSuccessBtn').addEventListener('click', () => {
    el.remove()
    document.body.style.overflow = ''
    window.location.reload()
  })
}

/**
 * Show an error message.
 */
function showError(msg) {
  hideCheckout()

  const el = document.createElement('div')
  el.className = 'paypal-success-overlay'
  el.innerHTML = `
    <div class="paypal-success-modal">
      <div class="paypal-success-icon" style="color:#ef4444;">❌</div>
      <h3>Payment Failed</h3>
      <p>${msg}</p>
      <button id="paypalErrorBtn" class="btn btn-primary">Try Again</button>
    </div>
  `
  document.body.appendChild(el)
  document.body.style.overflow = 'hidden'

  el.querySelector('#paypalErrorBtn').addEventListener('click', () => {
    el.remove()
    document.body.style.overflow = ''
  })
}

/* ─── Plan storage (used after successful payment) ─── */

const PLAN_KEY = 'bg_remover_plan'

function savePlan(tier, total) {
  const data = { tier, used: 0, total, purchasedAt: Date.now() }
  localStorage.setItem(PLAN_KEY, JSON.stringify(data))
}

/**
 * Update the used count for a paid plan (Plus/Business).
 * Called after each successful image processing.
 */
export function updatePlanUsage(used) {
  const plan = loadSavedPlan()
  if (plan) {
    plan.used = used
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan))
  }
}

export function loadSavedPlan() {
  try {
    const raw = localStorage.getItem(PLAN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearSavedPlan() {
  localStorage.removeItem(PLAN_KEY)
}

/* ─── Main entry: called when user clicks a plan CTA ─── */

const PLAN_INFO = {
  plus:  { name: 'Plus',  price: 9,  total: 30 },
  business: { name: 'Business', price: 29, total: 150 },
}

export async function startPaypalCheckout(planId) {
  const info = PLAN_INFO[planId]
  if (!info) return

  // 1. Fetch PayPal Client ID from server
  let clientId
  try {
    const res = await fetch('/api/paypal/config')
    const data = await res.json()
    clientId = data.clientId
  } catch (err) {
    showError('Failed to load payment config. Please try again.')
    return
  }

  // 2. Show checkout modal
  const modal = showCheckout(planId, `${info.name} Plan`, info.price)

  try {
    // 3. Load PayPal SDK
    const paypal = await loadPayPalSDK(clientId)

    // 4. Clear the button container and render buttons
    const container = document.getElementById('paypalButtonContainer')
    container.innerHTML = ''

    paypal.Buttons({
      createOrder: async () => {
        const res = await fetch('/api/paypal/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, price: info.price }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to create order')
        }
        const order = await res.json()
        return order.id
      },
      onApprove: async (data) => {
        const res = await fetch('/api/paypal/capture-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: data.orderID }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to capture order')
        }
        const capture = await res.json()

        // Check if payment was completed
        if (capture.status === 'COMPLETED') {
          savePlan(planId, info.total)
          showSuccess(planId, info.name)
        } else {
          showError('Payment was not completed. Please try again.')
        }
      },
      onCancel: () => {
        hideCheckout()
        // Could show a brief "cancelled" message, but just closing is fine
      },
      onError: (err) => {
        showError(err.message || 'An unexpected PayPal error occurred.')
      },
    }).render('#paypalButtonContainer')

  } catch (err) {
    showError(err.message || 'Failed to load PayPal. Please try again.')
  }
}
