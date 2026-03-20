const SITE_DATA_PATH = '__SITE_DATA_PATH__';
const SERIES_COLORS = ['#006d77', '#d97706', '#b23a48', '#386641', '#355070'];

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatBytes(value) {
  if (value === undefined || value === null) {
    return 'n/a';
  }
  if (Math.abs(value) < 1024) {
    return `${formatNumber(value)} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let scaled = value / 1024;
  let unitIndex = 0;
  while (Math.abs(scaled) >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }
  return `${scaled.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderHeroStats(data) {
  const root = document.getElementById('hero-stats');
  root.innerHTML = [
    ['Generated', formatDate(data.generatedAt)],
    ['Total runs', formatNumber(data.overview.total)],
    ['Lanes', formatNumber(Object.keys(data.overview.byLane).length)],
    ['Implementations', formatNumber(data.implementations.length)],
  ]
    .map(
      ([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join('');
}

function renderLatestViews(data) {
  const root = document.getElementById('latest-results');
  if (data.latestViews.length === 0) {
    root.innerHTML = '<p class="empty-state">No benchmark history is indexed yet.</p>';
    return;
  }

  root.innerHTML = data.latestViews
    .map((view) => {
      const implementationRows = view.implementations
        .map(
          (implementation) => `
            <tr>
              <td>${escapeHtml(implementation.label)}</td>
              <td>${escapeHtml(implementation.variant)}</td>
              <td>${escapeHtml(implementation.executionModel)}</td>
              <td>${escapeHtml(formatNumber(implementation.avgDurationMs))} ms</td>
              <td>${escapeHtml(formatNumber(implementation.durationDeltaMsFromFastest))} ms</td>
              <td>${escapeHtml(formatBytes(implementation.avgSizeBytes))}</td>
              <td>${escapeHtml(formatBytes(implementation.avgMemoryDeltaBytes))}</td>
            </tr>`,
        )
        .join('');

      return `
        <article class="snapshot-card">
          <div class="snapshot-header">
            <div>
              <p class="meta-label">${escapeHtml(view.lane)} lane</p>
              <h3 class="snapshot-title">${escapeHtml(view.environment)}</h3>
              <p class="muted">${escapeHtml(view.scenarioLabel)}</p>
            </div>
            <div class="muted">
              <div>${escapeHtml(formatDate(view.collectedAt))}</div>
              <div>${escapeHtml(view.git.shortSha)} on ${escapeHtml(view.git.branch)}</div>
            </div>
          </div>
          <div class="pill-row">
            <span class="pill">Profile: ${escapeHtml(view.profile.label)}</span>
            <span class="pill">Rows: ${escapeHtml(formatNumber(view.scenario.request.limit))}</span>
            <span class="pill">Columns: ${escapeHtml(formatNumber(view.scenario.request.columns.length))}</span>
            <span class="pill">Samples: ${escapeHtml(formatNumber(view.scenario.sampleCount))}</span>
          </div>
          <dl class="meta-grid">
            <div>
              <dt>Runner</dt>
              <dd>${escapeHtml(view.runner.hostname)}</dd>
            </div>
            <div>
              <dt>Toolchain</dt>
              <dd>${escapeHtml(view.toolchain.nodeVersion)} / ${escapeHtml(view.toolchain.bunVersion ?? 'bun n/a')}</dd>
            </div>
            <div>
              <dt>Memory caveat</dt>
              <dd>${escapeHtml(view.diagnostics.memory.note)}</dd>
            </div>
            <div>
              <dt>Run path</dt>
              <dd>${escapeHtml(view.latestRunPath)}</dd>
            </div>
          </dl>
          <table class="implementation-table">
            <thead>
              <tr>
                <th>Implementation</th>
                <th>Variant</th>
                <th>Execution model</th>
                <th>Avg duration</th>
                <th>From fastest</th>
                <th>Avg size</th>
                <th>Avg memory delta</th>
              </tr>
            </thead>
            <tbody>${implementationRows}</tbody>
          </table>
        </article>
      `;
    })
    .join('');
}

function renderTrendChart(view) {
  const width = 920;
  const height = 220;
  const padding = 28;
  const allPoints = view.implementations.flatMap((implementation) => implementation.points);
  if (allPoints.length === 0) {
    return '<p class="empty-state">No trend points available.</p>';
  }
  const maxDuration = Math.max(...allPoints.map((point) => point.durationMs), 1);
  const xStep = allPoints.length === 1 ? 0 : (width - padding * 2) / (allPoints.length - 1);

  const paths = view.implementations
    .map((implementation, implementationIndex) => {
      const path = implementation.points
        .map((point, pointIndex) => {
          const x = padding + xStep * pointIndex;
          const y = height - padding - (point.durationMs / maxDuration) * (height - padding * 2);
          return `${pointIndex === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ');
      return `<path d="${path}" fill="none" stroke="${SERIES_COLORS[implementationIndex % SERIES_COLORS.length]}" stroke-width="3" stroke-linecap="round" />`;
    })
    .join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Duration trend chart">${paths}</svg>`;
}

function renderTrendViews(data) {
  const root = document.getElementById('trend-views');
  root.innerHTML = data.trendViews
    .map(
      (view) => `
        <article class="trend-card">
          <div class="trend-header">
            <div>
              <p class="meta-label">${escapeHtml(view.lane)} lane</p>
              <h3>${escapeHtml(view.environment)}</h3>
              <p class="muted">${escapeHtml(view.scenarioLabel)}</p>
            </div>
            <div class="muted">${escapeHtml(view.latestRunPath)}</div>
          </div>
          ${renderTrendChart(view)}
          <div class="legend">
            ${view.implementations
              .map(
                (implementation, index) => `
                  <div>
                    <p><span class="swatch" style="background:${SERIES_COLORS[index % SERIES_COLORS.length]}"></span>${escapeHtml(implementation.label)}</p>
                    <p class="muted">${escapeHtml(formatNumber(implementation.points.length))} indexed run(s)</p>
                  </div>`,
              )
              .join('')}
          </div>
        </article>`,
    )
    .join('');
}

function renderImplementationCatalog(data) {
  const root = document.getElementById('implementation-catalog');
  root.innerHTML = data.implementations
    .map(
      (implementation) => `
        <article class="implementation-card">
          <p class="meta-label">${escapeHtml(implementation.id)}</p>
          <h3>${escapeHtml(implementation.label)}</h3>
          <p class="muted">Variants: ${escapeHtml(implementation.variants.join(', '))}</p>
          <p class="muted">Execution models: ${escapeHtml(implementation.executionModels.join(', '))}</p>
          <p class="muted">Source keys: ${escapeHtml(implementation.sourceKeys.join(', '))}</p>
        </article>`,
    )
    .join('');
}

async function main() {
  const response = await fetch(SITE_DATA_PATH);
  if (!response.ok) {
    throw new Error(`Failed to load site data from ${SITE_DATA_PATH}`);
  }
  const data = await response.json();
  renderHeroStats(data);
  renderLatestViews(data);
  renderTrendViews(data);
  renderImplementationCatalog(data);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const root = document.getElementById('latest-results');
  if (root) {
    root.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
  }
});
