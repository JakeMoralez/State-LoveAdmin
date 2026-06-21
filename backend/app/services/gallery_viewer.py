"""HTML viewer for uploaded screenshot galleries."""

from __future__ import annotations

import json
from html import escape


def render_gallery_html(gallery_id: str, filenames: list[str]) -> str:
    images = [f"/uploads/galleries/{gallery_id}/{name}" for name in filenames]
    images_json = json.dumps(images, ensure_ascii=False)
    count = len(filenames)

    thumb_items = []
    for i, src in enumerate(images):
        esc = escape(src)
        thumb_items.append(
            f'<button type="button" class="thumb" data-index="{i}" aria-label="Фото {i + 1}">'
            f'<img src="{esc}" alt="" loading="lazy" /></button>'
        )

    filmstrip_html = ""
    if count > 1:
        filmstrip_html = f'<footer class="strip" id="strip">{"".join(thumb_items)}</footer>'

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
      background: #050506;
      color: #fff;
    }}
    button {{ font: inherit; color: inherit; cursor: pointer; border: none; background: none; }}
    a {{ color: inherit; text-decoration: none; }}

    .viewer {{
      display: grid;
      grid-template-rows: auto 1fr auto;
      height: 100dvh;
      height: 100vh;
    }}
    .viewer.no-strip {{ grid-template-rows: auto 1fr; }}

    .bar {{
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      padding-top: max(10px, env(safe-area-inset-top));
      background: #050506;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      z-index: 10;
    }}
    .bar-btn {{
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.7);
      transition: background 0.15s, color 0.15s;
      flex-shrink: 0;
    }}
    .bar-btn:hover {{ background: rgba(255,255,255,0.08); color: #fff; }}
    .bar-title {{
      flex: 1;
      text-align: center;
      font-size: 0.8125rem;
      font-weight: 500;
      color: rgba(255,255,255,0.55);
      letter-spacing: 0.02em;
      user-select: none;
    }}
    .bar-title strong {{ color: rgba(255,255,255,0.9); font-weight: 600; }}

    .stage-wrap {{
      position: relative;
      min-height: 0;
      background: #050506;
      overflow: hidden;
    }}
    .stage {{
      position: absolute;
      inset: 0;
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
      transition: opacity 0.2s ease;
    }}
    .stage img.loading {{ opacity: 0.4; }}

    .hud {{
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
    }}
    .hud-zoom {{
      position: absolute;
      left: 16px;
      bottom: 16px;
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(0,0,0,0.45);
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
      color: rgba(255,255,255,0.5);
      opacity: 0;
      transition: opacity 0.2s;
    }}
    .stage-wrap:hover .hud-zoom,
    .stage-wrap.show-hud .hud-zoom {{ opacity: 1; }}

    .nav {{
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 3;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(0,0,0,0.35);
      border: 1px solid rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.85);
      font-size: 1.25rem;
      line-height: 1;
      opacity: 0;
      transition: opacity 0.15s, background 0.15s;
      pointer-events: auto;
    }}
    .stage-wrap:hover .nav {{ opacity: 1; }}
    .nav:hover {{ background: rgba(255,255,255,0.12); }}
    .nav:disabled {{ opacity: 0 !important; pointer-events: none; }}
    .nav.prev {{ left: 16px; }}
    .nav.next {{ right: 16px; }}

    .strip {{
      display: flex;
      gap: 6px;
      padding: 10px 16px;
      padding-bottom: max(10px, env(safe-area-inset-bottom));
      overflow-x: auto;
      background: #050506;
      border-top: 1px solid rgba(255,255,255,0.06);
      scrollbar-width: none;
    }}
    .strip::-webkit-scrollbar {{ display: none; }}
    .thumb {{
      flex-shrink: 0;
      width: 72px;
      height: 48px;
      border-radius: 6px;
      overflow: hidden;
      border: 2px solid transparent;
      padding: 0;
      opacity: 0.55;
      transition: opacity 0.15s, border-color 0.15s;
    }}
    .thumb:hover {{ opacity: 0.85; }}
    .thumb.active {{ opacity: 1; border-color: #c9a227; }}
    .thumb img {{ width: 100%; height: 100%; object-fit: cover; display: block; }}

    .menu-backdrop {{
      position: fixed;
      inset: 0;
      z-index: 40;
      background: rgba(0,0,0,0.5);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
    }}
    .menu-backdrop.open {{ opacity: 1; pointer-events: auto; }}
    .menu {{
      position: fixed;
      top: 0;
      right: 0;
      z-index: 41;
      width: min(280px, 100vw);
      height: 100%;
      padding: 16px;
      padding-top: max(16px, env(safe-area-inset-top));
      background: #0a0a0e;
      border-left: 1px solid rgba(255,255,255,0.08);
      transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.22,1,0.36,1);
      overflow-y: auto;
    }}
    .menu.open {{ transform: translateX(0); }}
    .menu-head {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }}
    .menu-head h2 {{ margin: 0; font-size: 0.9375rem; font-weight: 600; }}
    .menu-meta {{
      margin-bottom: 16px;
      padding: 12px;
      border-radius: 8px;
      background: rgba(255,255,255,0.03);
      font-size: 0.75rem;
      color: rgba(255,255,255,0.45);
      line-height: 1.5;
      word-break: break-all;
    }}
    .menu-meta strong {{ display: block; color: rgba(255,255,255,0.8); font-weight: 500; margin-bottom: 4px; word-break: break-all; }}
    .menu-actions {{ display: flex; flex-direction: column; gap: 4px; }}
    .menu-item {{
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      text-align: left;
      font-size: 0.8125rem;
      color: rgba(255,255,255,0.85);
      transition: background 0.12s;
    }}
    .menu-item:hover {{ background: rgba(255,255,255,0.06); }}
    .menu-item kbd {{
      margin-left: auto;
      font-size: 0.6875rem;
      color: rgba(255,255,255,0.3);
      font-family: inherit;
    }}

    .grid-view {{
      display: none;
      position: absolute;
      inset: 0;
      z-index: 5;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
      padding: 16px;
      overflow: auto;
      background: #050506;
    }}
    .viewer.grid-mode .grid-view {{ display: grid; }}
    .viewer.grid-mode .stage,
    .viewer.grid-mode .hud,
    .viewer.grid-mode .nav {{ display: none; }}
    .grid-cell {{
      aspect-ratio: 1;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.06);
      padding: 0;
      transition: border-color 0.12s;
    }}
    .grid-cell:hover {{ border-color: rgba(201,162,39,0.4); }}
    .grid-cell img {{ width: 100%; height: 100%; object-fit: cover; display: block; }}

    .toast {{
      position: fixed;
      bottom: max(24px, env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%) translateY(8px);
      z-index: 50;
      padding: 8px 16px;
      border-radius: 8px;
      background: rgba(20,20,24,0.95);
      border: 1px solid rgba(255,255,255,0.1);
      font-size: 0.8125rem;
      color: rgba(255,255,255,0.9);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
    }}
    .toast.show {{ opacity: 1; transform: translateX(-50%) translateY(0); }}

    @media (max-width: 640px) {{
      .nav {{ opacity: 1; width: 40px; height: 40px; }}
      .hud-zoom {{ opacity: 1; }}
      .thumb {{ width: 64px; height: 42px; }}
    }}
  </style>
</head>
<body>
  <div class="viewer{' no-strip' if count <= 1 else ''}" id="viewer">
    <header class="bar">
      <button type="button" class="bar-btn" id="closeBtn" title="Закрыть" aria-label="Закрыть">✕</button>
      <div class="bar-title" id="counter"><strong>1</strong> / {count}</div>
      <button type="button" class="bar-btn" id="menuBtn" title="Меню" aria-label="Меню">⋯</button>
    </header>

    <div class="stage-wrap" id="stageWrap">
      <div class="stage" id="stage">
        <img id="img" alt="" draggable="false" />
      </div>
      <div class="hud" aria-hidden="true">
        <span class="hud-zoom" id="zoomHud">100%</span>
      </div>
      <button type="button" class="nav prev" id="prevBtn" aria-label="Назад">‹</button>
      <button type="button" class="nav next" id="nextBtn" aria-label="Вперёд">›</button>
      <div class="grid-view" id="gridView"></div>
    </div>

    {filmstrip_html}
  </div>

  <div class="menu-backdrop" id="menuBackdrop"></div>
  <aside class="menu" id="menu" aria-label="Меню">
    <div class="menu-head">
      <h2>Фото</h2>
      <button type="button" class="bar-btn" id="menuClose" aria-label="Закрыть меню">✕</button>
    </div>
    <div class="menu-meta">
      <strong id="fileName">—</strong>
      <span id="dimensions">—</span>
    </div>
    <div class="menu-actions">
      <button type="button" class="menu-item" id="fitBtn">Вписать в экран <kbd>0</kbd></button>
      <button type="button" class="menu-item" id="gridBtn">Сетка <kbd>G</kbd></button>
      <button type="button" class="menu-item" id="playBtn">Слайдшоу</button>
      <button type="button" class="menu-item" id="copyBtn">Копировать ссылку <kbd>C</kbd></button>
      <a class="menu-item" id="openBtn" href="#" target="_blank" rel="noreferrer">Открыть оригинал</a>
      <a class="menu-item" id="downloadBtn" href="#" download>Скачать</a>
      <button type="button" class="menu-item" id="fsBtn">Полный экран <kbd>F</kbd></button>
    </div>
  </aside>

  <div class="toast" id="toast"></div>

  <script>
    const images = {images_json};
    const viewer = document.getElementById('viewer');
    const stage = document.getElementById('stage');
    const stageWrap = document.getElementById('stageWrap');
    const img = document.getElementById('img');
    const counter = document.getElementById('counter');
    const zoomHud = document.getElementById('zoomHud');
    const fileName = document.getElementById('fileName');
    const dimensions = document.getElementById('dimensions');
    const downloadBtn = document.getElementById('downloadBtn');
    const openBtn = document.getElementById('openBtn');
    const gridView = document.getElementById('gridView');
    const strip = document.getElementById('strip');
    const menu = document.getElementById('menu');
    const menuBackdrop = document.getElementById('menuBackdrop');
    const toast = document.getElementById('toast');

    let index = 0;
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let dragging = false;
    let dragStart = null;
    let pinchStart = null;
    let swipeStart = null;
    let slideshow = null;

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    function toastMsg(msg) {{
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toastMsg._t);
      toastMsg._t = setTimeout(() => toast.classList.remove('show'), 1800);
    }}

    function applyTransform() {{
      img.style.transform = `translate(calc(-50% + ${{tx}}px), calc(-50% + ${{ty}}px)) scale(${{scale}})`;
      zoomHud.textContent = `${{Math.round(scale * 100)}}%`;
    }}

    function shareUrl(i) {{
      const url = new URL(location.href);
      url.searchParams.set('i', String(i));
      return url.toString();
    }}

    function updateUI() {{
      counter.innerHTML = `<strong>${{index + 1}}</strong> / ${{images.length}}`;
      const src = images[index];
      const name = src.split('/').pop() || 'screenshot';
      downloadBtn.href = src;
      downloadBtn.download = name;
      openBtn.href = src;
      fileName.textContent = name;
      document.querySelectorAll('.thumb').forEach((el, i) => {{
        el.classList.toggle('active', i === index);
      }});
      const active = strip?.querySelector('.thumb.active');
      if (active) active.scrollIntoView({{ block: 'nearest', inline: 'center', behavior: 'smooth' }});
      document.getElementById('prevBtn').disabled = index <= 0;
      document.getElementById('nextBtn').disabled = index >= images.length - 1;
    }}

    function fitToScreen() {{
      const rect = stage.getBoundingClientRect();
      const iw = img.naturalWidth || 1;
      const ih = img.naturalHeight || 1;
      scale = Math.min(rect.width / iw, rect.height / ih) * 0.92;
      tx = 0;
      ty = 0;
      applyTransform();
    }}

    function show(i) {{
      index = clamp(i, 0, images.length - 1);
      img.classList.add('loading');
      const onLoad = () => {{
        img.classList.remove('loading');
        dimensions.textContent = `${{img.naturalWidth}} × ${{img.naturalHeight}} px`;
        fitToScreen();
      }};
      img.onload = onLoad;
      img.src = images[index];
      updateUI();
      if (img.complete) onLoad();
    }}

    function step(delta) {{
      if (!images.length) return;
      show(index + delta);
    }}

    function zoomAt(cx, cy, factor) {{
      const rect = stage.getBoundingClientRect();
      const px = cx - rect.left - rect.width / 2 - tx;
      const py = cy - rect.top - rect.height / 2 - ty;
      const next = clamp(scale * factor, 0.1, 8);
      const ratio = next / scale;
      tx -= px * (ratio - 1);
      ty -= py * (ratio - 1);
      scale = next;
      applyTransform();
      stageWrap.classList.add('show-hud');
      clearTimeout(zoomAt._h);
      zoomAt._h = setTimeout(() => stageWrap.classList.remove('show-hud'), 1500);
    }}

    function buildGrid() {{
      gridView.innerHTML = images.map((src, i) =>
        `<button type="button" class="grid-cell" data-index="${{i}}"><img src="${{src}}" alt="" loading="lazy" /></button>`
      ).join('');
      gridView.querySelectorAll('.grid-cell').forEach((btn) => {{
        btn.addEventListener('click', () => {{
          viewer.classList.remove('grid-mode');
          closeMenu();
          show(Number(btn.dataset.index));
        }});
      }});
    }}

    function openMenu() {{
      menu.classList.add('open');
      menuBackdrop.classList.add('open');
    }}
    function closeMenu() {{
      menu.classList.remove('open');
      menuBackdrop.classList.remove('open');
    }}

    function toggleGrid() {{
      viewer.classList.toggle('grid-mode');
      closeMenu();
    }}

    async function copyLink() {{
      try {{
        await navigator.clipboard.writeText(shareUrl(index));
        toastMsg('Ссылка скопирована');
      }} catch {{
        toastMsg('Не удалось скопировать');
      }}
    }}

    strip?.querySelectorAll('.thumb').forEach((btn) => {{
      btn.addEventListener('click', () => show(Number(btn.dataset.index)));
    }});

    document.getElementById('prevBtn').addEventListener('click', () => step(-1));
    document.getElementById('nextBtn').addEventListener('click', () => step(1));
    document.getElementById('closeBtn').addEventListener('click', () => {{
      if (window.history.length > 1) window.history.back();
      else window.close();
    }});
    document.getElementById('menuBtn').addEventListener('click', openMenu);
    document.getElementById('menuClose').addEventListener('click', closeMenu);
    menuBackdrop.addEventListener('click', closeMenu);
    document.getElementById('fitBtn').addEventListener('click', () => {{ fitToScreen(); closeMenu(); }});
    document.getElementById('gridBtn').addEventListener('click', toggleGrid);
    document.getElementById('copyBtn').addEventListener('click', () => void copyLink());
    document.getElementById('fsBtn').addEventListener('click', () => {{
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {{}});
      else document.exitFullscreen();
      closeMenu();
    }});
    document.getElementById('playBtn').addEventListener('click', (e) => {{
      const btn = e.currentTarget;
      if (slideshow) {{
        clearInterval(slideshow);
        slideshow = null;
        btn.textContent = 'Слайдшоу';
        return;
      }}
      btn.textContent = 'Остановить слайдшоу';
      closeMenu();
      slideshow = setInterval(() => step(index >= images.length - 1 ? -(images.length - 1) : 1), 3000);
    }});

    stage.addEventListener('wheel', (e) => {{
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 0.9);
    }}, {{ passive: false }});

    stage.addEventListener('dblclick', (e) => {{
      if (scale > 1.05) fitToScreen();
      else zoomAt(e.clientX, e.clientY, 2);
    }});

    stage.addEventListener('pointerdown', (e) => {{
      if (e.button !== 0) return;
      dragging = true;
      dragStart = {{ x: e.clientX, y: e.clientY, tx, ty }};
      swipeStart = {{ x: e.clientX, y: e.clientY, t: Date.now() }};
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
      if (swipeStart && scale <= 1.05) {{
        const dx = e.clientX - swipeStart.x;
        if (Math.abs(dx) > 50 && Date.now() - swipeStart.t < 400) step(dx > 0 ? -1 : 1);
      }}
      dragging = false;
      dragStart = null;
      swipeStart = null;
      stage.classList.remove('dragging');
      try {{ stage.releasePointerCapture(e.pointerId); }} catch (_) {{}}
    }};
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    stage.addEventListener('touchstart', (e) => {{
      if (e.touches.length === 2) {{
        const [a, b] = e.touches;
        pinchStart = {{ dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale }};
      }}
    }}, {{ passive: true }});
    stage.addEventListener('touchmove', (e) => {{
      if (e.touches.length === 2 && pinchStart) {{
        e.preventDefault();
        const [a, b] = e.touches;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const midX = (a.clientX + b.clientX) / 2;
        const midY = (a.clientY + b.clientY) / 2;
        zoomAt(midX, midY, dist / pinchStart.dist);
        pinchStart.dist = dist;
      }}
    }}, {{ passive: false }});
    stage.addEventListener('touchend', () => {{ pinchStart = null; }});

    window.addEventListener('keydown', (e) => {{
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === '0') fitToScreen();
      if (e.key === 'Escape') {{
        if (menu.classList.contains('open')) closeMenu();
        else if (viewer.classList.contains('grid-mode')) viewer.classList.remove('grid-mode');
        else document.getElementById('closeBtn').click();
      }}
      if (e.key === 'f' || e.key === 'F') document.getElementById('fsBtn').click();
      if (e.key === 'g' || e.key === 'G') toggleGrid();
      if (e.key === 'c' || e.key === 'C') void copyLink();
    }});

    window.addEventListener('resize', () => {{ if (scale < 1.05) fitToScreen(); }});

    buildGrid();
    const start = Number(new URLSearchParams(location.search).get('i'));
    show(Number.isFinite(start) ? start : 0);
  </script>
</body>
</html>"""
