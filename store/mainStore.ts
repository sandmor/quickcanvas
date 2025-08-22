"use client";

import { create } from "zustand";
import { CanvasTool } from "@/types/canvas";
import * as fabric from "fabric";
import { toast } from "sonner";
import { stableHash } from "@/lib/utils";
import { applyFillToObjectOrSelection, extractUnifiedFill, supportsFill } from "@/lib/fabric/selection";
import { recordReorder, ensureObjectId, recordPropertyMutation, commandManager } from '@/lib/history/commandManager';

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
    // Active document id & collection cache
    documentId: string | null;
    documentName: string;
    documents: { id: string; name: string; updatedAt: number; preview?: string }[]; // lightweight list
    documentDirty: boolean; // unsaved local mutations since last persisted snapshot
    loadDocuments: () => Promise<void>;
    createDocument: (name?: string) => Promise<void>;
    loadDocument: (id: string, canvas?: fabric.Canvas) => Promise<void>;
    renameDocument: (id: string, name: string) => Promise<void>;
    deleteDocument: (id: string, activeCanvas?: fabric.Canvas) => Promise<void>;
    saveDocument: (canvas?: fabric.Canvas, opts?: { force?: boolean }) => Promise<void>;
    markDirty: () => void; // mark active doc dirty; debounced autosave will pick up
    tool: CanvasTool;
    setTool: (t: CanvasTool) => void;
    // Selection (centralized info derived from fabric canvas)
    selection: {
        has: boolean;
        type: string | null; // fabric object type or 'activeSelection'
        editingText: boolean;
        fill: string | null; // unified fill across selection or null if mixed / unsupported
        // Shape-specific unified properties (extensible). Only populated when all selected objects share a shape kind.
        shape?: {
            kind: string; // e.g. 'rect', 'ellipse'
            // Rectangle specific
            rect?: { rx: number | null; ry: number | null };
        } | null;
        // Capability flags (render gating). Add new flags here instead of ad-hoc UI conditionals.
        capabilities?: {
            fill: boolean;           // at least one object supports fill
            cornerRadius: boolean;   // all objects are rects (unified corner radius editing)
        };
    };
    setSelectionFromCanvas: (canvas: fabric.Canvas) => void;
    applyFillToSelection: (canvas: fabric.Canvas, color: string) => void;
    applyRectCornerRadiusToSelection: (canvas: fabric.Canvas, radius: { rx?: number; ry?: number }, opts?: { record?: boolean }) => void;
    deleteSelection: (canvas: fabric.Canvas) => void;
    bringForward: (canvas: fabric.Canvas) => void;
    sendBackward: (canvas: fabric.Canvas) => void;
    bringToFront: (canvas: fabric.Canvas) => void;
    sendToBack: (canvas: fabric.Canvas) => void;
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
    'fill', 'stroke', 'strokeWidth', 'opacity', 'flipX', 'flipY', 'shadow', 'strokeDashArray',
    // Text specific
    'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'underline', 'linethrough', 'overline', 'charSpacing', 'lineHeight', 'textAlign'
];

export const useMainStore = create<Mainstore>()((set, get) => ({
    tool: "pointer",
    setTool: (t) => set({ tool: t }),
    documentId: null,
    documentName: 'Untitled',
    documents: [],
    documentDirty: false,
    loadDocuments: async () => {
        const { db } = await import('@/lib/db');
        console.log('Loading documents...');
        const docs = await db.documents.orderBy('updatedAt').reverse().toArray();
        console.log('Loaded documents:', docs);
        set({ documents: docs.map(d => ({ id: d.id, name: d.name, updatedAt: d.updatedAt, preview: d.preview })) });
    },
    createDocument: async (name = 'Untitled') => {
        const { db, generateId, computeStableHash } = await import('@/lib/db');
        const id = generateId();
        const now = Date.now();
        const emptyData = { version: '5', objects: [] };
        const contentHash = await computeStableHash(emptyData);
        await db.documents.put({ id, name, createdAt: now, updatedAt: now, data: emptyData, contentHash });
        set(state => ({ documentId: id, documentName: name, documentDirty: false, documents: [{ id, name, updatedAt: now }, ...state.documents] }));
        try { localStorage.setItem('qc:lastDoc', id); } catch { }
    },
    loadDocument: async (id, canvas) => {
        const { db } = await import('@/lib/db');
        const rec = await db.documents.get(id);
        if (!rec) { toast.error('Document not found'); return; }
        // Short-circuit if already active (and no canvas reload requested)
        if (get().documentId === id && !canvas) return;
        if (canvas) {
            try {
                canvas.__qcLoading = true;
                commandManager.clear();
                // fabric v6: loadFromJSON returns Promise<void>
                await (canvas as unknown as { loadFromJSON: (json: any) => Promise<void> }).loadFromJSON(rec.data);
                canvas.renderAll();
                canvas.discardActiveObject();
            } catch (e) {
                console.warn('Failed to load document', e);
                toast.error('Failed to load document');
            } finally {
                canvas.__qcLoading = false;
                try { get().setSelectionFromCanvas(canvas); } catch { }
            }
        }
        set({ documentId: rec.id, documentName: rec.name, documentDirty: false });
        try { localStorage.setItem('qc:lastDoc', rec.id); } catch { }
        // Refresh list ordering asynchronously (do not await)
        get().loadDocuments();
    },
    renameDocument: async (id, name) => {
        const { db } = await import('@/lib/db');
        await db.documents.update(id, { name, updatedAt: Date.now() });
        set(state => ({ documentName: state.documentId === id ? name : state.documentName, documents: state.documents.map(d => d.id === id ? { ...d, name } : d) }));
    },
    deleteDocument: async (id, activeCanvas) => {
        const { db } = await import('@/lib/db');
        await db.documents.delete(id);
        set(state => ({ documents: state.documents.filter(d => d.id !== id) }));
        const st = get();
        if (st.documentId === id) {
            // If we deleted active doc, create a new one.
            await get().createDocument('Untitled');
            if (activeCanvas) activeCanvas.clear();
        }
        try {
            const last = get().documentId; if (last) localStorage.setItem('qc:lastDoc', last); else localStorage.removeItem('qc:lastDoc');
        } catch { }
    },
    saveDocument: async (canvas, opts) => {
        const { documentId, documentDirty } = get();
        if (!documentId) return;
        if (!opts?.force && !documentDirty) return; // skip if not dirty
        const { db, computeStableHash } = await import('@/lib/db');
        const rec = await db.documents.get(documentId); if (!rec) return;
        let data = rec.data;
        try {
            if (canvas) {
                // We store plain object JSON; toJSON returns fabric objects array, we keep that.
                data = canvas.toJSON();
            }
        } catch (e) { console.warn('Serialize canvas failed', e); }
        const contentHash = await computeStableHash({ objects: (data as any).objects });
        const now = Date.now();
        // Generate preview (throttled size) – capture bounding box of all objects.
        let preview = rec.preview; // reuse if we fail
        if (canvas) {
            try {
                const objs = canvas.getObjects().filter(o => o.selectable !== false);
                if (objs.length) {
                    const sel = new fabric.ActiveSelection(objs, { canvas });
                    const bb = sel.getBoundingRect();
                    const MAX = 300; const scale = Math.min(MAX / bb.width, MAX / bb.height, 1);
                    preview = canvas.toDataURL({ format: 'png', left: bb.left, top: bb.top, width: bb.width, height: bb.height, multiplier: scale });
                } else {
                    preview = undefined;
                }
            } catch { }
        }
        await db.documents.put({ ...rec, data, contentHash, updatedAt: now, preview });
        set(state => ({ documentDirty: false, documents: state.documents.map(d => d.id === documentId ? { ...d, updatedAt: now, preview } : d) }));
        try { localStorage.setItem('qc:lastDoc', documentId); } catch { }
    },
    markDirty: () => set({ documentDirty: true }),
    selection: { has: false, type: null, editingText: false, fill: null, shape: null, capabilities: { fill: false, cornerRadius: false } },
    setSelectionFromCanvas: (canvas) => {
        const active = canvas.getActiveObject() as fabric.Object | fabric.ActiveSelection | null;
        const editingText = !!active && active.type === 'i-text' && (active as any).isEditing;
        let fill: string | null = null;
        let shape: Mainstore['selection']['shape'] = null;
        let capabilities: NonNullable<Mainstore['selection']['capabilities']> = { fill: false, cornerRadius: false };
        if (active && !editingText) {
            fill = extractUnifiedFill(active);
            // Shape kind detection (all rects, all ellipses, etc.) – extensible
            const collect: fabric.Object[] = [];
            if (active.type === 'activeSelection') (active as fabric.ActiveSelection).forEachObject(o => collect.push(o)); else collect.push(active);
            if (collect.length) {
                // Capability: fill if any object supports fill
                capabilities.fill = collect.some(o => supportsFill(o));
                const allTypes = new Set(collect.map(o => o.type));
                if (allTypes.size === 1) {
                    const onlyType = collect[0].type;
                    if (onlyType === 'rect') {
                        const rxVals = new Set<number>();
                        const ryVals = new Set<number>();
                        collect.forEach(o => {
                            const r = o as any; if (typeof r.rx === 'number') rxVals.add(r.rx); if (typeof r.ry === 'number') ryVals.add(r.ry);
                        });
                        shape = {
                            kind: 'rect',
                            rect: {
                                rx: rxVals.size === 1 ? [...rxVals][0] : null,
                                ry: ryVals.size === 1 ? [...ryVals][0] : null,
                            }
                        };
                        capabilities.cornerRadius = true; // unified rect radius editing
                    } else if (onlyType === 'ellipse') {
                        shape = { kind: 'ellipse' }; // placeholders for future ellipse-specific props
                    }
                }
                // Corner radius only when all are rects (already gated above). For mixed future shapes, keep false.
            }
        }
        set({ selection: { has: !!active && !editingText, type: active?.type || null, editingText, fill, shape, capabilities } });
    },
    applyFillToSelection: (canvas, color) => {
        const active = canvas.getActiveObject() as fabric.Object | fabric.ActiveSelection | null; if (!active) return;
        applyFillToObjectOrSelection(active, color);
        canvas.requestRenderAll();
        // Update unified fill immediately
        set(state => ({ selection: { ...state.selection, fill: color } }));
    },
    applyRectCornerRadiusToSelection: (canvas, radius) => {
        const active = canvas.getActiveObject() as fabric.Object | fabric.ActiveSelection | null; if (!active) return;
        const objs: fabric.Object[] = [];
        if (active.type === 'activeSelection') (active as fabric.ActiveSelection).forEachObject(o => objs.push(o)); else objs.push(active);
        const rects = objs.filter(o => o.type === 'rect');
        if (!rects.length) return;
        rects.forEach(ensureObjectId);
        const before: { qcId: string; props: { rx: number; ry: number } }[] = [];
        const after: { qcId: string; props: { rx: number; ry: number } }[] = [];
        rects.forEach(r => {
            const anyR = r as any;
            const currentRx = typeof anyR.rx === 'number' ? anyR.rx : 0;
            const currentRy = typeof anyR.ry === 'number' ? anyR.ry : 0;
            const nextRx = radius.rx != null ? Math.max(0, radius.rx) : currentRx;
            const nextRy = radius.ry != null ? Math.max(0, radius.ry) : currentRy;
            if (nextRx !== currentRx || nextRy !== currentRy) {
                before.push({ qcId: anyR.qcId, props: { rx: currentRx, ry: currentRy } });
                anyR.set?.({ rx: nextRx, ry: nextRy });
                anyR.setCoords();
                after.push({ qcId: anyR.qcId, props: { rx: nextRx, ry: nextRy } });
            }
        });
        if (after.length) {
            canvas.requestRenderAll();
            recordPropertyMutation(canvas, before, after, 'Corner Radius', true);
        }
        // Refresh selection snapshot (unified rx/ry)
        get().setSelectionFromCanvas(canvas);
    },
    deleteSelection: (canvas) => {
        const active = canvas.getActiveObject() as any; if (!active) return;
        if (active.type === 'activeSelection') {
            (active as fabric.ActiveSelection).forEachObject((o: fabric.Object) => canvas.remove(o));
        } else {
            canvas.remove(active);
        }
        canvas.discardActiveObject(); canvas.requestRenderAll();
        set({ selection: { has: false, type: null, editingText: false, fill: null } });
    },
    bringForward: (canvas) => {
        const active = canvas.getActiveObject(); if (!active) return;
        const selection: fabric.Object[] = [];
        if (active.type === 'activeSelection') (active as fabric.ActiveSelection).forEachObject(o => selection.push(o)); else selection.push(active);
        if (!selection.length) return;
        canvas.getObjects().forEach(ensureObjectId);
        const before = canvas.getObjects().map(o => o.qcId || '');
        // Move each object one step forward preserving relative order (topmost first)
        const ordered = [...selection].sort((a, b) => canvas._objects.indexOf(b) - canvas._objects.indexOf(a));
        ordered.forEach(o => (canvas as any).bringObjectForward?.(o) ?? canvas.bringObjectForward(o));
        const after = canvas.getObjects().map(o => o.qcId || '');
        recordReorder(canvas, before, after, 'Bring Forward');
        get().setSelectionFromCanvas(canvas); // trigger UI update for disable logic
    },
    sendBackward: (canvas) => {
        const active = canvas.getActiveObject(); if (!active) return;
        const selection: fabric.Object[] = [];
        if (active.type === 'activeSelection') (active as fabric.ActiveSelection).forEachObject(o => selection.push(o)); else selection.push(active);
        if (!selection.length) return;
        canvas.getObjects().forEach(ensureObjectId);
        const before = canvas.getObjects().map(o => o.qcId || '');
        const ordered = [...selection].sort((a, b) => canvas._objects.indexOf(a) - canvas._objects.indexOf(b));
        ordered.forEach(o => (canvas as any).sendObjectBackwards?.(o) ?? canvas.sendObjectBackwards(o));
        const after = canvas.getObjects().map(o => o.qcId || '');
        recordReorder(canvas, before, after, 'Send Backward');
        get().setSelectionFromCanvas(canvas);
    },
    bringToFront: (canvas) => {
        const active = canvas.getActiveObject(); if (!active) return;
        const selection: fabric.Object[] = [];
        if (active.type === 'activeSelection') (active as fabric.ActiveSelection).forEachObject(o => selection.push(o)); else selection.push(active);
        if (!selection.length) return;
        canvas.getObjects().forEach(ensureObjectId);
        const before = canvas.getObjects().map(o => o.qcId || '');
        const ordered = [...selection].sort((a, b) => canvas._objects.indexOf(a) - canvas._objects.indexOf(b));
        ordered.forEach(o => (canvas as any).bringObjectToFront?.(o) ?? canvas.bringObjectToFront(o));
        const after = canvas.getObjects().map(o => o.qcId || '');
        recordReorder(canvas, before, after, 'Bring To Front');
        get().setSelectionFromCanvas(canvas);
    },
    sendToBack: (canvas) => {
        const active = canvas.getActiveObject(); if (!active) return;
        const selection: fabric.Object[] = [];
        if (active.type === 'activeSelection') (active as fabric.ActiveSelection).forEachObject(o => selection.push(o)); else selection.push(active);
        if (!selection.length) return;
        canvas.getObjects().forEach(ensureObjectId);
        const before = canvas.getObjects().map(o => o.qcId || '');
        const ordered = [...selection].sort((a, b) => canvas._objects.indexOf(b) - canvas._objects.indexOf(a));
        ordered.forEach(o => (canvas as any).sendObjectToBack?.(o) ?? canvas.sendObjectToBack(o));
        const after = canvas.getObjects().map(o => o.qcId || '');
        recordReorder(canvas, before, after, 'Send To Back');
        get().setSelectionFromCanvas(canvas);
    },
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
