import type { PaintColour } from './reading';

export type InkColour = PaintColour | 'eraser';
type Point = [number, number];
export type InkSurface = 'text' | 'sketch';
export type InkStroke = { surface: InkSurface; colour: InkColour; points: Point[] };
type Bounds = { left: number; top: number; width: number; height: number };

const pigments: Record<PaintColour, string> = {
  sun: '#ffbf16', rose: '#e4649a', mint: '#66b84e', sky: '#50aee4', lilac: '#a185e2',
};

export function appendInkPoint(stroke: InkStroke, event: PointerEvent, bounds: Bounds) {
  const limit = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;
  const next: Point = [
    limit((event.clientX - bounds.left) / bounds.width),
    limit((event.clientY - bounds.top) / bounds.height),
  ];
  const previous = stroke.points.at(-1);
  if (!previous || Math.hypot((next[0] - previous[0]) * bounds.width, (next[1] - previous[1]) * bounds.height) >= 1) {
    stroke.points.push(next);
  }
}

export function renderInkCanvas(canvas: HTMLCanvasElement, strokes: readonly InkStroke[], draft?: InkStroke) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const resolution = Math.min(devicePixelRatio || 1, 2, 4096 / height, 4096 / width);
  const pixelWidth = Math.ceil(width * resolution);
  const pixelHeight = Math.ceil(height * resolution);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
  context.clearRect(0, 0, width, height);
  const surface = canvas.dataset.inkSurface;
  for (const stroke of strokes) {
    if (stroke.surface === surface) drawStroke(context, stroke, width, height);
  }
  if (draft && draft.surface === surface) drawStroke(context, draft, width, height);
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: InkStroke, width: number, height: number) {
  const points = stroke.points.map(([x, y]): Point => [x * width, y * height]);
  if (!points.length) return;
  const erasing = stroke.colour === 'eraser';
  ctx.globalAlpha = erasing ? 1 : .30;
  ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
  const colour = stroke.colour === 'eraser' ? '#000000' : pigments[stroke.colour];
  ctx.strokeStyle = ctx.fillStyle = colour;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.lineWidth = erasing ? 30 : 19;

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0], points[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const point = points[index];
    // A sharp turnaround starts a new pass so rubbing back and forth builds
    // ink within one gesture. The rest of a pass has even opacity at joins.
    if (!erasing && index > 1 && reverses(points[index - 2], previous, point)) {
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(...previous);
    }
    ctx.lineTo(...point);
  }
  ctx.stroke();
}

function reverses(a: Point, b: Point, c: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const nextX = c[0] - b[0], nextY = c[1] - b[1];
  const length = Math.hypot(dx, dy) * Math.hypot(nextX, nextY);
  return length >= 8 && dx * nextX + dy * nextY < -.72 * length;
}
