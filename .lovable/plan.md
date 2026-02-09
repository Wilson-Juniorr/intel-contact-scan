

# CRM de Planos de Saúde - Sistema Completo

## Visão Geral
Um CRM especializado para corretores de planos de saúde, com captura inteligente de leads por imagem (OCR via IA), gestão completa do funil de vendas e acesso rápido ao WhatsApp.

---

## 1. Dashboard Principal
- **Resumo visual** com cards: Total de Leads, Leads Novos (hoje/semana), Em Negociação, Convertidos, Perdidos
- **Gráfico de funil** mostrando a conversão por etapa
- **Lista de leads recentes** com status e ações rápidas
- **Indicadores de follow-up**: leads que precisam de contato hoje

## 2. Cadastro de Leads
### Cadastro Manual
- Formulário com: Nome, Telefone, Email, Tipo (PF/PJ/PME), Operadora de interesse, Quantidade de vidas, Observações

### Cadastro por Imagem (IA + OCR)
- Upload de foto/print contendo nome e número do lead
- A IA (Lovable AI com Gemini) analisa a imagem e extrai automaticamente nome e telefone
- Pré-preenche o formulário para o usuário confirmar e salvar
- Suporte a múltiplos formatos: prints de WhatsApp, listas, cartões

## 3. Funil de Vendas (Kanban)
Colunas do funil adaptadas ao mercado de saúde:
- **Novo Lead** → **Primeiro Contato** → **Cotação Enviada** → **Em Negociação** → **Proposta Aceita** → **Implantação** → **Convertido**
- Coluna extra: **Perdido** (com motivo)
- Arrastar e soltar cards entre colunas
- Cada card mostra: nome, telefone, operadora, dias no estágio

## 4. Ficha Completa do Lead
- Dados pessoais e de contato
- Tipo de plano procurado (Individual, Familiar, Empresarial, PME)
- Operadoras cotadas e valores
- **Timeline de interações**: registro de cada contato feito (ligação, WhatsApp, reunião)
- Campo para adicionar notas/observações
- Botão de WhatsApp direto (abre conversa com o número)
- Histórico de mudanças de status no funil

## 5. Assistente IA Integrado
- **Chat com IA** para tirar dúvidas sobre planos, coberturas, carências
- Sugestões inteligentes de follow-up baseadas no perfil do lead
- Geração de mensagens prontas para enviar ao lead via WhatsApp
- Resumo automático do lead para agilizar atendimento

## 6. Lembretes e Follow-up
- Agendar lembretes por lead (data e hora)
- Notificações visuais de leads que precisam de contato
- Indicador de "dias sem contato" em cada lead

## 7. Design e Experiência
- Interface moderna, escura com acentos em azul/verde (remetendo a saúde)
- 100% responsivo (funciona bem no celular)
- Navegação lateral com: Dashboard, Leads, Funil, Assistente IA
- Busca rápida de leads por nome ou telefone

## Tecnologia
- **Frontend**: React + Tailwind (já configurado)
- **Backend**: Lovable Cloud (banco de dados, autenticação, storage para imagens)
- **IA**: Lovable AI (Gemini) para OCR de imagens e assistente inteligente
- **Storage**: Para armazenar as imagens enviadas dos leads

