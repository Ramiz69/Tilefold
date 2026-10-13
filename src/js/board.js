// Доска на первом экране: 4×4, степени двойки. Свайпом или стрелками играет человек, без него
// доска неспешно играет сама. Цвета плиток – в CSS по уровню (.l1 – двойка, .l2 – четвёрка, …),
// так палитра страницы перекрашивает и доску.

const N = 4;
// Сколько ждать человека после его хода, прежде чем снова играть самой.
const IDLE_AFTER_USER = 8000;
const AUTO_STEP = 1100;
const SLIDE = 120;

export function initBoard() {
  const board = document.querySelector('[data-board]');
  if (!board) return;
  const scoreEl = document.querySelector('[data-score]');
  const hintEl = document.querySelector('[data-board-hint]');
  const reduced = () => document.documentElement.classList.contains('rm');

  let tiles = [], nextId = 1, score = 0, instant = false, autoTimer = 0, idleTimer = 0, userPlayed = false;
  const els = new Map();

  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    place(cell, r, c);
    board.append(cell);
  }

  function place(el, r, c) {
    el.style.setProperty('--r', r);
    el.style.setProperty('--c', c);
  }

  function spawn() {
    const free = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!tiles.some(t => t.r === r && t.c === c)) free.push([r, c]);
    if (!free.length) return;
    const [r, c] = free[Math.floor(Math.random() * free.length)];
    tiles.push({ id: nextId++, v: Math.random() < 0.9 ? 2 : 4, r, c, isNew: true });
  }

  // Ход: 0 вверх, 1 вправо, 2 вниз, 3 влево. Возвращает, сдвинулось ли что-нибудь.
  function move(dir, dry = false) {
    const grid = Array.from({ length: N }, () => Array(N).fill(null));
    const src = dry ? tiles.map(t => ({ ...t })) : tiles;
    src.forEach(t => { grid[t.r][t.c] = t; t.isNew = false; t.merged = false; });
    const vertical = dir === 0 || dir === 2, forward = dir === 1 || dir === 2;
    let moved = false, gained = 0;
    const removed = new Set();
    for (let line = 0; line < N; line++) {
      const cells = [];
      for (let k = 0; k < N; k++) {
        const i = forward ? N - 1 - k : k;
        const t = vertical ? grid[i][line] : grid[line][i];
        if (t) cells.push(t);
      }
      let pos = 0, last = null;
      for (const t of cells) {
        if (last && last.v === t.v && !last.merged) {
          last.v *= 2; last.merged = true; gained += last.v; removed.add(t);
          t.r = last.r; t.c = last.c; moved = true;
          continue;
        }
        const i = forward ? N - 1 - pos : pos;
        pos++;
        const r = vertical ? i : line, c = vertical ? line : i;
        if (t.r !== r || t.c !== c) moved = true;
        t.r = r; t.c = c; last = t;
      }
    }
    if (dry || !moved) return moved;
    score += gained;
    const finish = () => {
      tiles = tiles.filter(t => !removed.has(t));
      spawn();
      render();
      if (!canMove()) setTimeout(reset, 1800);
    };
    if (instant) { finish(); return true; }
    render(removed);
    setTimeout(finish, reduced() ? 0 : SLIDE);
    return true;
  }
  const canMove = () => [0, 1, 2, 3].some(d => move(d, true));

  function render(removed = new Set()) {
    for (const t of tiles) {
      let el = els.get(t.id);
      if (!el) {
        // Новая плитка встаёт сразу на место, без переезда из угла.
        el = document.createElement('div');
        el.className = 'tile still';
        place(el, t.r, t.c);
        board.append(el);
        els.set(t.id, el);
        void el.offsetWidth;
        el.classList.remove('still');
      }
      const level = Math.min(Math.log2(t.v), 15);
      el.textContent = t.v;
      el.className = `tile l${level}${t.v >= 1024 ? ' huge' : t.v >= 128 ? ' big' : ''}${t.isNew ? ' new' : ''}${t.merged && !removed.has(t) ? ' merged' : ''}`;
      el.classList.toggle('under', removed.has(t));
      place(el, t.r, t.c);
    }
    for (const [id, el] of els) if (!tiles.some(t => t.id === id)) { el.remove(); els.delete(id); }
    if (scoreEl) scoreEl.value = score;
  }

  function reset() { tiles = []; score = 0; spawn(); spawn(); render(); }

  // Без человека доска играет сама: держит крупное в нижнем углу, как живой игрок.
  function autoStep() {
    const dir = [2, 3, 1, 0].find(d => move(d, true));
    if (dir !== undefined) move(dir);
  }
  function startAuto() {
    clearInterval(autoTimer);
    if (!reduced()) autoTimer = setInterval(autoStep, AUTO_STEP);
  }
  function userMove(dir) {
    clearInterval(autoTimer);
    clearTimeout(idleTimer);
    if (!userPlayed && hintEl) { userPlayed = true; hintEl.textContent = hintEl.dataset.you; }
    move(dir);
    idleTimer = setTimeout(startAuto, IDLE_AFTER_USER);
  }

  board.addEventListener('keydown', e => {
    const dir = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    userMove(dir);
  });
  let start = null;
  board.addEventListener('pointerdown', e => { start = [e.clientX, e.clientY]; board.setPointerCapture(e.pointerId); });
  board.addEventListener('pointercancel', () => { start = null; });
  board.addEventListener('pointerup', e => {
    if (!start) return;
    const dx = e.clientX - start[0], dy = e.clientY - start[1];
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    // В арабском интерфейс справа налево, но доска – нет: свайп влево двигает влево, как в игре.
    userMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  });

  // Анимация вне экрана тратит батарею зря: доска играет сама, только пока её видно.
  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible) clearInterval(autoTimer);
      else if (!userPlayed || !idleTimer) startAuto();
    }).observe(board);
  }

  reset();
  // Немного сыгранной партии, чтобы доска не начиналась с пустоты.
  instant = true;
  for (let k = 0; k < 14; k++) autoStep();
  instant = false;
  for (const t of tiles) { t.isNew = false; t.merged = false; }
  render();
  idleTimer = setTimeout(() => { if (visible) startAuto(); }, 2500);
}
