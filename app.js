const DEFAULT_DXF_PATH = "data/PP23.dxf";

let angleChart;
let directionChart;
let currentRows = [];
let currentFileName = "PP23.dxf";

const state = {
  blastName: "PP23",
  limits: {
    angleMin: 12,
    angleMax: 18,
    azimuth: 6,
    depth: 0.20,
    meta: 80
  }
};

const els = {
  blastNameInput: document.getElementById("blastNameInput"),
  dxfInput: document.getElementById("dxfInput"),
  logoInput: document.getElementById("logoInput"),
  reloadDefaultBtn: document.getElementById("reloadDefaultBtn"),
  exportPdfBtn: document.getElementById("exportPdfBtn"),
  reportTitle: document.getElementById("reportTitle"),
  reportSubtitle: document.getElementById("reportSubtitle"),
  reportLogo: document.getElementById("reportLogo"),
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

function normalizeDeg(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

function angleDiff(a, b) {
  return Math.abs(normalizeDeg(a - b));
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

function pointFromRaw(raw, prefix) {
  return {
    x: getNum(raw, `${prefix}10`),
    y: getNum(raw, `${prefix}20`),
    z: getNum(raw, `${prefix}30`, 0)
  };
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
  afterDatasetsDraw(chart, args, pluginOptions) {
    const { ctx, chartArea, scales } = chart;
    const opts = chart.options.plugins.toleranceLines || {};
    if (!chartArea || !opts) return;

    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#0f6a2b";
    ctx.lineCap = "round";

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

function renderCharts(rows) {
  const angleCtx = document.getElementById("angleChart");
  const directionCtx = document.getElementById("directionChart");
  const blast = state.blastName || "Fogo";

  const angleData = rows
    .filter(row => Number.isFinite(row.frontalAngle))
    .map(row => ({ x: row.id, y: row.frontalAngle }));

  const directionData = rows
    .filter(row => Number.isFinite(row.azimuthDelta) && Number.isFinite(row.depthDelta))
    .map(row => ({ x: row.azimuthDelta, y: row.depthDelta, id: row.id }));

  if (angleChart) angleChart.destroy();
  if (directionChart) directionChart.destroy();

  angleChart = new Chart(angleCtx, {
    type: "scatter",
    data: {
      datasets: [{
        label: "Furo executado",
        data: angleData,
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 1.5,
        borderColor: "#85620f",
        backgroundColor: "#c79517"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `ID ${ctx.raw.x}: ${formatNumber(ctx.raw.y, 2)}°`
          }
        },
        toleranceLines: {
          yLines: [state.limits.angleMin, state.limits.angleMax]
        }
      },
      scales: {
        x: {
          title: { display: true, text: "ID Furo", font: { weight: "700" } },
          grid: { color: "#d5d9d6" }
        },
        y: {
          title: { display: true, text: "Ângulo [°]", font: { weight: "700" } },
          min: 0,
          suggestedMax: Math.max(30, state.limits.angleMax + 4),
          grid: { color: "#d5d9d6" }
        }
      }
    }
  });

  directionChart = new Chart(directionCtx, {
    type: "scatter",
    data: {
      datasets: [{
        label: "Furo executado",
        data: directionData,
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 1.5,
        borderColor: "#85620f",
        backgroundColor: "#c79517"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `ID ${ctx.raw.id}: ΔAz ${formatNumber(ctx.raw.x, 2)}° | ΔZ ${formatNumber(ctx.raw.y, 2)} m`
          }
        },
        toleranceLines: {
          xLines: [-state.limits.azimuth, state.limits.azimuth],
          yLines: [-state.limits.depth, state.limits.depth]
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Azimute [°]", font: { weight: "700" } },
          min: -45,
          max: 45,
          grid: { color: "#d5d9d6" }
        },
        y: {
          title: { display: true, text: "Δ Profundidade [m]", font: { weight: "700" } },
          reverse: true,
          min: -2.5,
          max: 2.5,
          grid: { color: "#d5d9d6" }
        }
      }
    }
  });

  els.angleChartTitle.textContent = `Ângulo Frontal [${blast}]`;
  els.directionChartTitle.textContent = `Direção dos Furos [${blast}]`;
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

  const xs = allPoints.map(p => p.x).filter(Number.isFinite);
  const ys = allPoints.map(p => p.y).filter(Number.isFinite);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 28;
  const width = 1200;
  const height = 430;
  const scale = Math.min(
    (width - pad * 2) / Math.max(maxX - minX, 1),
    (height - pad * 2) / Math.max(maxY - minY, 1)
  );

  const tx = x => pad + (x - minX) * scale + (width - pad * 2 - (maxX - minX) * scale) / 2;
  const ty = y => height - pad - (y - minY) * scale - (height - pad * 2 - (maxY - minY) * scale) / 2;

  const plannedLines = rows.map(row =>
    `<line x1="${tx(row.plannedStart.x)}" y1="${ty(row.plannedStart.y)}" x2="${tx(row.plannedEnd.x)}" y2="${ty(row.plannedEnd.y)}" class="planned-line"/>`
  ).join("");

  const realLines = rows.map(row => {
    const pts = row.realPoints.map(p => `${tx(p.x)},${ty(p.y)}`).join(" ");
    return `<polyline points="${pts}" class="real-line"/>`;
  }).join("");

  const collars = rows.map(row =>
    `<circle cx="${tx(row.plannedStart.x)}" cy="${ty(row.plannedStart.y)}" r="2.8" class="collar-dot"/>`
  ).join("");

  els.planMap.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mapa de planejado e executado">
      <defs>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#10201a" flood-opacity=".18"/>
        </filter>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>
      <g filter="url(#softShadow)">${plannedLines}</g>
      <g>${realLines}</g>
      <g>${collars}</g>
      <g class="map-legend" transform="translate(24, 24)">
        <rect width="292" height="42" rx="14" fill="rgba(255,255,255,.86)" stroke="#dbe1dd"/>
        <line x1="18" y1="15" x2="50" y2="15" class="planned-line"/>
        <text x="58" y="19">Planejado</text>
        <line x1="146" y1="15" x2="178" y2="15" class="real-line"/>
        <text x="186" y="19">Executado</text>
        <circle cx="18" cy="30" r="3" class="collar-dot"/>
        <text x="28" y="34">Emboque</text>
      </g>
    </svg>
  `;
}

function renderTable(rows) {
  els.dataTableBody.innerHTML = rows.slice(0, 40).map(row => `
    <tr>
      <td>${row.id}</td>
      <td>${formatNumber(row.frontalAngle, 2)}</td>
      <td>${formatNumber(row.azimuthDelta, 2)}</td>
      <td>${formatNumber(row.depthDelta, 2)}</td>
      <td>${formatNumber(row.plannedLength, 2)}</td>
      <td>${formatNumber(row.executedLength, 2)}</td>
    </tr>
  `).join("");
}

function depthSentence(avgDelta) {
  if (!Number.isFinite(avgDelta)) return "Não foi possível consolidar a tendência de profundidade.";
  if (avgDelta > 0.03) return "Os furos estão, em média, com profundidades maiores que as de projeto.";
  if (avgDelta < -0.03) return "Os furos estão, em média, com profundidades menores que as de projeto.";
  return "As profundidades médias estão próximas das profundidades de projeto.";
}

function renderSummary(rows) {
  const metrics = calculateMetrics(rows);
  const blast = state.blastName || "Fogo";

  els.reportTitle.textContent = `Análise do fogo ${blast}`;
  els.reportSubtitle.textContent = `Gerado automaticamente a partir do DXF ${currentFileName}`;
  els.metricHoles.textContent = metrics.total.toLocaleString("pt-BR");
  els.metricComparable.textContent = `${metrics.azComparable.toLocaleString("pt-BR")} com direção comparável`;
  els.metricAngle.textContent = formatPercent(metrics.anglePct);
  els.metricAzimuth.textContent = formatPercent(metrics.azPct);
  els.metricDepth.textContent = formatPercent(metrics.depthPct);

  const azNote = metrics.azComparable < metrics.total
    ? `<br><span class="muted">Obs.: ${metrics.total - metrics.azComparable} furo(s) sem direção teórica em planta suficiente para comparação de azimute.</span>`
    : "";

  els.analysisText.innerHTML = `
    <strong>Aderência de Ângulo = ${formatPercent(metrics.anglePct)}</strong> (Meta = ${state.limits.meta}%).<br>
    <strong>Aderência Azimute = ${formatPercent(metrics.azPct)}</strong> (Meta = ${state.limits.meta}%).<br>
    <strong>Aderência Z = ${formatPercent(metrics.depthPct)}</strong> (Meta = ${state.limits.meta}%).<br><br>
    ${depthSentence(metrics.avgDepthDelta)}
    ${azNote}
  `;
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
    els.analysisText.innerHTML = "O DXF foi lido, mas não foram encontradas camadas compatíveis com Hole, Theoretical Hole e Real Hole.";
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
    els.analysisText.innerHTML = "Não foi possível carregar automaticamente o DXF padrão. Se estiver abrindo o arquivo localmente, selecione o DXF no campo acima ou execute por um servidor local.";
    console.error(error);
  }
}

function wireEvents() {
  els.blastNameInput.addEventListener("input", event => {
    state.blastName = event.target.value.trim() || "Fogo";
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
    reader.onload = () => {
      els.reportLogo.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });

  els.reloadDefaultBtn.addEventListener("click", () => loadDefaultDxf());

  [els.angleMinInput, els.angleMaxInput, els.azLimitInput, els.depthLimitInput].forEach(input => {
    input.addEventListener("change", () => {
      applyLimitsFromInputs();
      if (currentRows.length) renderAll(currentRows);
    });
  });

  els.exportPdfBtn.addEventListener("click", () => {
    const blast = (state.blastName || "fogo").replace(/[^\w\-]+/g, "_").toLowerCase();
    const opt = {
      margin: 6,
      filename: `analise-desvios-${blast}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] }
    };

    html2pdf().set(opt).from(document.getElementById("report")).save();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyLimitsFromInputs();
  wireEvents();
  loadDefaultDxf();
});
