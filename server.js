require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'troque-este-token';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5521981515646';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(LEADS_FILE);
  } catch (_) {
    await fs.writeFile(LEADS_FILE, '[]', 'utf8');
  }
}

async function readLeads() {
  await ensureStorage();
  const raw = await fs.readFile(LEADS_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeLeads(leads) {
  await ensureStorage();
  await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function isValidBrazilianPhone(phone) {
  const cleaned = normalizePhone(phone);
  return cleaned.length >= 10 && cleaned.length <= 13;
}

function calculateLeadScore(payload) {
  let score = 0;
  const reasons = [];

  const hiringTime = payload.hiringTime || '';
  const lives = payload.lives || '';
  const type = payload.planType || '';
  const hasPlan = payload.hasPlan || '';
  const budget = payload.budget || '';
  const phone = normalizePhone(payload.phone);

  if (hiringTime === 'Hoje') {
    score += 35;
    reasons.push('pretende contratar hoje');
  } else if (hiringTime === 'Esta semana') {
    score += 25;
    reasons.push('pretende contratar esta semana');
  } else if (hiringTime === 'Este mês') {
    score += 15;
    reasons.push('pretende contratar este mês');
  }

  if (['3 a 5 vidas', '6 a 10 vidas', 'Mais de 10 vidas'].includes(lives)) {
    score += lives === 'Mais de 10 vidas' ? 25 : 18;
    reasons.push('possui múltiplas vidas');
  }

  if (['Empresarial', 'MEI'].includes(type)) {
    score += 20;
    reasons.push('perfil empresarial/MEI');
  }

  if (hasPlan === 'Sim, quero trocar') {
    score += 15;
    reasons.push('já possui plano e quer trocar');
  }

  if (budget && budget !== 'Quero avaliar opções') {
    score += 10;
    reasons.push('informou faixa de investimento');
  }

  if (isValidBrazilianPhone(phone)) {
    score += 10;
    reasons.push('WhatsApp informado');
  }

  let temperature = 'Frio';
  if (score >= 70) temperature = 'Quente';
  else if (score >= 40) temperature = 'Morno';

  return { score, temperature, reasons };
}

function validateLead(payload) {
  const errors = [];
  const required = ['name', 'phone', 'planType', 'audience', 'lives', 'city', 'hasPlan', 'budget', 'hiringTime'];

  required.forEach((field) => {
    if (!payload[field] || String(payload[field]).trim().length < 2) {
      errors.push(`Campo obrigatório ausente: ${field}`);
    }
  });

  if (!isValidBrazilianPhone(payload.phone)) {
    errors.push('WhatsApp inválido. Informe DDD e número.');
  }

  if (payload.consent !== true) {
    errors.push('Consentimento LGPD obrigatório.');
  }

  return errors;
}

function getOrigin(req, payload) {
  return {
    source: payload.source || req.query.utm_source || 'site',
    medium: payload.medium || req.query.utm_medium || '',
    campaign: payload.campaign || req.query.utm_campaign || '',
    term: payload.term || req.query.utm_term || '',
    content: payload.content || req.query.utm_content || '',
    referrer: payload.referrer || req.get('referer') || '',
    userAgent: req.get('user-agent') || ''
  };
}

async function sendWebhook(lead) {
  if (!WEBHOOK_URL) return { sent: false, reason: 'WEBHOOK_URL não configurado' };
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead)
    });
    return { sent: response.ok, status: response.status };
  } catch (error) {
    return { sent: false, error: error.message };
  }
}

app.get('/api/config', (req, res) => {
  res.json({
    whatsappNumber: WHATSAPP_NUMBER,
    projectName: 'Azevedo Saúde'
  });
});

app.post('/api/leads', async (req, res) => {
  try {
    const payload = req.body || {};
    const errors = validateLead(payload);
    if (errors.length) {
      return res.status(400).json({ ok: false, errors });
    }

    const scoring = calculateLeadScore(payload);
    const now = new Date().toISOString();

    const lead = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      status: 'Novo',
      name: String(payload.name).trim(),
      phone: normalizePhone(payload.phone),
      email: String(payload.email || '').trim(),
      bestTime: String(payload.bestTime || '').trim(),
      planType: payload.planType,
      audience: payload.audience,
      lives: payload.lives,
      city: String(payload.city).trim(),
      hasPlan: payload.hasPlan,
      budget: payload.budget,
      hiringTime: payload.hiringTime,
      notes: String(payload.notes || '').trim(),
      consent: true,
      consentText: 'Autorizo o contato da Azevedo Saúde para atendimento e cotação de planos de saúde.',
      score: scoring.score,
      temperature: scoring.temperature,
      reasons: scoring.reasons,
      origin: getOrigin(req, payload),
      ipHint: req.ip
    };

    const leads = await readLeads();
    leads.unshift(lead);
    await writeLeads(leads);

    const webhook = await sendWebhook(lead);

    res.status(201).json({
      ok: true,
      leadId: lead.id,
      temperature: lead.temperature,
      score: lead.score,
      whatsappNumber: WHATSAPP_NUMBER,
      webhook
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Erro ao salvar lead.', detail: error.message });
  }
});

function requireAdmin(req, res, next) {
  const token = req.get('x-admin-token') || req.query.token;
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Token administrativo inválido.' });
  }
  next();
}

app.get('/api/admin/leads', requireAdmin, async (req, res) => {
  const leads = await readLeads();
  const filters = {
    temperature: req.query.temperature,
    status: req.query.status,
    planType: req.query.planType,
    q: String(req.query.q || '').toLowerCase()
  };

  const filtered = leads.filter((lead) => {
    const matchesTemperature = !filters.temperature || lead.temperature === filters.temperature;
    const matchesStatus = !filters.status || lead.status === filters.status;
    const matchesPlan = !filters.planType || lead.planType === filters.planType;
    const searchable = `${lead.name} ${lead.phone} ${lead.email} ${lead.city} ${lead.planType}`.toLowerCase();
    const matchesQ = !filters.q || searchable.includes(filters.q);
    return matchesTemperature && matchesStatus && matchesPlan && matchesQ;
  });

  const summary = filtered.reduce((acc, lead) => {
    acc.total += 1;
    acc.byTemperature[lead.temperature] = (acc.byTemperature[lead.temperature] || 0) + 1;
    acc.byPlanType[lead.planType] = (acc.byPlanType[lead.planType] || 0) + 1;
    acc.byStatus[lead.status] = (acc.byStatus[lead.status] || 0) + 1;
    return acc;
  }, { total: 0, byTemperature: {}, byPlanType: {}, byStatus: {} });

  res.json({ ok: true, summary, leads: filtered });
});

app.patch('/api/admin/leads/:id', requireAdmin, async (req, res) => {
  const leads = await readLeads();
  const index = leads.findIndex((lead) => lead.id === req.params.id);
  if (index === -1) return res.status(404).json({ ok: false, message: 'Lead não encontrado.' });

  const allowedStatus = ['Novo', 'Em atendimento', 'Cotação enviada', 'Convertido', 'Perdido'];
  if (req.body.status && !allowedStatus.includes(req.body.status)) {
    return res.status(400).json({ ok: false, message: 'Status inválido.' });
  }

  leads[index] = {
    ...leads[index],
    status: req.body.status || leads[index].status,
    adminNotes: typeof req.body.adminNotes === 'string' ? req.body.adminNotes : leads[index].adminNotes,
    updatedAt: new Date().toISOString()
  };

  await writeLeads(leads);
  res.json({ ok: true, lead: leads[index] });
});

app.delete('/api/admin/leads/:id', requireAdmin, async (req, res) => {
  const leads = await readLeads();
  const next = leads.filter((lead) => lead.id !== req.params.id);
  if (next.length === leads.length) return res.status(404).json({ ok: false, message: 'Lead não encontrado.' });
  await writeLeads(next);
  res.json({ ok: true });
});

app.get('/saude', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/empresarial', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/mei', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/odontologico', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.listen(PORT, async () => {
  await ensureStorage();
  console.log(`Azevedo Saúde rodando em http://localhost:${PORT}`);
});
