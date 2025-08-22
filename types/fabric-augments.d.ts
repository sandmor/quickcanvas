import type * as fabric from 'fabric';

declare module 'fabric' {
    // Runtime flags we attach for panning state
    interface Canvas {
        isDragging?: boolean;
        lastPosX?: number;
        lastPosY?: number;
        _groupSelector?: unknown; // internal fabric field accessed defensively
    }
}

declare global {
    interface Window {
        fabricCanvas?: fabric.Canvas;
    }
}

export { };