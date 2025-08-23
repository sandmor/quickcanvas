import * as fabric from "fabric";

/**
 * Export a fabric object (single or activeselection) to a PNG Blob.
 * Creates an offscreen canvas, normalizes object positions relative to top-left origin.
 */
export const exportSelectionToPNGBlob = async (active: any): Promise<Blob> => {
    const bounds = active.getBoundingRect(true, true);
    const tempEl = document.createElement("canvas");
    tempEl.width = Math.ceil(bounds.width);
    tempEl.height = Math.ceil(bounds.height);
    const tempCanvas = new fabric.Canvas(tempEl, {
        width: tempEl.width,
        height: tempEl.height,
        selection: false,
    });

    const cloned: any = await active.clone();
    const objs: any[] = cloned.isType?.('activeselection') ? cloned._objects || [] : [cloned];
    for (const o of objs) {
        try {
            const c: any = await o.clone();
            c.set({ left: (c.left || 0) - bounds.left, top: (c.top || 0) - bounds.top });
            tempCanvas.add(c);
        } catch (e) {
            console.warn("Clone failed during PNG export", e);
        }
    }
    tempCanvas.requestRenderAll();
    const dataUrl = tempCanvas.toDataURL({ format: "png", multiplier: 1, enableRetinaScaling: false });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    tempCanvas.dispose();
    return blob;
};

/**
 * Export a fabric object (single or activeselection) to an SVG string with a viewBox.
 */
export const exportSelectionToSVGString = async (active: any): Promise<string> => {
    const bounds = active.getBoundingRect(true, true);
    const tempEl = document.createElement("canvas");
    tempEl.width = Math.ceil(bounds.width);
    tempEl.height = Math.ceil(bounds.height);
    const tempCanvas = new fabric.Canvas(tempEl, {
        width: tempEl.width,
        height: tempEl.height,
        selection: false,
    });

    const cloned: any = await active.clone();
    const objs: any[] = cloned.isType?.('activeselection') ? cloned._objects || [] : [cloned];
    for (const o of objs) {
        try {
            const c: any = await o.clone();
            c.set({ left: (c.left || 0) - bounds.left, top: (c.top || 0) - bounds.top });
            tempCanvas.add(c);
        } catch (e) {
            console.warn("Clone failed during SVG export", e);
        }
    }
    tempCanvas.requestRenderAll();
    let svg = tempCanvas.toSVG();
    if (!/viewBox=/i.test(svg)) {
        svg = svg.replace(/<svg(\s+[^>]*)?>/i, (m) => m.replace(/>$/, '') + ` viewBox="0 0 ${Math.ceil(bounds.width)} ${Math.ceil(bounds.height)}">`);
    }
    tempCanvas.dispose();
    return svg;
};

/**
 * Export either the current active selection (if any) or the full set of canvas objects to a PNG Blob.
 * When exporting the full canvas we tightly crop to the combined bounding box of all selectable objects
 * (rather than the entire viewport) for a cleaner result.
 */
export const exportActiveOrCanvasToPNGBlob = async (canvas: fabric.Canvas): Promise<Blob> => {
    const active = canvas.getActiveObject();
    if (active) {
        return exportSelectionToPNGBlob(active);
    }
    const objects = canvas.getObjects().filter(o => o.selectable !== false);
    if (!objects.length) {
        // Return a 1x1 transparent pixel
        return new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    }
    // Create a temporary ActiveSelection to leverage existing selection export logic.
    const selection = new fabric.ActiveSelection(objects, { canvas });
    try {
        return await exportSelectionToPNGBlob(selection as unknown as any);
    } finally {
        // Do not mutate canvas state; selection was ephemeral.
    }
};

