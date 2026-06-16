export function fireConfetti() {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden";
  document.body.appendChild(container);

  const colors = ["#7c3aed", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#f97316"];

  for (let i = 0; i < 80; i++) {
    const el = document.createElement("div");
    const color  = colors[i % colors.length];
    const x      = 10 + Math.random() * 80;
    const size   = 5 + Math.random() * 8;
    const dur    = 1.2 + Math.random() * 1;
    const delay  = Math.random() * 0.5;
    const rotate = Math.floor(Math.random() * 720);
    const round  = Math.random() > 0.5;
    el.style.cssText = [
      `position:absolute`,
      `left:${x}%`,
      `top:-10px`,
      `width:${size}px`,
      `height:${size}px`,
      `background:${color}`,
      `border-radius:${round ? "50%" : "3px"}`,
      `animation:confetti-fall ${dur}s ${delay}s ease-in forwards`,
      `--r:${rotate}deg`,
    ].join(";");
    container.appendChild(el);
  }

  setTimeout(() => container.remove(), 3500);
}
