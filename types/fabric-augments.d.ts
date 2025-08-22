import type * as fabric from 'fabric';

declare module 'fabric' {
    // Runtime flags we attach for panning state
    interface Canvas {
        isDragging?: boolean;
        lastPosX?: number;
        lastPosY?: number;
        _groupSelector?: unknown; // internal fabric field accessed defensively
        __qcLoading?: boolean; // quickcanvas: true while loading doc JSON
    }
    interface FabricObject {
        qcId?: string; // internal quickcanvas id for history tracking
    }
}

declare global {
    interface Window {
        fabricCanvas?: fabric.Canvas;
    }
}

export { };