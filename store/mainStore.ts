"use client";
import { create } from "zustand";
import { CanvasTool } from "@/hooks/useFabricCanvas";
import type * as fabric from "fabric";
import { toast } from "sonner";
import { stableHash } from "@/lib/utils";

// Representation of a gallery resource (persisted in-memory for now)
// We store: id, kind, a lightweight preview (dataURL), and a serialized object JSON
// Minimal serialized representation for a single fabric object we care about.
export interface SerializedFabricObject {
    id?: string;
    name?: string;
    left?: number; top?: number; width?: number; height?: number;
    angle?: number; scaleX?: number; scaleY?: number; rx?: number; ry?: number;
    fill?: string; stroke?: string; strokeWidth?: number; opacity?: number;
    selectable?: boolean; evented?: boolean;
    // Allow passthrough extra props without widening to any – index signature with unknown.
    [extra: string]: unknown;
}

export type GalleryPayload = SerializedFabricObject | SerializedFabricObject[];

export interface GalleryItem {
    id: string;
    kind: "image" | "object" | "selection" | "unknown";
    preview: string; // data URL (png) used as thumbnail
    payload: GalleryPayload; // fabric JSON representation (object or array for selection)
    checksum: string; // stable hash for dedupe
    addedAt: number;
}

interface Mainstore {
    tool: CanvasTool;
    setTool: (t: CanvasTool) => void;
    gallery: GalleryItem[];
    addToGallery: (obj: fabric.Object | fabric.ActiveSelection) => Promise<void>;
    clearGallery: () => void;
    removeFromGallery: (id: string) => void;
}

const genId = () => Math.random().toString(36).slice(2, 11);

export const useMainStore = create<Mainstore>()((set, get) => ({
    tool: "pointer",
    setTool: (t) => set({ tool: t }),
    gallery: [],
    addToGallery: async (obj) => {
        const serialize = (o: fabric.Object): SerializedFabricObject => {
            // toObject typing returns any; cast to our structured subset.
            const base = (o.toObject?.([
                'selectable', 'evented', 'name', 'id', 'left', 'top', 'width', 'height', 'angle', 'scaleX', 'scaleY', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth', 'opacity'
            ]) ?? {}) as Record<string, unknown>;
            return base as SerializedFabricObject;
        };
        let payload: GalleryPayload;
        let kind: GalleryItem['kind'] = 'object';
        const isSelection = (obj.type === 'activeSelection');
        const isImage = (obj.type === 'image');
        if (isSelection) {
            kind = 'selection';
            const items: SerializedFabricObject[] = [];
            (obj as fabric.ActiveSelection).forEachObject((child: fabric.Object) => items.push(serialize(child)));
            payload = items;
        } else if (isImage) {
            kind = 'image';
            payload = serialize(obj as fabric.Object);
        } else {
            payload = serialize(obj as fabric.Object);
        }
        // Normalize for hash
        const round = (n: unknown): number | unknown => typeof n === 'number' && isFinite(n) ? Math.round(n * 1000) / 1000 : n;
        let normForHash: GalleryPayload = payload;
        try {
            if (kind === 'selection' && Array.isArray(payload) && payload.length) {
                const lefts = payload.map(p => typeof p.left === 'number' ? p.left : 0);
                const tops = payload.map(p => typeof p.top === 'number' ? p.top : 0);
                const minLeft = Math.min(...lefts);
                const minTop = Math.min(...tops);
                normForHash = payload.map(p => {
                    const { left, top, ...rest } = p;
                    return { ...rest, left: round((left ?? 0) - minLeft), top: round((top ?? 0) - minTop) } as SerializedFabricObject;
                });
            } else if (payload && !Array.isArray(payload) && typeof payload === 'object') {
                const { left, top, ...rest } = payload as SerializedFabricObject;
                normForHash = { ...rest, left: 0, top: 0 } as SerializedFabricObject;
            }
        } catch (e) {
            console.warn('Normalization for hash failed', e);
        }
        let checksum = '';
        try { checksum = await stableHash(normForHash); } catch (e) { console.warn("stableHash failed", e); }
        if (checksum) {
            const existing = get().gallery.find(g => g.checksum === checksum);
            if (existing) {
                const remainder = get().gallery.filter(g => g.id !== existing.id);
                const bumped = { ...existing, addedAt: Date.now() };
                set({ gallery: [bumped, ...remainder].slice(0, 200) });
                (toast as any).message?.("Resource already in gallery – bumped to top") || toast("Resource already in gallery – bumped to top");
                return;
            }
        }
        // Thumbnail generation
        const canvasEl = document.createElement('canvas');
        // Some objects (cloned) may not have canvas yet; _canvas is private, access guarded.
        const fabricCanvas = (obj.canvas || (obj as unknown as { _canvas?: fabric.Canvas })._canvas) as fabric.Canvas | undefined;
        let dataUrl = '';
        try {
            if (fabricCanvas) {
                const origSel = fabricCanvas.getActiveObject();
                const maybeObj = obj as fabric.Object & { toDataURL?: (opts?: any) => string };
                dataUrl = maybeObj.toDataURL?.({ format: 'png', multiplier: 0.5 }) || fabricCanvas.toDataURL({ format: 'png', multiplier: 0.5 });
                if (origSel) fabricCanvas.setActiveObject(origSel);
            } else {
                const bb = obj.getBoundingRect?.();
                if (bb) { canvasEl.width = Math.max(32, Math.min(512, bb.width)); canvasEl.height = Math.max(32, Math.min(512, bb.height)); }
                dataUrl = canvasEl.toDataURL('image/png');
            }
        } catch (e) {
            console.warn("Thumbnail generation failed", e);
            toast.error("Couldn't generate preview thumbnail. Object still added.");
        }
        const newItem: GalleryItem = { id: genId(), kind, preview: dataUrl, payload, checksum, addedAt: Date.now() };
        set({ gallery: [newItem, ...get().gallery].slice(0, 200) });
    },
    clearGallery: () => set({ gallery: [] }),
    removeFromGallery: (id: string) => set({ gallery: get().gallery.filter(g => g.id !== id) }),
}));

export type { Mainstore };
