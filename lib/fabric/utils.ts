import * as fabric from "fabric";

export const centerObjectAt = (obj: fabric.Object, target: fabric.Point) => {
    obj.setPositionByOrigin(new fabric.Point(target.x, target.y), "center", "center");
    obj.setCoords();
};

export const addObjectsAsSelection = (objects: fabric.Object[], canvas: fabric.Canvas, target: fabric.Point) => {
    const selection = new fabric.ActiveSelection(objects, { canvas });
    centerObjectAt(selection, target);
    canvas.setActiveObject(selection);
    canvas.requestRenderAll();
};

export const invertPointThroughViewport = (canvas: fabric.Canvas, screenPoint: fabric.Point) => {
    const vpt = canvas.viewportTransform as number[] | null;
    if (vpt) {
        const inv = (fabric as any).util.invertTransform(vpt);
        return (fabric as any).util.transformPoint(screenPoint, inv);
    }
    return screenPoint;
};

export const getCanvasCenterWorld = (canvas: fabric.Canvas) => {
    const screenCenter = new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
    return invertPointThroughViewport(canvas, screenCenter);
};

// Unified helper: find world-space center of current viewport & center object/selection there
export const centerInViewport = (canvas: fabric.Canvas, obj: fabric.Object) => {
    const center = getCanvasCenterWorld(canvas);
    centerObjectAt(obj, center);
};
