# Guia rápido de publicação

## Opção 1: VPS

```bash
npm install
cp .env.example .env
nano .env
npm start
```

Depois configure Nginx/Apache para apontar o domínio para a porta 3000 e habilite HTTPS.

## Opção 2: Docker

```bash
docker build -t plano-lead-saude .
docker run -p 3000:3000 --env-file .env plano-lead-saude
```

## Opção 3: Render/Railway

- Build command: `npm install`
- Start command: `npm start`
- Variáveis de ambiente:
  - `PORT`
  - `ADMIN_TOKEN`
  - `WHATSAPP_NUMBER`
  - `WEBHOOK_URL`

## Eventos recomendados para anúncios

Na página `/obrigado.html`, configure os eventos de conversão do Google Ads e Meta Pixel.

Sugestão de eventos:

- Lead
- CompleteRegistration
- Contact

## Próximos upgrades recomendados

- Banco PostgreSQL.
- Login administrativo com usuário e senha.
- Envio de e-mail de notificação.
- Integração com CRM real.
- Distribuição automática por corretor/região.
- Relatório de CPL e taxa de conversão.
- Upload de tabela de operadoras/regiões.
