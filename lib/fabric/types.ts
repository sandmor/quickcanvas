import type * as fabric from "fabric";

export type FabricClipboardEntry =
    | { kind: "image"; clone: fabric.Image }
    | { kind: "selection"; clone: fabric.ActiveSelection }
    | { kind: "object"; clone: fabric.Object };

export const classifyClipboardObject = (obj: fabric.Object): FabricClipboardEntry => {
    const t = obj.type;
    if (t === "image" || obj.isType?.('image')) return { kind: "image", clone: obj as fabric.Image };
    if (obj.isType?.('activeselection')) return { kind: "selection", clone: obj as fabric.ActiveSelection };
    return { kind: "object", clone: obj };
};
