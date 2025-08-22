"use client";
import { create } from "zustand";
import { CanvasTool } from "@/hooks/useFabricCanvas";
import * as fabric from "fabric";
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
    /**
     * Add a fabric object (single / image / activeSelection) to the gallery.
     * Returns the GalleryItem (either newly created or the existing bumped one).
     */
    addToGallery: (obj: fabric.Object | fabric.ActiveSelection) => Promise<GalleryItem>;
    clearGallery: () => void;
    removeFromGallery: (id: string) => void;
}

const genId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return Math.random().toString(36).slice(2, 11);
};

// Maintain an internal checksum index for O(1) dedupe lookups (not exposed in state)
const checksumIndex = new Map<string, string>(); // checksum -> gallery id

// Whitelisted properties for serialization + a few more style/transform properties for fidelity
const SERIALIZE_PROPS = [
    'selectable', 'evented', 'name', 'id', 'left', 'top', 'width', 'height', 'angle', 'scaleX', 'scaleY', 'rx', 'ry',
    'fill', 'stroke', 'strokeWidth', 'opacity', 'flipX', 'flipY', 'shadow', 'strokeDashArray', 'fontSize', 'fontFamily', 'fontWeight'
];

export const useMainStore = create<Mainstore>()((set, get) => ({
    tool: "pointer",
    setTool: (t) => set({ tool: t }),
    gallery: [],
    addToGallery: async (obj) => {
        const serialize = (o: fabric.Object): SerializedFabricObject => {
            const base = (o.toObject?.(SERIALIZE_PROPS) ?? {}) as Record<string, unknown>;
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

        // Normalize for hash (position-invariant, tolerant to micro float noise)
        const round = (n: unknown): number | unknown => typeof n === 'number' && isFinite(n) ? Math.round(n * 100) / 100 : n; // 2dp tolerance
        let normForHash: GalleryPayload = payload;
        try {
            if (kind === 'selection' && Array.isArray(payload) && payload.length) {
                const lefts = payload.map(p => typeof p.left === 'number' ? p.left : 0);
                const tops = payload.map(p => typeof p.top === 'number' ? p.top : 0);
                const minLeft = Math.min(...lefts);
                const minTop = Math.min(...tops);
                normForHash = payload.map(p => {
                    const { left, top, angle, ...rest } = p;
                    return { ...rest, angle: round(angle), left: round((left ?? 0) - minLeft), top: round((top ?? 0) - minTop) } as SerializedFabricObject;
                });
            } else if (payload && !Array.isArray(payload) && typeof payload === 'object') {
                const { left, top, angle, ...rest } = payload as SerializedFabricObject;
                normForHash = { ...rest, angle: round(angle), left: 0, top: 0 } as SerializedFabricObject;
            }
        } catch (e) {
            console.warn('Normalization for hash failed', e);
        }

        // Compute checksum. If it fails, dedupe is skipped for this item.
        let checksum = '';
        try { checksum = await stableHash(normForHash); } catch (e) { console.warn('stableHash failed', e); }

        // Fast O(1) dedupe via checksumIndex (only if checksum produced)
        if (checksum && checksumIndex.has(checksum)) {
            const existingId = checksumIndex.get(checksum)!;
            let bumpedItem: GalleryItem | undefined;
            set(state => {
                const idx = state.gallery.findIndex(g => g.id === existingId);
                if (idx === -1) return state; // index drift; ignore
                const existing = state.gallery[idx];
                bumpedItem = { ...existing, addedAt: Date.now() };
                const newGallery = [bumpedItem!, ...state.gallery.slice(0, idx), ...state.gallery.slice(idx + 1)];
                return { ...state, gallery: newGallery.slice(0, 200) };
            });
            if (bumpedItem) {
                (toast as any).message?.('Resource already in gallery – bumped to top') || toast('Resource already in gallery – bumped to top');
                return bumpedItem!;
            }
        }

        // Thumbnail generation (crop to bounding box; limit max dimension)
        let dataUrl = '';
        const MAX_DIM = 256;
        try {
            const fabricCanvas = (obj.canvas || (obj as unknown as { _canvas?: fabric.Canvas })._canvas) as fabric.Canvas | undefined;
            const bb = obj.getBoundingRect?.();
            if (fabricCanvas && bb) {
                const scale = Math.min(MAX_DIM / bb.width, MAX_DIM / bb.height, 1);
                dataUrl = fabricCanvas.toDataURL({
                    format: 'png',
                    left: bb.left, top: bb.top, width: bb.width, height: bb.height,
                    multiplier: scale
                });
            } else if (bb) {
                // Render offscreen using a temporary StaticCanvas for orphan objects
                const off = document.createElement('canvas');
                const w = Math.min(MAX_DIM, Math.max(16, bb.width));
                const h = Math.min(MAX_DIM, Math.max(16, bb.height));
                off.width = w; off.height = h;
                // Use fabric if available to render (avoids blank thumbnails)
                try {
                    const temp = new (fabric as any).StaticCanvas(off, { renderOnAddRemove: true });
                    const cloned = await (obj as fabric.Object).clone();
                    cloned.set({ left: w / 2 - (bb.width / 2), top: h / 2 - (bb.height / 2) });
                    temp.add(cloned);
                    temp.renderAll();
                    dataUrl = off.toDataURL('image/png');
                    temp.dispose?.();
                } catch {
                    dataUrl = off.toDataURL('image/png');
                }
            }
        } catch (e) {
            console.warn('Thumbnail generation failed', e);
            toast.error("Couldn't generate preview thumbnail. Object still added.");
        }
        // If still empty create minimal transparent pixel to avoid broken img tags
        if (!dataUrl) {
            dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
        }

        const newItem: GalleryItem = { id: genId(), kind, preview: dataUrl, payload, checksum, addedAt: Date.now() };
        if (checksum) checksumIndex.set(checksum, newItem.id);
        let finalItem = newItem;
        set(state => ({ ...state, gallery: [newItem, ...state.gallery].slice(0, 200) }));
        return finalItem;
    },
    clearGallery: () => {
        checksumIndex.clear();
        set({ gallery: [] });
    },
    removeFromGallery: (id: string) => set(state => {
        const item = state.gallery.find(g => g.id === id);
        if (item?.checksum) checksumIndex.delete(item.checksum);
        return { ...state, gallery: state.gallery.filter(g => g.id !== id) };
    }),
}));

export type { Mainstore };
