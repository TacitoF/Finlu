# 📱 Finlu — Assistente Financeiro PWA

Aplicativo de finanças pessoais progressivo (PWA), otimizado para iPhone.  
100% offline, todos os dados ficam no dispositivo.

---

## 🚀 Como usar

### 1. Servir localmente (desenvolvimento)

```bash
# Python 3
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8080
```

Abra `http://localhost:8080` no Safari do iPhone (ou no navegador do desktop).

### 2. Deploy em produção

Faça upload de TODOS os arquivos para qualquer host HTTPS:

- Vercel, Netlify, GitHub Pages (grátis)
- Seu próprio servidor Nginx/Apache

> ⚠️ O Service Worker **exige HTTPS** para funcionar em produção.

### 3. Instalar no iPhone

1. Abra o site no **Safari** do iPhone
2. Toque no botão **Compartilhar** (quadrado com seta para cima)
3. Role e toque em **"Adicionar à Tela de Início"**
4. Confirme o nome e toque em **Adicionar**

O app aparecerá na tela inicial como um app nativo! ✅

---

## 📁 Estrutura de arquivos

```
financeapp/
├── index.html          # App shell + HTML completo
├── styles.css          # Design system + layout
├── app.js              # Toda a lógica do app
├── sw.js               # Service Worker (offline)
├── manifest.json       # PWA manifest
├── generate_icons.py   # Script Python para gerar ícones
└── icons/
    ├── icon-120.png    # iPhone Retina
    ├── icon-152.png    # iPad Retina
    ├── icon-180.png    # iPhone @3x (Apple Touch Icon)
    ├── icon-192.png    # Android / PWA
    └── icon-512.png    # Splash / Store
```

---

## ✨ Funcionalidades

### 💳 Transações
- Registrar gastos e receitas
- Categorias com ícones coloridos (13 padrão + personalizadas)
- Busca e filtro por tipo
- Swipe para deletar
- Data, descrição e nota

### 📊 Orçamentos
- Limite mensal por categoria
- Barra de progresso visual (verde/âmbar/vermelho)
- Alerta automático ao atingir 80%

### 🎯 Metas
- Nome, valor-alvo e prazo
- 8 ícones para escolher
- Depósitos incrementais
- Celebração ao atingir 100%

### 📈 Relatórios
- Períodos: 1M, 3M, 6M, 12M
- Gráfico de barras (receitas vs gastos)
- Gráfico de rosca por categoria
- Top 5 maiores gastos
- Taxa de poupança

### ⚙️ Configurações
- Nome e renda mensal
- Tema escuro / claro
- Moeda (R$, $, €)
- Categorias personalizadas
- Export CSV
- Reset de dados

---

## 📱 Otimizações iPhone

- `viewport-fit=cover` — ocupa toda a tela (sem barras brancas)
- `env(safe-area-inset-*)` — respeita notch e Dynamic Island
- `apple-mobile-web-app-capable` — modo fullscreen
- `apple-mobile-web-app-status-bar-style: black-translucent`
- Touch targets ≥ 44×44pt (padrão Apple HIG)
- `-webkit-overflow-scrolling: touch` — scroll inercial nativo
- `overscroll-behavior-y: contain` — previne pull-to-refresh indesejado
- `prefers-reduced-motion` respeitado
- Contraste WCAG AA em todo o app
- Todos os modais com `aria-modal`, `role="dialog"` e foco gerenciado

---

## 🛠️ Stack

| Tecnologia | Uso |
|---|---|
| Vanilla HTML/CSS/JS | Zero dependências de build |
| Chart.js 4.4 | Gráficos de barras e rosca |
| Tabler Icons | Ícones vetoriais (webfont) |
| Plus Jakarta Sans | Tipografia (Google Fonts) |
| localStorage | Persistência de dados |
| Service Worker | Offline + cache |
| Web App Manifest | Instalação PWA |

---

## 🔒 Privacidade

Todos os dados (transações, metas, orçamentos) ficam **exclusivamente no localStorage do seu dispositivo**.  
Nenhum dado é enviado para servidores externos.

---

*Desenvolvido com UI/UX Pro Max skill + design system fintech otimizado para iOS.*
