# Azevedo Saúde

Site completo de captação de leads para corretores de planos de saúde.

## O que vem pronto

- Landing page profissional.
- Simulador de cotação em etapas.
- Qualificação automática do lead: quente, morno ou frio.
- API para salvar leads.
- Painel administrativo simples.
- Página de obrigado com CTA para WhatsApp.
- Estrutura LGPD com consentimento obrigatório.
- Pronto para integrar com CRM via webhook.

## Como rodar localmente

1. Instale o Node.js.
2. Abra a pasta do projeto no terminal.
3. Rode:

```bash
npm install
npm start
```

4. Acesse:

```txt
http://localhost:3000
```

## Painel administrativo

Acesse:

```txt
http://localhost:3000/admin.html
```

Use o token configurado no arquivo `.env`.

Para começar rápido, copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

Depois edite:

```txt
ADMIN_TOKEN=seu-token-seguro
WHATSAPP_NUMBER=5521981515646
WEBHOOK_URL=https://seu-crm.com/webhook
```

## Integração com WhatsApp

O botão da página de obrigado usa o número definido em `WHATSAPP_NUMBER`.

## Integração com CRM

Se `WEBHOOK_URL` estiver preenchido, todo lead novo será enviado por POST para esse endereço.

## Observação importante

Este projeto é uma base funcional. Para produção, recomenda-se trocar o armazenamento em JSON por banco de dados, usar autenticação real no painel, logs seguros e revisão jurídica da Política de Privacidade/LGPD.
