import type * as fabric from "fabric";

export type FabricClipboardEntry =
    | { kind: "image"; clone: fabric.Image }
    | { kind: "selection"; clone: fabric.ActiveSelection }
    | { kind: "object"; clone: fabric.Object };

export const classifyClipboardObject = (obj: fabric.Object): FabricClipboardEntry => {
    const t = (obj as any).type;
    if (t === "image") return { kind: "image", clone: obj as fabric.Image };
    if (t === "activeSelection") return { kind: "selection", clone: obj as any };
    return { kind: "object", clone: obj };
};
