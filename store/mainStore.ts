"use client";
import { create } from "zustand";
import { CanvasTool } from "@/hooks/useFabricCanvas";
import type * as fabric from "fabric";
import { toast } from "sonner";
import { stableHash } from "@/lib/utils";

// Representation of a gallery resource (persisted in-memory for now)
// We store: id, kind, a lightweight preview (dataURL), and a serialized object JSON
export interface GalleryItem {
    id: string;
    kind: "image" | "object" | "selection" | "unknown";
    preview: string; // data URL (png) used as thumbnail
    payload: any; // fabric JSON representation (object or array for selection)
    checksum: string; // stable hash for dedupe
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
        // Compute checksum for payload to detect duplicates; ignore transient meta.
        let checksum = '';
        try { checksum = await stableHash(payload); } catch (e) { console.warn("stableHash failed", e); }
        if (checksum) {
            const existing = get().gallery.find(g => g.checksum === checksum);
            if (existing) {
                // Move existing to front, update timestamp; no duplicate insertion.
                const remainder = get().gallery.filter(g => g.id !== existing.id);
                const bumped = { ...existing, addedAt: Date.now() };
                set({ gallery: [bumped, ...remainder].slice(0, 200) });
                // Use toast.message if available else generic toast
                (toast as any).message?.("Resource already in gallery – bumped to top") || toast("Resource already in gallery – bumped to top");
                return;
            }
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
            console.warn("Thumbnail generation failed", e);
            toast.error("Couldn't generate preview thumbnail. Object still added.");
        }
        const newItem: GalleryItem = { id: genId(), kind, preview: dataUrl, payload, checksum, addedAt: Date.now() };
        set({ gallery: [newItem, ...get().gallery].slice(0, 200) }); // cap to 200 to avoid unbounded growth
    },
    clearGallery: () => set({ gallery: [] }),
}));

export type { Mainstore };
