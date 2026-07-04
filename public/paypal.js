/**
 * paypal.js â€” HuMem.cloud PayPal Subscription Integration
 * Product: PROD-3JU28167C60761939
 *
 * Live Plan IDs:
 *   Monthly Developer:    P-4KY808330K309150YNJEEW4A   ($49/mo)
 *   Monthly Enterprise:   P-71961006SN812100KNJEEW6Y   ($499/mo)
 *   Annual Developer:     P-39A998600S2661703NJEEXVQ   ($468/yr â€” 20% off)
 *   Annual Enterprise:    P-5EV669883V112024ENJEEXYA   ($4,788/yr â€” 20% off)
 */

const PAYPAL_CLIENT_ID = 'AaNitTUh_XOdWy2fLAqHvd59cvYd961wP-blU5RSng7WSx81g9BYFrfIyUm_rAoykfNsx4UKtPt_jurF';

const PLANS = {
  monthly: {
    developer:  { id: 'P-4KY808330K309150YNJEEW4A',  label: 'HuMem Developer â€” $49/month' },
    enterprise: { id: 'P-71961006SN812100KNJEEW6Y',  label: 'HuMem Enterprise â€” $499/month' },
  },
  annual: {
    developer:  { id: 'P-39A998600S2661703NJEEXVQ',  label: 'HuMem Developer â€” $468/year (20% off)' },
    enterprise: { id: 'P-5EV669883V112024ENJEEXYA',  label: 'HuMem Enterprise â€” $4,788/year (20% off)' },
  },
};

let currentBilling = 'monthly'; // default view
let sdkLoaded = false;

// â”€â”€ Load PayPal SDK once â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function loadPayPalSDK() {
  return new Promise((resolve, reject) => {
    if (sdkLoaded) return resolve();
    if (document.getElementById('paypal-sdk')) { sdkLoaded = true; return resolve(); }
    const script = document.createElement('script');
    script.id = 'paypal-sdk';
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription&currency=USD&components=buttons`;
    script.onload = () => { sdkLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// â”€â”€ Render a single PayPal Subscribe button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderButton(containerId, planId, planLabel) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  window.paypal.Buttons({
    style: { shape: 'pill', color: 'gold', layout: 'vertical', label: 'subscribe' },
    createSubscription(data, actions) {
      return actions.subscription.create({ plan_id: planId });
    },
    onApprove(data) {
      alert(`ðŸŽ‰ You are now subscribed to ${planLabel}! Redirecting to your dashboard...`);
      window.location.href = '/dashboard.html';
    },
    onError(err) {
      console.error('PayPal error:', err);
      alert('There was a problem processing your subscription. Please try again or contact support@humem.cloud.');
    },
    onCancel() {
      console.log('PayPal checkout cancelled by user.');
    },
  }).render(`#${containerId}`);
}

// â”€â”€ Re-render both buttons for the active billing period â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderAllButtons(billing) {
  const plans = PLANS[billing];
  renderButton('paypal-btn-developer',  plans.developer.id,  plans.developer.label);
  renderButton('paypal-btn-enterprise', plans.enterprise.id, plans.enterprise.label);
}

// â”€â”€ Update the pricing display when billing period toggles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function updatePricingDisplay(billing) {
  const isAnnual = billing === 'annual';

  // Developer card
  document.getElementById('price-developer').textContent  = isAnnual ? '$39' : '$49';
  document.getElementById('period-developer').textContent = isAnnual ? '/mo billed annually' : '/month';
  const saveDev = document.getElementById('savings-developer');
  if (saveDev) saveDev.style.display = isAnnual ? 'inline-block' : 'none';

  // Enterprise card
  document.getElementById('price-enterprise').textContent  = isAnnual ? '$399' : '$499';
  document.getElementById('period-enterprise').textContent = isAnnual ? '/mo billed annually' : '/month';
  const saveEnt = document.getElementById('savings-enterprise');
  if (saveEnt) saveEnt.style.display = isAnnual ? 'inline-block' : 'none';
}

// â”€â”€ Toggle handler wired to the billing toggle switch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setBillingPeriod(billing) {
  currentBilling = billing;

  // Update toggle button states
  document.querySelectorAll('.billing-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.billing === billing);
  });

  updatePricingDisplay(billing);
  renderAllButtons(billing);
}

// â”€â”€ Initialize on DOM ready â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function initPayPal() {
  try {
    await loadPayPalSDK();
    renderAllButtons(currentBilling);
  } catch (err) {
    console.error('PayPal init failed:', err);
    ['paypal-btn-developer', 'paypal-btn-enterprise'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<a href="mailto:sales@humem.cloud" class="btn btn-ghost">Contact Sales</a>';
    });
  }
}

// Expose toggle to inline HTML onclick
window.setBillingPeriod = setBillingPeriod;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPayPal);
} else {
  initPayPal();
}
