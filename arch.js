// Gives a word the Romanian logo look: flat top, curved bottom
// (letters get a little taller toward the ends), and shrinks it to fit.
(function () {
  function fit(el) {
    el.style.fontSize = "";
    const max = el.parentElement.clientWidth;
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > max && size > 18) { size -= 2; el.style.fontSize = size + "px"; }
  }
  window.ddArch = function (root) {
    (root || document).querySelectorAll(".arch").forEach((el) => {
      if (!el.dataset.arched) {
        const txt = el.textContent.trim();
        el.dataset.arched = "1";
        el.setAttribute("aria-label", txt);
        el.textContent = "";
        const n = txt.length, mid = (n - 1) / 2;
        [...txt].forEach((ch, i) => {
          const s = document.createElement("span");
          s.textContent = ch === " " ? " " : ch;
          const t = mid ? Math.abs(i - mid) / mid : 0;
          s.style.transform = `scaleY(${(1 + 0.2 * t * t).toFixed(3)})`;
          s.setAttribute("aria-hidden", "true");
          el.appendChild(s);
        });
      }
      fit(el);
    });
  };
  document.addEventListener("DOMContentLoaded", () => window.ddArch());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => window.ddArch());
  window.addEventListener("resize", () => window.ddArch());
})();
