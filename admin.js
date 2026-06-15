const adminState = {
  token: localStorage.getItem('adminToken') || '',
  leads: [],
  whatsappNumber: '5521981515646'
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[char]));
}

function phoneMask(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (clean.startsWith('55') && clean.length >= 12) {
    const ddd = clean.slice(2, 4);
    const first = clean.length === 13 ? clean.slice(4, 9) : clean.slice(4, 8);
    const second = clean.length === 13 ? clean.slice(9) : clean.slice(8);
    return `(${ddd}) ${first}-${second}`;
  }
  if (clean.length >= 10) {
    const ddd = clean.slice(0, 2);
    const first = clean.length === 11 ? clean.slice(2, 7) : clean.slice(2, 6);
    const second = clean.length === 11 ? clean.slice(7) : clean.slice(6);
    return `(${ddd}) ${first}-${second}`;
  }
  return phone || '-';
}

function makeWhatsAppUrl(phone, lead) {
  const clean = String(phone || '').replace(/\D/g, '');
  const number = clean.startsWith('55') ? clean : `55${clean}`;
  const message = `Olá, ${lead.name}. Recebi sua solicitação de cotação de plano de saúde pelo site. Posso te ajudar agora?`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const data = await response.json();
    if (data.whatsappNumber) adminState.whatsappNumber = data.whatsappNumber;
  } catch (_) {}
}

function getFilters() {
  const params = new URLSearchParams();
  const q = $('#searchInput')?.value.trim();
  const temperature = $('#temperatureFilter')?.value;
  const status = $('#statusFilter')?.value;
  const planType = $('#planFilter')?.value;

  if (q) params.set('q', q);
  if (temperature) params.set('temperature', temperature);
  if (status) params.set('status', status);
  if (planType) params.set('planType', planType);

  return params.toString();
}

async function fetchLeads() {
  if (!adminState.token) return;
  const query = getFilters();
  const response = await fetch(`/api/admin/leads${query ? `?${query}` : ''}`, {
    headers: { 'x-admin-token': adminState.token }
  });

  if (response.status === 401) {
    alert('Token inválido. Confira o ADMIN_TOKEN do .env.');
    logout();
    return;
  }

  const data = await response.json();
  adminState.leads = data.leads || [];
  renderSummary(data.summary || {});
  renderLeads(adminState.leads);
}

function renderSummary(summary) {
  const total = summary.total || 0;
  const hot = summary.byTemperature?.Quente || 0;
  const warm = summary.byTemperature?.Morno || 0;
  const converted = summary.byStatus?.Convertido || 0;

  $('#summaryCards').innerHTML = `
    <div class="summary-card"><span>Total filtrado</span><strong>${total}</strong></div>
    <div class="summary-card"><span>Leads quentes</span><strong>${hot}</strong></div>
    <div class="summary-card"><span>Leads mornos</span><strong>${warm}</strong></div>
    <div class="summary-card"><span>Convertidos</span><strong>${converted}</strong></div>
  `;
}

function renderLeads(leads) {
  const body = $('#leadsBody');
  if (!leads.length) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--muted); padding: 34px;">Nenhum lead encontrado.</td></tr>`;
    return;
  }

  body.innerHTML = leads.map((lead) => {
    const date = new Date(lead.createdAt).toLocaleString('pt-BR');
    const reasons = (lead.reasons || []).map(escapeHtml).join(', ');
    return `
      <tr>
        <td>
          <strong>${escapeHtml(lead.name)}</strong><br>
          <span style="color:var(--muted);">${phoneMask(lead.phone)}</span><br>
          <small>${escapeHtml(lead.email || '')}</small><br>
          <small>${date}</small>
        </td>
        <td>
          <span class="temp ${escapeHtml(lead.temperature)}">${escapeHtml(lead.temperature)}</span><br>
          <small>Score: ${lead.score}</small><br>
          <small title="${reasons}">${reasons || '-'}</small>
        </td>
        <td>
          <strong>${escapeHtml(lead.planType)}</strong><br>
          <small>${escapeHtml(lead.budget)}</small>
        </td>
        <td>
          ${escapeHtml(lead.lives)}<br>
          <small>${escapeHtml(lead.city)}</small><br>
          <small>${escapeHtml(lead.hasPlan)}</small><br>
          <small>Prazo: ${escapeHtml(lead.hiringTime)}</small>
        </td>
        <td>
          <strong>${escapeHtml(lead.origin?.source || 'site')}</strong><br>
          <small>${escapeHtml(lead.origin?.campaign || '')}</small>
        </td>
        <td>
          <select class="status-select" data-id="${lead.id}">
            ${['Novo', 'Em atendimento', 'Cotação enviada', 'Convertido', 'Perdido'].map((status) => `
              <option value="${status}" ${lead.status === status ? 'selected' : ''}>${status}</option>
            `).join('')}
          </select>
        </td>
        <td>
          <div class="table-actions">
            <a class="small-btn success" href="${makeWhatsAppUrl(lead.phone, lead)}" target="_blank" rel="noopener">WhatsApp</a>
            <button class="small-btn" type="button" data-copy="${lead.id}">Copiar</button>
            <button class="small-btn danger" type="button" data-delete="${lead.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.status-select').forEach((select) => {
    select.addEventListener('change', () => updateLeadStatus(select.dataset.id, select.value));
  });

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', () => copyLead(button.dataset.copy));
  });

  document.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteLead(button.dataset.delete));
  });
}

async function updateLeadStatus(id, status) {
  const response = await fetch(`/api/admin/leads/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminState.token
    },
    body: JSON.stringify({ status })
  });

  if (!response.ok) alert('Não foi possível atualizar o status.');
  await fetchLeads();
}

async function deleteLead(id) {
  if (!confirm('Deseja excluir este lead?')) return;
  const response = await fetch(`/api/admin/leads/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-token': adminState.token }
  });
  if (!response.ok) alert('Não foi possível excluir o lead.');
  await fetchLeads();
}

function copyLead(id) {
  const lead = adminState.leads.find((item) => item.id === id);
  if (!lead) return;
  const text = `Novo lead - Azevedo Saúde\n\nNome: ${lead.name}\nWhatsApp: ${phoneMask(lead.phone)}\nE-mail: ${lead.email || '-'}\nTipo de plano: ${lead.planType}\nPúblico: ${lead.audience}\nVidas: ${lead.lives}\nCidade: ${lead.city}\nPossui plano: ${lead.hasPlan}\nOrçamento: ${lead.budget}\nPrazo: ${lead.hiringTime}\nTemperatura: ${lead.temperature}\nScore: ${lead.score}\nObservações: ${lead.notes || '-'}`;
  navigator.clipboard.writeText(text);
  alert('Lead copiado.');
}

function login() {
  const token = $('#tokenInput').value.trim();
  if (!token) return alert('Digite o token administrativo.');
  adminState.token = token;
  localStorage.setItem('adminToken', token);
  showDashboard();
  fetchLeads();
}

function logout() {
  adminState.token = '';
  localStorage.removeItem('adminToken');
  $('#dashboard').classList.add('hidden');
  $('#loginBox').classList.remove('hidden');
}

function showDashboard() {
  $('#loginBox').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
}

function setupAdmin() {
  $('#saveTokenBtn').addEventListener('click', login);
  $('#logoutBtn').addEventListener('click', logout);
  $('#refreshBtn').addEventListener('click', fetchLeads);
  ['searchInput', 'temperatureFilter', 'statusFilter', 'planFilter'].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => fetchLeads());
    el.addEventListener('change', () => fetchLeads());
  });

  if (adminState.token) {
    $('#tokenInput').value = adminState.token;
    showDashboard();
    fetchLeads();
  }
}

loadConfig();
setupAdmin();
