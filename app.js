const state = {
  currentStep: 1,
  totalSteps: 9,
  whatsappNumber: '5521981515646'
};

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function getUtmParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    source: params.get('utm_source') || 'site',
    medium: params.get('utm_medium') || '',
    campaign: params.get('utm_campaign') || '',
    term: params.get('utm_term') || '',
    content: params.get('utm_content') || '',
    referrer: document.referrer || ''
  };
}

function makeWhatsappUrl(number, message) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const data = await response.json();
    if (data.whatsappNumber) state.whatsappNumber = data.whatsappNumber;
  } catch (_) {
    state.whatsappNumber = '5521981515646';
  }

  const message = 'Olá, gostaria de fazer uma cotação de plano de saúde com a Azevedo Saúde.';
  ['#heroWhatsapp', '#heroWhatsapp2', '#finalWhatsapp'].forEach((selector) => {
    const link = qs(selector);
    if (link) link.href = makeWhatsappUrl(state.whatsappNumber, message);
  });
}

function setupMenu() {
  const button = qs('#mobileMenu');
  const nav = qs('#nav');
  if (!button || !nav) return;
  button.addEventListener('click', () => nav.classList.toggle('open'));
  qsa('a', nav).forEach((link) => link.addEventListener('click', () => nav.classList.remove('open')));
}

function showError(message) {
  const box = qs('#formError');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
}

function clearError() {
  const box = qs('#formError');
  if (!box) return;
  box.textContent = '';
  box.classList.remove('show');
}

function updateStepUI() {
  qsa('.form-step').forEach((step) => {
    step.classList.toggle('active', Number(step.dataset.step) === state.currentStep);
  });

  const percent = Math.round((state.currentStep / state.totalSteps) * 100);
  const stepText = qs('#stepText');
  const progressPercent = qs('#progressPercent');
  const progressBar = qs('#progressBar');
  const prevBtn = qs('#prevBtn');
  const nextBtn = qs('#nextBtn');
  const submitBtn = qs('#submitBtn');

  if (stepText) stepText.textContent = `Etapa ${state.currentStep} de ${state.totalSteps}`;
  if (progressPercent) progressPercent.textContent = `${percent}%`;
  if (progressBar) progressBar.style.width = `${percent}%`;
  if (prevBtn) prevBtn.style.visibility = state.currentStep === 1 ? 'hidden' : 'visible';
  if (nextBtn) nextBtn.classList.toggle('hidden', state.currentStep === state.totalSteps);
  if (submitBtn) submitBtn.classList.toggle('hidden', state.currentStep !== state.totalSteps);
}

function currentStepIsValid() {
  const step = qs(`.form-step[data-step="${state.currentStep}"]`);
  if (!step) return true;
  const inputs = qsa('input, textarea, select', step);

  for (const input of inputs) {
    if (input.type === 'radio') {
      const group = qsa(`input[name="${input.name}"]`, step);
      if (group.some((item) => item.required) && !group.some((item) => item.checked)) {
        showError('Escolha uma opção para continuar.');
        return false;
      }
    } else if (input.type === 'checkbox') {
      if (input.required && !input.checked) {
        showError('Você precisa autorizar o contato para enviar a cotação.');
        return false;
      }
    } else if (input.required && !input.value.trim()) {
      showError('Preencha o campo obrigatório para continuar.');
      input.focus();
      return false;
    }
  }

  clearError();
  return true;
}

function setupShortcuts() {
  qsa('.plan-shortcut').forEach((link) => {
    link.addEventListener('click', () => {
      const plan = link.dataset.plan;
      const input = qs(`input[name="planType"][value="${plan}"]`);
      if (input) input.checked = true;
      state.currentStep = 1;
      updateStepUI();
    });
  });
}

function getFormPayload(form) {
  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  payload.consent = data.get('consent') === 'on';
  return { ...payload, ...getUtmParams() };
}

function localScore(payload) {
  let score = 0;
  if (payload.hiringTime === 'Hoje') score += 35;
  if (payload.hiringTime === 'Esta semana') score += 25;
  if (payload.hiringTime === 'Este mês') score += 15;
  if (['3 a 5 vidas', '6 a 10 vidas'].includes(payload.lives)) score += 18;
  if (payload.lives === 'Mais de 10 vidas') score += 25;
  if (['Empresarial', 'MEI'].includes(payload.planType)) score += 20;
  if (payload.hasPlan === 'Sim, quero trocar') score += 15;
  if (payload.budget && payload.budget !== 'Quero avaliar opções') score += 10;
  if (String(payload.phone || '').replace(/\D/g, '').length >= 10) score += 10;
  if (score >= 70) return 'Quente';
  if (score >= 40) return 'Morno';
  return 'Frio';
}

function saveThankYouContext(payload, response) {
  sessionStorage.setItem('lastLead', JSON.stringify({
    ...payload,
    leadId: response.leadId,
    temperature: response.temperature || localScore(payload),
    score: response.score || 0,
    whatsappNumber: response.whatsappNumber || state.whatsappNumber
  }));
}

async function submitLead(form) {
  clearError();
  const submitBtn = qs('#submitBtn');
  const payload = getFormPayload(form);

  if (!payload.consent) {
    showError('Você precisa autorizar o contato para enviar a cotação.');
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
    }

    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error((result.errors && result.errors.join(' ')) || result.message || 'Não foi possível enviar o lead.');
    }

    saveThankYouContext(payload, result);
    window.location.href = '/obrigado.html';
  } catch (error) {
    showError(error.message || 'Erro ao enviar cotação. Tente novamente.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar cotação';
    }
  }
}

function setupForm() {
  const form = qs('#leadForm');
  if (!form) return;

  qs('#nextBtn')?.addEventListener('click', () => {
    if (!currentStepIsValid()) return;
    state.currentStep = Math.min(state.currentStep + 1, state.totalSteps);
    updateStepUI();
  });

  qs('#prevBtn')?.addEventListener('click', () => {
    clearError();
    state.currentStep = Math.max(state.currentStep - 1, 1);
    updateStepUI();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentStepIsValid()) return;
    submitLead(form);
  });

  qsa('.option-grid input').forEach((input) => {
    input.addEventListener('change', () => {
      clearError();
      if (window.innerWidth > 760 && state.currentStep < state.totalSteps) {
        setTimeout(() => {
          if (currentStepIsValid()) {
            state.currentStep += 1;
            updateStepUI();
          }
        }, 140);
      }
    });
  });

  updateStepUI();
}

function setupThankYouPage() {
  const box = qs('#thanksContent');
  if (!box) return;

  const lastLead = JSON.parse(sessionStorage.getItem('lastLead') || '{}');
  const name = lastLead.name || 'Tudo certo';
  const planType = lastLead.planType || 'plano de saúde';
  const temperature = lastLead.temperature || 'Novo';
  const number = lastLead.whatsappNumber || state.whatsappNumber;
  const message = `Olá, acabei de preencher a cotação no site da Azevedo Saúde. Meu nome é ${lastLead.name || ''} e procuro um plano ${planType}.`;

  box.innerHTML = `
    <span class="badge">Solicitação recebida</span>
    <h1>${name}, sua cotação foi enviada.</h1>
    <p>Seu perfil foi classificado como <strong>${temperature}</strong>. A equipe da Azevedo Saúde poderá usar essas informações para agilizar o atendimento.</p>
    <div class="lead-preview-grid" style="margin: 24px 0;">
      <div><span>Tipo de plano</span><strong>${planType}</strong></div>
      <div><span>Quantidade de vidas</span><strong>${lastLead.lives || '-'}</strong></div>
      <div><span>Cidade</span><strong>${lastLead.city || '-'}</strong></div>
      <div><span>Prazo</span><strong>${lastLead.hiringTime || '-'}</strong></div>
    </div>
    <div class="hero-actions">
      <a class="btn btn-primary" href="${makeWhatsappUrl(number, message)}" target="_blank" rel="noopener">Falar agora no WhatsApp</a>
      <a class="btn btn-secondary" href="/">Voltar para o início</a>
    </div>
  `;
}

loadConfig();
setupMenu();
setupForm();
setupShortcuts();
setupThankYouPage();

function setupLandingContext() {
  const path = window.location.pathname;
  const heroTitle = document.querySelector('.hero h1');
  const heroSubtitle = document.querySelector('.hero-content p');

  const contexts = {
    '/empresarial': {
      title: 'Plano de saúde empresarial para sua equipe, com cotação rápida pelo WhatsApp',
      subtitle: 'Informe o perfil da empresa, quantidade de vidas e cidade para receber atendimento especializado.',
      plan: 'Empresarial'
    },
    '/mei': {
      title: 'Plano de saúde para MEI com orientação especializada',
      subtitle: 'Cote opções usando seu CNPJ MEI e veja alternativas para você e seus dependentes.',
      plan: 'MEI'
    },
    '/odontologico': {
      title: 'Plano odontológico para você, sua família ou empresa',
      subtitle: 'Receba opções de plano odontológico com atendimento rápido e contratação orientada.',
      plan: 'Odontológico'
    }
  };

  const context = contexts[path];
  if (!context) return;

  if (heroTitle) heroTitle.textContent = context.title;
  if (heroSubtitle) heroSubtitle.textContent = context.subtitle;

  const input = document.querySelector(`input[name="planType"][value="${context.plan}"]`);
  if (input) input.checked = true;
}

setupLandingContext();
