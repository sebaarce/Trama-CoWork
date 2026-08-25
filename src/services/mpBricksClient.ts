import { fetchBricksConfig, subscribeWithBricks, type BricksCheckoutPlan } from './subscriptionService';

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => {
      bricks: () => {
        create: (
          type: string,
          containerId: string,
          settings: Record<string, unknown>,
        ) => Promise<{ unmount: () => void }>;
      };
    };
  }
}

interface PaymentFormData {
  token: string;
  payer?: {
    email?: string;
  };
}

interface StartBricksCheckoutOptions {
  plan: BricksCheckoutPlan;
  userEmail: string;
  triggerButton: HTMLElement;
  showToast: (message: string, type: 'success' | 'error') => void;
}

interface ModalRefs {
  modal: HTMLElement;
  backdrop: HTMLElement;
  close: HTMLElement;
  planName: HTMLElement;
  planAmount: HTMLElement;
  loading: HTMLElement;
  error: HTMLElement;
  errorMsg: HTMLElement;
  container: HTMLElement;
}

const MP_SDK_URL = 'https://sdk.mercadopago.com/js/v2';
const MODAL_ROOT_ID = 'rollback-brick-modal-root';
const MODAL_TEMPLATE = `
  <div id="rollback-brick-modal" class="hidden fixed inset-0 z-50 items-center justify-center p-4">
    <div id="rollback-brick-backdrop" class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
    <div class="relative bg-surface-container-low rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
      <div class="sticky top-0 bg-surface-container-low z-10 flex items-start justify-between gap-4 p-6 pb-4 border-b border-outline-variant/15">
        <div>
          <h2 class="text-xl font-extrabold text-on-surface tracking-tight">Completar pago</h2>
          <p class="text-sm text-on-surface-variant mt-1">
            <span id="rollback-brick-plan-name" class="font-bold text-on-surface">—</span>
            <span id="rollback-brick-plan-amount"></span>
          </p>
        </div>
        <button id="rollback-brick-close" type="button" aria-label="Cerrar"
          class="shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors">
          <span class="material-symbols-outlined text-xl" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="p-6">
        <div id="rollback-brick-loading" class="flex flex-col items-center justify-center py-16 gap-4">
          <div class="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          <p class="text-sm font-medium text-on-surface-variant">Cargando medios de pago...</p>
        </div>
        <div id="rollback-brick-error" class="hidden text-center py-12">
          <span class="material-symbols-outlined text-4xl text-error mb-3 block" aria-hidden="true">error</span>
          <p id="rollback-brick-error-msg" class="text-sm font-medium text-on-surface-variant">No se pudieron cargar los medios de pago.</p>
        </div>
        <div id="rollback-brick-container"></div>
      </div>
    </div>
  </div>
`;

let mpPublicKey: string | null = null;
let brickController: { unmount: () => void } | null = null;
let modalRefs: ModalRefs | null = null;
let escHandlerBound = false;

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'ARS',
    minimumFractionDigits: 0,
  }).format(amount);
}

function frequencyLabel(freq: number, type: string): string {
  const labels: Record<string, string> = { days: 'dia', months: 'mes', years: 'año' };
  const label = labels[type] || type;
  if (freq === 1) return `/${label}`;
  return `cada ${freq} ${label}${freq > 1 ? (type === 'months' ? 'es' : 's') : ''}`;
}

function closeBrickModal() {
  if (!modalRefs) return;
  modalRefs.modal.classList.add('hidden');
  modalRefs.modal.classList.remove('flex');
  document.body.style.overflow = '';
  if (brickController) {
    try {
      brickController.unmount();
    } catch {
      // noop
    }
    brickController = null;
  }
  modalRefs.container.innerHTML = '';
}

function ensureModalRefs(): ModalRefs {
  if (modalRefs) return modalRefs;

  let root = document.getElementById(MODAL_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = MODAL_ROOT_ID;
    root.innerHTML = MODAL_TEMPLATE;
    document.body.appendChild(root);
  }

  modalRefs = {
    modal: document.getElementById('rollback-brick-modal')!,
    backdrop: document.getElementById('rollback-brick-backdrop')!,
    close: document.getElementById('rollback-brick-close')!,
    planName: document.getElementById('rollback-brick-plan-name')!,
    planAmount: document.getElementById('rollback-brick-plan-amount')!,
    loading: document.getElementById('rollback-brick-loading')!,
    error: document.getElementById('rollback-brick-error')!,
    errorMsg: document.getElementById('rollback-brick-error-msg')!,
    container: document.getElementById('rollback-brick-container')!,
  };

  modalRefs.close.addEventListener('click', closeBrickModal);
  modalRefs.backdrop.addEventListener('click', closeBrickModal);

  if (!escHandlerBound) {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modalRefs && !modalRefs.modal.classList.contains('hidden')) {
        closeBrickModal();
      }
    });
    escHandlerBound = true;
  }

  return modalRefs;
}

function openBrickModal(plan: BricksCheckoutPlan): ModalRefs {
  const refs = ensureModalRefs();
  refs.planName.textContent = plan.name;
  refs.planAmount.textContent = ` · ${formatCurrency(plan.amount, plan.currency)}${frequencyLabel(plan.frequency, plan.frequencyType)}`;
  refs.error.classList.add('hidden');
  refs.loading.classList.remove('hidden');
  refs.container.innerHTML = '';
  refs.modal.classList.remove('hidden');
  refs.modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
  return refs;
}

function loadMpSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('mp-sdk') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Mercado Pago')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'mp-sdk';
    script.src = MP_SDK_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Mercado Pago'));
    document.head.appendChild(script);
  });
}

async function processBrickSubscription(planId: string, formData: PaymentFormData, showToast: StartBricksCheckoutOptions['showToast']): Promise<void> {
  try {
    const baseUrl = import.meta.env.PUBLIC_BASE_URL || window.location.origin;
    const result = await subscribeWithBricks({
      planId,
      token: formData.token,
      payerEmail: formData.payer?.email,
      backUrl: `${baseUrl}/dashboard/pagos`,
    });

    if (result.status === 'authorized' || result.status === 'active' || result.status === 'pending') {
      const status = result.status === 'active' ? 'authorized' : result.status;
      const params = new URLSearchParams({ status });
      if (result.message) params.set('msg', result.message);
      if (result.nextPaymentDate) params.set('next_payment', result.nextPaymentDate);
      window.location.href = `/dashboard/pagos/resultado?${params.toString()}`;
      return;
    }

    showToast(result.message || 'No se pudo activar la suscripción. Probá con otra tarjeta.', 'error');
    throw new Error(result.status || 'rejected');
  } catch (err: unknown) {
    const error = err as Error & { status?: number; body?: { message?: string } };
    if (error?.status === 409) {
      closeBrickModal();
      showToast('Ya tenés una suscripción activa.', 'error');
      setTimeout(() => location.reload(), 1200);
      return;
    }
    if (error?.status) {
      showToast(error?.body?.message || error?.message || 'No se pudo procesar el pago.', 'error');
    }
    throw error instanceof Error ? error : new Error('payment_failed');
  }
}

export async function startBricksCheckout(options: StartBricksCheckoutOptions): Promise<void> {
  const { plan, userEmail, triggerButton, showToast } = options;
  const refs = openBrickModal(plan);

  triggerButton.setAttribute('disabled', '');
  triggerButton.innerHTML = '<div class="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin"></div> Procesando...';

  try {
    if (!mpPublicKey) {
      const config = await fetchBricksConfig();
      mpPublicKey = config.publicKey;
    }

    await loadMpSdk();
    if (!window.MercadoPago) throw new Error('No se pudo cargar Mercado Pago');

    const mp = new window.MercadoPago(mpPublicKey, { locale: 'es-AR' });
    const bricks = mp.bricks();

    brickController = await bricks.create('payment', 'rollback-brick-container', {
      initialization: {
        amount: Number(plan.amount),
        payer: { email: userEmail },
      },
      customization: {
        paymentMethods: {
          creditCard: 'all',
          debitCard: 'all',
        },
      },
      callbacks: {
        onReady: () => {
          refs.loading.classList.add('hidden');
        },
        onError: (error: unknown) => {
          console.error('Brick error:', error);
          refs.loading.classList.add('hidden');
          refs.error.classList.remove('hidden');
          refs.errorMsg.textContent = 'Ocurrió un error con el formulario de pago. Intentá de nuevo.';
        },
        onSubmit: ({ formData }: { formData: PaymentFormData }) => processBrickSubscription(plan.id, formData, showToast),
      },
    });
  } catch (err: unknown) {
    const error = err as Error & { status?: number };
    refs.loading.classList.add('hidden');

    if (error?.status === 409) {
      closeBrickModal();
      showToast('Ya tenés una suscripción activa.', 'error');
      setTimeout(() => location.reload(), 1200);
      return;
    }

    refs.error.classList.remove('hidden');
    refs.errorMsg.textContent = error?.message || 'No se pudieron cargar los medios de pago.';
  } finally {
    triggerButton.removeAttribute('disabled');
    triggerButton.innerHTML = '<span class="material-symbols-outlined text-sm" aria-hidden="true">credit_card</span> Suscribirme';
  }
}

// Traceability: implementation by Programmer at 2026-06-22 09:19:41
