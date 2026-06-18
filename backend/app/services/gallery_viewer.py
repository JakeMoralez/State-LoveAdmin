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

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Альбом · {count} фото</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}
    html, body {{
      margin: 0;
      height: 100%;
      overflow: hidden;
      font-family: system-ui, -apple-system, sans-serif;
      background: #08090d;
      color: #e8e8ec;
    }}
    button {{
      font: inherit;
      color: inherit;
      cursor: pointer;
      border: none;
      background: none;
    }}
    .viewer {{
      display: grid;
      grid-template-rows: auto 1fr;
      height: 100dvh;
    }}
    .toolbar {{
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(12, 13, 18, 0.96);
      backdrop-filter: blur(10px);
      z-index: 5;
    }}
    .toolbar .spacer {{ flex: 1; }}
    .btn, .icon-btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 34px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.88);
      transition: background 0.15s, border-color 0.15s, color 0.15s;
      text-decoration: none;
      font-size: 0.8125rem;
      white-space: nowrap;
    }}
    .icon-btn {{
      width: 34px;
      padding: 0;
      font-size: 1rem;
      line-height: 1;
    }}
    .btn:hover, .icon-btn:hover {{
      background: rgba(201, 162, 39, 0.12);
      border-color: rgba(201, 162, 39, 0.28);
      color: #e0c04a;
    }}
    .counter, .zoom-label {{
      font-size: 0.8125rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.72);
      min-width: 52px;
      text-align: center;
    }}
    .zoom-label {{
      min-width: 44px;
      font-variant-numeric: tabular-nums;
    }}
    .layout {{
      display: grid;
      grid-template-columns: 1fr auto;
      min-height: 0;
      height: 100%;
    }}
    .stage-wrap {{
      position: relative;
      min-width: 0;
      min-height: 0;
      background:
        radial-gradient(circle at 50% 0%, rgba(201, 162, 39, 0.06), transparent 55%),
        #08090d;
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
      will-change: transform;
    }}
    .nav {{
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 3;
      width: 42px;
      height: 64px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.45);
      color: rgba(255, 255, 255, 0.85);
      font-size: 1.75rem;
      line-height: 1;
      opacity: 0;
      transition: opacity 0.15s, background 0.15s;
    }}
    .stage-wrap:hover .nav {{ opacity: 1; }}
    .nav:hover {{
      background: rgba(201, 162, 39, 0.18);
      color: #e0c04a;
    }}
    .nav.prev {{ left: 12px; }}
    .nav.next {{ right: 12px; }}
    .nav:disabled {{
      opacity: 0.25 !important;
      cursor: default;
    }}
    .thumbs {{
      width: 132px;
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(10, 11, 16, 0.98);
      overflow-y: auto;
      padding: 10px 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}
    .thumb {{
      display: block;
      width: 100%;
      aspect-ratio: 16 / 10;
      border-radius: 8px;
      overflow: hidden;
      border: 2px solid transparent;
      padding: 0;
      background: #12141c;
      transition: border-color 0.15s, transform 0.15s;
    }}
    .thumb img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }}
    .thumb:hover {{ transform: scale(1.02); }}
    .thumb.active {{
      border-color: #c9a227;
      box-shadow: 0 0 0 1px rgba(201, 162, 39, 0.35);
    }}
    .grid-view {{
      display: none;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
      padding: 16px;
      overflow: auto;
      height: calc(100dvh - 56px);
    }}
    .grid-view.open {{ display: grid; }}
    .viewer.grid-mode .layout {{ display: none; }}
    .grid-shot {{
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #12141c;
      cursor: pointer;
      transition: border-color 0.15s;
    }}
    .grid-shot:hover {{ border-color: rgba(201, 162, 39, 0.35); }}
    .grid-shot img {{
      display: block;
      width: 100%;
      height: auto;
    }}
    @media (max-width: 720px) {{
      .layout {{ grid-template-columns: 1fr; }}
      .thumbs {{
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        width: auto;
        height: 92px;
        flex-direction: row;
        border-left: none;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        overflow-x: auto;
        overflow-y: hidden;
      }}
      .thumb {{
        width: 108px;
        flex-shrink: 0;
      }}
      .nav {{ opacity: 1; width: 36px; height: 52px; }}
    }}
  </style>
</head>
<body>
  <div class="viewer" id="viewer">
    <header class="toolbar">
      <a class="btn" id="downloadBtn" href="#" download>Скачать</a>
      <button type="button" class="icon-btn" id="playBtn" title="Слайдшоу">▶</button>
      <span class="counter" id="counter">1 / {count}</span>
      <div class="spacer"></div>
      <span class="zoom-label" id="zoomLabel">100%</span>
      <button type="button" class="icon-btn" id="zoomOutBtn" title="Уменьшить">−</button>
      <button type="button" class="icon-btn" id="zoomInBtn" title="Увеличить">+</button>
      <button type="button" class="icon-btn" id="fitBtn" title="Вписать в экран">⤢</button>
      <button type="button" class="icon-btn" id="actualBtn" title="Реальный размер">1:1</button>
      <button type="button" class="icon-btn" id="fsBtn" title="Полный экран">⛶</button>
      <button type="button" class="icon-btn" id="gridBtn" title="Сетка">▦</button>
      <button type="button" class="icon-btn" id="closeBtn" title="Закрыть">✕</button>
    </header>
    <div class="layout">
      <div class="stage-wrap">
        <button type="button" class="nav prev" id="prevBtn" aria-label="Назад">‹</button>
        <div class="stage" id="stage">
          <img id="mainImg" alt="" draggable="false" />
        </div>
        <button type="button" class="nav next" id="nextBtn" aria-label="Вперёд">›</button>
      </div>
      <aside class="thumbs" id="thumbs">
        {"".join(thumb_items)}
      </aside>
    </div>
    <div class="grid-view" id="gridView"></div>
  </div>
  <script>
    const images = {images_json};
    const stage = document.getElementById('stage');
    const mainImg = document.getElementById('mainImg');
    const counter = document.getElementById('counter');
    const zoomLabel = document.getElementById('zoomLabel');
    const downloadBtn = document.getElementById('downloadBtn');
    const viewer = document.getElementById('viewer');
    const gridView = document.getElementById('gridView');
    const thumbs = document.getElementById('thumbs');

    let index = 0;
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let dragging = false;
    let dragStart = null;
    let pinchStart = null;
    let slideshow = null;

    function clamp(v, min, max) {{ return Math.min(max, Math.max(min, v)); }}

    function applyTransform() {{
      mainImg.style.transform = `translate(calc(-50% + ${{tx}}px), calc(-50% + ${{ty}}px)) scale(${{scale}})`;
      zoomLabel.textContent = `${{Math.round(scale * 100)}}%`;
    }}

    function updateUI() {{
      counter.textContent = `${{index + 1}} / ${{images.length}}`;
      downloadBtn.href = images[index];
      downloadBtn.download = images[index].split('/').pop() || 'screenshot';
      document.querySelectorAll('.thumb').forEach((el, i) => {{
        el.classList.toggle('active', i === index);
      }});
      const activeThumb = thumbs.querySelector('.thumb.active');
      if (activeThumb) activeThumb.scrollIntoView({{ block: 'nearest', inline: 'nearest', behavior: 'smooth' }});
      document.getElementById('prevBtn').disabled = index <= 0;
      document.getElementById('nextBtn').disabled = index >= images.length - 1;
    }}

    function fitToScreen() {{
      const rect = stage.getBoundingClientRect();
      const iw = mainImg.naturalWidth || 1;
      const ih = mainImg.naturalHeight || 1;
      scale = Math.min(rect.width / iw, rect.height / ih) * 0.92;
      tx = 0;
      ty = 0;
      applyTransform();
    }}

    function actualSize() {{
      scale = 1;
      tx = 0;
      ty = 0;
      applyTransform();
    }}

    function show(i) {{
      index = clamp(i, 0, images.length - 1);
      mainImg.onload = () => fitToScreen();
      mainImg.src = images[index];
      updateUI();
      if (mainImg.complete) fitToScreen();
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
      gridView.innerHTML = images.map((src, i) =>
        `<button type="button" class="grid-shot" data-index="${{i}}"><img src="${{src}}" alt="" loading="lazy" /></button>`
      ).join('');
      gridView.querySelectorAll('.grid-shot').forEach((btn) => {{
        btn.addEventListener('click', () => {{
          viewer.classList.remove('grid-mode');
          show(Number(btn.dataset.index));
        }});
      }});
    }}

    thumbs.querySelectorAll('.thumb').forEach((btn) => {{
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
    document.getElementById('actualBtn').addEventListener('click', actualSize);
    document.getElementById('fsBtn').addEventListener('click', () => {{
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {{}});
      else document.exitFullscreen();
    }});
    document.getElementById('gridBtn').addEventListener('click', () => {{
      viewer.classList.toggle('grid-mode');
    }});
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
        btn.title = 'Слайдшоу';
        return;
      }}
      btn.textContent = '⏸';
      btn.title = 'Пауза';
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
      if (e.key === 'Escape') document.getElementById('closeBtn').click();
      if (e.key === 'f' || e.key === 'F') document.getElementById('fsBtn').click();
    }});

    window.addEventListener('resize', () => {{
      if (scale < 1.05) fitToScreen();
    }});

    const start = Number(new URLSearchParams(location.search).get('i'));
    buildGrid();
    show(Number.isFinite(start) ? start : 0);
  </script>
</body>
</html>"""
