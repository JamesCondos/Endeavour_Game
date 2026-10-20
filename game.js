/* Static forecasting game with a shared scoreboard. */
(function () {
  'use strict';
  const ROUND_COUNT = 3;
  const CASE_IDS = ['forecast-01', 'forecast-02', 'forecast-03'];
  const NS = 'http://www.w3.org/2000/svg';
  const money = value => Number(value).toFixed(2);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const number = value => typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  const safeText = value => String(value == null ? '' : value);
  let root, ui = {}, data, available = [], chosen = [], rounds = [], roundIndex = 0;
  const horizon = 30;
  let phase = 'ready', current = null, target = null, chartState = null;
  let active = false, submission = null, playerName = '', boardLoaded = false, boardBusy = false, pendingBusy = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function append(parent, ...children) { children.forEach(child => parent.appendChild(child)); return parent; }
  function svg(tag, attrs, text) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
    if (text != null) node.textContent = text;
    return node;
  }
  function setHidden(node, value) { node.hidden = value; }
  function niceMax(value) {
    const raw = Math.max(value, 1), power = Math.pow(10, Math.floor(Math.log10(raw)));
    return Math.ceil(raw / power * 2) / 2 * power;
  }
  function validateData() {
    data = window.BOOTH_GAME_DATA || {};
    const ids = new Set();
    available = (Array.isArray(data.cases) ? data.cases : []).filter(item => {
      if (!item || ids.has(item.id) || !Array.isArray(item.history) || item.history.length < 2 || !Array.isArray(item.targets)) return false;
      if (!item.history.every(point => point && finite(number(point.value)) && number(point.value) >= 0)) return false;
      ids.add(item.id);
      return item.targets.some(point => [15, 30, 45, 60].includes(number(point.minutes)) && finite(number(point.actual)) && finite(number(point.prediction)));
    });
  }
  function candidates() {
    return CASE_IDS.map(id => available.find(item => item.id === id))
      .filter(item => item && item.targets.some(point => number(point.minutes) === horizon && finite(number(point.actual)) && finite(number(point.prediction))));
  }
  function announce(message) { ui.live.textContent = message; }
  function updateStart() {
    const total = candidates().length;
    ui.start.disabled = total < ROUND_COUNT;
    ui.poolNote.textContent = total >= ROUND_COUNT
      ? 'Everyone plays the same three rounds, predicting 30 minutes ahead. Lowest average error wins.'
      : 'This challenge could not load. Please refresh and try again.';
  }
  function start() {
    const pool = candidates();
    if (pool.length < ROUND_COUNT) return;
    chosen = pool; rounds = []; roundIndex = 0; submission = null;
    playerName = Array.from(ui.nickname.value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, 24).join('') || 'Anonymous visitor';
    root.classList.add('game-session');
    ui.save.hidden = true; ui.saveStatus.textContent = '';
    setHidden(ui.intro, true); setHidden(ui.finish, true); setHidden(ui.play, false);
    startRound();
  }
  function startRound() {
    current = chosen[roundIndex];
    target = current.targets.find(point => number(point.minutes) === horizon);
    phase = 'guessing';
    ui.round.textContent = `Round ${roundIndex + 1} of ${ROUND_COUNT}`;
    ui.question.textContent = `What will throughput be ${horizon} minutes later?`;
    ui.last.textContent = `${money(number(current.history[current.history.length - 1].value))} Mbps`;
    ui.guess.value = '';
    ui.guess.disabled = false; ui.slider.disabled = false; ui.lock.disabled = false;
    ui.slider.value = Math.max(0, number(current.history[current.history.length - 1].value));
    ui.guessError.textContent = '';
    setHidden(ui.form, false); setHidden(ui.progress, false);
    ui.progress.textContent = rounds.length ? `Your average error so far: ${money(mean(rounds.map(item => item.humanError)))} Mbps` : 'Read the recent history, then make your best guess.';
    setHidden(ui.reveal, true); setHidden(ui.next, true); setHidden(ui.lock, false);
    renderChart(false);
    ui.slider.max = chartState.max;
    ui.slider.value = Math.min(chartState.max, number(current.history[current.history.length - 1].value));
    ui.slider.setAttribute('aria-valuetext', `${money(Number(ui.slider.value))} Mbps`);
    announce(`Round ${roundIndex + 1}. Predict throughput ${horizon} minutes ahead. Last measurement ${ui.last.textContent}.`);
    if (active) { root.scrollIntoView({ block: 'start' }); ui.question.focus({ preventScroll: true }); }
  }
  function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
  function formatGuess() {
    if (phase !== 'guessing') return;
    const value = Number(ui.guess.value);
    const valid = ui.guess.value.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 1000000;
    if (valid) {
      ui.slider.value = Math.min(value, Number(ui.slider.max));
      ui.slider.setAttribute('aria-valuetext', `${money(value)} Mbps`);
    }
    renderGuess(valid ? value : null);
    ui.guessError.textContent = '';
  }
  function lockGuess(event) {
    if (event) event.preventDefault();
    if (phase !== 'guessing') return;
    const guess = Number(ui.guess.value);
    if (!ui.guess.value.trim() || !Number.isFinite(guess) || guess < 0 || guess > 1000000) {
      ui.guessError.textContent = 'Enter a number from 0 to 1,000,000 Mbps.';
      ui.guess.focus(); return;
    }
    const actual = number(target.actual), prediction = number(target.prediction);
    const record = { caseId: current.id, guess, actual, prediction, humanError: Math.abs(guess - actual), aiError: Math.abs(prediction - actual) };
    rounds.push(record); phase = 'revealed';
    if (rounds.length === ROUND_COUNT) saveScore();
    ui.guess.disabled = true; ui.slider.disabled = true; ui.lock.disabled = true;
    setHidden(ui.form, true); setHidden(ui.progress, true);
    setHidden(ui.lock, true); setHidden(ui.reveal, false); setHidden(ui.next, false);
    ui.next.textContent = roundIndex === ROUND_COUNT - 1 ? 'See your final score →' : 'Next round →';
    const difference = record.humanError - record.aiError;
    ui.revealTitle.textContent = Math.abs(difference) < 0.005 ? 'A photo finish — it’s a tie!' : difference < 0 ? 'You were closer this round!' : 'The AI was closer this round.';
    ui.actual.textContent = `${money(actual)} Mbps`;
    ui.humanValue.textContent = `${money(guess)} Mbps`; ui.humanError.textContent = `${money(record.humanError)} Mbps error`;
    ui.aiValue.textContent = `${money(prediction)} Mbps`; ui.aiError.textContent = `${money(record.aiError)} Mbps error`;
    ui.explanation.textContent = 'Error is the distance between a prediction and the actual value.';
    renderChart(true);
    announce(`${ui.revealTitle.textContent} Recorded outcome ${money(actual)} Mbps. Your error ${money(record.humanError)} Mbps. AI error ${money(record.aiError)} Mbps.`);
    ui.revealTitle.focus();
  }
  function nextRound() {
    if (phase !== 'revealed') return;
    if (roundIndex < ROUND_COUNT - 1) { roundIndex++; startRound(); }
    else finish();
  }
  function finish() {
    phase = 'finished'; setHidden(ui.play, true); setHidden(ui.finish, false);
    const human = mean(rounds.map(row => row.humanError)), ai = mean(rounds.map(row => row.aiError));
    ui.finishTitle.textContent = Math.abs(human - ai) < 0.005 ? 'A draw. Nicely predicted!' : human < ai ? 'You beat the AI this time!' : 'The AI takes this challenge.';
    ui.finalHuman.textContent = `${money(human)} Mbps`;
    ui.finalAi.textContent = `${money(ai)} Mbps`;
    ui.finishDetail.textContent = `Mean absolute error across your three ${horizon}-minute forecasts. This short game is a demonstration; it is not an overall model evaluation.`;
    ui.roundTable.replaceChildren();
    rounds.forEach((row, index) => {
      const tr = element('tr');
      [String(index + 1), money(row.humanError), money(row.aiError)].forEach(value => tr.appendChild(element('td', '', value)));
      ui.roundTable.appendChild(tr);
    });
    refreshLeaderboard();
    announce(`${ui.finishTitle.textContent} Your mean absolute error ${money(human)} Mbps. AI mean absolute error ${money(ai)} Mbps.`);
    ui.finishTitle.focus();
  }
  function reset() {
    phase = 'ready'; rounds = []; chosen = []; current = target = null;
    root.classList.remove('game-session');
    setHidden(ui.intro, false); setHidden(ui.play, true); setHidden(ui.finish, true);
    ui.nickname.value = '';
    submission = null;
    ui.live.textContent = ''; updateStart();
    if (active) { root.scrollIntoView({ block: 'start' }); ui.start.focus({ preventScroll: true }); }
  }
  function pendingMessage(error, durable) {
    const disconnected = ['NOT_CONFIGURED', 'INVALID_CONFIG'].includes(error?.code);
    const rejected = error && !error.retryable && !disconnected;
    const reason = disconnected ? 'The shared scoreboard is not connected yet.'
      : rejected ? 'The scoreboard could not accept your score. Use Retry saving score to try again.'
      : 'Your score has not reached the scoreboard yet.';
    return `${reason} ${durable
      ? disconnected ? 'Your score is saved on this device, ready to upload once connected.'
        : rejected ? 'Your score remains saved on this device.'
        : 'It is saved on this device and will retry automatically while the game is open.'
      : 'Keep this page open; this browser cannot save pending scores.'}`;
  }
  async function saveScore() {
    if (rounds.length !== ROUND_COUNT) return;
    const client = window.BoothScoreboard;
    try {
      if (!submission) submission = client.createSubmission(playerName, rounds.map(row => row.guess));
    } catch (_) {
      ui.saveStatus.textContent = 'Your score could not be prepared for saving. Keep this page open and try again.';
      ui.save.hidden = false;
      return;
    }
    const pending = submission;
    ui.save.hidden = true;
    ui.saveStatus.textContent = 'Saving your score…';
    try {
      await client.submit(pending);
      if (submission === pending) {
        ui.saveStatus.textContent = 'Your score is saved on the shared scoreboard.';
        ui.save.hidden = true;
      }
      refreshLeaderboard();
    } catch (error) {
      if (submission !== pending) return;
      ui.saveStatus.textContent = pendingMessage(error, client.isDurable(pending));
      ui.save.hidden = false;
    }
  }
  function renderLeaderboard(result) {
    boardLoaded = true;
    const scores = result.scores;
    ui.leaderRows.replaceChildren();
    ui.leaderEmpty.hidden = scores.length > 0;
    ui.leaderTable.hidden = scores.length === 0;
    ui.leaderEmpty.textContent = 'No scores yet. Play three rounds to set the first score.';
    ui.leaderMeta.textContent = `${result.total.toLocaleString()} completed ${result.total === 1 ? 'game' : 'games'} · AI average error: ${money(result.aiMae)} Mbps`;
    scores.forEach((row, index) => {
      const tr = element('tr');
      [String(row.rank || index + 1), safeText(row.name), money(row.mae)].forEach(value => tr.appendChild(element('td', '', value)));
      ui.leaderRows.appendChild(tr);
    });
  }
  function updatePending() {
    const count = window.BoothScoreboard.pendingCount();
    ui.pendingNote.textContent = count ? `${count} ${count === 1 ? 'score is' : 'scores are'} waiting to upload from this browser.` : '';
    ui.pendingNote.hidden = count === 0;
    ui.retryPending.hidden = count === 0;
    ui.retryPending.disabled = pendingBusy || !window.BoothScoreboard.configured();
  }
  async function refreshLeaderboard() {
    if (boardBusy || !ui.leaderRows) return;
    if (!window.BoothScoreboard.configured()) {
      ui.leaderStatus.textContent = 'The shared scoreboard is not connected yet. You can still play.';
      return;
    }
    boardBusy = true; ui.refresh.disabled = true;
    ui.leaderStatus.textContent = 'Updating scores…';
    try {
      renderLeaderboard(await window.BoothScoreboard.refresh());
      ui.leaderStatus.textContent = 'Up to date · refreshes every 30 seconds.';
    } catch (_) {
      ui.leaderStatus.textContent = boardLoaded
        ? 'Unable to refresh. Showing the last received scores.'
        : 'Unable to reach the scoreboard. Check your connection and try Refresh.';
    } finally { boardBusy = false; ui.refresh.disabled = false; }
  }
  function renderChart(revealed) {
    const points = current.history.map(point => number(point.value));
    const record = revealed ? rounds[rounds.length - 1] : null;
    const historyMax = niceMax(Math.max(...points) * 1.2);
    // Future values are deliberately excluded before the visitor locks in a guess.
    const max = revealed ? niceMax(Math.max(historyMax, record.actual * 1.1, record.prediction * 1.1, record.guess * 1.1)) : historyMax;
    // Size the drawing to its container so text stays readable on a phone.
    const W = Math.max(240, Math.min(980, ui.chart.clientWidth || 980));
    const compact = W < 600;
    const H = compact ? 300 : 340, L = compact ? 52 : 80, R = compact ? 20 : 32, T = 35, B = 62;
    const width = W - L - R, height = H - T - B;
    const historyMinutes = -number(current.history[0].minutes);
    const originX = L + width * (historyMinutes / (historyMinutes + horizon));
    const endX = W - R;
    const yy = value => H - B - value / max * height;
    const xx = index => L + index / (points.length - 1) * (originX - L);
    const drawing = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: '0', 'aria-label': `Recorded throughput history for round ${roundIndex + 1}. ${revealed ? 'Revealed forecast comparison.' : 'Future observations and the AI prediction are hidden. Use the labelled number field to enter your prediction.'}` });
    append(drawing, svg('title', {}, revealed ? 'Forecast challenge: revealed outcome' : 'Forecast challenge: history only'));
    append(drawing, svg('rect', { x: originX, y: T, width: endX - originX, height, fill: '#edf5fa' }));
    for (let index = 0; index <= 4; index++) {
      const value = max * index / 4, y = yy(value);
      append(drawing, svg('line', { x1: L, x2: endX, y1: y, y2: y, stroke: '#dde6ed', 'stroke-width': 1 }));
      const tickText = value.toLocaleString('en-AU', { maximumFractionDigits: 2, notation: compact && max >= 1000 ? 'compact' : 'standard' });
      append(drawing, svg('text', { x: L - 12, y: y + 5, 'text-anchor': 'end', class: 'game-svg-axis' }, tickText));
    }
    append(drawing, svg('text', { x: L, y: 19, class: 'game-svg-unit' }, 'Throughput (Mbps)'));
    append(drawing, svg('line', { x1: originX, x2: originX, y1: T, y2: H - B, stroke: '#a7bccd', 'stroke-dasharray': '5 5', 'stroke-width': 1.5 }));
    const tickIndices = compact ? [0, points.length - 1] : [0, Math.round((points.length - 1) / 2), points.length - 1];
    tickIndices.forEach((index, tick) => {
      append(drawing, svg('text', { x: xx(index), y: H - B + 28, 'text-anchor': tick === tickIndices.length - 1 ? 'end' : tick === 0 ? 'start' : 'middle', class: 'game-svg-axis' }, `${number(current.history[index].minutes)} min`));
    });
    append(drawing, svg('text', { x: endX, y: H - 7, 'text-anchor': 'end', class: 'game-svg-axis game-svg-future' }, `+${horizon} min`));
    append(drawing, svg('text', { x: compact ? L : (L + originX) / 2, y: H - 7, 'text-anchor': compact ? 'start' : 'middle', class: 'game-svg-axis' }, compact ? 'Past 6 hours' : 'Recorded history · preceding 6 hours'));
    append(drawing, svg('text', { x: endX, y: compact ? 19 : T + 20, 'text-anchor': 'end', class: 'game-svg-label' }, revealed ? 'REVEAL' : 'YOUR GUESS'));
    const path = points.map((value, index) => `${index ? 'L' : 'M'}${xx(index).toFixed(2)},${yy(value).toFixed(2)}`).join(' ');
    append(drawing, svg('path', { d: path, fill: 'none', stroke: '#183454', 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    append(drawing, svg('circle', { cx: originX, cy: yy(points[points.length - 1]), r: 5, fill: '#183454', stroke: '#fff', 'stroke-width': 2 }));
    chartState = { drawing, max, yy, xx, endX, originX, T, B, H, W, guessGroup: svg('g', {}) };
    if (revealed) {
      append(drawing, svg('line', { x1: originX, x2: endX, y1: yy(points[points.length - 1]), y2: yy(record.actual), stroke: '#087e83', 'stroke-width': 2.5, 'stroke-dasharray': '5 4' }));
      // Distinct shapes keep the comparisons legible without relying on colour alone.
      append(drawing, svg('circle', { cx: endX, cy: yy(record.actual), r: 8, fill: '#087e83', stroke: '#fff', 'stroke-width': 2 }));
      append(drawing, svg('path', { d: `M${endX},${yy(record.prediction) - 9} L${endX + 9},${yy(record.prediction)} L${endX},${yy(record.prediction) + 9} L${endX - 9},${yy(record.prediction)} Z`, fill: '#003f8b', stroke: '#fff', 'stroke-width': 1.5 }));
      append(drawing, svg('path', { d: `M${endX - 7},${yy(record.guess) - 7} l14,14 m-14,0 l14,-14`, stroke: '#c66a3b', 'stroke-width': 4, fill: 'none' }));
    }
    append(drawing, chartState.guessGroup);
    drawing.addEventListener('click', event => {
      if (phase !== 'guessing') return;
      const bounds = drawing.getBoundingClientRect();
      const point = drawing.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      const matrix = drawing.getScreenCTM();
      if (!matrix || !bounds.height) return;
      const local = point.matrixTransform(matrix.inverse());
      if (local.y < T || local.y > H - B) return;
      const value = Math.max(0, Math.min(max, (H - B - local.y) / height * max));
      ui.guess.value = value.toFixed(2); formatGuess();
    });
    ui.chart.replaceChildren(drawing);
    ui.chartLegend.textContent = revealed ? '● Recorded history / outcome    ◆ AI forecast    × Your guess' : 'Tap the chart, move the slider, or type your guess.';
    ui.axisNote.textContent = revealed && max > historyMax ? 'The vertical axis expanded after the reveal to fit the results.' : '';
  }
  function renderGuess(value) {
    if (!chartState || phase !== 'guessing') return;
    const { guessGroup, yy, endX, originX, max, T } = chartState;
    guessGroup.replaceChildren();
    if (value == null) return;
    const y = yy(Math.min(max, value));
    append(guessGroup, svg('line', { x1: originX, x2: endX, y1: y, y2: y, stroke: '#c66a3b', 'stroke-width': 2, 'stroke-dasharray': '5 4' }));
    append(guessGroup, svg('path', { d: `M${endX - 7},${y - 7} l14,14 m-14,0 l14,-14`, stroke: '#c66a3b', 'stroke-width': 4, fill: 'none' }));
    append(guessGroup, svg('text', { x: endX - 12, y: y < T + 35 ? y + 25 : y - 13, 'text-anchor': 'end', class: 'game-svg-guess' }, `${money(value)}${value > max ? ' ↑' : ''} Mbps`));
  }
  function card(label, valueClass, errorClass) {
    const box = element('div', 'game-score-card');
    const value = element('strong', valueClass, '—');
    const error = errorClass ? element('span', errorClass, '') : null;
    append(box, element('span', 'game-score-label', label), value);
    if (error) append(box, error);
    return { box, value, error };
  }
  function mount(container) {
    if (root === container && root.children.length) return;
    root = container; validateData();
    root.classList.add('game-root'); root.replaceChildren();
    ui = {};
    ui.live = element('div', 'game-sr'); ui.live.setAttribute('aria-live', 'polite'); ui.live.setAttribute('aria-atomic', 'true');
    const header = element('div', 'game-header');
    const title = element('h1', 'game-title', 'Can you beat the AI?'); title.id = 'game-title';
    append(header, title, element('p', 'game-intro-text', 'Predict what comes next in a mobile network. Three rounds. You versus the AI.'));
    ui.intro = element('section', 'game-intro-panel');
    const how = element('div', 'game-how');
    [['01', 'Read the history', 'See six hours of recorded mobile-network throughput.'], ['02', 'Make your guess', 'Predict the throughput in Mbps at a future time.'], ['03', 'Meet your opponent', 'Compare your guess and the AI forecast with the actual value.']].forEach(([n, title, description]) => {
      const item = element('div', 'game-how-item'); append(item, element('span', 'game-step', n), element('h3', '', title), element('p', '', description)); append(how, item);
    });
    const entry = element('form', 'game-entry');
    entry.addEventListener('submit', event => { event.preventDefault(); start(); });
    const nameLabel = element('label', 'game-input-label', 'Your nickname (optional)'); nameLabel.htmlFor = 'game-nickname';
    ui.nickname = element('input', 'game-nickname'); ui.nickname.id = 'game-nickname'; ui.nickname.maxLength = 24; ui.nickname.autocomplete = 'off'; ui.nickname.placeholder = 'Anonymous visitor';
    ui.nickname.setAttribute('aria-describedby', 'game-name-note');
    const nameNote = element('p', 'game-small', 'Your nickname and score will appear on the shared scoreboard. Leave blank to stay anonymous.'); nameNote.id = 'game-name-note';
    ui.start = element('button', 'game-button game-button-primary game-start', 'Start the 3-round challenge →'); ui.start.type = 'submit';
    append(entry, nameLabel, ui.nickname, nameNote, ui.start);
    ui.poolNote = element('p', 'game-small', '');
    append(ui.intro, how, ui.poolNote, entry, element('p', 'game-data-note', 'This is a fun challenge - only score data is retained.'));

    ui.play = element('section', 'game-play'); ui.play.hidden = true;
    const context = element('div', 'game-context');
    ui.round = element('span', 'game-round', '');
    const resetButton = element('button', 'game-button game-button-quiet', 'Start over'); resetButton.type = 'button'; resetButton.addEventListener('click', reset);
    append(context, ui.round, resetButton);
    ui.question = element('h2', 'game-question', ''); ui.question.tabIndex = -1;
    const last = element('p', 'game-last', 'Latest recorded value: '); ui.last = element('strong', '', ''); append(last, ui.last);
    ui.chart = element('div', 'game-chart'); ui.chartLegend = element('p', 'game-chart-legend', ''); ui.axisNote = element('p', 'game-axis-note', '');
    const form = element('form', 'game-guess-form'); form.noValidate = true; form.addEventListener('submit', lockGuess);
    ui.form = form;
    const guessArea = element('div', 'game-guess-area');
    const label = element('label', 'game-input-label', 'Your prediction'); label.htmlFor = 'game-guess-value';
    const inputWrap = element('div', 'game-input-wrap');
    ui.guess = element('input', 'game-number'); ui.guess.id = 'game-guess-value'; ui.guess.type = 'number'; ui.guess.min = '0'; ui.guess.max = '1000000'; ui.guess.step = '0.01'; ui.guess.inputMode = 'decimal'; ui.guess.autocomplete = 'off'; ui.guess.placeholder = 'Type a value'; ui.guess.setAttribute('aria-describedby', 'game-guess-error'); ui.guess.addEventListener('input', formatGuess);
    append(inputWrap, ui.guess, element('span', 'game-input-unit', 'Mbps'));
    ui.slider = element('input', 'game-slider'); ui.slider.type = 'range'; ui.slider.min = '0'; ui.slider.step = '0.01'; ui.slider.setAttribute('aria-label', 'Set your throughput prediction in Mbps'); ui.slider.addEventListener('input', () => { ui.guess.value = Number(ui.slider.value).toFixed(2); formatGuess(); });
    append(guessArea, label, inputWrap, ui.slider);
    ui.lock = element('button', 'game-button game-button-primary', 'Lock in my guess →'); ui.lock.type = 'submit';
    ui.guessError = element('p', 'game-error', ''); ui.guessError.id = 'game-guess-error'; ui.guessError.setAttribute('role', 'alert');
    append(form, guessArea, ui.lock, ui.guessError);
    ui.progress = element('p', 'game-small', '');
    ui.reveal = element('div', 'game-reveal'); ui.reveal.hidden = true;
    ui.revealTitle = element('h3', '', ''); ui.revealTitle.tabIndex = -1;
    const scores = element('div', 'game-scores');
    const human = card('Your guess', 'game-score-value game-human', 'game-score-error'); ui.humanValue = human.value; ui.humanError = human.error;
    const ai = card('AI forecast', 'game-score-value game-ai', 'game-score-error'); ui.aiValue = ai.value; ui.aiError = ai.error;
    const actual = card('Actual value', 'game-score-value game-actual'); ui.actual = actual.value;
    append(scores, human.box, ai.box, actual.box); ui.explanation = element('p', 'game-small', ''); append(ui.reveal, ui.revealTitle, scores, ui.explanation);
    ui.next = element('button', 'game-button game-button-primary game-next', 'Next round →'); ui.next.type = 'button'; ui.next.hidden = true; ui.next.addEventListener('click', nextRound);
    append(ui.play, context, ui.question, last, ui.chart, ui.chartLegend, ui.axisNote, form, ui.progress, ui.reveal, ui.next);

    ui.finish = element('section', 'game-finish'); ui.finish.hidden = true;
    ui.finishTitle = element('h2', 'game-finish-title', ''); ui.finishTitle.tabIndex = -1;
    const finalScores = element('div', 'game-scores game-final-scores');
    const finalHuman = card('Your average error', 'game-score-value game-human'); ui.finalHuman = finalHuman.value;
    const finalAi = card('AI average error', 'game-score-value game-ai'); ui.finalAi = finalAi.value;
    append(finalScores, finalHuman.box, finalAi.box);
    ui.finishDetail = element('p', 'game-small', '');
    const detail = element('details', 'game-details'); append(detail, element('summary', '', 'See each round’s absolute error'));
    const tableWrap = element('div', 'game-table-wrap'), table = element('table', 'game-table');
    const head = element('thead'), headerRow = element('tr'); ['Round', 'You (Mbps)', 'AI (Mbps)'].forEach(text => append(headerRow, element('th', '', text))); append(head, headerRow); ui.roundTable = element('tbody'); append(table, head, ui.roundTable); append(tableWrap, table); append(detail, tableWrap);
    const saveArea = element('div', 'game-save-area');
    ui.save = element('button', 'game-button game-button-secondary', 'Retry saving score'); ui.save.type = 'button'; ui.save.hidden = true; ui.save.addEventListener('click', saveScore);
    ui.saveStatus = element('p', 'game-small', ''); ui.saveStatus.setAttribute('role', 'status'); append(saveArea, ui.saveStatus, ui.save);
    const replay = element('button', 'game-button game-button-primary', 'Play again →'); replay.type = 'button'; replay.addEventListener('click', reset);
    append(ui.finish, ui.finishTitle, finalScores, ui.finishDetail, detail, saveArea, replay);

    const leaderboard = element('section', 'game-leaderboard'); leaderboard.setAttribute('aria-labelledby', 'game-board-title');
    const leaderHeader = element('div', 'game-leader-header');
    ui.leaderLabel = element('h2', '', 'Scoreboard'); ui.leaderLabel.id = 'game-board-title';
    ui.refresh = element('button', 'game-button game-button-quiet', 'Refresh'); ui.refresh.type = 'button'; ui.refresh.addEventListener('click', refreshLeaderboard);
    append(leaderHeader, ui.leaderLabel, ui.refresh); append(leaderboard, leaderHeader);
    append(leaderboard, element('p', 'game-small', 'Lowest average error wins. Completed games are submitted automatically.'));
    ui.leaderMeta = element('p', 'game-small game-board-meta', '');
    ui.leaderStatus = element('p', 'game-small game-board-status', ''); ui.leaderStatus.setAttribute('role', 'status');
    ui.leaderEmpty = element('p', 'game-small', 'Scores will appear here once the scoreboard is connected.');
    ui.leaderTable = element('table', 'game-table'); const leaderHead = element('thead'), leaderHeadRow = element('tr'); ['Rank', 'Visitor', 'Average error (Mbps)'].forEach(text => append(leaderHeadRow, element('th', '', text))); append(leaderHead, leaderHeadRow); ui.leaderRows = element('tbody'); append(ui.leaderTable, leaderHead, ui.leaderRows);
    ui.leaderTable.hidden = true;
    const leaderTableWrap = element('div', 'game-table-wrap'); append(leaderTableWrap, ui.leaderTable);
    ui.pendingNote = element('p', 'game-small game-pending-note', '');
    ui.retryPending = element('button', 'game-button game-button-secondary game-retry-pending', 'Retry pending scores'); ui.retryPending.type = 'button';
    ui.retryPending.addEventListener('click', async () => {
      pendingBusy = true; updatePending();
      try { await window.BoothScoreboard.retryPending(); }
      finally { pendingBusy = false; updatePending(); refreshLeaderboard(); }
    });
    append(leaderboard, ui.leaderMeta, ui.leaderEmpty, leaderTableWrap, ui.leaderStatus, ui.pendingNote, ui.retryPending);
    append(root, ui.live, header, ui.intro, ui.play, ui.finish, leaderboard);
    updateStart();
    window.BoothScoreboard.subscribe(event => {
      updatePending();
      if (event.type === 'saved') {
        if (submission?.submissionId === event.submissionId) {
          ui.saveStatus.textContent = 'Your score is saved on the shared scoreboard.';
          ui.save.hidden = true;
        }
        refreshLeaderboard();
      } else if (['pending', 'error'].includes(event.type) && submission?.submissionId === event.submissionId) {
        ui.saveStatus.textContent = pendingMessage(event.error, event.durable);
        if (event.type === 'error') ui.save.hidden = false;
      }
    });
    updatePending();
    refreshLeaderboard();
    setInterval(() => {
      if (!document.hidden && window.BoothScoreboard.configured()) {
        refreshLeaderboard();
        window.BoothScoreboard.flush().catch(() => {});
      }
    }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLeaderboard(); });
    window.addEventListener('online', refreshLeaderboard);
  }
  let resizeFrame;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (!active || !current || !['guessing', 'revealed'].includes(phase)) return;
      renderChart(phase === 'revealed');
      if (phase === 'guessing') formatGuess();
    });
  });
  window.BoothGame = {
    mount,
    activate() { active = true; },
    deactivate() { active = false; },
    reset,
    // Read-only state makes automated offline checks possible without exposing future values in the UI.
    status() { return { phase, horizon, round: roundIndex + 1, completedRounds: rounds.length, availableCases: candidates().length }; }
  };
})();
