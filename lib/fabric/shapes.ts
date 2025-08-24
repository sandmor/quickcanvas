import * as fabric from "fabric";

export type ShapeKind = "rect" | "ellipse" | "line";

export interface ShapeStyle {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    rx?: number; // rectangle corner radius
    ry?: number;
    opacity?: number;
}

export interface ShapeCreateContext {
    kind: ShapeKind;
    origin: fabric.Point; // world-space origin where drag started
    object: fabric.Object | null; // lazily created once drag surpasses threshold
    started: boolean; // true once object created / drag threshold met
}

// Default style definitions – central place to tweak visual language.
const DEFAULT_STYLES: Record<ShapeKind, ShapeStyle> = {
    rect: { fill: "#2563eb", rx: 4, ry: 4 },
    ellipse: { fill: "#16a34a" },
    line: { stroke: "#0f172a", strokeWidth: 3 },
};

export interface InsertOptions {
    at: fabric.Point; // world point to center shape
    autoSelect?: boolean;
    overrides?: ShapeStyle & { width?: number; height?: number; radius?: number; }; // selective overrides
}

// Programmatic insertion (e.g. command palette, future UI buttons) – centers shape at point.
export const insertShape = (canvas: fabric.Canvas, kind: ShapeKind, opts: InsertOptions): fabric.Object => {
    const style = { ...DEFAULT_STYLES[kind], ...(opts.overrides || {}) } as ShapeStyle & { width?: number; height?: number; radius?: number; };
    let obj: fabric.Object;
    if (kind === 'rect') {
        const width = style.width ?? 160;
        const height = style.height ?? 100;
        obj = new fabric.Rect({
            width,
            height,
            fill: style.fill,
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            rx: style.rx,
            ry: style.ry,
            opacity: style.opacity,
            originX: 'center',
            originY: 'center'
        });
    } else if (kind === 'ellipse') {
        const radius = style.radius ?? 60;
        // Default insertion keeps previous centered circle behavior (use ellipse for flexibility)
        obj = new fabric.Ellipse({
            rx: radius, ry: radius,
            fill: style.fill,
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            opacity: style.opacity,
            originX: 'center',
            originY: 'center'
        });
    } else if (kind === 'line') {
        const length = style.width ?? 160;
        // Horizontal default line centered at insertion
        obj = new fabric.Line([-length / 2, 0, length / 2, 0], {
            stroke: style.stroke || '#0f172a',
            strokeWidth: style.strokeWidth ?? 3,
            opacity: style.opacity,
            originX: 'center',
            originY: 'center'
        });
    } else {
        throw new Error(`Unsupported shape kind: ${kind}`);
    }
    obj.setPositionByOrigin(new fabric.Point(opts.at.x, opts.at.y), 'center', 'center');
    canvas.add(obj);
    if (opts.autoSelect !== false) {
        canvas.setActiveObject(obj);
    }
    canvas.requestRenderAll();
    return obj;
};

// Lazy creation during drag: update dimensions based on current pointer.
// Returns updated context (mutated in place) and underlying fabric object if present.
export const updateDraggingShape = (
    canvas: fabric.Canvas,
    ctx: ShapeCreateContext,
    current: fabric.Point,
    opts?: { maintainAspect?: boolean; minSize?: number; fromCenter?: boolean }
): fabric.Object | null => {
    const { kind, origin } = ctx;
    const minSize = opts?.minSize ?? 4;
    const maintainAspect = opts?.maintainAspect ?? false;
    const fromCenter = opts?.fromCenter ?? false;
    const dx = current.x - origin.x;
    const dy = current.y - origin.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!ctx.started) {
        const threshold = 6;
        if (Math.max(absDx, absDy) < threshold) return null;
        ctx.object = ((): fabric.Object => {
            if (kind === 'rect') return new fabric.Rect({ width: 1, height: 1, ...DEFAULT_STYLES.rect, originX: 'left', originY: 'top' });
            if (kind === 'ellipse') return new fabric.Ellipse({ rx: 1, ry: 1, ...DEFAULT_STYLES.ellipse, originX: 'left', originY: 'top' });
            if (kind === 'line') return new fabric.Line([origin.x, origin.y, origin.x, origin.y], { ...DEFAULT_STYLES.line, stroke: DEFAULT_STYLES.line.stroke || '#0f172a', strokeWidth: DEFAULT_STYLES.line.strokeWidth ?? 3 });
            throw new Error('Unsupported shape kind');
        })();
        canvas.add(ctx.object);
        ctx.started = true;
    }
    if (!ctx.object) return null;

    if (kind === 'rect') {
        let left: number; let top: number; let width: number; let height: number;
        if (fromCenter) {
            width = Math.abs(dx) * 2; height = Math.abs(dy) * 2;
            if (maintainAspect) { const size = Math.max(width, height); width = size; height = size; }
            left = origin.x - width / 2; top = origin.y - height / 2;
        } else {
            width = dx; height = dy; left = origin.x; top = origin.y;
            if (width < 0) { left += width; width = Math.abs(width); }
            if (height < 0) { top += height; height = Math.abs(height); }
            if (maintainAspect) {
                const size = Math.max(width, height);
                if (dx < 0) left = origin.x - size; else left = origin.x;
                if (dy < 0) top = origin.y - size; else top = origin.y;
                width = size; height = size;
            }
        }
        width = Math.max(minSize, width); height = Math.max(minSize, height);
        ctx.object.set({ left, top, width, height });
        ctx.object.setCoords();
    } else if (kind === 'ellipse') {
        let w: number; let h: number; let left: number; let top: number;
        if (fromCenter) {
            w = Math.abs(dx) * 2; h = Math.abs(dy) * 2;
            if (maintainAspect) { const size = Math.max(w, h); w = size; h = size; }
            left = origin.x - w / 2; top = origin.y - h / 2;
        } else {
            w = dx; h = dy; left = origin.x; top = origin.y;
            if (w < 0) { left += w; w = Math.abs(w); }
            if (h < 0) { top += h; h = Math.abs(h); }
            if (maintainAspect) {
                const size = Math.max(w, h);
                if (dx < 0) left = origin.x - size; else left = origin.x;
                if (dy < 0) top = origin.y - size; else top = origin.y;
                w = size; h = size;
            }
        }
        w = Math.max(minSize, w); h = Math.max(minSize, h);
        ctx.object.set({ left, top });
        ctx.object.set({ rx: w / 2, ry: h / 2 });
        ctx.object.setCoords();
    } else if (kind === 'line') {
        let x2 = origin.x + dx; let y2 = origin.y + dy;
        if (maintainAspect) {
            const ang = Math.atan2(dy, dx);
            const snap = Math.PI / 4; const snapped = Math.round(ang / snap) * snap;
            const len = Math.sqrt(dx * dx + dy * dy);
            x2 = origin.x + Math.cos(snapped) * len;
            y2 = origin.y + Math.sin(snapped) * len;
        }
        ctx.object.set({ x1: origin.x, y1: origin.y, x2, y2 });
        ctx.object.setCoords();
    }
    canvas.requestRenderAll();
    return ctx.object;
};

export const finalizeDraggingShape = (canvas: fabric.Canvas, ctx: ShapeCreateContext): fabric.Object | null => {
    if (!ctx.started || !ctx.object) return null;
    ctx.object.set({ evented: true });
    canvas.setActiveObject(ctx.object);
    canvas.requestRenderAll();
    return ctx.object;
};
