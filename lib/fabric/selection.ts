import * as fabric from "fabric";

// Determine whether an object supports a fill color mutation in our UI.
export const supportsFill = (obj: fabric.Object): boolean => {
    // Exclude images, groups, and active selections themselves.
    const type = (obj as any).type;
    if (type === 'image' || type === 'activeSelection' || type === 'group') return false;
    if ((obj as any).isType?.('image')) return false;
    return 'fill' in obj;
};

// If every object in the selection shares the same fill, return it; otherwise null.
export const extractUnifiedFill = (target: fabric.Object | fabric.ActiveSelection): string | null => {
    if (target.type === 'activeSelection') {
        let unified: string | null = null;
        let mixed = false;
        (target as fabric.ActiveSelection).forEachObject((child: fabric.Object) => {
            if (!supportsFill(child)) return;
            const f = (child as any).fill as string | undefined;
            if (f == null) return;
            if (unified == null) unified = f; else if (unified !== f) mixed = true;
        });
        return mixed ? null : unified;
    }
    return supportsFill(target) ? ((target as any).fill ?? null) : null;
};

export const applyFillToObjectOrSelection = (target: fabric.Object | fabric.ActiveSelection, color: string) => {
    const assign = (o: fabric.Object) => { if (supportsFill(o)) { (o as any).set?.({ fill: color }); o.setCoords(); } };
    if (target.type === 'activeSelection') {
        (target as fabric.ActiveSelection).forEachObject(assign);
    } else {
        assign(target as fabric.Object);
    }
};
