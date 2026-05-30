# DharMarnatee

**Clima, vento, ondas e maré**

Aplicativo web mobile-first para consulta de condições marinhas e meteorológicas no litoral brasileiro. Desenvolvido como presente para um/a pesquisador/a, com foco em transparência de dados, design limpo e responsividade mobile.

---

## O que o app faz

O usuário digita o nome de uma cidade, praia ou ponto costeiro. O app exibe cards organizados com:

| Card | Dados |
|------|-------|
| ☀️ Clima | Temperatura, sensação térmica, umidade |
| 💨 Vento | Velocidade (nós), direção, rajadas |
| 🌊 Ondas | Altura (m), período (s), direção |
| 🌙 Maré | Próxima cheia e baixa (horário local), tendência |
| ℹ️ Dados/Fonte | Fonte, coordenadas, cache, aviso de uso |

---

## Tecnologias

| Componente | Tecnologia |
|------------|------------|
| Backend | Python 3.11+ · Flask · Flask-CORS |
| Frontend | HTML5 · CSS3 · JavaScript (puro) |
| Dados marinhos | [Stormglass API](https://stormglass.io) |
| Geocoding fallback | [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) |
| Localidades | `backend/locations.json` (curado) |
| Cache local | Arquivo JSON em `backend/cache/` |

---

## Como executar

### Backend

```bash
cd backend

# Criar e ativar ambiente virtual (Windows)
python -m venv venv
venv\Scripts\activate

# Linux / macOS:
# source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Configurar chave de API (copie o exemplo)
copy .env.example .env
# Edite o arquivo .env e insira sua STORMGLASS_API_KEY

# Iniciar servidor
python app.py
```

O backend sobe em `http://localhost:5000`.

### Frontend

Abra `frontend/index.html` diretamente no navegador, ou sirva com qualquer servidor estático:

```bash
# Python (opção rápida)
cd frontend
python -m http.server 8080

# Depois acesse: http://localhost:8080
```

> O backend precisa estar rodando para o frontend funcionar.

---

## Configuração da chave Stormglass

1. Crie uma conta em [stormglass.io](https://stormglass.io)
2. Copie a API key do painel
3. No arquivo `backend/.env`, defina:

```env
STORMGLASS_API_KEY=sua_chave_aqui
```

A chave **nunca** é exposta ao frontend — ela permanece exclusivamente no backend.

---

## Como `locations.json` funciona

O arquivo `backend/locations.json` é a base primária de localidades costeiras. Cada entrada contém:

```json
{
  "guarapari_es": {
    "id": "guarapari_es",
    "name": "Guarapari",
    "region": "Litoral Sul",
    "state": "Espírito Santo",
    "country": "Brasil",
    "latitude": -20.6741,
    "longitude": -40.4997,
    "type": "cidade",
    "aliases": ["guarapari", "praia do morro", "setiba", "meaípe"]
  }
}
```

### Tipos válidos

`cidade` · `praia` · `ilha` · `baía` · `barra` · `porto` · `ponto_costeiro` · `distrito`

### Como adicionar novos locais

1. Abra `backend/locations.json`
2. Adicione uma nova entrada seguindo o padrão acima
3. Use o ID no formato `nome_uf` (ex: `porto_seguro_ba`)
4. Inclua aliases para variações de grafia e nomes de praias próximas
5. Use coordenadas reais e realistas — evite precisão falsa
6. Reinicie o backend (o arquivo é carregado em memória na inicialização)

---

## Como o geocoding fallback funciona

Se a busca não encontrar nenhum resultado em `locations.json`, o backend consulta a [Open-Meteo Geocoding API](https://geocoding-api.open-meteo.com) para obter as coordenadas.

- A Open-Meteo é usada **somente para geocoding** (lat/lng)
- Os dados de clima, vento, ondas e maré **sempre** vêm do Stormglass
- A resposta indica a origem das coordenadas: `"coordinateSource": "open-meteo-geocoding"`

---

## Como o cache funciona

Para reduzir o consumo da API Stormglass, os dados são cacheados com dois TTLs independentes:

| Tipo | Chave (sufixo) | TTL padrão | Variável |
|------|---------------|-----------|----------|
| Clima, vento, ondas | `..._wm` | **1 hora** | `WEATHER_MARINE_CACHE_TTL_HOURS` |
| Maré | `..._tide` | **24 horas** | `TIDE_CACHE_TTL_HOURS` |

Quando `/api/conditions` é chamado, o backend verifica cada cache separadamente e só consulta o Stormglass para o tipo que estiver vencido. A resposta indica o status de cada tipo em `weatherMarineFromCache` e `tideFromCache`.

### Backend de cache — CACHE_BACKEND

O backend de cache é controlado pela variável `CACHE_BACKEND` no `.env`:

| Valor | Descrição |
|-------|-----------|
| `file` (padrão) | Arquivos JSON em `backend/cache/`. Ideal para desenvolvimento local. |
| `redis` | Upstash Redis via REST API. Recomendado para produção. |

### Configurar Upstash Redis (produção)

1. Crie uma conta gratuita em [upstash.com](https://upstash.com)
2. Crie uma nova **Redis Database** (escolha a região mais próxima do seu servidor)
3. No painel da database, copie a **REST URL** e o **REST Token**
4. No `.env` do backend, configure:

```env
CACHE_BACKEND=redis
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

O backend usa diretamente a REST API HTTP do Upstash — sem dependências extras além do `requests` já incluído. A expiração de chaves é gerenciada automaticamente pelo Redis via parâmetro `EX` (segundos).

### Funções de cache (modulares)

```python
get_cached_data(cache_key)                    # Busca no cache (file ou Redis)
save_cached_data(cache_key, data, ttl_hours)  # Salva com TTL (file ou Redis)
is_cache_fresh(cached_record)                 # Verifica TTL (apenas file; Redis é sempre fresco)
```

### Arquivos de cache local

- Gerados em `backend/cache/` com nomes como `dm_m20d315_m40d313_2026-05-29_wm.json`
- Não são versionados no git (ver `.gitignore`)
- O cache local **não funciona** em plataformas serverless (Vercel, Render free tier, Railway) — use `CACHE_BACKEND=redis` em produção

---

## Fontes de dados

| Dado | Fonte |
|------|-------|
| Temperatura, umidade | Stormglass `/v2/weather/point` (parâmetro `airTemperature`, `humidity`) |
| Vento | Stormglass `/v2/weather/point` (`windSpeed` m/s → convertido para nós, `windDirection`, `gust`) |
| Ondas | Stormglass `/v2/weather/point` (`waveHeight`, `wavePeriod`, `waveDirection`) |
| Maré | Stormglass `/v2/tide/extremes/point` (próxima cheia e baixa) |
| Coordenadas (prioridade) | `backend/locations.json` (curado) |
| Coordenadas (fallback) | Open-Meteo Geocoding API |

---

## Limitações conhecidas

- **Nível atual de maré** (`tide.level`) está marcado como `null` — requer endpoint separado `/v2/tide/sea-level/point` (não implementado nesta versão)
- **Sensação térmica** é calculada via índice de calor (NOAA) apenas quando T > 27 °C e UR > 40%; retorna a temperatura real nas demais condições
- **Condição meteorológica textual** (ensolarado, nublado etc.) não é fornecida pelo Stormglass neste endpoint
- A disponibilidade de dados de ondas varia por localidade (locais costeiros têm melhor cobertura)
- O app usa UTC-local do navegador para exibir horários de maré

---

## Aviso de uso

> **Dados informativos e modelados. Não utilizar para tomada de decisões de navegação, mergulho, pesca profissional ou qualquer atividade com risco à segurança pessoal. Sempre consulte fontes oficiais como a Marinha do Brasil.**

---

## Deploy em produção

O DharMarnatee usa uma arquitetura separada para frontend e backend em produção:

| Componente | Plataforma |
|------------|-----------|
| Frontend (estático) | GitHub Pages |
| Backend / API | Vercel (Python Functions) |
| Cache | Upstash Redis |

### Frontend — GitHub Actions → GitHub Pages

O frontend é publicado automaticamente via **GitHub Actions** toda vez que arquivos em `frontend/` ou `.github/workflows/deploy-frontend.yml` são alterados no branch `main`.

O workflow está em `.github/workflows/deploy-frontend.yml` e usa as actions oficiais:
- `actions/checkout@v4` — clona o repositório
- `actions/configure-pages@v5` — prepara o ambiente de Pages
- `actions/upload-pages-artifact@v3` — empacota apenas `frontend/`
- `actions/deploy-pages@v4` — publica no GitHub Pages

A URL do backend Vercel está configurada diretamente em `frontend/script.js`:
```javascript
const API_BASE = window.API_BASE || 'https://dharmarnatee.vercel.app';
```

Nenhum segredo é incluído no frontend. Todas as chaves de API ficam exclusivamente nas variáveis de ambiente do Vercel.

---

### Backend — Vercel

1. Importe o repositório em [vercel.com](https://vercel.com)
2. O Vercel detecta automaticamente `api/index.py` e `vercel.json`
3. Configure as variáveis de ambiente abaixo no painel do Vercel

#### Variáveis de ambiente no Vercel

| Variável | Exemplo | Obrigatório | Descrição |
|----------|---------|-------------|-----------|
| `STORMGLASS_API_KEY` | `abc123` | ✅ | Chave da API Stormglass |
| `CACHE_BACKEND` | `redis` | ✅ | Sempre `redis` no Vercel (sem filesystem persistente) |
| `UPSTASH_REDIS_REST_URL` | `https://x.upstash.io` | ✅ | URL REST da database Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | `AX...` | ✅ | Token REST da database Upstash |
| `WEATHER_MARINE_CACHE_TTL_HOURS` | `1` | — | TTL clima/vento/ondas (padrão: 1h) |
| `TIDE_CACHE_TTL_HOURS` | `24` | — | TTL maré (padrão: 24h) |
| `FLASK_ENV` | `production` | — | Desativa o modo debug |
| `CORS_ORIGINS` | `https://user.github.io` | — | Restrinja ao domínio do GitHub Pages |

### Frontend — GitHub Pages

1. No GitHub, acesse **Settings → Pages**
2. Em **Source**, selecione o branch `main` e o diretório `/frontend`
3. O site será publicado em `https://yourusername.github.io/repository-name`

### Conectar frontend ao backend

Após o deploy no Vercel, copie a URL gerada (ex: `https://dhar-marnatee-api.vercel.app`).

**Opção 1** — Edite diretamente a primeira linha de `frontend/script.js`:

```javascript
const API_BASE = window.API_BASE || 'https://dhar-marnatee-api.vercel.app';
```

**Opção 2** — Injete antes do `<script src="script.js">` em `frontend/index.html`:

```html
<script>window.API_BASE = 'https://dhar-marnatee-api.vercel.app';</script>
<script src="script.js"></script>
```

### CORS em produção

Para restringir o backend ao domínio exato do GitHub Pages, adicione no Vercel:

```
CORS_ORIGINS=https://yourusername.github.io
```

Para múltiplas origens, separe por vírgula:

```
CORS_ORIGINS=https://yourusername.github.io,https://custom-domain.com
```

---

## Estrutura do projeto

```
DharMarnatee/
├── frontend/
│   ├── index.html        # Interface mobile-first
│   ├── style.css         # Design responsivo
│   └── script.js         # Lógica do frontend
│
├── backend/
│   ├── app.py            # API Flask
│   ├── requirements.txt  # Dependências Python
│   ├── .env.example      # Template de variáveis de ambiente
│   ├── locations.json    # Base de localidades costeiras (ES e expansível)
│   └── cache/
│       └── .gitkeep      # Mantém o diretório no git
│
├── README.md
└── .gitignore
```
