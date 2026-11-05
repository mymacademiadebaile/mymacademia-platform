// Visual-only overlay injected into every page while recording a tutorial.
// It draws a mouse pointer that follows real mouse events and a soft ring on
// each click, plus an optional highlight box. It never intercepts events
// (pointer-events: none) and does not change the application's own UI.
(() => {
  if (window.__tutorialOverlay) return;
  window.__tutorialOverlay = true;

  const css = `
    #__tut_cursor{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;
      transform:translate(-200px,-200px);will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));}
    .__tut_ring{position:fixed;z-index:2147483646;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;
      border-radius:50%;border:3px solid rgba(255,153,0,.95);background:rgba(255,153,0,.18);
      animation:__tut_ring .65s ease-out forwards;}
    @keyframes __tut_ring{from{transform:scale(.35);opacity:1}to{transform:scale(1.25);opacity:0}}
    #__tut_box{position:fixed;z-index:2147483645;pointer-events:none;border:3px solid rgba(255,153,0,.95);
      border-radius:10px;box-shadow:0 0 0 9999px rgba(10,12,16,.28);transition:opacity .35s ease, all .35s ease;opacity:0;}
  `;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <path d="M4 2 L4 22 L9.5 17 L13.2 25.5 L16.8 24 L13.2 15.8 L20.5 15.8 Z" fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

  function mount() {
    if (document.getElementById("__tut_cursor")) return;
    const style = document.createElement("style");
    style.id = "__tut_style";
    style.textContent = css;
    document.documentElement.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "__tut_cursor";
    cursor.innerHTML = svg;
    document.documentElement.appendChild(cursor);
    const box = document.createElement("div");
    box.id = "__tut_box";
    document.documentElement.appendChild(box);
    if (window.__tutPos) move(window.__tutPos.x, window.__tutPos.y);
  }

  function move(x, y) {
    window.__tutPos = { x, y };
    const c = document.getElementById("__tut_cursor");
    if (c) c.style.transform = `translate(${x - 3}px, ${y - 1}px)`;
  }

  window.__tutSetCursor = (x, y) => { mount(); move(x, y); };
  window.__tutBox = (rect) => {
    mount();
    const b = document.getElementById("__tut_box");
    if (!rect) { b.style.opacity = "0"; return; }
    const pad = 6;
    Object.assign(b.style, {
      left: rect.x - pad + "px", top: rect.y - pad + "px",
      width: rect.width + pad * 2 + "px", height: rect.height + pad * 2 + "px", opacity: "1",
    });
  };

  document.addEventListener("mousemove", (e) => { mount(); move(e.clientX, e.clientY); }, true);
  document.addEventListener("mousedown", (e) => {
    mount();
    const r = document.createElement("div");
    r.className = "__tut_ring";
    r.style.left = e.clientX + "px";
    r.style.top = e.clientY + "px";
    document.documentElement.appendChild(r);
    setTimeout(() => r.remove(), 800);
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
  // React may replace large parts of the DOM; make sure the overlay survives.
  setInterval(mount, 500);
})();
