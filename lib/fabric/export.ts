import * as fabric from "fabric";

/**
 * Export a fabric object (single or activeSelection) to a PNG Blob.
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
    const objs: any[] = cloned.type === "activeSelection" ? cloned._objects || [] : [cloned];
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
 * Export a fabric object (single or activeSelection) to an SVG string with a viewBox.
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
    const objs: any[] = cloned.type === "activeSelection" ? cloned._objects || [] : [cloned];
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
