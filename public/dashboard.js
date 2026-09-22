// Aggregate view of the recipe book: stat cards + three clickable charts.
// Pure SVG, no charting library. Every mark (bar / slice) is a real link
// target -- clicking or activating one navigates to index.html pre-filtered,
// so the dashboard is a way *into* the recipes, not just a report about them.

const OTHER_COLOR = '#9c9488'; // muted, outside the categorical order -- "everything else"
const SERIES_COUNT = 8;

function seriesColor(i) {
  return `var(--series-${(i % SERIES_COUNT) + 1})`;
}

function navigateTo(params) {
  const qs = new URLSearchParams(params).toString();
  window.location.href = `index.html?${qs}`;
}

// --- Shared tooltip --------------------------------------------------------

function showTooltip(evt, text) {
  const tip = document.getElementById('chart-tooltip');
  tip.textContent = text;
  tip.style.left = `${evt.clientX}px`;
  tip.style.top = `${evt.clientY}px`;
  tip.hidden = false;
}

function moveTooltip(evt) {
  const tip = document.getElementById('chart-tooltip');
  tip.style.left = `${evt.clientX}px`;
  tip.style.top = `${evt.clientY}px`;
}

function hideTooltip() {
  document.getElementById('chart-tooltip').hidden = true;
}

// Wires hover + click + keyboard activation onto one SVG mark element.
function wireMark(el, { tooltip, onActivate }) {
  el.classList.add('chart-mark');
  if (onActivate) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', tooltip);
    el.addEventListener('click', onActivate);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); }
    });
  }
  el.addEventListener('mouseenter', (e) => showTooltip(e, tooltip));
  el.addEventListener('mousemove', moveTooltip);
  el.addEventListener('mouseleave', hideTooltip);
  el.addEventListener('focus', (e) => showTooltip(e, tooltip));
  el.addEventListener('blur', hideTooltip);
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// A bar's data-end is a 4px-radius rounded rect, anchored square to the
// baseline it rises from -- built as a path so only the far corners round.
function roundedTopRectPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function roundedRightRectPath(x, y, w, h, r) {
  r = Math.min(r, h / 2, w);
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}

// --- Stat cards --------------------------------------------------------

function renderStatsRow(recipes) {
  const stats = computeStats(recipes);
  const cards = [{ label: 'Recipes', value: String(stats.total) }];
  if (stats.topMealType) cards.push({ label: 'Top meal type', value: `${stats.topMealType.label} (${stats.topMealType.count})` });
  if (stats.topProtein) cards.push({ label: 'Most common protein', value: `${stats.topProtein.label} (${stats.topProtein.count})` });
  cards.push({
    label: 'Calorie range',
    value: stats.calorieRange ? `${stats.calorieRange.min}–${stats.calorieRange.max} cal` : 'No data yet',
  });
  document.getElementById('stats-row').innerHTML = cards
    .map((c) => `
      <div class="stat-card">
        <span class="stat-value">${escapeHtml(c.value)}</span>
        <span class="stat-label">${escapeHtml(c.label)}</span>
      </div>`)
    .join('');
}

// --- Day-bucketed bar chart (shared by "added over time" and "cooking
// frequency" -- both are a single series of counts per calendar day, just
// counting a different thing) ------------------------------------------

function renderDayBarChart(elementId, days, { ariaLabel, emptyText, unitLabel, onActivate }) {
  const wrap = document.getElementById(elementId);
  if (!days.length) {
    wrap.innerHTML = `<p class="chart-empty">${emptyText}</p>`;
    return;
  }

  const dense = days.length > 40;
  const barW = dense ? 10 : days.length > 20 ? 16 : 26;
  const gap = dense ? 4 : days.length > 20 ? 8 : 16;
  const chartH = 200;
  const padTop = 16;
  const padBottom = 34;
  const padLeft = 8;
  const width = padLeft + days.length * (barW + gap);
  const height = padTop + chartH + padBottom;
  const max = Math.max(1, ...days.map((d) => d.count));
  const labelEvery = Math.max(1, Math.ceil(days.length / 12)); // keep axis labels from colliding

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': ariaLabel });
  svg.appendChild(svgEl('line', {
    x1: padLeft, y1: padTop + chartH, x2: width, y2: padTop + chartH,
    stroke: 'var(--chart-grid)', 'stroke-width': 1,
  }));

  days.forEach((d, i) => {
    const x = padLeft + i * (barW + gap);
    const h = d.count ? Math.max(4, (d.count / max) * chartH) : 0;
    const y = padTop + chartH - h;

    if (h > 0) {
      const bar = svgEl('path', { d: roundedTopRectPath(x, y, barW, h, 4), fill: 'var(--accent)' });
      wireMark(bar, {
        tooltip: `${formatDayLabel(d.date)} — ${d.count} ${unitLabel(d.count)}`,
        onActivate: () => onActivate(d.date),
      });
      svg.appendChild(bar);
    }

    if (i % labelEvery === 0 || i === days.length - 1) {
      const label = svgEl('text', {
        x: x + barW / 2, y: padTop + chartH + 16, 'text-anchor': 'middle', class: 'chart-axis-label',
      });
      label.textContent = formatDayLabel(d.date);
      svg.appendChild(label);
    }
  });

  wrap.innerHTML = '';
  wrap.appendChild(svg);
}

// --- Chart 1: recipes added over time ---------------------------------

function renderTimeChart(recipes) {
  renderDayBarChart('time-chart', recipesByDay(recipes), {
    ariaLabel: 'Recipes added per day',
    emptyText: 'No dated recipes yet.',
    unitLabel: (n) => `recipe${n === 1 ? '' : 's'} added`,
    onActivate: (date) => navigateTo({ date }),
  });
}

// --- Chart 1b: cooking frequency, from "Mark as made" history ---------

function renderCookingChart(recipes) {
  const madeDates = recipes.flatMap((r) => getMadeDates(r));
  renderDayBarChart('cooking-chart', datesToDayBuckets(madeDates), {
    ariaLabel: 'Recipes cooked per day',
    emptyText: 'Nothing marked as made yet — use "Mark as made" on a recipe to start tracking.',
    unitLabel: (n) => `recipe${n === 1 ? '' : 's'} cooked`,
    onActivate: (date) => navigateTo({ madeOn: date }),
  });
}

// --- Chart 2: meal-type distribution (horizontal bars, single series) -----

function renderMealTypeChart(recipes) {
  const wrap = document.getElementById('mealtype-chart');
  const counts = countTagsFrom(recipes, MEAL_TYPE_TAGS);
  if (!counts.length) {
    wrap.innerHTML = '<p class="chart-empty">No meal-type tags yet.</p>';
    return;
  }

  const rowH = 30;
  const gap = 10;
  const labelW = 100;
  const valueW = 40;
  const barMaxW = 320;
  const width = labelW + barMaxW + valueW;
  const height = counts.length * (rowH + gap);
  const max = Math.max(1, ...counts.map((c) => c.count));

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': 'Recipe count by meal type' });

  counts.forEach((c, i) => {
    const y = i * (rowH + gap);
    const w = Math.max(6, (c.count / max) * barMaxW);

    const label = svgEl('text', {
      x: labelW - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'chart-axis-label',
    });
    label.textContent = c.label;
    svg.appendChild(label);

    const bar = svgEl('path', { d: roundedRightRectPath(labelW, y, w, rowH, 4), fill: 'var(--accent)' });
    wireMark(bar, {
      tooltip: `${c.label} — ${c.count} recipe${c.count === 1 ? '' : 's'}`,
      onActivate: () => navigateTo({ mealType: c.label }),
    });
    svg.appendChild(bar);

    const value = svgEl('text', {
      x: labelW + w + 8, y: y + rowH / 2 + 4, class: 'chart-data-label',
    });
    value.textContent = c.count;
    svg.appendChild(value);
  });

  wrap.innerHTML = '';
  wrap.appendChild(svg);
}

// --- Chart 2b: most-used tags overall (horizontal bars, single series) ----
// A word cloud was the original ask, but size-only encoding makes exact
// ranking and comparison hard to read (and to click) -- this reuses the
// meal-type chart's proven bar layout across the whole tag taxonomy instead,
// capped to the top N so it stays legible as the book grows.

const TOP_TAGS_LIMIT = 12;

function renderTopTagsChart(recipes) {
  const wrap = document.getElementById('top-tags-chart');
  const counts = countTagsFrom(recipes, ALL_TAGS).slice(0, TOP_TAGS_LIMIT);
  if (!counts.length) {
    wrap.innerHTML = '<p class="chart-empty">No tags yet.</p>';
    return;
  }

  const rowH = 26;
  const gap = 8;
  const labelW = 120;
  const valueW = 40;
  const barMaxW = 320;
  const width = labelW + barMaxW + valueW;
  const height = counts.length * (rowH + gap);
  const max = Math.max(1, ...counts.map((c) => c.count));

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': 'Most-used tags' });

  counts.forEach((c, i) => {
    const y = i * (rowH + gap);
    const w = Math.max(6, (c.count / max) * barMaxW);

    const label = svgEl('text', {
      x: labelW - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'chart-axis-label',
    });
    label.textContent = c.label;
    svg.appendChild(label);

    const bar = svgEl('path', { d: roundedRightRectPath(labelW, y, w, rowH, 4), fill: 'var(--accent)' });
    wireMark(bar, {
      tooltip: `${c.label} — ${c.count} recipe${c.count === 1 ? '' : 's'}`,
      onActivate: () => navigateTo({ tag: c.label }),
    });
    svg.appendChild(bar);

    const value = svgEl('text', {
      x: labelW + w + 8, y: y + rowH / 2 + 4, class: 'chart-data-label',
    });
    value.textContent = c.count;
    svg.appendChild(value);
  });

  wrap.innerHTML = '';
  wrap.appendChild(svg);
}

// --- Chart 3: protein sources (donut pie, categorical palette) ------------

function polarPoint(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const [x1, y1] = polarPoint(cx, cy, rOuter, startAngle);
  const [x2, y2] = polarPoint(cx, cy, rOuter, endAngle);
  const [x3, y3] = polarPoint(cx, cy, rInner, endAngle);
  const [x4, y4] = polarPoint(cx, cy, rInner, startAngle);
  return [
    `M${x1},${y1}`,
    `A${rOuter},${rOuter} 0 ${large} 1 ${x2},${y2}`,
    `L${x3},${y3}`,
    `A${rInner},${rInner} 0 ${large} 0 ${x4},${y4}`,
    'Z',
  ].join(' ');
}

function renderProteinChart(recipes) {
  const wrap = document.getElementById('protein-chart');
  const counts = countTagsFrom(recipes, PROTEIN_TAGS);
  if (!counts.length) {
    wrap.innerHTML = '<p class="chart-empty">No protein tags yet.</p>';
    return;
  }

  const MAX_SLOTS = SERIES_COUNT;
  const slices = counts.slice(0, MAX_SLOTS);
  const rest = counts.slice(MAX_SLOTS);
  if (rest.length) {
    slices.push({ label: 'Other', count: rest.reduce((sum, c) => sum + c.count, 0), isOther: true });
  }

  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 4;
  const rInner = rOuter * 0.55;

  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': 'Recipe count by protein source' });

  let angle = -Math.PI / 2;
  slices.forEach((s, i) => {
    const frac = s.count / total;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    const color = s.isOther ? OTHER_COLOR : seriesColor(i);

    const slice = svgEl('path', {
      d: donutSlicePath(cx, cy, rOuter, rInner, start, end),
      fill: color,
      stroke: 'var(--card)',
      'stroke-width': 2,
    });
    const pct = Math.round(frac * 100);
    wireMark(slice, {
      tooltip: `${s.label} — ${s.count} recipe${s.count === 1 ? '' : 's'} (${pct}%)`,
      onActivate: s.isOther ? null : () => navigateTo({ tag: s.label }),
    });
    svg.appendChild(slice);

    if (frac >= 0.08) {
      const mid = (start + end) / 2;
      const [lx, ly] = polarPoint(cx, cy, (rOuter + rInner) / 2, mid);
      const label = svgEl('text', {
        x: lx, y: ly + 4, 'text-anchor': 'middle', class: 'chart-data-label',
      });
      label.textContent = `${pct}%`;
      label.style.pointerEvents = 'none';
      svg.appendChild(label);
    }
  });

  const totalLabel = svgEl('text', {
    x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'chart-axis-label', style: 'font-size:13px;font-weight:700;fill:var(--ink);',
  });
  totalLabel.textContent = total;
  svg.appendChild(totalLabel);
  const totalSub = svgEl('text', {
    x: cx, y: cy + 14, 'text-anchor': 'middle', class: 'chart-axis-label',
  });
  totalSub.textContent = 'tagged';
  svg.appendChild(totalSub);

  wrap.innerHTML = '';
  wrap.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  slices.forEach((s, i) => {
    const color = s.isOther ? OTHER_COLOR : seriesColor(i);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'chart-legend-item';
    item.innerHTML = `<span class="chart-legend-swatch" style="background:${color}"></span>${escapeHtml(s.label)} (${s.count})`;
    if (!s.isOther) item.addEventListener('click', () => navigateTo({ tag: s.label }));
    else item.disabled = true;
    legend.appendChild(item);
  });
  wrap.appendChild(legend);
}

// --- Init ------------------------------------------------------------

async function loadDashboard() {
  const empty = document.getElementById('empty-state');
  const charts = document.getElementById('charts');
  try {
    const recipes = await fetchJson(API_BASE);
    if (!recipes.length) {
      empty.hidden = false;
      charts.hidden = true;
      document.getElementById('stats-row').innerHTML = '';
      return;
    }
    empty.hidden = true;
    charts.hidden = false;
    renderStatsRow(recipes);
    renderTimeChart(recipes);
    renderCookingChart(recipes);
    renderMealTypeChart(recipes);
    renderTopTagsChart(recipes);
    renderProteinChart(recipes);
  } catch (err) {
    empty.hidden = false;
    empty.textContent = `Could not load recipes: ${err.message}`;
    charts.hidden = true;
  }
}

// Lets app.js's SSE listener refresh this page in place instead of a full
// reload -- see the comment there. Rebuilding all four charts in place is
// still some work, but far less jarring than a hard navigation every time
// a recipe is captured, deleted, or marked made anywhere else.
window.onRecipesChanged = loadDashboard;

loadDashboard();
