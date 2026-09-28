function initCompareSlider(root) {
  const afterImg = root.querySelector(".compare-img-after");
  const handle = root.querySelector(".compare-handle");
  if (!afterImg || !handle) return;

  let dragging = false;

  function setPosition(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    afterImg.style.clipPath = `inset(0 0 0 ${clamped}%)`;
    handle.style.left = `${clamped}%`;
    root.setAttribute("aria-valuenow", String(Math.round(clamped)));
  }

  function percentFromClientX(clientX) {
    const rect = root.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }

  function onPointerDown(e) {
    dragging = true;
    root.setPointerCapture(e.pointerId);
    setPosition(percentFromClientX(e.clientX));
  }

  function onPointerMove(e) {
    if (!dragging) return;
    setPosition(percentFromClientX(e.clientX));
  }

  function onPointerUp(e) {
    dragging = false;
    if (root.hasPointerCapture?.(e.pointerId)) {
      root.releasePointerCapture(e.pointerId);
    }
  }

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerUp);

  root.addEventListener("keydown", (e) => {
    const current = parseFloat(root.getAttribute("aria-valuenow")) || 50;
    const step = e.shiftKey ? 10 : 4;
    if (e.key === "ArrowLeft") {
      setPosition(current - step);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      setPosition(current + step);
      e.preventDefault();
    } else if (e.key === "Home") {
      setPosition(0);
      e.preventDefault();
    } else if (e.key === "End") {
      setPosition(100);
      e.preventDefault();
    }
  });

  setPosition(50);
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-compare-slider]").forEach(initCompareSlider);
});
