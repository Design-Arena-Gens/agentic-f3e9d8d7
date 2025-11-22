"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TransitionState = {
  from: number;
  to: number;
};

type LoadedImages = (HTMLImageElement | null)[];

type ViewportState = {
  width: number;
  height: number;
  dpr: number;
};

const DEFAULT_SOURCES = ["/default-first.svg", "/default-second.svg"] as const;

const RAVEN_POINTS: Array<[number, number]> = [
  [-0.28, 0.52],
  [-0.1, 0.42],
  [0.06, 0.33],
  [0.15, 0.24],
  [0.28, 0.12],
  [0.38, 0.03],
  [0.5, -0.08],
  [0.62, -0.18],
  [0.75, -0.23],
  [0.87, -0.18],
  [1.0, -0.08],
  [1.07, 0.02],
  [1.16, 0.08],
  [1.22, 0.18],
  [1.26, 0.28],
  [1.24, 0.38],
  [1.16, 0.48],
  [1.02, 0.58],
  [0.9, 0.66],
  [0.72, 0.72],
  [0.54, 0.7],
  [0.36, 0.68],
  [0.18, 0.66],
  [0.04, 0.62],
  [-0.12, 0.58]
];

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const drawCoverImage = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number
) => {
  const imageRatio = img.width / img.height;
  const canvasRatio = width / height;
  let drawWidth: number;
  let drawHeight: number;

  if (imageRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = drawHeight * imageRatio;
  } else {
    drawWidth = width;
    drawHeight = drawWidth / imageRatio;
  }

  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
};

const traceRavenPath = (
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>
) => {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
};

const computeRavenGeometry = (
  width: number,
  height: number,
  progress: number
) => {
  const eased = easeInOutCubic(progress);
  const base = Math.min(width, height);
  const shapeWidth = base * 1.32;
  const shapeHeight = base * 0.74;
  const travel = width + shapeWidth * 0.85;
  const offsetX = eased * travel - shapeWidth * 0.75;
  const offsetY = height * 0.52 - Math.sin(eased * Math.PI) * base * 0.08;
  const skew = (eased - 0.5) * 0.55;
  const lift = Math.sin(eased * Math.PI) * 0.18;

  const points = RAVEN_POINTS.map(([nx, ny]) => {
    const centeredY = ny - 0.5;
    const scaledX = offsetX + shapeWidth * (nx + 0.15) + centeredY * shapeHeight * skew;
    const scaledY = offsetY + shapeHeight * centeredY * (1 - lift * 0.35);
    return { x: scaledX, y: scaledY };
  });

  return {
    points,
    offsetX,
    offsetY,
    shapeWidth,
    shapeHeight,
    eased
  };
};

const useLoadedImages = (sources: string[]): LoadedImages => {
  const [images, setImages] = useState<LoadedImages>([null, null]);

  useEffect(() => {
    sources.forEach((src, index) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = src;

      setImages(prev => {
        const next = [...prev] as LoadedImages;
        next[index] = null;
        return next;
      });

      image.onload = () => {
        setImages(prev => {
          const next = [...prev] as LoadedImages;
          next[index] = image;
          return next;
        });
      };
    });
  }, [sources]);

  return images;
};

const useObjectUrlManager = () => {
  const ref = useRef<string[]>(["", ""]);

  useEffect(() => {
    const urls = ref.current;
    return () => {
      urls.forEach(url => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  const setUrl = useCallback((index: number, url: string) => {
    const current = ref.current[index];
    if (current) {
      URL.revokeObjectURL(current);
    }
    ref.current[index] = url;
  }, []);

  return { setUrl };
};

const useFeatherSeeds = () =>
  useMemo(
    () =>
      Array.from({ length: 18 }, (_, idx) => {
        const seed = (idx + 1) * 37;
        const base = (Math.sin(seed * 1.3) + 1) / 2;
        const spread = (Math.cos(seed * 0.77) + 1) / 2;
        return {
          offsetY: spread * 0.9 - 0.45,
          sizeScale: 0.55 + base * 0.65,
          delay: (idx % 6) * 0.05,
          sway: Math.sin(seed * 0.61) * 0.9
        };
      }),
    []
  );

type RavenTransitionControls = {
  startTransition: () => void;
  isAnimating: boolean;
  activeIndex: number;
};

const useTransitionCanvas = (
  canvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  images: LoadedImages,
  duration: number,
  featherSeeds: ReturnType<typeof useFeatherSeeds>
): RavenTransitionControls => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationFrameRef = useRef<number>();
  const startTimestampRef = useRef<number>(0);
  const transitionRef = useRef<TransitionState>({ from: 0, to: 1 });
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const viewportRef = useRef<ViewportState>({ width: 0, height: 0, dpr: 1 });
  const isAnimatingRef = useRef(false);

  const ensureContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;
  }, [canvasRef]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (typeof ctx.resetTransform === "function") {
      ctx.resetTransform();
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
    viewportRef.current = { width: rect.width, height: rect.height, dpr };
  }, [canvasRef, containerRef]);

  const drawStatic = useCallback(() => {
    const ctx = ctxRef.current;
    const { width, height } = viewportRef.current;
    if (!ctx || !width || !height) return;

    ctx.clearRect(0, 0, width, height);
    const currentImage = images[activeIndex];
    if (!currentImage) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "rgba(18, 24, 48, 0.9)");
      gradient.addColorStop(1, "rgba(8, 11, 24, 0.85)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      return;
    }

    drawCoverImage(ctx, currentImage, width, height);
  }, [activeIndex, images]);

  const drawFeathers = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      progress: number,
      width: number,
      height: number,
      geometry: ReturnType<typeof computeRavenGeometry>
    ) => {
      const eased = easeOutQuart(progress);
      const baseSize = Math.min(width, height) * 0.07;
      const baseX = geometry.offsetX + geometry.shapeWidth * 0.28;

      featherSeeds.forEach(seed => {
        const local = (progress - seed.delay) / 0.75;
        if (local <= 0) return;
        const clamped = clamp01(local);
        const fade = 1 - clamped;
        if (fade <= 0.01) return;

        const size = baseSize * seed.sizeScale;
        const centerX = baseX - clamped * width * 0.32;
        const centerY = height * 0.5 + seed.offsetY * height * 0.32;

        ctx.save();
        ctx.globalAlpha = fade * 0.5;
        ctx.translate(centerX, centerY);
        ctx.rotate(-0.35 + seed.sway * (1 - fade));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-size * 0.5, -size * 1.1);
        ctx.quadraticCurveTo(size * 0.1, -size * 0.9, size * 0.22, -size * 1.45);
        ctx.lineTo(size * 0.18, -size * 0.35);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, 0, 0, -size * 1.4);
        gradient.addColorStop(0, "rgba(0, 0, 0, 0.62)");
        gradient.addColorStop(1, "rgba(42, 44, 60, 0.15)");
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.restore();
      });

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const sweepWidth = geometry.shapeWidth * 0.35;
      const sweepX = geometry.offsetX + geometry.shapeWidth * 0.42;
      const sweepGradient = ctx.createLinearGradient(
        sweepX - sweepWidth,
        0,
        sweepX + sweepWidth,
        0
      );
      sweepGradient.addColorStop(0, "rgba(40, 44, 72, 0)");
      sweepGradient.addColorStop(0.5, `rgba(120, 122, 180, ${0.28 * (1 - eased)})`);
      sweepGradient.addColorStop(1, "rgba(40, 44, 72, 0)");
      ctx.fillStyle = sweepGradient;
      ctx.fillRect(sweepX - sweepWidth, 0, sweepWidth * 2, height);
      ctx.restore();
    },
    [featherSeeds]
  );

  const drawFrame = useCallback(
    (progress: number) => {
      const transition = transitionRef.current;
      const ctx = ctxRef.current;
      const { width, height } = viewportRef.current;
      if (!ctx || !width || !height) return;
      const fromImage = images[transition.from];
      const toImage = images[transition.to];
      if (!fromImage || !toImage) return;

      ctx.clearRect(0, 0, width, height);
      drawCoverImage(ctx, fromImage, width, height);

      const geometry = computeRavenGeometry(width, height, progress);

      ctx.save();
      traceRavenPath(ctx, geometry.points);
      ctx.clip();
      drawCoverImage(ctx, toImage, width, height);
      ctx.restore();

      ctx.save();
      traceRavenPath(ctx, geometry.points);
      const ravenGradient = ctx.createLinearGradient(
        geometry.offsetX,
        geometry.offsetY - geometry.shapeHeight * 0.5,
        geometry.offsetX + geometry.shapeWidth,
        geometry.offsetY + geometry.shapeHeight * 0.5
      );
      ravenGradient.addColorStop(0, "rgba(6, 6, 10, 0.8)");
      ravenGradient.addColorStop(0.45, "rgba(14, 14, 18, 0.65)");
      ravenGradient.addColorStop(1, "rgba(2, 2, 6, 0.9)");
      ctx.fillStyle = ravenGradient;
      ctx.globalAlpha = 0.75 + 0.15 * (1 - progress);
      ctx.fill();
      ctx.restore();

      drawFeathers(ctx, progress, width, height, geometry);
    },
    [drawFeathers, images]
  );

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
  }, []);

  const animate = useCallback(
    (timestamp: number) => {
      if (!startTimestampRef.current) {
        startTimestampRef.current = timestamp;
      }
      const elapsed = timestamp - startTimestampRef.current;
      const progress = clamp01(elapsed / duration);
      drawFrame(progress);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        isAnimatingRef.current = false;
        setIsAnimating(false);
        setActiveIndex(transitionRef.current.to);
        startTimestampRef.current = 0;
        cancelAnimation();
        drawStatic();
      }
    },
    [cancelAnimation, drawFrame, drawStatic, duration]
  );

  const startTransition = useCallback(() => {
    if (isAnimatingRef.current) return;
    const nextIndex = activeIndex === 0 ? 1 : 0;
    if (!images[activeIndex] || !images[nextIndex]) return;

    transitionRef.current = { from: activeIndex, to: nextIndex };
    isAnimatingRef.current = true;
    setIsAnimating(true);
    startTimestampRef.current = 0;
    cancelAnimation();
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [activeIndex, animate, cancelAnimation, images]);

  useEffect(() => {
    ensureContext();
    resize();
    const handleResize = () => {
      resize();
      if (!isAnimatingRef.current) {
        drawStatic();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimation();
    };
  }, [cancelAnimation, drawStatic, ensureContext, resize]);

  useEffect(() => {
    if (!isAnimatingRef.current) {
      drawStatic();
    }
  }, [drawStatic, images, activeIndex]);

  return {
    startTransition,
    isAnimating,
    activeIndex
  };
};

const DurationControl = ({
  duration,
  onChange
}: {
  duration: number;
  onChange: (value: number) => void;
}) => {
  return (
    <div className="control-group">
      <label htmlFor="duration">Transition Duration</label>
      <div className="control-inline">
        <input
          id="duration"
          type="range"
          min={800}
          max={2400}
          step={50}
          value={duration}
          onChange={event => onChange(Number(event.target.value))}
        />
        <span>{(duration / 1000).toFixed(2)}s</span>
      </div>
    </div>
  );
};

const FilePicker = ({
  label,
  onChange
}: {
  label: string;
  onChange: (file: File | null) => void;
}) => (
  <label className="file-picker">
    <span>{label}</span>
    <input
      type="file"
      accept="image/*"
      onChange={event => onChange(event.target.files?.[0] ?? null)}
    />
  </label>
);

export const RavenTransition = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sources, setSources] = useState<string[]>([...DEFAULT_SOURCES]);
  const [duration, setDuration] = useState(1400);
  const { setUrl } = useObjectUrlManager();
  const featherSeeds = useFeatherSeeds();
  const images = useLoadedImages(sources);

  const transition = useTransitionCanvas(
    canvasRef,
    containerRef,
    images,
    duration,
    featherSeeds
  );

  const replaceSource = useCallback(
    (index: number, file: File | null) => {
      if (!file) return;
      const objectUrl = URL.createObjectURL(file);
      setSources(prev => {
        const next = [...prev];
        next[index] = objectUrl;
        return next;
      });
      setUrl(index, objectUrl);
    },
    [setUrl]
  );

  return (
    <div className="raven-shell">
      <div className="stage" ref={containerRef}>
        <canvas ref={canvasRef} />
        <div className="stage-overlay">
          <div className="badge">Raven Transition</div>
          <button
            type="button"
            className={clsx("trigger", { running: transition.isAnimating })}
            onClick={transition.startTransition}
            disabled={transition.isAnimating}
          >
            {transition.isAnimating ? "Transitioning..." : "Trigger the Raven"}
          </button>
        </div>
      </div>

      <div className="control-panel">
        <h2>Visual Controls</h2>
        <p>
          Load two frames and unleash a raven-shaped wipe to morph between them in a
          single cinematic sweep.
        </p>
        <div className="control-grid">
          <FilePicker label="Primary Frame" onChange={file => replaceSource(0, file)} />
          <FilePicker label="Reveal Frame" onChange={file => replaceSource(1, file)} />
        </div>
        <DurationControl duration={duration} onChange={setDuration} />
        <div className="status">
          <span className="dot" aria-hidden="true" />
          <span>
            Currently showing frame {transition.activeIndex + 1} · Duration {" "}
            {(duration / 1000).toFixed(2)}s
          </span>
        </div>
      </div>
    </div>
  );
};

export default RavenTransition;
