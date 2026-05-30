// ── Configuration ──────────────────────────────────────────────
// For production, set window.API_BASE before loading this script,
// e.g. <script>window.API_BASE = 'https://api.yourdomain.com';</script>
const API_BASE = window.API_BASE || "https://dharmarnatee.vercel.app";

// ── DOM refs ────────────────────────────────────────────────────
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const searchResults = document.getElementById("searchResults");
const statusMsg = document.getElementById("statusMsg");
const loadingState = document.getElementById("loadingState");
const dataSection = document.getElementById("dataSection");
const emptyState = document.getElementById("emptyState");
const locationStrip = document.getElementById("locationStrip");
const cardClima = document.getElementById("cardClima");
const cardVento = document.getElementById("cardVento");
const cardOndas = document.getElementById("cardOndas");
const cardMare = document.getElementById("cardMare");
const cardFonte = document.getElementById("cardFonte");

// ── Helpers ─────────────────────────────────────────────────────

/** Format a numeric value or return a styled "—" placeholder. */
function val(value, decimals = null, unit = "") {
  if (value === null || value === undefined) {
    return `<span class="na">—</span>`;
  }
  const num = decimals !== null ? Number(value).toFixed(decimals) : value;
  if (unit)
    return `${num} <span style="font-weight:500;color:var(--text-secondary)">${unit}</span>`;
  return String(num);
}

/** Format an ISO timestamp to local HH:MM (user's browser timezone). */
function fmtTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

/** Format an ISO timestamp to "DD/MM HH:MM". */
function fmtDateTime(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
    const time = d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} às ${time}`;
  } catch {
    return null;
  }
}

/** Escape HTML entities for safe innerHTML insertion. */
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── UI state helpers ────────────────────────────────────────────

function showStatus(message, type = "error") {
  statusMsg.textContent = message;
  statusMsg.className = `status-msg status--${type}`;
  statusMsg.hidden = false;
}

function clearStatus() {
  statusMsg.hidden = true;
  statusMsg.textContent = "";
}

function showLoading() {
  clearStatus();
  hideSearchResults();
  loadingState.hidden = false;
  dataSection.hidden = true;
  emptyState.hidden = true;
}

function hideLoading() {
  loadingState.hidden = true;
}

function showData() {
  dataSection.hidden = false;
  emptyState.hidden = true;
}

function showEmpty() {
  emptyState.hidden = false;
  dataSection.hidden = true;
  loadingState.hidden = true;
}

function showSearchResults(results) {
  if (!results.length) {
    hideSearchResults();
    return;
  }
  searchResults.innerHTML = results
    .map((r, i) => {
      const region = [r.region, r.state, r.country].filter(Boolean).join(", ");
      const src = r.source === "locations.json" ? "Base local" : "Geocoding";
      return `
      <div class="search-result-item" role="option" tabindex="0"
           data-index="${i}"
           data-id="${esc(r.id || "")}"
           data-lat="${r.latitude}"
           data-lng="${r.longitude}"
           data-name="${esc(r.name || "")}"
           data-source="${esc(r.source || "")}">
        <span class="result-name">${esc(r.name)}</span>
        <span class="result-meta">${esc(region)}</span>
        <span class="result-source">${src}</span>
      </div>
    `;
    })
    .join("");
  searchResults.hidden = false;
}

function hideSearchResults() {
  searchResults.hidden = true;
  searchResults.innerHTML = "";
}

// ── Render helpers ──────────────────────────────────────────────

function detailRow(label, value) {
  return `
    <div class="detail-row">
      <span class="detail-label">${label}</span>
      <span class="detail-value">${value}</span>
    </div>
  `;
}

function naDetail(label) {
  return `
    <div class="detail-row">
      <span class="detail-label">${label}</span>
      <span class="detail-value unavailable">Indisponível</span>
    </div>
  `;
}

// ── Card renderers ──────────────────────────────────────────────

function renderClima(weather) {
  const temp = weather.temperature;
  const feels = weather.feelsLike;
  const hum = weather.humidity;

  const mainVal =
    temp !== null
      ? `${Number(temp).toFixed(1)}`
      : `<span class="na" style="font-size:1.4rem">Indisponível</span>`;
  const mainUnit = temp !== null ? "°C" : "";

  cardClima.innerHTML = `
    <div class="card-header">
      <span class="card-icon">☀️</span>
      <span class="card-title">Clima</span>
    </div>
    <div class="card-main">
      <span class="card-value">${mainVal}</span>
      ${mainUnit ? `<span class="card-unit">${mainUnit}</span>` : ""}
    </div>
    <div class="card-details">
      ${feels !== null ? detailRow("Sensação", `${Number(feels).toFixed(1)} °C`) : naDetail("Sensação")}
      ${hum !== null ? detailRow("Umidade", `${Math.round(hum)} %`) : naDetail("Umidade")}
      ${weather.condition ? detailRow("Condição", esc(weather.condition)) : ""}
    </div>
  `;
}

function renderVento(wind) {
  const speed = wind.speed;
  const gusts = wind.gusts;
  const dir = wind.directionText;

  const mainVal =
    speed !== null
      ? `${Number(speed).toFixed(1)}`
      : `<span class="na" style="font-size:1.4rem">Indisponível</span>`;
  const mainUnit = speed !== null ? "nós" : "";

  cardVento.innerHTML = `
    <div class="card-header">
      <span class="card-icon">💨</span>
      <span class="card-title">Vento</span>
    </div>
    <div class="card-main">
      <span class="card-value">${mainVal}</span>
      ${mainUnit ? `<span class="card-unit">${mainUnit}</span>` : ""}
    </div>
    <div class="card-details">
      ${dir ? detailRow("Direção", esc(dir)) : naDetail("Direção")}
      ${gusts !== null ? detailRow("Rajadas", `${Number(gusts).toFixed(1)} nós`) : naDetail("Rajadas")}
    </div>
  `;
}

function renderOndas(waves) {
  const h = waves.height;
  const per = waves.period;
  const dir = waves.directionText;

  const mainVal =
    h !== null
      ? `${Number(h).toFixed(1)}`
      : `<span class="na" style="font-size:1.4rem">Indisponível</span>`;
  const mainUnit = h !== null ? "m" : "";

  cardOndas.innerHTML = `
    <div class="card-header">
      <span class="card-icon">🌊</span>
      <span class="card-title">Ondas</span>
    </div>
    <div class="card-main">
      <span class="card-value">${mainVal}</span>
      ${mainUnit ? `<span class="card-unit">${mainUnit}</span>` : ""}
    </div>
    <div class="card-details">
      ${per !== null ? detailRow("Período", `${Math.round(per)} s`) : naDetail("Período")}
      ${dir ? detailRow("Direção", esc(dir)) : naDetail("Direção")}
    </div>
  `;
}

function renderMare(tide) {
  const nh = tide.nextHigh;
  const nl = tide.nextLow;
  const nhH = tide.nextHighHeight;
  const nlH = tide.nextLowHeight;
  const trend = tide.trend;
  const tideErr = tide.error;

  if (tideErr && tideErr !== "quota_exceeded") {
    cardMare.innerHTML = `
      <div class="card-header">
        <span class="card-icon">🌙</span>
        <span class="card-title">Maré</span>
      </div>
      <p class="na-block">Dados de maré indisponíveis para este local.</p>
    `;
    return;
  }

  const nhTime = fmtTime(nh);
  const nlTime = fmtTime(nl);

  const trendClass =
    trend === "Subindo"
      ? "trend--up"
      : trend === "Descendo"
        ? "trend--down"
        : "";
  const trendArrow =
    trend === "Subindo" ? "↑" : trend === "Descendo" ? "↓" : "";

  cardMare.innerHTML = `
    <div class="card-header">
      <span class="card-icon">🌙</span>
      <span class="card-title">Maré</span>
    </div>
    <div class="tide-blocks">
      <div class="tide-block">
        <div class="tide-block-label">Cheia</div>
        <div class="tide-block-time">${nhTime || '<span class="na">—</span>'}</div>
        ${nhH !== null ? `<div class="tide-block-height">${Number(nhH).toFixed(2)} m</div>` : ""}
      </div>
      <div class="tide-block">
        <div class="tide-block-label">Baixa</div>
        <div class="tide-block-time">${nlTime || '<span class="na">—</span>'}</div>
        ${nlH !== null ? `<div class="tide-block-height">${Number(nlH).toFixed(2)} m</div>` : ""}
      </div>
    </div>
    <div class="card-details">
      ${trend ? detailRow("Tendência", `<span class="${trendClass}">${trendArrow} ${esc(trend)}</span>`) : naDetail("Tendência")}
    </div>
  `;
}

function cacheBadge(fromCache) {
  return fromCache
    ? `<span class="loc-cache-badge badge--cached">Cache</span>`
    : `<span class="loc-cache-badge badge--live">Ao vivo</span>`;
}

function renderFonte(source, location) {
  const updatedAt = fmtDateTime(source.updatedAt);
  const coordSrc =
    source.coordinateSource === "locations.json"
      ? "Base local (locations.json)"
      : "Geocoding (Open-Meteo fallback)";
  const dataErr = source.marineDataError;

  // Suporte a payload antigo (fromCache único) e novo (separado por tipo)
  const wmCache = source.weatherMarineFromCache ?? source.fromCache ?? false;
  const tideCache = source.tideFromCache ?? source.fromCache ?? false;

  let errNote = "";
  if (dataErr && dataErr !== "no_tide_data") {
    const msgs = {
      api_key_missing: "Chave de API não configurada.",
      quota_exceeded: "Limite de requisições da API atingido.",
      timeout: "Tempo de conexão esgotado.",
      request_failed: "Falha na requisição à API.",
      no_data: "Nenhum dado retornado pela fonte.",
    };
    errNote = `<div class="fonte-note" style="color:#c62828">⚠️ ${msgs[dataErr] || "Erro desconhecido: " + esc(dataErr)}</div>`;
  }

  cardFonte.innerHTML = `
    <div class="fonte-header">
      <span class="card-icon">ℹ️</span>
      <span class="fonte-title">Dados / Fonte</span>
    </div>
    <div class="fonte-rows">
      <div class="fonte-row">
        <span class="fonte-key">Fonte</span>
        <span class="fonte-val">${esc(source.provider)}</span>
      </div>
      <div class="fonte-row">
        <span class="fonte-key">Clima / Vento / Ondas</span>
        <span class="fonte-val">${cacheBadge(wmCache)}</span>
      </div>
      <div class="fonte-row">
        <span class="fonte-key">Maré</span>
        <span class="fonte-val">${cacheBadge(tideCache)}</span>
      </div>
      <div class="fonte-row">
        <span class="fonte-key">Atualizado</span>
        <span class="fonte-val">${updatedAt || "Desconhecido"}</span>
      </div>
      <div class="fonte-row">
        <span class="fonte-key">Coordenadas</span>
        <span class="fonte-val">${esc(source.coordinates)}</span>
      </div>
      <div class="fonte-row">
        <span class="fonte-key">Origem coord.</span>
        <span class="fonte-val">${esc(coordSrc)}</span>
      </div>
    </div>
    ${errNote}
    <div class="fonte-note">${esc(source.note)}</div>
  `;
}

function renderLocationStrip(location, source) {
  const parts = [location.region, location.state, location.country].filter(
    Boolean,
  );
  const fromCache = source.fromCache;
  const badgeHtml = fromCache
    ? `<span class="loc-cache-badge badge--cached">Cache</span>`
    : `<span class="loc-cache-badge badge--live">Ao vivo</span>`;
  const updatedAt = fmtTime(source.updatedAt);

  locationStrip.innerHTML = `
    <div class="loc-name">
      <span class="loc-pin">📍</span>
      ${esc(location.name)}${parts.length ? `, <span style="font-weight:500">${esc(parts[0])}</span>` : ""}
      ${badgeHtml}
    </div>
    <div class="loc-meta">
      <span>Lat: ${location.latitude}</span>
      <span>Lon: ${location.longitude}</span>
      ${updatedAt ? `<span>Atualizado: ${updatedAt}</span>` : ""}
    </div>
  `;
}

// ── Main render ─────────────────────────────────────────────────

function renderAll(data) {
  renderLocationStrip(data.location, data.source);
  renderClima(data.weather);
  renderVento(data.wind);
  renderOndas(data.waves);
  renderMare(data.tide);
  renderFonte(data.source, data.location);
  showData();
}

// ── API calls ───────────────────────────────────────────────────

async function searchLocation(query) {
  showLoading();
  try {
    const resp = await fetch(
      `${API_BASE}/api/search-location?query=${encodeURIComponent(query)}`,
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error("Search error:", err);
    return null;
  }
}

async function loadConditions(locationId, lat, lng, name) {
  showLoading();
  try {
    let url;
    if (locationId) {
      url = `${API_BASE}/api/conditions?locationId=${encodeURIComponent(locationId)}`;
    } else {
      url = `${API_BASE}/api/conditions?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&name=${encodeURIComponent(name || "")}`;
    }

    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok) {
      if (resp.status === 429 || data.error === "quota_exceeded") {
        showStatus(
          "Limite da fonte de dados atingido. Exibindo dados em cache, se disponíveis.",
          "warning",
        );
      } else {
        showStatus(
          data.message ||
            data.error ||
            "Não foi possível carregar os dados agora.",
          "error",
        );
      }
      hideLoading();
      showEmpty();
      return;
    }

    hideLoading();
    clearStatus();
    renderAll(data);

    // Warn if marine data had an error but tide is fine (partial data)
    if (
      data.source.marineDataError &&
      data.source.marineDataError !== "no_tide_data"
    ) {
      showStatus(
        "Alguns dados não puderam ser carregados. Verifique os detalhes no cartão de fonte.",
        "warning",
      );
    }
  } catch (err) {
    console.error("Conditions error:", err);
    hideLoading();
    showEmpty();
    showStatus(
      "Não foi possível carregar os dados agora. Verifique sua conexão e tente novamente.",
      "error",
    );
  }
}

// ── Search result selection ─────────────────────────────────────

function handleResultClick(el) {
  const id = el.dataset.id;
  const lat = el.dataset.lat;
  const lng = el.dataset.lng;
  const name = el.dataset.name;
  const source = el.dataset.source;

  searchInput.value = name;
  hideSearchResults();

  if (id && source === "locations.json") {
    loadConditions(id, null, null, null);
  } else {
    loadConditions(null, lat, lng, name);
  }
}

// ── Search submission ───────────────────────────────────────────

async function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    showStatus("Digite um local para buscar.", "info");
    return;
  }

  hideSearchResults();
  const data = await searchLocation(query);

  if (!data) {
    hideLoading();
    showEmpty();
    showStatus(
      "Não foi possível conectar ao servidor. Certifique-se de que o backend está rodando.",
      "error",
    );
    return;
  }

  const results = data.results || [];

  if (results.length === 0) {
    hideLoading();
    showEmpty();
    showStatus(
      "Local não encontrado. Tente informar cidade, praia ou estado.",
      "error",
    );
    return;
  }

  if (results.length === 1) {
    const r = results[0];
    searchInput.value = r.name;
    if (r.id && r.source === "locations.json") {
      loadConditions(r.id, null, null, null);
    } else {
      loadConditions(null, r.latitude, r.longitude, r.name);
    }
    return;
  }

  // Multiple results: show picker
  hideLoading();
  showEmpty();
  clearStatus();
  showSearchResults(results);
}

// ── Event listeners ─────────────────────────────────────────────

searchBtn.addEventListener("click", handleSearch);

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleSearch();
  }
  if (e.key === "Escape") {
    hideSearchResults();
  }
});

// Delegate clicks in search results
searchResults.addEventListener("click", (e) => {
  const item = e.target.closest(".search-result-item");
  if (item) handleResultClick(item);
});

// Keyboard navigation in search results
searchResults.addEventListener("keydown", (e) => {
  const item = e.target.closest(".search-result-item");
  if (!item) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    handleResultClick(item);
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = item.nextElementSibling;
    if (next) next.focus();
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = item.previousElementSibling;
    if (prev) prev.focus();
    else searchInput.focus();
  }
  if (e.key === "Escape") {
    hideSearchResults();
    searchInput.focus();
  }
});

// Close results on click outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-section")) {
    hideSearchResults();
  }
});

// ── Init ────────────────────────────────────────────────────────
showEmpty();
