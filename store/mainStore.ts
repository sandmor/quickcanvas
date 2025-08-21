"use client";
import { create } from "zustand";
import { CanvasTool } from "@/hooks/useFabricCanvas";
import type * as fabric from "fabric";

// Representation of a gallery resource (persisted in-memory for now)
// We store: id, kind, a lightweight preview (dataURL), and a serialized object JSON
export interface GalleryItem {
    id: string;
    kind: "image" | "object" | "selection" | "unknown";
    preview: string; // data URL (png) used as thumbnail
    payload: any; // fabric JSON representation (object or array for selection)
    addedAt: number;
}

interface Mainstore {
    tool: CanvasTool;
    setTool: (t: CanvasTool) => void;
    gallery: GalleryItem[];
    addToGallery: (obj: fabric.Object | fabric.ActiveSelection) => Promise<void>;
    clearGallery: () => void;
}

const genId = () => Math.random().toString(36).slice(2, 11);

export const useMainStore = create<Mainstore>()((set, get) => ({
    tool: "pointer",
    setTool: (t) => set({ tool: t }),
    gallery: [],
    addToGallery: async (obj) => {
        // Clone to avoid side effects; for selection, capture each object.
        const serialize = (o: any) => o.toObject?.(['selectable', 'evented', 'name', 'id']) ?? {};
        let payload: any;
        let kind: GalleryItem['kind'] = 'object';
        if ((obj as any).type === 'activeSelection') {
            kind = 'selection';
            const items: any[] = [];
            (obj as any).forEachObject((child: any) => items.push(serialize(child)));
            payload = items;
        } else if ((obj as any).type === 'image') {
            kind = 'image';
            payload = serialize(obj);
        } else {
            payload = serialize(obj);
        }
        // Generate thumbnail PNG
        const canvasEl = document.createElement('canvas');
        const fabricCanvas = (obj.canvas || (obj as any)._canvas) as fabric.Canvas | undefined;
        // If object not on a canvas (unlikely), temporary canvas for export
        let dataUrl = '';
        try {
            if (fabricCanvas) {
                const origSel = fabricCanvas.getActiveObject();
                // Use built-in toDataURL on object for simplicity
                dataUrl = (obj as any).toDataURL?.({ format: 'png', multiplier: 0.5 }) || fabricCanvas.toDataURL({ format: 'png', multiplier: 0.5 } as any);
                if (origSel) fabricCanvas.setActiveObject(origSel);
            } else {
                // fallback: draw bounding box snapshot
                const bb: any = (obj as any).getBoundingRect?.();
                if (bb) { canvasEl.width = Math.max(32, Math.min(512, bb.width)); canvasEl.height = Math.max(32, Math.min(512, bb.height)); }
                dataUrl = canvasEl.toDataURL('image/png');
            }
        } catch (e) {
            // swallow
        }
        const newItem: GalleryItem = { id: genId(), kind, preview: dataUrl, payload, addedAt: Date.now() };
        set({ gallery: [newItem, ...get().gallery].slice(0, 200) }); // cap to 200 to avoid unbounded growth
    },
    clearGallery: () => set({ gallery: [] }),
}));

export type { Mainstore };
