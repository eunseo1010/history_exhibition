function loadStylesheet(path) {
  const href = new URL(path, import.meta.url).href;
  const alreadyLinked = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .some((link) => link.href === href);
  if (alreadyLinked) return;

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = href;
  document.head.append(stylesheet);
}

export function mountStartScreen(container, onContinue) {
  loadStylesheet("../../styles/start-screen.css");

  const screen = document.createElement("main");
  screen.className = "start-screen";
  screen.innerHTML = `
    <div class="start-screen__backdrop" aria-hidden="true"></div>
    <canvas class="start-screen__snow" aria-hidden="true"></canvas>
    <button class="start-screen__activate" type="button" aria-label="질문 화면으로 이동">
      <span class="start-screen__prompt">화면을 터치해주세요</span>
    </button>
  `;
  container.replaceChildren(screen);

  const canvas = screen.querySelector(".start-screen__snow");
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new Error("눈 내리는 시작 화면을 위한 2D 캔버스를 초기화하지 못했습니다.");
  }

  const flakes = [];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let animationFrame = 0;
  let lastFrameTime = 0;

  function makeFlake(scatter = false) {
    return {
      x: Math.random() * width,
      y: scatter ? Math.random() * height : -Math.random() * 20,
      radius: 1 + Math.random() * 2.5,
      opacity: 0.3 + Math.random() * 0.6,
      speed: 15 + Math.random() * 30,
      drift: 8 + Math.random() * 20,
      phase: Math.random() * Math.PI * 2,
    };
  }

  function resizeCanvas() {
    const bounds = screen.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    width = bounds.width;
    height = bounds.height;
    if (!width || !height) return;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);

    const count = Math.max(100, Math.min(150, Math.round((width * height) / 8000)));
    flakes.length = 0;
    for (let index = 0; index < count; index += 1) {
      flakes.push(makeFlake(true));
    }

    if (reduceMotion) drawSnow(0);
  }

  function drawSnow(timestamp) {
    const delta = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) : 0;
    lastFrameTime = timestamp;
    context.clearRect(0, 0, width, height);

    for (let index = 0; index < flakes.length; index += 1) {
      const flake = flakes[index];
      flake.y += flake.speed * delta;
      flake.x += Math.sin(timestamp / 1100 + flake.phase) * flake.drift * delta;

      if (flake.y - flake.radius > height) {
        flakes[index] = makeFlake();
        continue;
      }
      if (flake.x < -8) flake.x = width + 5;
      if (flake.x > width + 8) flake.x = -5;

      context.beginPath();
      context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
      context.fill();
    }

    if (!reduceMotion) {
      animationFrame = window.requestAnimationFrame(drawSnow);
    }
  }

  function handleResize() {
    resizeCanvas();
    if (!reduceMotion) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(drawSnow);
    }
  }

  const activateButton = screen.querySelector(".start-screen__activate");
  const resizeObserver = new ResizeObserver(handleResize);
  activateButton.addEventListener("click", onContinue);
  window.addEventListener("resize", handleResize, { passive: true });
  resizeObserver.observe(screen);
  resizeCanvas();
  if (!reduceMotion) {
    animationFrame = window.requestAnimationFrame(drawSnow);
  }

  return () => {
    window.cancelAnimationFrame(animationFrame);
    window.removeEventListener("resize", handleResize);
    resizeObserver.disconnect();
    activateButton.removeEventListener("click", onContinue);
    screen.remove();
  };
}
