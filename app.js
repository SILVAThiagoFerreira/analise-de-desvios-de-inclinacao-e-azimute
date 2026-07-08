const DEFAULT_DXF_PATH = "data/PP23.dxf";
const DEFAULT_REPORT_LOGO_PATH = "assets/default-report-logo.png";

const THEME = {
  accent: "#E20613",
  accentDark: "#B00410",
  textStrong: "#38424B",
  textBody: "#38424B",
  textMuted: "#6C7680",
  border: "#E3E6EA",
  borderStrong: "#D2D6DB",
  grid: "#ECEFF3",
  planned: "#2F3640",
  surface: "#FFFFFF",
  soft: "#F5F6F7"
};

const CHART_LIMITS = {
  angle: {
    min: 0,
    max: 30,
    yStep: 5,
    xStep: 10
  },
  direction: {
    xMin: -45,
    xMax: 45,
    xStep: 10,
    yMin: -2.5,
    yMax: 2.5,
    yStep: 0.5
  }
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
    angleMin: 11.8,
    angleMax: 18.2,
    azimuth: 6.39,
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
  exportExcelBtn: document.getElementById("exportExcelBtn"),
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
  metricAngleMeta: document.getElementById("metricAngleMeta"),
  metricAzimuthMeta: document.getElementById("metricAzimuthMeta"),
  metricDepthMeta: document.getElementById("metricDepthMeta"),
  controlMetaText: document.getElementById("controlMetaText"),
  controlAngleExpected: document.getElementById("controlAngleExpected"),
  controlAngleLimits: document.getElementById("controlAngleLimits"),
  controlAngleTolerance: document.getElementById("controlAngleTolerance"),
  controlAzimuthExpected: document.getElementById("controlAzimuthExpected"),
  controlAzimuthLimits: document.getElementById("controlAzimuthLimits"),
  controlAzimuthTolerance: document.getElementById("controlAzimuthTolerance"),
  controlDepthExpected: document.getElementById("controlDepthExpected"),
  controlDepthLimits: document.getElementById("controlDepthLimits"),
  controlDepthTolerance: document.getElementById("controlDepthTolerance"),
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

function formatSignedNumber(value, digits = 2, unit = "") {
  if (!Number.isFinite(value)) return "N/A";
  if (value === 0) return `${formatNumber(0, digits)}${unit}`;
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatNumber(Math.abs(value), digits)}${unit}`;
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

function roundUpToStep(value, step) {
  return Math.ceil(value / step) * step;
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
  const metaLabel = `Meta = ${formatNumber(state.limits.meta, 0)}%`;

  els.headerBlastName.textContent = blast;
  els.reportFireTag.textContent = `Fogo ${blast}`;
  els.reportTitle.textContent = `Análise de Desvios de Inclinação e Azimute - ${blast}`;
  els.reportSubtitle.textContent = currentFileName;
  els.reportSource.textContent = "Leitura direta do DXF com comparação entre planejado, executado e limites de aderência.";
  els.reportDate.textContent = formatDateTime(state.renderedAt);

  els.metricHoles.textContent = metrics.total.toLocaleString("pt-BR");
  els.metricComparable.textContent = `${metrics.azComparable.toLocaleString("pt-BR")} com direção comparável em planta`;
  els.metricAngle.textContent = formatPercent(metrics.anglePct);
  els.metricAzimuth.textContent = formatPercent(metrics.azPct);
  els.metricDepth.textContent = formatPercent(metrics.depthPct);
  els.metricAngleMeta.textContent = metaLabel;
  els.metricAzimuthMeta.textContent = metaLabel;
  els.metricDepthMeta.textContent = metaLabel;

  setMetricCardTone(els.metricAngleCard, metrics.anglePct);
  setMetricCardTone(els.metricAzimuthCard, metrics.azPct);
  setMetricCardTone(els.metricDepthCard, metrics.depthPct);

  const paragraphs = buildAnalysisParagraphs(metrics)
    .map(paragraph => `<p>${paragraph}</p>`)
    .join("");

  els.analysisText.innerHTML = paragraphs;
}

function renderControlParameters() {
  const angleExpected = (state.limits.angleMin + state.limits.angleMax) / 2;
  const angleTolerance = Math.abs(state.limits.angleMax - state.limits.angleMin) / 2;

  els.controlMetaText.textContent = `${formatNumber(state.limits.meta, 0)}%`;
  els.controlAngleExpected.textContent = `${formatNumber(angleExpected, 2)}°`;
  els.controlAngleLimits.textContent = `Limites: ${formatNumber(state.limits.angleMin, 2)}° a ${formatNumber(state.limits.angleMax, 2)}°`;
  els.controlAngleTolerance.textContent = `Tolerância: ±${formatNumber(angleTolerance, 2)}°`;

  els.controlAzimuthExpected.textContent = "0,00°";
  els.controlAzimuthLimits.textContent = `Limites: ${formatSignedNumber(-state.limits.azimuth, 2, "°")} a ${formatSignedNumber(state.limits.azimuth, 2, "°")}`;
  els.controlAzimuthTolerance.textContent = `Tolerância: ±${formatNumber(state.limits.azimuth, 2)}°`;

  els.controlDepthExpected.textContent = "0,00 m";
  els.controlDepthLimits.textContent = `Limites: ${formatSignedNumber(-state.limits.depth, 2, " m")} a ${formatSignedNumber(state.limits.depth, 2, " m")}`;
  els.controlDepthTolerance.textContent = `Tolerância: ±${formatNumber(state.limits.depth, 2)} m`;
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
      resolve(canvas.toDataURL("image/png"));
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
        maxRotation: 0,
        padding: 10
      },
      grid: {
        color: THEME.grid,
        lineWidth: 1.15,
        drawTicks: true
      },
      border: {
        color: THEME.borderStrong,
        width: 1.15
      }
    },
    y: {
      ticks: {
        color: THEME.textMuted,
        padding: 8
      },
      grid: {
        color: THEME.grid,
        lineWidth: 1.15,
        drawTicks: true
      },
      border: {
        color: THEME.borderStrong,
        width: 1.15
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

  const normalizedLimit = Math.max(
    120,
    ...normalizedAzimuth.filter(Number.isFinite),
    ...normalizedDepth.filter(Number.isFinite)
  ) * 1.1;
  const angleMaxId = Math.max(...angleData.map(point => Number(point.x) || 0), 0);
  const angleXAxisMax = Math.max(CHART_LIMITS.angle.xStep, roundUpToStep(angleMaxId + 2, 5));

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
          color: THEME.planned,
          lineWidth: 1.85,
          dash: []
        }
      },
      scales: {
        ...buildChartScales(),
        x: {
          ...buildChartScales().x,
          title: { display: true, text: "ID Furo", color: THEME.textBody, font: { weight: "600" } },
          min: 0,
          max: angleXAxisMax,
          ticks: {
            ...buildChartScales().x.ticks,
            stepSize: CHART_LIMITS.angle.xStep
          }
        },
        y: {
          ...buildChartScales().y,
          title: { display: true, text: "Ângulo [°]", color: THEME.textBody, font: { weight: "600" } },
          min: CHART_LIMITS.angle.min,
          max: CHART_LIMITS.angle.max,
          ticks: {
            ...buildChartScales().y.ticks,
            stepSize: CHART_LIMITS.angle.yStep
          }
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
          color: THEME.planned,
          lineWidth: 1.85,
          dash: []
        }
      },
      scales: {
        ...buildChartScales(),
        x: {
          ...buildChartScales().x,
          title: { display: true, text: "Δ Azimute [°]", color: THEME.textBody, font: { weight: "600" } },
          min: CHART_LIMITS.direction.xMin,
          max: CHART_LIMITS.direction.xMax,
          ticks: {
            ...buildChartScales().x.ticks,
            stepSize: CHART_LIMITS.direction.xStep
          }
        },
        y: {
          ...buildChartScales().y,
          title: { display: true, text: "Δ Profundidade [m]", color: THEME.textBody, font: { weight: "600" } },
          reverse: true,
          min: CHART_LIMITS.direction.yMin,
          max: CHART_LIMITS.direction.yMax,
          ticks: {
            ...buildChartScales().y.ticks,
            stepSize: CHART_LIMITS.direction.yStep
          }
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
          spanGaps: false
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
          spanGaps: false
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
  renderControlParameters();
  renderSummary(rows);
  renderPlanMap(rows);
  renderCharts(rows);
  renderTable(rows);
}

function applyLimitsFromInputs() {
  state.limits.angleMin = toNumber(els.angleMinInput.value, 12);
  state.limits.angleMax = toNumber(els.angleMaxInput.value, 18);
  state.limits.azimuth = toNumber(els.azLimitInput.value, 5);
  state.limits.depth = toNumber(els.depthLimitInput.value, 0.25);
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

async function renderElementToCanvas(element, scale) {
  return window.html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false
  });
}

function createPdfLayout(pdf, margin = 10, sectionGap = 4) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  return {
    margin,
    sectionGap,
    pageWidth,
    pageHeight,
    printableWidth: pageWidth - margin * 2,
    printableHeight: pageHeight - margin * 2,
    currentY: margin,
    pageIndex: 0
  };
}

function mmPerPixelForCanvas(layout, canvas) {
  return layout.printableWidth / canvas.width;
}

function ensurePdfSpace(pdf, layout, requiredHeight, options = {}) {
  const forceNewPage = options.forceNewPage === true;
  const remainingHeight = layout.pageHeight - layout.margin - layout.currentY;
  if (
    forceNewPage ||
    (layout.currentY > layout.margin && requiredHeight > remainingHeight)
  ) {
    pdf.addPage();
    layout.pageIndex += 1;
    layout.currentY = layout.margin;
  }
}

function addCanvasPageSlice(pdf, layout, canvas, offsetY, sliceHeight, mmPerPixel) {
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
    offsetY,
    canvas.width,
    sliceHeight,
    0,
    0,
    pageCanvas.width,
    pageCanvas.height
  );

  const renderedHeightMm = sliceHeight * mmPerPixel;
  const imageData = pageCanvas.toDataURL("image/jpeg", 0.98);
  pdf.addImage(
    imageData,
    "JPEG",
    layout.margin,
    layout.currentY,
    layout.printableWidth,
    renderedHeightMm,
    undefined,
    "FAST"
  );
  layout.currentY += renderedHeightMm;
}

function appendCanvasAsSection(pdf, layout, canvas, options = {}) {
  const mmPerPixel = mmPerPixelForCanvas(layout, canvas);
  const renderedHeight = canvas.height * mmPerPixel;

  if (renderedHeight <= layout.printableHeight && !options.allowSplit) {
    ensurePdfSpace(pdf, layout, renderedHeight, options);
    addCanvasPageSlice(pdf, layout, canvas, 0, canvas.height, mmPerPixel);
    layout.currentY += layout.sectionGap;
    return;
  }

  if (!options.allowSplit && renderedHeight > layout.printableHeight) {
    ensurePdfSpace(pdf, layout, layout.printableHeight, options);
  } else {
    ensurePdfSpace(pdf, layout, options.minBlockHeightMm || 28, options);
  }

  let renderedOffset = 0;
  while (renderedOffset < canvas.height) {
    const remainingHeightMm = layout.pageHeight - layout.margin - layout.currentY;
    const availablePixelHeight = Math.max(
      1,
      Math.floor(remainingHeightMm / mmPerPixel)
    );
    const sliceHeight = Math.min(availablePixelHeight, canvas.height - renderedOffset);
    addCanvasPageSlice(pdf, layout, canvas, renderedOffset, sliceHeight, mmPerPixel);
    renderedOffset += sliceHeight;

    if (renderedOffset < canvas.height) {
      pdf.addPage();
      layout.pageIndex += 1;
      layout.currentY = layout.margin;
    } else {
      layout.currentY += layout.sectionGap;
    }
  }
}

async function exportReportBySections(report, scale) {
  const { jsPDF } = window.jspdf || {};
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true
  });
  const layout = createPdfLayout(pdf, 10, 4);

  const sections = [
    report.querySelector(".report-header"),
    report.querySelector(".summary-grid"),
    report.querySelector(".control-card"),
    report.querySelector(".analysis-card"),
    ...Array.from(report.querySelectorAll(".charts-grid .chart-card")),
    report.querySelector(".data-table-card")
  ].filter(Boolean);

  for (const section of sections) {
    const canvas = await renderElementToCanvas(section, scale);
    const isTable = section.classList.contains("data-table-card");
    appendCanvasAsSection(pdf, layout, canvas, {
      allowSplit: isTable,
      minBlockHeightMm: isTable ? 42 : 28,
      forceNewPage: isTable
    });
  }

  return pdf;
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

    const scale = Math.max(window.devicePixelRatio || 1, 2.2);
    const pdf = await exportReportBySections(report, scale);
    pdf.save(filename);
  } finally {
    els.exportPdfBtn.disabled = false;
    els.exportPdfBtn.textContent = "Exportar PDF";
    report.classList.remove("report-sheet--exporting");
  }
}

function roundOrNull(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildExcelWorkbook(rows) {
  if (typeof window.XLSX === "undefined") {
    throw new Error("Biblioteca XLSX não disponível.");
  }
  const XLSX = window.XLSX;
  const metrics = calculateMetrics(rows);
  const limits = state.limits;
  const generatedAt = formatDateTime(new Date());

  const paramSheetData = [
    ["Análise de Desvios de Inclinação e Azimute"],
    [],
    ["Fogo analisado", state.blastName || ""],
    ["Arquivo de origem", currentFileName || ""],
    ["Data de geração", generatedAt],
    [],
    ["Parâmetro", "Valor"],
    ["Ângulo mínimo (°)", roundOrNull(limits.angleMin, 2)],
    ["Ângulo máximo (°)", roundOrNull(limits.angleMax, 2)],
    ["Limite de azimute (°)", roundOrNull(limits.azimuth, 2)],
    ["Limite de profundidade (m)", roundOrNull(limits.depth, 2)],
    ["Meta de aderência (%)", roundOrNull(limits.meta, 2)],
    [],
    ["Indicador", "Valor"],
    ["Furos analisados", metrics.total],
    ["Furos com direção comparável", metrics.azComparable],
    ["Aderência de ângulo (%)", roundOrNull(metrics.anglePct, 2)],
    ["Aderência de azimute (%)", roundOrNull(metrics.azPct, 2)],
    ["Aderência de Z (%)", roundOrNull(metrics.depthPct, 2)],
    ["Furos dentro do limite de ângulo", metrics.angleOk],
    ["Furos dentro do limite de azimute", metrics.azOk],
    ["Furos dentro do limite de Z", metrics.depthOk],
    ["Δ profundidade médio (m)", roundOrNull(metrics.avgDepthDelta, 2)]
  ];
  const paramSheet = XLSX.utils.aoa_to_sheet(paramSheetData);
  paramSheet["!cols"] = [{ wch: 34 }, { wch: 22 }];

  const blastName = state.blastName || "";
  const header = [
    "Plano",
    "ID",
    "Ângulo frontal (°)",
    "Azimute planejado (°)",
    "Azimute executado (°)",
    "Δ Azimute (°)",
    "Profundidade planejada (m)",
    "Profundidade executada (m)",
    "Δ Profundidade (m)",
    "Ângulo dentro do limite",
    "Azimute dentro do limite",
    "Z dentro do limite"
  ];

  const angleMin = limits.angleMin;
  const angleMax = limits.angleMax;
  const azLimit = limits.azimuth;
  const depthLimit = limits.depth;

  const body = rows.map(row => {
    const angleOk = Number.isFinite(row.frontalAngle)
      && row.frontalAngle >= angleMin
      && row.frontalAngle <= angleMax;
    const azOk = Number.isFinite(row.azimuthDelta)
      && Math.abs(row.azimuthDelta) <= azLimit;
    const depthOk = Number.isFinite(row.depthDelta)
      && Math.abs(row.depthDelta) <= depthLimit;

    return [
      blastName,
      row.id,
      roundOrNull(row.frontalAngle, 2),
      roundOrNull(row.plannedAzimuth, 2),
      roundOrNull(row.executedAzimuth, 2),
      roundOrNull(row.azimuthDelta, 2),
      roundOrNull(row.plannedLength, 2),
      roundOrNull(row.executedLength, 2),
      roundOrNull(row.depthDelta, 2),
      Number.isFinite(row.frontalAngle) ? (angleOk ? "Sim" : "Não") : "N/A",
      Number.isFinite(row.azimuthDelta) ? (azOk ? "Sim" : "Não") : "N/A",
      Number.isFinite(row.depthDelta) ? (depthOk ? "Sim" : "Não") : "N/A"
    ];
  });

  const baseSheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  baseSheet["!cols"] = header.map(col => ({ wch: Math.max(col.length + 2, 14) }));
  baseSheet["!autofilter"] = { ref: XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: body.length, c: header.length - 1 }
  }) };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, paramSheet, "Resumo");
  XLSX.utils.book_append_sheet(workbook, baseSheet, "Base calculada");
  return workbook;
}

function exportExcel() {
  if (typeof window.XLSX === "undefined") {
    window.alert("Biblioteca de exportação Excel não carregada.");
    return;
  }
  if (!currentRows.length) {
    window.alert("Nenhum dado disponível para exportar. Carregue um DXF válido antes.");
    return;
  }

  const blast = (state.blastName || "fogo").replace(/[^\w\-]+/g, "_").toLowerCase();
  const filename = `analise-desvios-${blast}.xlsx`;
  els.exportExcelBtn.disabled = true;
  const originalLabel = els.exportExcelBtn.textContent;
  els.exportExcelBtn.textContent = "Gerando Excel...";
  try {
    const workbook = buildExcelWorkbook(currentRows);
    window.XLSX.writeFile(workbook, filename);
  } finally {
    els.exportExcelBtn.disabled = false;
    els.exportExcelBtn.textContent = originalLabel;
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

  els.exportExcelBtn.addEventListener("click", () => {
    try {
      exportExcel();
    } catch (error) {
      console.error(error);
      window.alert("Não foi possível gerar o Excel: " + (error?.message || error));
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyLimitsFromInputs();
  resetReportLogo().catch(error => console.error(error));
  wireEvents();
  loadDefaultDxf();
});
