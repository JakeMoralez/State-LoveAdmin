"""HTML viewer for uploaded screenshot galleries."""

from __future__ import annotations

import json
from html import escape


def render_gallery_html(gallery_id: str, filenames: list[str]) -> str:
    images = [f"/uploads/galleries/{gallery_id}/{name}" for name in filenames]
    images_json = json.dumps(images, ensure_ascii=False)
    count = len(filenames)
    gid = escape(gallery_id)

    thumb_items = []
    for i, src in enumerate(images):
        esc = escape(src)
        thumb_items.append(
            f'<button type="button" class="filmstrip-item" data-index="{i}" aria-label="Фото {i + 1}">'
            f'<img src="{esc}" alt="" loading="lazy" /></button>'
        )

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="dark" />
  <title>Альбом · {count} фото</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}
    html, body {{
      margin: 0;
      height: 100%;
      overflow: hidden;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 13px;
      background: #060608;
      color: rgba(255, 255, 255, 0.92);
    }}
    button {{
      font: inherit;
      color: inherit;
      cursor: pointer;
      border: none;
      background: none;
    }}
    .app {{
      display: grid;
      grid-template-rows: auto auto auto 1fr;
      height: 100dvh;
    }}
    .topbar {{
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      background: rgba(8, 8, 12, 0.96);
      backdrop-filter: blur(12px);
      z-index: 5;
    }}
    .brand {{
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex-shrink: 1;
    }}
    .brand-mark {{
      width: 26px;
      height: 26px;
      border-radius: 7px;
      background: linear-gradient(145deg, #d4af37, #8a7120);
      flex-shrink: 0;
    }}
    .brand-text {{
      min-width: 0;
      line-height: 1.25;
    }}
    .brand-title {{
      display: block;
      font-size: 0.8125rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.92);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}
    .brand-sub {{
      display: block;
      font-size: 0.6875rem;
      color: rgba(255, 255, 255, 0.38);
    }}
    .topbar-spacer {{ flex: 1; }}
    .pill, .tool-btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 2rem;
      padding: 0 10px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.02);
      color: rgba(255, 255, 255, 0.82);
      font-size: 0.8125rem;
      font-weight: 500;
      white-space: nowrap;
      transition: background 0.12s, border-color 0.12s, color 0.12s;
      text-decoration: none;
    }}
    .tool-btn {{
      width: 2rem;
      padding: 0;
      flex-shrink: 0;
    }}
    .pill:hover, .tool-btn:hover {{
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.14);
      color: #fff;
    }}
    .pill.active {{
      border-color: rgba(201, 162, 39, 0.35);
      background: rgba(201, 162, 39, 0.1);
      color: #d4af37;
    }}
    .progress-wrap {{
      height: 3px;
      background: rgba(255, 255, 255, 0.06);
    }}
    .progress-bar {{
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #c9a227, #d4af37);
      transition: width 0.25s ease;
    }}
    .meta-bar {{
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(6, 6, 8, 0.85);
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.42);
      align-self: start;
    }}
    .meta-bar strong {{
      color: rgba(255, 255, 255, 0.72);
      font-weight: 500;
    }}
    .meta-spacer {{ flex: 1; }}
    .body {{
      grid-row: 4;
      display: grid;
      grid-template-columns: 1fr auto;
      min-height: 0;
    }}
    .body.filmstrip-hidden {{ grid-template-columns: 1fr; }}
    .stage-wrap {{
      position: relative;
      min-width: 0;
      min-height: 0;
      background: #060608;
    }}
    .stage {{
      position: absolute;
      inset: 0;
      overflow: hidden;
      cursor: grab;
      touch-action: none;
    }}
    .stage.dragging {{ cursor: grabbing; }}
    .stage img {{
      position: absolute;
      top: 50%;
      left: 50%;
      max-width: none;
      max-height: none;
      transform-origin: center center;
      user-select: none;
      -webkit-user-drag: none;
      will-change: transform, opacity;
      transition: opacity 0.18s ease;
    }}
    .stage img.loading {{ opacity: 0.35; }}
    .nav-btn {{
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 3;
      width: 40px;
      height: 56px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.5);
      color: rgba(255, 255, 255, 0.85);
      font-size: 1.5rem;
      line-height: 1;
      opacity: 0;
      transition: opacity 0.15s, background 0.15s;
    }}
    .stage-wrap:hover .nav-btn {{ opacity: 1; }}
    .nav-btn:hover {{
      background: rgba(255, 255, 255, 0.1);
    }}
    .nav-btn:disabled {{
      opacity: 0.2 !important;
      cursor: default;
    }}
    .nav-btn.prev {{ left: 10px; }}
    .nav-btn.next {{ right: 10px; }}
    .filmstrip {{
      width: 120px;
      border-left: 1px solid rgba(255, 255, 255, 0.07);
      background: rgba(8, 8, 12, 0.98);
      overflow-y: auto;
      padding: 8px 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }}
    .filmstrip-item {{
      display: block;
      width: 100%;
      aspect-ratio: 16 / 10;
      border-radius: 6px;
      overflow: hidden;
      border: 2px solid transparent;
      padding: 0;
      background: #101016;
      transition: border-color 0.12s;
    }}
    .filmstrip-item img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }}
    .filmstrip-item.active {{
      border-color: #c9a227;
    }}
    .grid-panel {{
      display: none;
      grid-row: 4;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
      padding: 14px;
      overflow: auto;
      min-height: 0;
      align-content: start;
    }}
    .app.grid-mode .body {{ display: none; }}
    .app.grid-mode .grid-panel {{ display: grid; }}
    .grid-tile {{
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #101016;
      cursor: pointer;
      transition: border-color 0.12s;
    }}
    .grid-tile:hover {{ border-color: rgba(201, 162, 39, 0.35); }}
    .grid-tile img {{
      display: block;
      width: 100%;
      height: auto;
    }}
    .grid-tile-num {{
      position: absolute;
      top: 6px;
      left: 6px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.55);
      font-size: 0.6875rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.85);
    }}
    .help {{
      position: fixed;
      inset: 0;
      z-index: 50;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
    }}
    .help.open {{ display: flex; }}
    .help-card {{
      width: min(360px, 100%);
      padding: 18px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: #0c0c10;
    }}
    .help-card h2 {{
      margin: 0 0 12px;
      font-size: 0.9375rem;
      font-weight: 600;
    }}
    .help-list {{
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 8px;
      font-size: 0.8125rem;
      color: rgba(255, 255, 255, 0.62);
    }}
    .help-list kbd {{
      display: inline-block;
      min-width: 1.5rem;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
      font-size: 0.75rem;
      font-family: inherit;
      color: rgba(255, 255, 255, 0.85);
      text-align: center;
    }}
    .toast {{
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(12px);
      z-index: 60;
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(12, 12, 16, 0.96);
      font-size: 0.8125rem;
      color: rgba(255, 255, 255, 0.88);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
    }}
    .toast.show {{
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }}
    @media (max-width: 720px) {{
      .brand-sub {{ display: none; }}
      .pill span {{ display: none; }}
      .body {{ grid-template-columns: 1fr; }}
      .filmstrip {{
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        width: auto;
        height: 84px;
        flex-direction: row;
        border-left: none;
        border-top: 1px solid rgba(255, 255, 255, 0.07);
        overflow-x: auto;
        overflow-y: hidden;
      }}
      .filmstrip-item {{
        width: 96px;
        flex-shrink: 0;
      }}
      .body.filmstrip-hidden .filmstrip {{ display: none; }}
      .nav-btn {{ opacity: 1; width: 34px; height: 48px; }}
    }}
  </style>
</head>
<body>
  <div class="app" id="app">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"></div>
        <div class="brand-text">
          <span class="brand-title">State Love</span>
          <span class="brand-sub">Альбом · {count} фото</span>
        </div>
      </div>
      <span class="pill" id="counter">1 / {count}</span>
      <div class="topbar-spacer"></div>
      <span class="pill" id="zoomLabel">100%</span>
      <button type="button" class="tool-btn" id="zoomOutBtn" title="Уменьшить (−)">−</button>
      <button type="button" class="tool-btn" id="zoomInBtn" title="Увеличить (+)">+</button>
      <button type="button" class="tool-btn" id="fitBtn" title="Вписать (0)">⤢</button>
      <button type="button" class="tool-btn" id="playBtn" title="Слайдшоу">▶</button>
      <button type="button" class="tool-btn" id="gridBtn" title="Сетка (G)">▦</button>
      <button type="button" class="tool-btn" id="stripBtn" title="Лента (T)">☰</button>
      <button type="button" class="tool-btn" id="copyBtn" title="Копировать ссылку">⎘</button>
      <a class="pill" id="openBtn" href="#" target="_blank" rel="noreferrer" title="Открыть фото">↗</a>
      <a class="pill" id="downloadBtn" href="#" download title="Скачать">↓</a>
      <button type="button" class="tool-btn" id="fsBtn" title="Полный экран (F)">⛶</button>
      <button type="button" class="tool-btn" id="helpBtn" title="Горячие клавиши (?)">?</button>
      <button type="button" class="tool-btn" id="closeBtn" title="Закрыть (Esc)">✕</button>
    </header>
    <div class="progress-wrap" aria-hidden="true"><div class="progress-bar" id="progressBar"></div></div>
    <div class="meta-bar">
      <span id="fileName">—</span>
      <span id="dimensions">—</span>
      <span class="meta-spacer"></span>
      <span id="galleryId">#{gid[:8]}…</span>
    </div>
    <div class="body" id="body">
      <div class="stage-wrap">
        <button type="button" class="nav-btn prev" id="prevBtn" aria-label="Назад">‹</button>
        <div class="stage" id="stage">
          <img id="mainImg" alt="" draggable="false" />
        </div>
        <button type="button" class="nav-btn next" id="nextBtn" aria-label="Вперёд">›</button>
      </div>
      <aside class="filmstrip" id="filmstrip">
        {"".join(thumb_items)}
      </aside>
    </div>
    <div class="grid-panel" id="gridPanel"></div>
  </div>

  <div class="help" id="help">
    <div class="help-card">
      <h2>Горячие клавиши</h2>
      <ul class="help-list">
        <li><kbd>←</kbd> <kbd>→</kbd> — предыдущее / следующее</li>
        <li><kbd>+</kbd> <kbd>−</kbd> — масштаб</li>
        <li><kbd>0</kbd> — вписать в экран</li>
        <li><kbd>F</kbd> — полный экран</li>
        <li><kbd>G</kbd> — сетка всех фото</li>
        <li><kbd>T</kbd> — показать / скрыть ленту</li>
        <li><kbd>C</kbd> — копировать ссылку на фото</li>
        <li><kbd>?</kbd> — эта подсказка</li>
        <li><kbd>Esc</kbd> — закрыть</li>
      </ul>
      <button type="button" class="pill" style="margin-top:14px;width:100%;justify-content:center" id="helpClose">Понятно</button>
    </div>
  </div>
  <div class="toast" id="toast"></div>

  <script>
    const images = {images_json};
    const app = document.getElementById('app');
    const body = document.getElementById('body');
    const stage = document.getElementById('stage');
    const mainImg = document.getElementById('mainImg');
    const counter = document.getElementById('counter');
    const zoomLabel = document.getElementById('zoomLabel');
    const progressBar = document.getElementById('progressBar');
    const fileName = document.getElementById('fileName');
    const dimensions = document.getElementById('dimensions');
    const downloadBtn = document.getElementById('downloadBtn');
    const openBtn = document.getElementById('openBtn');
    const gridPanel = document.getElementById('gridPanel');
    const filmstrip = document.getElementById('filmstrip');
    const toast = document.getElementById('toast');
    const help = document.getElementById('help');

    let index = 0;
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let dragging = false;
    let dragStart = null;
    let pinchStart = null;
    let slideshow = null;
    let filmstripVisible = true;

    function clamp(v, min, max) {{ return Math.min(max, Math.max(min, v)); }}

    function showToast(msg) {{
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(showToast._t);
      showToast._t = setTimeout(() => toast.classList.remove('show'), 1800);
    }}

    function applyTransform() {{
      mainImg.style.transform = `translate(calc(-50% + ${{tx}}px), calc(-50% + ${{ty}}px)) scale(${{scale}})`;
      zoomLabel.textContent = `${{Math.round(scale * 100)}}%`;
    }}

    function shareUrl(i) {{
      const url = new URL(location.href);
      url.searchParams.set('i', String(i));
      return url.toString();
    }}

    function prefetch(i) {{
      if (i < 0 || i >= images.length) return;
      const img = new Image();
      img.src = images[i];
    }}

    function updateUI() {{
      counter.textContent = `${{index + 1}} / ${{images.length}}`;
      progressBar.style.width = images.length > 1 ? `${{((index + 1) / images.length) * 100}}%` : '100%';
      const src = images[index];
      const name = src.split('/').pop() || 'screenshot';
      downloadBtn.href = src;
      downloadBtn.download = name;
      openBtn.href = src;
      fileName.innerHTML = `<strong>${{name}}</strong>`;
      document.querySelectorAll('.filmstrip-item').forEach((el, i) => {{
        el.classList.toggle('active', i === index);
      }});
      const active = filmstrip.querySelector('.filmstrip-item.active');
      if (active) active.scrollIntoView({{ block: 'nearest', inline: 'nearest', behavior: 'smooth' }});
      document.getElementById('prevBtn').disabled = index <= 0;
      document.getElementById('nextBtn').disabled = index >= images.length - 1;
      prefetch(index + 1);
      prefetch(index - 1);
    }}

    function fitToScreen() {{
      const rect = stage.getBoundingClientRect();
      const iw = mainImg.naturalWidth || 1;
      const ih = mainImg.naturalHeight || 1;
      scale = Math.min(rect.width / iw, rect.height / ih) * 0.94;
      tx = 0;
      ty = 0;
      applyTransform();
    }}

    function show(i) {{
      index = clamp(i, 0, images.length - 1);
      mainImg.classList.add('loading');
      mainImg.onload = () => {{
        mainImg.classList.remove('loading');
        dimensions.textContent = `${{mainImg.naturalWidth}} × ${{mainImg.naturalHeight}}`;
        fitToScreen();
      }};
      mainImg.src = images[index];
      updateUI();
      if (mainImg.complete) {{
        mainImg.classList.remove('loading');
        dimensions.textContent = `${{mainImg.naturalWidth}} × ${{mainImg.naturalHeight}}`;
        fitToScreen();
      }}
    }}

    function step(delta) {{
      if (!images.length) return;
      show(index + delta);
    }}

    function zoomAt(clientX, clientY, factor) {{
      const rect = stage.getBoundingClientRect();
      const cx = clientX - rect.left - rect.width / 2 - tx;
      const cy = clientY - rect.top - rect.height / 2 - ty;
      const next = clamp(scale * factor, 0.08, 12);
      const ratio = next / scale;
      tx -= cx * (ratio - 1);
      ty -= cy * (ratio - 1);
      scale = next;
      applyTransform();
    }}

    function buildGrid() {{
      gridPanel.innerHTML = images.map((src, i) =>
        `<button type="button" class="grid-tile" data-index="${{i}}">` +
        `<span class="grid-tile-num">${{i + 1}}</span>` +
        `<img src="${{src}}" alt="" loading="lazy" /></button>`
      ).join('');
      gridPanel.querySelectorAll('.grid-tile').forEach((btn) => {{
        btn.addEventListener('click', () => {{
          app.classList.remove('grid-mode');
          show(Number(btn.dataset.index));
        }});
      }});
    }}

    function toggleGrid() {{
      app.classList.toggle('grid-mode');
      document.getElementById('gridBtn').classList.toggle('active', app.classList.contains('grid-mode'));
    }}

    function toggleFilmstrip() {{
      filmstripVisible = !filmstripVisible;
      body.classList.toggle('filmstrip-hidden', !filmstripVisible);
      document.getElementById('stripBtn').classList.toggle('active', filmstripVisible);
    }}

    async function copyShareLink() {{
      try {{
        await navigator.clipboard.writeText(shareUrl(index));
        showToast('Ссылка скопирована');
      }} catch {{
        showToast('Не удалось скопировать');
      }}
    }}

    filmstrip.querySelectorAll('.filmstrip-item').forEach((btn) => {{
      btn.addEventListener('click', () => show(Number(btn.dataset.index)));
    }});

    document.getElementById('prevBtn').addEventListener('click', () => step(-1));
    document.getElementById('nextBtn').addEventListener('click', () => step(1));
    document.getElementById('zoomInBtn').addEventListener('click', () => {{
      const r = stage.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25);
    }});
    document.getElementById('zoomOutBtn').addEventListener('click', () => {{
      const r = stage.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8);
    }});
    document.getElementById('fitBtn').addEventListener('click', fitToScreen);
    document.getElementById('fsBtn').addEventListener('click', () => {{
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {{}});
      else document.exitFullscreen();
    }});
    document.getElementById('gridBtn').addEventListener('click', toggleGrid);
    document.getElementById('stripBtn').addEventListener('click', toggleFilmstrip);
    document.getElementById('copyBtn').addEventListener('click', () => void copyShareLink());
    document.getElementById('helpBtn').addEventListener('click', () => help.classList.add('open'));
    document.getElementById('helpClose').addEventListener('click', () => help.classList.remove('open'));
    help.addEventListener('click', (e) => {{ if (e.target === help) help.classList.remove('open'); }});
    document.getElementById('closeBtn').addEventListener('click', () => {{
      if (window.history.length > 1) window.history.back();
      else window.close();
    }});
    document.getElementById('playBtn').addEventListener('click', (e) => {{
      const btn = e.currentTarget;
      if (slideshow) {{
        clearInterval(slideshow);
        slideshow = null;
        btn.textContent = '▶';
        btn.classList.remove('active');
        return;
      }}
      btn.textContent = '⏸';
      btn.classList.add('active');
      slideshow = setInterval(() => {{
        if (index >= images.length - 1) show(0);
        else step(1);
      }}, 3000);
    }});

    stage.addEventListener('wheel', (e) => {{
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89);
    }}, {{ passive: false }});

    stage.addEventListener('dblclick', (e) => {{
      if (scale > 1.05) fitToScreen();
      else zoomAt(e.clientX, e.clientY, 2);
    }});

    stage.addEventListener('pointerdown', (e) => {{
      if (e.button !== 0) return;
      dragging = true;
      dragStart = {{ x: e.clientX, y: e.clientY, tx, ty }};
      stage.classList.add('dragging');
      stage.setPointerCapture(e.pointerId);
    }});
    stage.addEventListener('pointermove', (e) => {{
      if (!dragging || !dragStart) return;
      tx = dragStart.tx + (e.clientX - dragStart.x);
      ty = dragStart.ty + (e.clientY - dragStart.y);
      applyTransform();
    }});
    const endDrag = (e) => {{
      if (!dragging) return;
      dragging = false;
      dragStart = null;
      stage.classList.remove('dragging');
      try {{ stage.releasePointerCapture(e.pointerId); }} catch (_) {{}}
    }};
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    stage.addEventListener('touchstart', (e) => {{
      if (e.touches.length === 2) {{
        const [a, b] = e.touches;
        pinchStart = {{
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          scale,
          midX: (a.clientX + b.clientX) / 2,
          midY: (a.clientY + b.clientY) / 2,
        }};
      }}
    }}, {{ passive: true }});
    stage.addEventListener('touchmove', (e) => {{
      if (e.touches.length === 2 && pinchStart) {{
        e.preventDefault();
        const [a, b] = e.touches;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const next = clamp(pinchStart.scale * (dist / pinchStart.dist), 0.08, 12);
        const factor = next / scale;
        const midX = (a.clientX + b.clientX) / 2;
        const midY = (a.clientY + b.clientY) / 2;
        const rect = stage.getBoundingClientRect();
        const cx = midX - rect.left - rect.width / 2 - tx;
        const cy = midY - rect.top - rect.height / 2 - ty;
        tx -= cx * (factor - 1);
        ty -= cy * (factor - 1);
        scale = next;
        applyTransform();
      }}
    }}, {{ passive: false }});
    stage.addEventListener('touchend', () => {{ pinchStart = null; }});

    window.addEventListener('keydown', (e) => {{
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === '+' || e.key === '=') document.getElementById('zoomInBtn').click();
      if (e.key === '-') document.getElementById('zoomOutBtn').click();
      if (e.key === '0') fitToScreen();
      if (e.key === 'Escape') {{
        if (help.classList.contains('open')) help.classList.remove('open');
        else if (app.classList.contains('grid-mode')) toggleGrid();
        else document.getElementById('closeBtn').click();
      }}
      if (e.key === 'f' || e.key === 'F') document.getElementById('fsBtn').click();
      if (e.key === 'g' || e.key === 'G') toggleGrid();
      if (e.key === 't' || e.key === 'T') toggleFilmstrip();
      if (e.key === 'c' || e.key === 'C') void copyShareLink();
      if (e.key === '?') help.classList.add('open');
    }});

    window.addEventListener('resize', () => {{
      if (scale < 1.05) fitToScreen();
    }});

    document.getElementById('stripBtn').classList.add('active');
    const start = Number(new URLSearchParams(location.search).get('i'));
    buildGrid();
    show(Number.isFinite(start) ? start : 0);
  </script>
</body>
</html>"""
