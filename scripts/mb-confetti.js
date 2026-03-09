/**
 * Lightweight confetti canvas effect for Mystery Box reveals.
 * Adapted from the CritFX pattern — uses a fullscreen canvas overlay
 * that is injected once and reused across calls.
 */
export class MysteryBoxConfetti {
  /** @type {HTMLCanvasElement|null} Reused canvas element across calls. */
  #canvas = null;

  /** @type {boolean} Whether the confetti animation loop is active. */
  #running = false;

  /**
   * Injects the canvas into the DOM on first use and reuses it thereafter.
   * Keeps the canvas outside any AppV2 shadow root so it covers the full viewport.
   * @returns {HTMLCanvasElement}
   */
  #getCanvas() {
    if (!this.#canvas) {
      this.#canvas = document.getElementById("dh-mb-confetti-canvas");
    }
    if (!this.#canvas) {
      this.#canvas = document.createElement("canvas");
      this.#canvas.id = "dh-mb-confetti-canvas";
      // Inline only the structural properties required for a fullscreen overlay;
      // pointer-events:none ensures the canvas never blocks user interaction.
      Object.assign(this.#canvas.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: "100000",
        background: "transparent"
      });
      document.body.appendChild(this.#canvas);
    }
    return this.#canvas;
  }

  /**
   * Plays the confetti animation for the specified duration.
   * Intensity maps to particle count: 1→50, 2→100, 3→200, 4→400, 5→800.
   * @param {object} [options={}]
   * @param {number} [options.intensity=3] - Intensity level from 1 to 5.
   * @param {number} [options.duration=4000] - Total animation duration in ms.
   */
  play({ intensity = 3, duration = 4000 } = {}) {
    // Stop any previous run so particles reset cleanly.
    this.#running = false;

    const canvas = this.#getCanvas();
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const intensityMap = { 1: 50, 2: 100, 3: 200, 4: 400, 5: 800 };
    const particleCount = intensityMap[intensity] ?? 200;
    const colors = ["#a864fd", "#29cdff", "#78ff44", "#ff718d", "#fdff6a"];

    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      // Start above the visible area so particles fall into view.
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5,
      h: Math.random() * 10 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: Math.random() * 3 + 2,
      angle: Math.random() * 360,
      spin: Math.random() < 0.5 ? -1 : 1,
      drift: Math.random() * 2 - 1
    }));

    this.#running = true;

    const animate = () => {
      if (!this.#running) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.y += p.speed;
        p.x += p.drift;
        p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.angle * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
        // Recycle particles that fall off screen to maintain density throughout the duration.
        if (p.y > canvas.height) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      }
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);

    setTimeout(() => {
      this.#running = false;
      // Allow one final frame to clear the canvas before stopping.
      setTimeout(() => ctx.clearRect(0, 0, canvas.width, canvas.height), 100);
    }, duration);
  }
}
