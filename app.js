const DEFAULT_DXF_PATH = "data/PP23.dxf";
const DEFAULT_REPORT_LOGO_PATH = "assets/openblast-logo.png";

const THEME = {
  accent: "#E30613",
  accentDark: "#9D0B0E",
  textStrong: "#111111",
  textBody: "#333333",
  textMuted: "#6B7280",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  grid: "#ECEFF3",
  planned: "#2F3640",
  surface: "#FFFFFF",
  soft: "#F7F7F7"
};

let angleChart;
let directionChart;
let deviationChart;
let currentRows = [];
let currentFileName = "PP23.dxf";
let currentReportLogoDataUrl = null;

const state = {
  blastName: "PP23",
  renderedAt: new Date(),
  limits: {
    angleMin: 12,
    angleMax: 18,
    azimuth: 6,
    depth: 0.20,
    meta: 80
  }
};

const els = {
  headerBlastName: document.getElementById("headerBlastName"),
  blastNameInput: document.getElementById("blastNameInput"),
  dxfInput: document.getElementById("dxfInput"),
  logoInput: document.getElementById("logoInput"),
  loadDxfBtn: document.getElementById("loadDxfBtn"),
  loadLogoBtn: document.getElementById("loadLogoBtn"),
  reloadDefaultBtn: document.getElementById("reloadDefaultBtn"),
  exportPdfBtn: document.getElementById("exportPdfBtn"),
  reportTitle: document.getElementById("reportTitle"),
  reportSubtitle: document.getElementById("reportSubtitle"),
  reportSource: document.getElementById("reportSource"),
  reportDate: document.getElementById("reportDate"),
  reportFireTag: document.getElementById("reportFireTag"),
  reportLogoBlock: document.getElementById("reportLogoBlock"),
  reportLogo: document.getElementById("reportLogo"),
  reportLogoWordmark: document.getElementById("reportLogoWordmark"),
  metricHolesCard: document.getElementById("metricHolesCard"),
  metricAngleCard: document.getElementById("metricAngleCard"),
  metricAzimuthCard: document.getElementById("metricAzimuthCard"),
  metricDepthCard: document.getElementById("metricDepthCard"),
  metricHoles: document.getElementById("metricHoles"),
  metricComparable: document.getElementById("metricComparable"),
  metricAngle: document.getElementById("metricAngle"),
  metricAzimuth: document.getElementById("metricAzimuth"),
  metricDepth: document.getElementById("metricDepth"),
  analysisText: document.getElementById("analysisText"),
  planMap: document.getElementById("planMap"),
  dataTableBody: document.getElementById("dataTableBody"),
  angleChartTitle: document.getElementById("angleChartTitle"),
  directionChartTitle: document.getElementById("directionChartTitle"),
  deviationChartTitle: document.getElementById("deviationChartTitle"),
  angleMinInput: document.getElementById("angleMinInput"),
  angleMaxInput: document.getElementById("angleMaxInput"),
  azLimitInput: document.getElementById("azLimitInput"),
  depthLimitInput: document.getElementById("depthLimitInput")
};

function toNumber(value, fallback = NaN) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "N/A";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${formatNumber(value, 2)}%`;
}

function formatDateTime(value) {
  return value.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function normalizeDeg(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

function distance3d(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function horizontalDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function azimuthDeg(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.atan2(dx, dy) * 180 / Math.PI;
}

function inclinationFromVerticalDeg(a, b) {
  const dz = Math.abs(b.z - a.z);
  const h = horizontalDistance(a, b);
  if (dz <= 1e-9) return NaN;
  return Math.atan2(h, dz) * 180 / Math.PI;
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distance3d(points[i - 1], points[i]);
  }
  return total;
}

function getField(raw, code, fallback = "") {
  const wanted = String(code);
  const found = raw.find(([c]) => c === wanted);
  return found ? found[1] : fallback;
}

function getNum(raw, code, fallback = NaN) {
  return toNumber(getField(raw, code, ""), fallback);
}

function lineStartEnd(entity) {
  return {
    start: {
      x: getNum(entity.raw, 10),
      y: getNum(entity.raw, 20),
      z: getNum(entity.raw, 30, 0)
    },
    end: {
      x: getNum(entity.raw, 11),
      y: getNum(entity.raw, 21),
      z: getNum(entity.raw, 31, 0)
    }
  };
}

function vertexToPoint(raw) {
  return {
    x: getNum(raw, 10),
    y: getNum(raw, 20),
    z: getNum(raw, 30, 0)
  };
}

function parseDxfPairs(text) {
  const lines = text.replace(/\r/g, "").split("\n").map(line => line.trim());
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    pairs.push([lines[i], lines[i + 1]]);
  }
  return pairs;
}

function parseDxfEntities(text) {
  const pairs = parseDxfPairs(text);
  const entities = [];
  let inEntities = false;
  let i = 0;

  while (i < pairs.length) {
    const [code, value] = pairs[i];

    if (code === "2" && value === "ENTITIES") {
      inEntities = true;
      i += 1;
      continue;
    }

    if (!inEntities) {
      i += 1;
      continue;
    }

    if (code === "0" && value === "ENDSEC") break;

    if (code === "0") {
      const entity = { type: value, raw: [] };
      i += 1;

      while (i < pairs.length && pairs[i][0] !== "0") {
        entity.raw.push(pairs[i]);
        i += 1;
      }

      if (entity.type === "POLYLINE") {
        entity.verticesRaw = [];

        while (i < pairs.length) {
          const [nextCode, nextValue] = pairs[i];

          if (nextCode === "0" && nextValue === "VERTEX") {
            const vertex = [];
            i += 1;

            while (i < pairs.length && pairs[i][0] !== "0") {
              vertex.push(pairs[i]);
              i += 1;
            }

            entity.verticesRaw.push(vertex);
            continue;
          }

          if (nextCode === "0" && nextValue === "SEQEND") {
            i += 1;
            while (i < pairs.length && pairs[i][0] !== "0") i += 1;
            break;
          }

          break;
        }
      }

      entities.push(entity);
      continue;
    }

    i += 1;
  }

  return entities;
}

function buildHolesFromEntities(entities) {
  const holes = [];
  let current = null;

  for (const entity of entities) {
    const layer = getField(entity.raw, 8, "");

    if (entity.type === "POINT" && layer === "Hole") {
      if (current) holes.push(current);
      current = { point: entity };
      continue;
    }

    if (!current) continue;

    if (entity.type === "LINE" && layer === "Theoretical Hole") {
      current.theoretical = entity;
      continue;
    }

    if (entity.type === "TEXT" && layer === "Number") {
      current.id = getField(entity.raw, 1, "");
      continue;
    }

    if (entity.type === "TEXT" && layer === "Length") {
      current.plannedLengthText = toNumber(getField(entity.raw, 1, ""));
      continue;
    }

    if (entity.type === "POLYLINE" && layer === "Real Hole") {
      current.real = entity;
    }
  }

  if (current) holes.push(current);
  return holes;
}

function calculateRows(holes) {
  return holes
    .filter(hole => hole.theoretical && hole.real && hole.real.verticesRaw && hole.real.verticesRaw.length >= 2)
    .map((hole, index) => {
      const id = Number.parseInt(hole.id, 10);
      const safeId = Number.isFinite(id) ? id : index + 1;
      const { start: plannedStart, end: plannedEnd } = lineStartEnd(hole.theoretical);
      const realPoints = hole.real.verticesRaw.map(vertexToPoint);
      const realStart = realPoints[0];
      const realEnd = realPoints[realPoints.length - 1];

      const plannedLength = distance3d(plannedStart, plannedEnd);
      const executedLength = polylineLength(realPoints);
      const executedChord = distance3d(realStart, realEnd);

      const plannedHorizontal = horizontalDistance(plannedStart, plannedEnd);
      const executedHorizontal = horizontalDistance(realStart, realEnd);

      const plannedAzimuth = plannedHorizontal > 0.05 ? azimuthDeg(plannedStart, plannedEnd) : NaN;
      const executedAzimuth = executedHorizontal > 0.05 ? azimuthDeg(realStart, realEnd) : NaN;
      const azimuthDelta = Number.isFinite(plannedAzimuth) && Number.isFinite(executedAzimuth)
        ? normalizeDeg(executedAzimuth - plannedAzimuth)
        : NaN;

      const frontalAngle = inclinationFromVerticalDeg(realStart, realEnd);
      const depthDelta = executedLength - plannedLength;

      return {
        id: safeId,
        plannedStart,
        plannedEnd,
        realPoints,
        realStart,
        realEnd,
        plannedLength,
        executedLength,
        executedChord,
        plannedAzimuth,
        executedAzimuth,
        azimuthDelta,
        frontalAngle,
        depthDelta
      };
    })
    .sort((a, b) => a.id - b.id);
}

function calculateMetrics(rows) {
  const total = rows.length;
  const azComparable = rows.filter(row => Number.isFinite(row.azimuthDelta));
  const angleOk = rows.filter(row =>
    Number.isFinite(row.frontalAngle) &&
    row.frontalAngle >= state.limits.angleMin &&
    row.frontalAngle <= state.limits.angleMax
  ).length;

  const azOk = azComparable.filter(row =>
    Math.abs(row.azimuthDelta) <= state.limits.azimuth
  ).length;

  const depthOk = rows.filter(row =>
    Number.isFinite(row.depthDelta) &&
    Math.abs(row.depthDelta) <= state.limits.depth
  ).length;

  const depthValues = rows.map(row => row.depthDelta).filter(Number.isFinite);
  const avgDepthDelta = depthValues.length
    ? depthValues.reduce((sum, value) => sum + value, 0) / depthValues.length
    : NaN;

  return {
    total,
    azComparable: azComparable.length,
    anglePct: total ? angleOk / total * 100 : NaN,
    azPct: azComparable.length ? azOk / azComparable.length * 100 : NaN,
    depthPct: total ? depthOk / total * 100 : NaN,
    angleOk,
    azOk,
    depthOk,
    avgDepthDelta
  };
}

const tolerancePlugin = {
  id: "toleranceLines",
  afterDatasetsDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    const opts = chart.options.plugins.toleranceLines || {};
    if (!chartArea || !opts) return;

    ctx.save();
    ctx.lineWidth = opts.lineWidth || 1.25;
    ctx.strokeStyle = opts.color || THEME.textMuted;
    ctx.lineCap = "butt";
    ctx.setLineDash(opts.dash || [5, 4]);

    if (Array.isArray(opts.yLines) && scales.y) {
      for (const y of opts.yLines) {
        const py = scales.y.getPixelForValue(y);
        if (Number.isFinite(py)) {
          ctx.beginPath();
          ctx.moveTo(chartArea.left, py);
          ctx.lineTo(chartArea.right, py);
          ctx.stroke();
        }
      }
    }

    if (Array.isArray(opts.xLines) && scales.x) {
      for (const x of opts.xLines) {
        const px = scales.x.getPixelForValue(x);
        if (Number.isFinite(px)) {
          ctx.beginPath();
          ctx.moveTo(px, chartArea.top);
          ctx.lineTo(px, chartArea.bottom);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }
};

Chart.register(tolerancePlugin);
Chart.defaults.font.family = "Inter, Arial, Helvetica, system-ui, sans-serif";
Chart.defaults.color = THEME.textMuted;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.boxHeight = 12;
Chart.defaults.devicePixelRatio = Math.max(window.devicePixelRatio || 1, 2);

function computeSymmetricExtent(values, limit, floorValue) {
  const valid = values.filter(Number.isFinite).map(value => Math.abs(value));
  const peak = valid.length ? Math.max(...valid) : 0;
  return Math.max(floorValue, limit, peak) * 1.2;
}

function setMetricCardTone(card, pct) {
  card.classList.remove("metric-card--alert", "metric-card--ok");
  if (!Number.isFinite(pct)) return;
  card.classList.add(pct >= state.limits.meta ? "metric-card--ok" : "metric-card--alert");
}

function complianceAssessment(pct, meta) {
  if (!Number.isFinite(pct)) return "não pôde ser consolidada";
  if (pct >= meta) return "permanece em linha com a meta de referência";
  return "apresenta desempenho abaixo da meta de referência";
}

function depthSentence(avgDelta) {
  if (!Number.isFinite(avgDelta)) {
    return "A tendência média de profundidade não pôde ser consolidada com base no conjunto disponível.";
  }
  if (avgDelta > 0.03) {
    return "A profundidade média executada permanece acima da profundidade de projeto no conjunto analisado.";
  }
  if (avgDelta < -0.03) {
    return "A profundidade média executada permanece abaixo da profundidade de projeto no conjunto analisado.";
  }
  return "A profundidade média executada permanece próxima da profundidade de projeto no conjunto analisado.";
}

function buildAnalysisParagraphs(metrics) {
  const paragraphs = [];
  paragraphs.push(
    `A aderência de ângulo registra <strong>${formatPercent(metrics.anglePct)}</strong> e ${complianceAssessment(metrics.anglePct, state.limits.meta)}, com ${metrics.angleOk} de ${metrics.total} furos enquadrados no intervalo configurado de ${formatNumber(state.limits.angleMin, 2)}° a ${formatNumber(state.limits.angleMax, 2)}°.`
  );

  if (metrics.azComparable > 0) {
    paragraphs.push(
      `A aderência de azimute registra <strong>${formatPercent(metrics.azPct)}</strong> e ${complianceAssessment(metrics.azPct, state.limits.meta)}, considerando ${metrics.azComparable} furo(s) com base comparável em planta dentro do limite de ${formatNumber(state.limits.azimuth, 2)}°.`
    );
  } else {
    paragraphs.push("Não houve base geométrica suficiente para consolidar a aderência de azimute no conjunto analisado.");
  }

  paragraphs.push(
    `A aderência Z registra <strong>${formatPercent(metrics.depthPct)}</strong> e ${complianceAssessment(metrics.depthPct, state.limits.meta)}, com verificação frente ao limite de profundidade de ${formatNumber(state.limits.depth, 2)} m.`
  );

  paragraphs.push(depthSentence(metrics.avgDepthDelta));

  if (metrics.azComparable < metrics.total) {
    paragraphs.push(
      `${metrics.total - metrics.azComparable} furo(s) não apresentaram deslocamento teórico em planta suficiente para comparação direcional.`
    );
  }

  return paragraphs;
}

function renderSummary(rows) {
  const metrics = calculateMetrics(rows);
  const blast = state.blastName || "Fogo";
  state.renderedAt = new Date();

  els.headerBlastName.textContent = blast;
  els.reportFireTag.textContent = `Fogo ${blast}`;
  els.reportTitle.textContent = `Análise do fogo ${blast}`;
  els.reportSubtitle.textContent = currentFileName;
  els.reportSource.textContent = "Leitura direta do DXF com comparação entre planejado, executado e limites de aderência configurados para esta análise.";
  els.reportDate.textContent = formatDateTime(state.renderedAt);

  els.metricHoles.textContent = metrics.total.toLocaleString("pt-BR");
  els.metricComparable.textContent = `${metrics.azComparable.toLocaleString("pt-BR")} com direção comparável em planta`;
  els.metricAngle.textContent = formatPercent(metrics.anglePct);
  els.metricAzimuth.textContent = formatPercent(metrics.azPct);
  els.metricDepth.textContent = formatPercent(metrics.depthPct);

  setMetricCardTone(els.metricAngleCard, metrics.anglePct);
  setMetricCardTone(els.metricAzimuthCard, metrics.azPct);
  setMetricCardTone(els.metricDepthCard, metrics.depthPct);

  const paragraphs = buildAnalysisParagraphs(metrics)
    .map(paragraph => `<p>${paragraph}</p>`)
    .join("");

  els.analysisText.innerHTML = paragraphs;
}

function normalizeImageToDataUrl(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Não foi possível preparar o logo para exportação."));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.96));
    };
    image.onerror = () => reject(new Error("Falha ao normalizar o logo para exportação."));
    image.src = source;
  });
}

async function applyReportLogo(source) {
  const normalized = await normalizeImageToDataUrl(source);
  currentReportLogoDataUrl = normalized;
  els.reportLogo.src = normalized;
  return normalized;
}

async function resetReportLogo() {
  return applyReportLogo(DEFAULT_REPORT_LOGO_PATH);
}

async function ensureReportLogoReady() {
  if (currentReportLogoDataUrl?.startsWith("data:image/")) {
    return currentReportLogoDataUrl;
  }
  return applyReportLogo(els.reportLogo.src || DEFAULT_REPORT_LOGO_PATH);
}

function openFilePicker(input) {
  input.value = "";
  try {
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
  } catch (error) {
    console.warn("showPicker indisponível, usando fallback de clique.", error);
  }
  input.click();
}

function renderPlanMap(rows) {
  if (!rows.length) {
    els.planMap.innerHTML = "<div class='empty-map'>Sem geometria disponível.</div>";
    return;
  }

  const allPoints = [];
  rows.forEach(row => {
    allPoints.push(row.plannedStart, row.plannedEnd, ...row.realPoints);
  });

  const xs = allPoints.map(point => point.x).filter(Number.isFinite);
  const ys = allPoints.map(point => point.y).filter(Number.isFinite);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 30;
  const width = 1200;
  const height = 430;
  const scale = Math.min(
    (width - pad * 2) / Math.max(maxX - minX, 1),
    (height - pad * 2) / Math.max(maxY - minY, 1)
  );

  const tx = x => pad + (x - minX) * scale + (width - pad * 2 - (maxX - minX) * scale) / 2;
  const ty = y => height - pad - (y - minY) * scale - (height - pad * 2 - (maxY - minY) * scale) / 2;

  const plannedLines = rows.map(row =>
    `<line x1="${tx(row.plannedStart.x)}" y1="${ty(row.plannedStart.y)}" x2="${tx(row.plannedEnd.x)}" y2="${ty(row.plannedEnd.y)}" class="planned-line" />`
  ).join("");

  const realLines = rows.map(row => {
    const points = row.realPoints.map(point => `${tx(point.x)},${ty(point.y)}`).join(" ");
    return `<polyline points="${points}" class="real-line" />`;
  }).join("");

  const collars = rows.map(row =>
    `<circle cx="${tx(row.plannedStart.x)}" cy="${ty(row.plannedStart.y)}" r="2.7" class="collar-dot" />`
  ).join("");

  els.planMap.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mapa de planejado e executado">
      <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
      <g>${plannedLines}</g>
      <g>${realLines}</g>
      <g>${collars}</g>
      <g class="map-legend" transform="translate(24, 24)">
        <rect width="300" height="46" fill="rgba(255,255,255,0.96)" stroke="${THEME.border}" />
        <line x1="16" y1="16" x2="52" y2="16" class="planned-line" />
        <text x="60" y="20">Planejado</text>
        <line x1="132" y1="16" x2="168" y2="16" class="real-line" />
        <text x="176" y="20">Executado</text>
        <circle cx="16" cy="32" r="3" class="collar-dot" />
        <text x="28" y="36">Emboque</text>
      </g>
    </svg>
  `;
}

function buildChartScales() {
  return {
    x: {
      ticks: {
        color: THEME.textMuted,
        maxRotation: 0
      },
      grid: {
        color: THEME.grid
      },
      border: {
        color: THEME.borderStrong
      }
    },
    y: {
      ticks: {
        color: THEME.textMuted
      },
      grid: {
        color: THEME.grid
      },
      border: {
        color: THEME.borderStrong
      }
    }
  };
}

function renderCharts(rows) {
  const angleCtx = document.getElementById("angleChart");
  const directionCtx = document.getElementById("directionChart");
  const deviationCtx = document.getElementById("deviationChart");

  const angleData = rows
    .filter(row => Number.isFinite(row.frontalAngle))
    .map(row => ({ x: row.id, y: row.frontalAngle }));

  const directionData = rows
    .filter(row => Number.isFinite(row.azimuthDelta) && Number.isFinite(row.depthDelta))
    .map(row => ({ x: row.azimuthDelta, y: row.depthDelta, id: row.id }));

  const normalizedAzimuth = rows.map(row => (
    Number.isFinite(row.azimuthDelta)
      ? Math.abs(row.azimuthDelta) / Math.max(state.limits.azimuth, 0.0001) * 100
      : null
  ));

  const normalizedDepth = rows.map(row => (
    Number.isFinite(row.depthDelta)
      ? Math.abs(row.depthDelta) / Math.max(state.limits.depth, 0.0001) * 100
      : null
  ));

  const directionXLimit = computeSymmetricExtent(rows.map(row => row.azimuthDelta), state.limits.azimuth, 10);
  const directionYLimit = computeSymmetricExtent(rows.map(row => row.depthDelta), state.limits.depth, 0.4);
  const normalizedLimit = Math.max(
    120,
    ...normalizedAzimuth.filter(Number.isFinite),
    ...normalizedDepth.filter(Number.isFinite)
  ) * 1.1;

  if (angleChart) angleChart.destroy();
  if (directionChart) directionChart.destroy();
  if (deviationChart) deviationChart.destroy();

  angleChart = new Chart(angleCtx, {
    type: "scatter",
    data: {
      datasets: [{
        label: "Executado",
        data: angleData,
        pointRadius: 4,
        pointHoverRadius: 5,
        borderWidth: 1,
        borderColor: THEME.accentDark,
        backgroundColor: THEME.accent
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: THEME.surface,
          titleColor: THEME.textStrong,
          bodyColor: THEME.textBody,
          borderColor: THEME.borderStrong,
          borderWidth: 1,
          callbacks: {
            label: ctx => `ID ${ctx.raw.x}: ${formatNumber(ctx.raw.y, 2)}°`
          }
        },
        toleranceLines: {
          yLines: [state.limits.angleMin, state.limits.angleMax],
          color: THEME.textMuted
        }
      },
      scales: {
        ...buildChartScales(),
        x: {
          ...buildChartScales().x,
          title: { display: true, text: "ID do furo", color: THEME.textBody, font: { weight: "600" } }
        },
        y: {
          ...buildChartScales().y,
          title: { display: true, text: "Ângulo [°]", color: THEME.textBody, font: { weight: "600" } },
          min: 0,
          suggestedMax: Math.max(25, state.limits.angleMax + 4)
        }
      }
    }
  });

  directionChart = new Chart(directionCtx, {
    type: "scatter",
    data: {
      datasets: [{
        label: "Executado",
        data: directionData,
        pointRadius: 4,
        pointHoverRadius: 5,
        borderWidth: 1,
        borderColor: THEME.accentDark,
        backgroundColor: THEME.accent
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: THEME.surface,
          titleColor: THEME.textStrong,
          bodyColor: THEME.textBody,
          borderColor: THEME.borderStrong,
          borderWidth: 1,
          callbacks: {
            label: ctx => `ID ${ctx.raw.id}: ΔAz ${formatNumber(ctx.raw.x, 2)}° | ΔProf ${formatNumber(ctx.raw.y, 2)} m`
          }
        },
        toleranceLines: {
          xLines: [-state.limits.azimuth, state.limits.azimuth],
          yLines: [-state.limits.depth, state.limits.depth],
          color: THEME.textMuted
        }
      },
      scales: {
        ...buildChartScales(),
        x: {
          ...buildChartScales().x,
          title: { display: true, text: "Δ Azimute [°]", color: THEME.textBody, font: { weight: "600" } },
          min: -directionXLimit,
          max: directionXLimit
        },
        y: {
          ...buildChartScales().y,
          title: { display: true, text: "Δ Profundidade [m]", color: THEME.textBody, font: { weight: "600" } },
          reverse: true,
          min: -directionYLimit,
          max: directionYLimit
        }
      }
    }
  });

  deviationChart = new Chart(deviationCtx, {
    type: "line",
    data: {
      labels: rows.map(row => String(row.id)),
      datasets: [
        {
          label: "Azimute | % do limite",
          data: normalizedAzimuth,
          borderColor: THEME.accent,
          backgroundColor: "rgba(227, 6, 19, 0.12)",
          borderWidth: 1.8,
          pointRadius: 2.5,
          pointHoverRadius: 4,
          tension: 0.16,
          spanGaps: true
        },
        {
          label: "Profundidade | % do limite",
          data: normalizedDepth,
          borderColor: THEME.planned,
          backgroundColor: "rgba(47, 54, 64, 0.10)",
          borderWidth: 1.8,
          pointRadius: 2.5,
          pointHoverRadius: 4,
          tension: 0.16,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "start"
        },
        tooltip: {
          backgroundColor: THEME.surface,
          titleColor: THEME.textStrong,
          bodyColor: THEME.textBody,
          borderColor: THEME.borderStrong,
          borderWidth: 1
        },
        toleranceLines: {
          yLines: [100],
          color: THEME.textMuted
        }
      },
      scales: {
        ...buildChartScales(),
        x: {
          ...buildChartScales().x,
          title: { display: true, text: "ID do furo", color: THEME.textBody, font: { weight: "600" } }
        },
        y: {
          ...buildChartScales().y,
          title: { display: true, text: "% do limite configurado", color: THEME.textBody, font: { weight: "600" } },
          min: 0,
          max: normalizedLimit
        }
      }
    }
  });

  els.angleChartTitle.textContent = "Ângulo frontal";
  els.directionChartTitle.textContent = "Direção dos furos";
  els.deviationChartTitle.textContent = "Distribuição de desvios";
}

function renderTable(rows) {
  els.dataTableBody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.id}</td>
      <td>${formatNumber(row.frontalAngle, 2)}°</td>
      <td>${formatNumber(row.azimuthDelta, 2)}°</td>
      <td>${formatNumber(row.depthDelta, 2)} m</td>
      <td>${formatNumber(row.plannedLength, 2)} m</td>
      <td>${formatNumber(row.executedLength, 2)} m</td>
    </tr>
  `).join("");
}

function clearCharts() {
  if (angleChart) {
    angleChart.destroy();
    angleChart = null;
  }
  if (directionChart) {
    directionChart.destroy();
    directionChart = null;
  }
  if (deviationChart) {
    deviationChart.destroy();
    deviationChart = null;
  }
}

function renderEmptyState(message) {
  currentRows = [];
  clearCharts();
  els.planMap.innerHTML = "<div class='empty-map'>Sem geometria disponível.</div>";
  els.dataTableBody.innerHTML = "";
  els.analysisText.innerHTML = `<p>${message}</p>`;
  els.reportDate.textContent = formatDateTime(new Date());
  els.reportSubtitle.textContent = currentFileName;
}

function renderAll(rows) {
  currentRows = rows;
  renderSummary(rows);
  renderPlanMap(rows);
  renderCharts(rows);
  renderTable(rows);
}

function applyLimitsFromInputs() {
  state.limits.angleMin = toNumber(els.angleMinInput.value, 12);
  state.limits.angleMax = toNumber(els.angleMaxInput.value, 18);
  state.limits.azimuth = toNumber(els.azLimitInput.value, 6);
  state.limits.depth = toNumber(els.depthLimitInput.value, 0.20);
}

function processDxfText(text, fileName) {
  currentFileName = fileName || "DXF";
  const entities = parseDxfEntities(text);
  const holes = buildHolesFromEntities(entities);
  const rows = calculateRows(holes);

  if (!rows.length) {
    renderEmptyState("O DXF foi lido, mas não foram encontradas camadas compatíveis com Hole, Theoretical Hole e Real Hole.");
    return;
  }

  renderAll(rows);
}

async function loadDefaultDxf() {
  try {
    const response = await fetch(DEFAULT_DXF_PATH);
    if (!response.ok) throw new Error("Falha ao carregar o DXF padrão.");
    const text = await response.text();
    processDxfText(text, "PP23.dxf");
  } catch (error) {
    renderEmptyState("Não foi possível carregar automaticamente o DXF padrão. Se estiver abrindo o arquivo localmente, selecione o DXF manualmente ou execute o projeto por um servidor local.");
    console.error(error);
  }
}

async function exportPdf() {
  const blast = (state.blastName || "fogo").replace(/[^\w\-]+/g, "_").toLowerCase();
  const report = document.getElementById("report");
  const filename = `analise-desvios-${blast}.pdf`;
  const { jsPDF } = window.jspdf || {};
  if (typeof window.html2canvas !== "function" || !jsPDF) {
    throw new Error("Bibliotecas de exportação não disponíveis.");
  }

  report.classList.add("report-sheet--exporting");
  els.exportPdfBtn.disabled = true;
  els.exportPdfBtn.textContent = "Gerando PDF...";
  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await ensureReportLogoReady();

    await new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

    const canvas = await window.html2canvas(report, {
      scale: Math.max(window.devicePixelRatio || 1, 2.5),
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false
    });

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;
    const mmPerPixel = printableWidth / canvas.width;
    const pagePixelHeight = Math.floor(printableHeight / mmPerPixel);

    let renderedHeight = 0;
    let pageIndex = 0;

    while (renderedHeight < canvas.height) {
      const sliceHeight = Math.min(pagePixelHeight, canvas.height - renderedHeight);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      const pageContext = pageCanvas.getContext("2d");
      if (!pageContext) {
        throw new Error("Não foi possível preparar o PDF para download.");
      }

      pageContext.fillStyle = "#ffffff";
      pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageContext.drawImage(
        canvas,
        0,
        renderedHeight,
        canvas.width,
        sliceHeight,
        0,
        0,
        pageCanvas.width,
        pageCanvas.height
      );

      const imageData = pageCanvas.toDataURL("image/jpeg", 0.98);
      const renderedPageHeight = sliceHeight * mmPerPixel;

      if (pageIndex > 0) {
        pdf.addPage();
      }

      pdf.addImage(
        imageData,
        "JPEG",
        margin,
        margin,
        printableWidth,
        renderedPageHeight,
        undefined,
        "FAST"
      );

      renderedHeight += sliceHeight;
      pageIndex += 1;
    }

    pdf.save(filename);
  } finally {
    els.exportPdfBtn.disabled = false;
    els.exportPdfBtn.textContent = "Exportar PDF";
    report.classList.remove("report-sheet--exporting");
  }
}

function wireEvents() {
  els.blastNameInput.addEventListener("input", event => {
    state.blastName = event.target.value.trim() || "Fogo";
    els.headerBlastName.textContent = state.blastName;
    if (currentRows.length) renderAll(currentRows);
  });

  els.dxfInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => processDxfText(String(reader.result || ""), file.name);
    reader.readAsText(file, "latin1");
  });

  els.logoInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await applyReportLogo(String(reader.result || ""));
      } catch (error) {
        console.error(error);
      }
    };
    reader.readAsDataURL(file);
  });

  els.loadDxfBtn.addEventListener("click", () => {
    openFilePicker(els.dxfInput);
  });

  els.loadLogoBtn.addEventListener("click", () => {
    openFilePicker(els.logoInput);
  });

  els.reloadDefaultBtn.addEventListener("click", () => loadDefaultDxf());

  [els.angleMinInput, els.angleMaxInput, els.azLimitInput, els.depthLimitInput].forEach(input => {
    input.addEventListener("change", () => {
      applyLimitsFromInputs();
      if (currentRows.length) renderAll(currentRows);
    });
  });

  els.exportPdfBtn.addEventListener("click", () => {
    exportPdf().catch(error => {
      console.error(error);
      window.alert("Não foi possível gerar o PDF automaticamente nesta tentativa.");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyLimitsFromInputs();
  resetReportLogo().catch(error => console.error(error));
  wireEvents();
  loadDefaultDxf();
});
