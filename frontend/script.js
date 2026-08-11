// ── Configuration ──────────────────────────────────────────────
// For production, set window.API_BASE before loading this script,
// e.g. <script>window.API_BASE = 'https://api.yourdomain.com';</script>
const API_BASE = window.API_BASE || 'https://dharmarnatee.vercel.app';

// ── DOM refs ────────────────────────────────────────────────────
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const searchResults = document.getElementById("searchResults");
const statusMsg = document.getElementById("statusMsg");
const loadingState = document.getElementById("loadingState");
const dataSection = document.getElementById("dataSection");
const emptyState = document.getElementById("emptyState");
const summaryCard = document.getElementById("summaryCard");
const cardClima = document.getElementById("cardClima");
const cardVento = document.getElementById("cardVento");
const cardOndas = document.getElementById("cardOndas");
const cardMare = document.getElementById("cardMare");
const forecastStrip = document.getElementById("forecastStrip");
const cardFonte = document.getElementById("cardFonte");

// ── Conditions rating thresholds (tweak freely) ────────────────────
// Used only for a compact, non-official visual summary — not a marine
// safety assessment.
const RATING_THRESHOLDS = {
  windKmh: { caution: 30, bad: 45 },
  gustsKmh: { caution: 40, bad: 60 },
  waveM: { caution: 1.2, bad: 2.0 },
  rainMm: { caution: 0.2, bad: 2 },
};

const RATING_LEVELS = {
  good: { icon: "🟢", label: "Boas condições" },
  caution: { icon: "🟡", label: "Atenção" },
  bad: { icon: "🔴", label: "Condições desfavoráveis" },
};

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
  const cond = weather.condition;
  const rain = weather.rainMm;

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
    ${
      cond
        ? `<div class="card-condition"><span class="card-condition-icon">${cond.icon}</span>${esc(cond.label)}${cond.label === "Chuva" && rain !== null ? ` · ${Number(rain).toFixed(1)} mm/h` : ""}</div>`
        : ""
    }
    <div class="card-details">
      ${feels !== null ? detailRow("Sensação", `${Number(feels).toFixed(1)} °C`) : naDetail("Sensação")}
      ${hum !== null ? detailRow("Umidade", `${Math.round(hum)} %`) : naDetail("Umidade")}
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
  const mainUnit = speed !== null ? "km/h" : "";

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
      ${gusts !== null ? detailRow("Rajadas", `${Number(gusts).toFixed(1)} km/h`) : naDetail("Rajadas")}
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
        <span class="fonte-key">Origem coord.</span>
        <span class="fonte-val">${esc(coordSrc)}</span>
      </div>
    </div>
    ${errNote}
    <div class="fonte-note">${esc(source.note)}</div>
  `;
}

// ── Conditions rating ────────────────────────────────────────────

function classifyMetric(value, thresholds) {
  if (value === null || value === undefined) return "unknown";
  if (value >= thresholds.bad) return "bad";
  if (value >= thresholds.caution) return "caution";
  return "good";
}

function computeRating(data) {
  const levels = [
    classifyMetric(data.wind?.speed, RATING_THRESHOLDS.windKmh),
    classifyMetric(data.wind?.gusts, RATING_THRESHOLDS.gustsKmh),
    classifyMetric(data.waves?.height, RATING_THRESHOLDS.waveM),
    classifyMetric(data.weather?.rainMm, RATING_THRESHOLDS.rainMm),
  ].filter((l) => l !== "unknown");

  let level = "good";
  if (levels.includes("bad")) level = "bad";
  else if (levels.includes("caution")) level = "caution";

  return RATING_LEVELS[level];
}

// ── Summary bar ("Condições agora") ──────────────────────────────

function renderSummaryCard(data) {
  const location = data.location;
  const source = data.source;
  const rating = computeRating(data);
  const cond = data.weather.condition;
  const updatedAt = fmtTime(source.updatedAt);
  const forecast = data.forecast || [];

  const parts = [location.region, location.state, location.country].filter(Boolean);
  const badgeHtml = source.fromCache
    ? `<span class="loc-cache-badge badge--cached">Cache</span>`
    : `<span class="loc-cache-badge badge--live">Ao vivo</span>`;

  const nearRain = forecast
    .slice(0, 3)
    .some((f) => f.rainMm !== null && f.rainMm !== undefined && f.rainMm >= RATING_THRESHOLDS.rainMm.caution);
  const rainNote = nearRain
    ? "Chuva prevista nas próximas horas"
    : "Sem previsão de chuva no curto prazo";

  summaryCard.innerHTML = `
    <div class="loc-name">
      <span class="loc-pin">📍</span>
      ${esc(location.name)}${parts.length ? `, <span style="font-weight:500">${esc(parts[0])}</span>` : ""}
      ${badgeHtml}
    </div>
    <div class="loc-meta">
      <span>Lat: ${location.latitude}</span>
      <span>Lon: ${location.longitude}</span>
    </div>
    <div class="summary-top">
      <span class="summary-rating"
            title="Resumo visual simples com base nos dados exibidos — não é uma avaliação oficial de segurança marítima.">
        ${rating.icon} <strong>${esc(rating.label)}</strong>
      </span>
      ${updatedAt ? `<span class="summary-updated">Atualizado às ${updatedAt}</span>` : ""}
    </div>
    <div class="summary-detail">
      ${cond ? `${cond.icon} ${esc(cond.label)} · ` : ""}${rainNote}
    </div>
  `;
}

// ── "Próximas horas" forecast strip ──────────────────────────────

function pickForecastPoints(forecast) {
  if (!forecast || !forecast.length) return [];
  const startMs = new Date(forecast[0].time).getTime();
  const targetsHours = [0, 3, 6, 9, 12];
  const usedIdx = new Set();
  const points = [];

  targetsHours.forEach((hOffset) => {
    const targetMs = startMs + hOffset * 3600 * 1000;
    let bestIdx = -1;
    let bestDiff = Infinity;
    forecast.forEach((f, i) => {
      if (usedIdx.has(i)) return;
      const diff = Math.abs(new Date(f.time).getTime() - targetMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    });
    if (bestIdx !== -1) {
      usedIdx.add(bestIdx);
      points.push({
        ...forecast[bestIdx],
        label: hOffset === 0 ? "Agora" : `+${hOffset}h`,
      });
    }
  });

  return points;
}

function buildForecastStripTrack(forecast) {
  const points = pickForecastPoints(forecast);
  if (!points.length) return "";
  return `
    <div class="forecast-strip-track">
      ${points
        .map((p) => {
          const icon = p.condition ? p.condition.icon : '<span class="na">—</span>';
          const temp =
            p.temperature !== null && p.temperature !== undefined
              ? `${Math.round(p.temperature)}°`
              : '<span class="na">—</span>';
          const wind =
            p.windSpeed !== null && p.windSpeed !== undefined
              ? `${Math.round(p.windSpeed)} km/h`
              : '<span class="na">—</span>';
          const rain =
            p.rainMm !== null && p.rainMm !== undefined
              ? `<div class="forecast-item-rain">💧 ${Number(p.rainMm).toFixed(1)} mm</div>`
              : "";
          return `
          <div class="forecast-item">
            <div class="forecast-item-label">${esc(p.label)}</div>
            <div class="forecast-item-icon">${icon}</div>
            <div class="forecast-item-temp">${temp}</div>
            <div class="forecast-item-wind">${wind}</div>
            ${rain}
          </div>
        `;
        })
        .join("")}
    </div>
  `;
}

// ── "Próximas 12 horas" evolution card ───────────────────────────
// Every chart point, tick, and stat below is computed directly from the
// real hourly `forecast` array — nothing interpolated or invented.

const SPARK_WIDTH = 280;
const SPARK_HEIGHT = 64;
const SPARK_PAD_X = 6; // keeps hover markers from bleeding past the SVG edge
const SPARK_PAD_Y = 7;

/** x-position (0–1 fraction of chart width) for each index — index-based, since forecast hours are evenly spaced. */
function sparkXFractions(length) {
  if (length < 2) return [];
  const stepX = (SPARK_WIDTH - SPARK_PAD_X * 2) / (length - 1);
  return Array.from({ length }, (_, i) => (SPARK_PAD_X + i * stepX) / SPARK_WIDTH);
}

/** Min/max across one or more series, so related series (e.g. wind + gusts) can share one scale. */
function combinedRange(...seriesList) {
  const nums = seriesList.flat().filter((v) => v !== null && v !== undefined);
  if (nums.length < 1) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/**
 * Map a value series onto chart coordinates. Missing values stay null (no fabricated points).
 * Pass `range` so two series (e.g. wind + gusts) share one y-scale — never normalize them separately,
 * or a larger value in one series can plot lower than a smaller value in the other.
 * Pass `minRange` to stop a small real range (e.g. wave height varying by 0.1m) from being stretched
 * to fill the whole chart height, which makes trivial changes look like a dramatic swing.
 */
function seriesToCoords(values, range, minRange = 0) {
  const nums = values.filter((v) => v !== null && v !== undefined);
  if (nums.length < 2) return values.map(() => null);
  let { min, max } = range || combinedRange(values);
  if (minRange && max - min < minRange) {
    const mid = (max + min) / 2;
    min = mid - minRange / 2;
    max = mid + minRange / 2;
  }
  const r = max - min || 1;
  const fracs = sparkXFractions(values.length);
  return values.map((v, i) => {
    if (v === null || v === undefined) return null;
    const y = SPARK_HEIGHT - SPARK_PAD_Y - ((v - min) / r) * (SPARK_HEIGHT - SPARK_PAD_Y * 2);
    return { x: fracs[i] * SPARK_WIDTH, y };
  });
}

/** Build a compact inline-SVG line (real data points, straight segments — no smoothing). */
function buildSparklinePath(coords, lineClass, dashed = false) {
  const valid = coords.filter(Boolean);
  if (valid.length < 2) return "";
  const pointsAttr = valid.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  return `<polyline points="${pointsAttr}" class="sparkline-line ${lineClass}" ${dashed ? 'stroke-dasharray="4 3"' : ""}></polyline>`;
}

/** Real first / middle / last data indices only — never more than 3, never invented. */
function pickTickIndices(times) {
  if (!times.length) return [];
  const lastIdx = times.length - 1;
  if (lastIdx === 0) return [0];
  const midIdx = Math.round(lastIdx / 2);
  return Array.from(new Set([0, midIdx, lastIdx])).sort((a, b) => a - b);
}

function buildTimeAxis(times, tickIdx) {
  if (!tickIdx.length) return "";
  const fracs = sparkXFractions(times.length);
  return `
    <div class="chart-axis">
      ${tickIdx
        .map((i, pos) => {
          const cls = pos === 0 ? "chart-axis-tick--start" : pos === tickIdx.length - 1 ? "chart-axis-tick--end" : "";
          return `<span class="chart-axis-tick ${cls}" style="left:${(fracs[i] * 100).toFixed(1)}%">${fmtTime(times[i])}</span>`;
        })
        .join("")}
    </div>
  `;
}

/** Real now / peak / end-of-window values for the compact 3-column stat row. */
function computeSeriesStats(times, values) {
  const points = values
    .map((v, i) => ({ v, t: times[i] }))
    .filter((p) => p.v !== null && p.v !== undefined && p.t);
  if (!points.length) return null;

  const now = points[0];
  const end = points[points.length - 1];
  let peak = points[0];
  points.forEach((p) => {
    if (p.v > peak.v) peak = p;
  });

  const endHours = Math.round((new Date(end.t).getTime() - new Date(now.t).getTime()) / 3600000);
  return { now, peak, end, endLabel: `+${endHours}h` };
}

function buildStatsGrid(stats, unit, decimals) {
  if (!stats) return `<div class="chart-stats"><p class="na-block">Indisponível</p></div>`;
  const fmt = (v) => Number(v).toFixed(decimals);
  return `
    <div class="chart-stats">
      <div class="chart-stat">
        <div class="chart-stat-label">Agora</div>
        <div class="chart-stat-value">${fmt(stats.now.v)} ${unit}</div>
      </div>
      <div class="chart-stat">
        <div class="chart-stat-label">Pico</div>
        <div class="chart-stat-value">${fmt(stats.peak.v)} ${unit}</div>
        <div class="chart-stat-time">${fmtTime(stats.peak.t)}</div>
      </div>
      <div class="chart-stat">
        <div class="chart-stat-label">${esc(stats.endLabel)}</div>
        <div class="chart-stat-value">${fmt(stats.end.v)} ${unit}</div>
      </div>
    </div>
  `;
}

function formatWindTooltip(p) {
  const rows = [`<div class="chart-tooltip-time">${fmtTime(p.t)}</div>`];
  if (p.gust !== null && p.gust !== undefined) rows.push(`<div>Rajadas: ${Math.round(p.gust)} km/h</div>`);
  if (p.wind !== null && p.wind !== undefined) rows.push(`<div>Vento: ${Math.round(p.wind)} km/h</div>`);
  return rows.join("");
}

function formatWaveTooltip(p) {
  const rows = [`<div class="chart-tooltip-time">${fmtTime(p.t)}</div>`];
  if (p.height !== null && p.height !== undefined) rows.push(`<div>Altura: ${Number(p.height).toFixed(1)} m</div>`);
  if (p.period !== null && p.period !== undefined) rows.push(`<div>Período: ${Math.round(p.period)} s</div>`);
  if (p.dir) rows.push(`<div>Direção: ${esc(p.dir)}</div>`);
  return rows.join("");
}

/**
 * Wires hover (desktop) / tap-drag (touch) interaction for one chart's tooltip + highlight dot(s).
 * `points[i].y` is a map of series name -> that series' real y-coordinate at that hour (e.g.
 * `{ wind: 12.3, gust: 4.1 }`), so each series gets its own dot at its own real position —
 * a chart with two series (wind + gusts) must never show a single dot on only one of them.
 */
function attachChartTooltip(wrapEl, points, fracs, formatFn) {
  const tooltip = wrapEl.querySelector(".chart-tooltip");
  const hoverDots = wrapEl.querySelectorAll(".chart-hover-dot");
  if (!tooltip || !fracs.length) return;

  function fracFromClientX(clientX) {
    const rect = wrapEl.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function showAtFrac(fracX) {
    let bestIdx = 0;
    let bestDiff = Infinity;
    fracs.forEach((f, i) => {
      const diff = Math.abs(f - fracX);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    });
    const p = points[bestIdx];
    if (!p) return;
    tooltip.innerHTML = formatFn(p);
    const pct = fracs[bestIdx] * 100;
    tooltip.style.left = `${pct}%`;
    tooltip.classList.toggle("chart-tooltip--start", pct < 15);
    tooltip.classList.toggle("chart-tooltip--end", pct > 85);
    tooltip.hidden = false;
    hoverDots.forEach((dot) => {
      const series = dot.dataset.series;
      const y = p.y ? p.y[series] : null;
      if (y === null || y === undefined) {
        dot.style.opacity = "0";
        return;
      }
      dot.setAttribute("cx", p.x.toFixed(1));
      dot.setAttribute("cy", y.toFixed(1));
      dot.style.opacity = series === "gust" ? "0.6" : "1";
    });
  }

  function hide() {
    tooltip.hidden = true;
    hoverDots.forEach((dot) => (dot.style.opacity = "0"));
  }

  wrapEl.addEventListener("mousemove", (e) => showAtFrac(fracFromClientX(e.clientX)));
  wrapEl.addEventListener("mouseleave", hide);
  wrapEl.addEventListener("touchstart", (e) => showAtFrac(fracFromClientX(e.touches[0].clientX)), { passive: true });
  wrapEl.addEventListener(
    "touchmove",
    (e) => {
      showAtFrac(fracFromClientX(e.touches[0].clientX));
      e.preventDefault();
    },
    { passive: false },
  );
  wrapEl.addEventListener("touchend", () => setTimeout(hide, 1200));
}

function buildChartBlock({ title, legendHtml, svgInner, dotSeries, axisHtml, statsHtml }) {
  const dotsHtml = dotSeries
    .map((s) => `<circle class="chart-hover-dot ${s}" data-series="${s}" r="4" cx="0" cy="0"></circle>`)
    .join("");
  return `
    <div class="trend-block">
      <div class="trend-block-label">
        <span>${esc(title)}</span>
        ${legendHtml || ""}
      </div>
      <div class="chart-wrap">
        <svg viewBox="0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}" class="sparkline" preserveAspectRatio="none" role="img" aria-hidden="true">
          ${svgInner}
          ${dotsHtml}
        </svg>
        <div class="chart-tooltip" hidden></div>
      </div>
      ${axisHtml}
      ${statsHtml}
    </div>
  `;
}

function renderForecastSection(data) {
  const forecast = data.forecast || [];
  if (!forecast.length) {
    forecastStrip.hidden = true;
    forecastStrip.innerHTML = "";
    return;
  }

  const stripTrackHtml = buildForecastStripTrack(forecast);

  if (forecast.length < 2) {
    forecastStrip.innerHTML = `
      <div class="card-header"><span class="card-title">Próximas horas</span></div>
      ${stripTrackHtml}
    `;
    forecastStrip.hidden = false;
    return;
  }

  const times = forecast.map((f) => f.time);
  const tickIdx = pickTickIndices(times);
  const axisHtml = buildTimeAxis(times, tickIdx);
  const fracs = sparkXFractions(times.length);

  // ── Wind ──
  // Wind and gusts MUST share one y-scale — see seriesToCoords doc comment.
  const windSeries = forecast.map((f) => f.windSpeed);
  const gustSeries = forecast.map((f) => f.gusts);
  const windGustRange = combinedRange(windSeries, gustSeries);
  const windCoords = seriesToCoords(windSeries, windGustRange);
  const gustCoords = seriesToCoords(gustSeries, windGustRange);
  const windHasData = windCoords.some(Boolean);

  const windLegend = `
    <span class="trend-legend">
      <span class="legend-dot legend-dot--wind"></span>Vento
      <span class="legend-dash"></span>Rajadas
    </span>
  `;
  const windPoints = forecast.map((f, i) => ({
    t: f.time,
    wind: f.windSpeed,
    gust: f.gusts,
    x: fracs[i] * SPARK_WIDTH,
    y: {
      wind: windCoords[i] ? windCoords[i].y : null,
      gust: gustCoords[i] ? gustCoords[i].y : null,
    },
  }));

  const windBlock = windHasData
    ? buildChartBlock({
        title: "Vento",
        legendHtml: windLegend,
        svgInner: buildSparklinePath(windCoords, "wind") + buildSparklinePath(gustCoords, "gust", true),
        dotSeries: ["wind", "gust"],
        axisHtml,
        statsHtml: buildStatsGrid(computeSeriesStats(times, windSeries), "km/h", 0),
      })
    : `<div class="trend-block"><div class="trend-block-label">Vento</div><p class="na-block">Indisponível</p></div>`;

  // ── Waves ──
  // Real wave-height swings in a 12h window are often tiny (e.g. 0.1m). Scaling the
  // y-axis to exactly that tiny range would stretch it to fill the whole chart height,
  // making an insignificant change look like a dramatic drop — hence the floor below.
  const WAVE_MIN_RANGE_M = 0.5;
  const waveSeries = forecast.map((f) => f.waveHeight);
  const waveCoords = seriesToCoords(waveSeries, null, WAVE_MIN_RANGE_M);
  const waveHasData = waveCoords.some(Boolean);
  const wavePoints = forecast.map((f, i) => ({
    t: f.time,
    height: f.waveHeight,
    period: f.wavePeriod,
    dir: f.waveDirectionText,
    x: fracs[i] * SPARK_WIDTH,
    y: { wave: waveCoords[i] ? waveCoords[i].y : null },
  }));

  const waveStats = computeSeriesStats(times, waveSeries);

  const waveBlock = waveHasData
    ? buildChartBlock({
        title: "Ondas",
        svgInner: buildSparklinePath(waveCoords, "wave"),
        dotSeries: ["wave"],
        axisHtml,
        statsHtml: buildStatsGrid(waveStats, "m", 1),
      })
    : `<div class="trend-block"><div class="trend-block-label">Ondas</div><p class="na-block">Indisponível</p></div>`;

  forecastStrip.innerHTML = `
    <div class="card-header">
      <span class="card-title">Próximas horas</span>
    </div>
    ${stripTrackHtml}
    <div class="trend-stack">
      ${windBlock}
      ${waveBlock}
    </div>
  `;
  forecastStrip.hidden = false;

  if (windHasData) {
    attachChartTooltip(forecastStrip.querySelectorAll(".chart-wrap")[0], windPoints, fracs, formatWindTooltip);
  }
  if (waveHasData) {
    const waveWrapIdx = windHasData ? 1 : 0;
    attachChartTooltip(forecastStrip.querySelectorAll(".chart-wrap")[waveWrapIdx], wavePoints, fracs, formatWaveTooltip);
  }
}

// ── Main render ─────────────────────────────────────────────────

function renderAll(data) {
  renderSummaryCard(data);
  renderClima(data.weather);
  renderVento(data.wind);
  renderOndas(data.waves);
  renderMare(data.tide);
  renderForecastSection(data);
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
