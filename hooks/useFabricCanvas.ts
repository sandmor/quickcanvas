"use client";

import { useEffect, useRef, useCallback } from "react";
import * as fabric from "fabric";
import { addImageBlob, addSVGString, copyToSystemClipboard, tryReadFromSystemClipboard } from "@/lib/fabric/clipboard";
import { centerObjectAt, getCanvasCenterWorld } from "@/lib/fabric/utils";
import { ShapeKind, insertShape, ShapeCreateContext, updateDraggingShape, finalizeDraggingShape } from "@/lib/fabric/shapes";
import { classifyClipboardObject, FabricClipboardEntry, isActiveSelection } from "@/lib/fabric/types";
import { toast } from "sonner";
import { useMainStore } from "@/store/mainStore";
import { CanvasTool } from "@/types/canvas";

export interface FabricCanvasHook {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    copy: () => Promise<void>;
    cut: () => Promise<void>;
    paste: () => Promise<void>;
    getCanvas: () => fabric.Canvas | null;
    tool: CanvasTool;
    setTool: (t: CanvasTool) => void;
}

// CanvasTool type moved to '@/types/canvas' for reuse without circular deps.

export const useFabricCanvas = (): FabricCanvasHook => {
    // Use explicit possibly-null element ref but cast on return to align with consumer expectations
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const clipboardRef = useRef<FabricClipboardEntry | null>(null);
    const lastPointerRef = useRef<fabric.Point | null>(null);
    // Track active touch pointers for multi-touch gestures (pinch / two-finger pan)
    const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    // Pinch gesture state
    const pinchStateRef = useRef<{ active: boolean; startDist: number; startZoom: number; lastMid: { x: number; y: number } | null; prevSelection: boolean; prevSkipTargetFind: boolean }>({
        active: false,
        startDist: 0,
        startZoom: 1,
        lastMid: null,
        prevSelection: true,
        prevSkipTargetFind: false,
    });
    // Track a transient toast id for long-running operations (e.g. image paste)
    const inFlightToastIdRef = useRef<string | number | null>(null);
    // Suppress DOM paste handler if we've already handled via programmatic paste (Ctrl/Cmd+V)
    const suppressNextDomPasteRef = useRef(false);

    const tool = useMainStore(s => s.tool);
    const setTool = useMainStore(s => s.setTool);
    const addToGallery = useMainStore(s => s.addToGallery);
    const setSelectionFromCanvas = useMainStore(s => s.setSelectionFromCanvas);
    const toolRef = useRef<CanvasTool>(tool);
    useEffect(() => { toolRef.current = tool; }, [tool]);

    const notify = useCallback((msg: string) => {
        // Normalize message classification
        const lower = msg.toLowerCase();
        if (lower.includes("pasting")) {
            // Start / update loading toast
            if (inFlightToastIdRef.current == null) {
                inFlightToastIdRef.current = toast.loading(msg);
            } else {
                toast.loading(msg, { id: inFlightToastIdRef.current });
            }
            return;
        }
        const isSuccess = /(pasted|copied)/i.test(msg) && !/failed|blocked|unavailable/i.test(msg);
        const isError = /failed|blocked|unavailable/.test(lower);
        const opts: any = inFlightToastIdRef.current != null ? { id: inFlightToastIdRef.current } : {};
        if (isSuccess) {
            toast.success(msg, opts);
        } else if (isError) {
            toast.error(msg, opts);
        } else {
            toast(msg, opts);
        }
        if (inFlightToastIdRef.current != null) inFlightToastIdRef.current = null;
    }, []);

    const getTargetPoint = useCallback((): fabric.Point => {
        const canvas = fabricCanvasRef.current!;
        return lastPointerRef.current || getCanvasCenterWorld(canvas);
    }, []);

    const copy = useCallback(async () => {
        const canvas = fabricCanvasRef.current; if (!canvas) return;
        const activeObject = canvas.getActiveObject();
        if (!activeObject) return;
        const cloned = await (activeObject as fabric.Object).clone();
        clipboardRef.current = classifyClipboardObject(cloned as fabric.Object);
        await copyToSystemClipboard(activeObject, notify);
        setSelectionFromCanvas(canvas);
    }, []);

    const cut = useCallback(async () => {
        const canvas = fabricCanvasRef.current; if (!canvas) return;
        const activeObject = canvas.getActiveObject();
        if (!activeObject) return;
        const cloned = await (activeObject as fabric.Object).clone();
        clipboardRef.current = classifyClipboardObject(cloned as fabric.Object);
        await copyToSystemClipboard(activeObject, notify);
        if (isActiveSelection(activeObject)) {
            activeObject.forEachObject((obj: fabric.Object) => canvas.remove(obj));
        } else {
            canvas.remove(activeObject);
        }
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        setSelectionFromCanvas(canvas);
    }, [notify]);

    const paste = useCallback(async () => {
        const canvas = fabricCanvasRef.current; if (!canvas) return;
        const targetPoint = getTargetPoint();
        const didSystem = await tryReadFromSystemClipboard(
            canvas,
            targetPoint,
            notify,
            async (blob) => { await addImageBlob(canvas, blob, targetPoint, notify); const obj = canvas.getActiveObject(); if (obj) addToGallery(obj); },
            async (svg) => { await addSVGString(canvas, svg, targetPoint); const obj = canvas.getActiveObject(); if (obj) addToGallery(obj); /* notify handled inside tryReadFromSystemClipboard */ }
        );
        if (didSystem) return;
        const entry = clipboardRef.current;
        if (!entry) return;
        const clonedObj = await (entry.clone as fabric.Object).clone();
        canvas.discardActiveObject();
        if (entry.kind === "selection" && clonedObj.type === "activeSelection") {
            const activeSel = clonedObj as fabric.ActiveSelection;
            activeSel.canvas = canvas;
            const pasted: fabric.Object[] = [];
            activeSel.forEachObject((obj: fabric.Object) => {
                obj.set({ evented: true });
                canvas.add(obj); pasted.push(obj);
            });
            const selection = new fabric.ActiveSelection(pasted, { canvas });
            centerObjectAt(selection, targetPoint); // still respect pointer if available
            canvas.setActiveObject(selection);
            addToGallery(selection);
        } else if (entry.kind === "image" || entry.kind === "object") {
            clonedObj.set({ evented: true });
            centerObjectAt(clonedObj, targetPoint);
            canvas.add(clonedObj);
            canvas.setActiveObject(clonedObj);
            addToGallery(clonedObj);
        }
        canvas.requestRenderAll();
        setSelectionFromCanvas(canvas);
    }, [getTargetPoint, notify]);

    const creationRef = useRef<ShapeCreateContext | null>(null);
    const creationEnvRef = useRef<{ prevSelection: boolean; prevSkipTF: boolean } | null>(null);
    const cancelCreation = () => {
        const canvas = fabricCanvasRef.current; if (!canvas) { creationRef.current = null; return; }
        const ctx = creationRef.current;
        if (ctx?.started && ctx.object) {
            canvas.remove(ctx.object);
            canvas.requestRenderAll();
        }
        if (creationEnvRef.current) {
            canvas.selection = creationEnvRef.current.prevSelection;
            canvas.skipTargetFind = creationEnvRef.current.prevSkipTF;
        }
        creationEnvRef.current = null;
        creationRef.current = null;
    };
    const beginCreation = (kind: ShapeKind, origin: fabric.Point) => {
        const canvas = fabricCanvasRef.current; if (!canvas) return;
        creationRef.current = { kind, origin, object: null, started: false };
        creationEnvRef.current = { prevSelection: canvas.selection as boolean, prevSkipTF: canvas.skipTargetFind === true };
        canvas.selection = false; // suppress group selection rectangle
        canvas.skipTargetFind = true; // avoid hover outlines or accidental targeting
    };
    const updateCreation = (pt: fabric.Point, shiftKey: boolean, altKey: boolean) => {
        const canvas = fabricCanvasRef.current; if (!canvas) return;
        if (!creationRef.current) return;
        updateDraggingShape(canvas, creationRef.current, pt, { maintainAspect: shiftKey, fromCenter: altKey });
    };
    const finalizeCreation = () => {
        const canvas = fabricCanvasRef.current; if (!canvas) return;
        const ctx = creationRef.current; if (!ctx) return;
        if (ctx.started && ctx.object) {
            finalizeDraggingShape(canvas, ctx);
        } else {
            insertShape(canvas, ctx.kind, { at: ctx.origin, autoSelect: true });
        }
        if (creationEnvRef.current) {
            canvas.selection = creationEnvRef.current.prevSelection;
            canvas.skipTargetFind = creationEnvRef.current.prevSkipTF;
            creationEnvRef.current = null;
        } else {
            canvas.selection = true;
            canvas.skipTargetFind = false;
        }
        setTool('pointer');
        creationRef.current = null;
    };

    // Initialization + events
    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = new fabric.Canvas(canvasRef.current, {
            width: window.innerWidth,
            height: window.innerHeight,
            fireRightClick: true,
            fireMiddleClick: true,
            stopContextMenu: true,
            selection: true,
            // Slightly refine selection aesthetics for clarity
            selectionBorderColor: '#3b82f6',
            selectionColor: 'rgba(59,130,246,0.08)',
            selectionLineWidth: 1.25,
        });
        fabricCanvasRef.current = canvas;
        window.fabricCanvas = canvas;
        canvas.isDragging = false; canvas.lastPosX = 0; canvas.lastPosY = 0;
        // Prevent default touch actions (scroll/zoom) so we can fully control gestures
        try { canvas.upperCanvasEl.style.touchAction = 'none'; } catch { }

        const handleResize = () => { canvas.setWidth(window.innerWidth); canvas.setHeight(window.innerHeight); canvas.renderAll(); };
        window.addEventListener("resize", handleResize);

        const handleKeydown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            // Tool hotkeys (no modifier) mimic design app conventions
            const canvas = fabricCanvasRef.current;
            const active = canvas?.getActiveObject() as any;
            const editingText = !!active && active.type === 'i-text' && active.isEditing;
            if (editingText) {
                // While editing text, only handle Escape (exit) – let browser handle copy/cut/paste & character input.
                if (key === 'escape') {
                    active.exitEditing(); canvas?.requestRenderAll();
                    if (canvas) setSelectionFromCanvas(canvas);
                }
                return; // swallow other hotkeys so they don't toggle tools mid-edit
            }
            if (!e.metaKey && !e.ctrlKey && !e.altKey) {
                if (key === "v" || key === "escape") { setTool("pointer"); if (key === 'escape') cancelCreation(); }
                else if (key === "h") { setTool("pan"); }
                else if (key === "r") { setTool("rect"); }
                else if (key === "e") { setTool("ellipse"); }
                else if (key === "l") { setTool("line"); }
                else if (key === "t") { setTool("text"); }
            }
            const meta = e.ctrlKey || e.metaKey; if (!meta) return;
            if (key === "c") { e.preventDefault(); copy(); }
            else if (key === "x") { e.preventDefault(); cut(); }
            else if (key === "v") { e.preventDefault(); suppressNextDomPasteRef.current = true; paste(); }
            else if (key === 'a' && canvas) { // Select all
                e.preventDefault();
                const objs = canvas.getObjects().filter(o => o.selectable !== false);
                if (objs.length === 1) {
                    canvas.setActiveObject(objs[0]);
                } else if (objs.length > 1) {
                    const sel = new fabric.ActiveSelection(objs, { canvas: canvas as fabric.Canvas });
                    canvas.setActiveObject(sel);
                }
                canvas.requestRenderAll();
                setSelectionFromCanvas(canvas);
            }
        };
        window.addEventListener("keydown", handleKeydown);
        const handleKeyup = (e: KeyboardEvent) => {
            // Delete / Backspace remove active object(s) unless currently editing text
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const active: any = canvas.getActiveObject();
                if (active && !(active.type === 'i-text' && active.isEditing)) {
                    if (isActiveSelection(active)) {
                        active.forEachObject((obj: fabric.Object) => canvas.remove(obj));
                    } else {
                        canvas.remove(active);
                    }
                    canvas.discardActiveObject();
                    canvas.requestRenderAll();
                    setSelectionFromCanvas(canvas);
                }
            }
        };
        window.addEventListener('keyup', handleKeyup);

        const handlePasteEvent = async (e: ClipboardEvent) => {
            if (suppressNextDomPasteRef.current) { suppressNextDomPasteRef.current = false; return; }
            if (!e.clipboardData) return; const dt = e.clipboardData; const target = getTargetPoint();
            for (const item of Array.from(dt.items)) {
                if (item.type.startsWith("image/")) { const file = item.getAsFile(); if (file) { e.preventDefault(); await addImageBlob(canvas, file, target, notify); const obj = canvas.getActiveObject(); if (obj) addToGallery(obj); return; } }
            }
            const html = dt.getData("text/html");
            if (html) { const match = html.match(/<svg[\s\S]*?<\/svg>/i); if (match) { e.preventDefault(); await addSVGString(canvas, match[0], target); notify("Pasted SVG"); const obj = canvas.getActiveObject(); if (obj) addToGallery(obj); return; } }
            const txt = dt.getData("text/plain");
            if (txt) {
                if (/^\s*<svg[\s\S]*<\/svg>\s*$/i.test(txt)) { e.preventDefault(); await addSVGString(canvas, txt, target); notify("Pasted SVG"); const obj = canvas.getActiveObject(); if (obj) addToGallery(obj); return; }
                // Plain text -> create a text object (do NOT add to gallery per requirements)
                if (txt.trim().length > 0) {
                    e.preventDefault();
                    const textObj = new fabric.IText(txt, {
                        left: target.x,
                        top: target.y,
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: 28,
                        fill: '#111827'
                    });
                    canvas.add(textObj);
                    canvas.setActiveObject(textObj);
                    textObj.setCoords();
                    canvas.requestRenderAll();
                    notify('Pasted Text');
                    setSelectionFromCanvas(canvas);
                    return;
                }
            }
        };
        window.addEventListener("paste", handlePasteEvent);

        canvas.on("mouse:wheel", (opt) => {
            if (!opt.e) return; const delta = (opt.e as WheelEvent).deltaY; let zoom = canvas.getZoom(); zoom *= 0.999 ** delta; zoom = Math.min(20, Math.max(0.01, zoom));
            canvas.zoomToPoint(new fabric.Point((opt.e as WheelEvent).offsetX, (opt.e as WheelEvent).offsetY), zoom);
            opt.e.preventDefault(); opt.e.stopPropagation();
        });
        // Pointer events (not fabric) for robust multi-touch pinch zoom & two-finger pan
        const el = canvas.upperCanvasEl;
        const getTouchMidAndDist = () => {
            const pts = Array.from(activeTouchesRef.current.values());
            if (pts.length < 2) return null;
            const [a, b] = pts;
            const dx = b.x - a.x; const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            return { dist, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        };
        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType === 'touch') {
                activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (activeTouchesRef.current.size === 2) {
                    const info = getTouchMidAndDist();
                    if (info) {
                        pinchStateRef.current.active = true;
                        pinchStateRef.current.startDist = info.dist;
                        pinchStateRef.current.startZoom = canvas.getZoom();
                        pinchStateRef.current.lastMid = info.mid;
                        // Save & disable selection / target finding to avoid marquee rectangle during pinch.
                        pinchStateRef.current.prevSelection = canvas.selection as boolean;
                        pinchStateRef.current.prevSkipTargetFind = canvas.skipTargetFind === true;
                        canvas.selection = false;
                        canvas.skipTargetFind = true;
                        // During pinch disable selection/panning state in fabric (we handle manually)
                        canvas.discardActiveObject();
                        canvas.requestRenderAll();
                    }
                }
            }
        };
        const onPointerMove = (e: PointerEvent) => {
            if (e.pointerType === 'touch') {
                if (activeTouchesRef.current.has(e.pointerId)) {
                    activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                }
                if (pinchStateRef.current.active && activeTouchesRef.current.size >= 2) {
                    const info = getTouchMidAndDist();
                    if (info && pinchStateRef.current.startDist > 0) {
                        // Compute scale factor
                        const scale = info.dist / pinchStateRef.current.startDist;
                        let nextZoom = pinchStateRef.current.startZoom * scale;
                        nextZoom = Math.min(20, Math.max(0.01, nextZoom));
                        // Zoom to midpoint (screen coords -> world point via zoomToPoint)
                        canvas.zoomToPoint(new fabric.Point(info.mid.x, info.mid.y), nextZoom);
                        // Two-finger pan: if midpoint moved, translate viewport accordingly to keep content under fingers stable.
                        if (pinchStateRef.current.lastMid) {
                            const last = pinchStateRef.current.lastMid;
                            const dx = info.mid.x - last.x;
                            const dy = info.mid.y - last.y;
                            const vpt = canvas.viewportTransform;
                            if (vpt) { vpt[4] += dx; vpt[5] += dy; canvas.requestRenderAll(); }
                        }
                        // Clear any in-progress group selector rectangle Fabric may have started before pinch detection.
                        if (canvas._groupSelector) { canvas._groupSelector = null; }
                        pinchStateRef.current.lastMid = info.mid;
                        e.preventDefault();
                    }
                } else if (activeTouchesRef.current.size === 1) {
                    // Single touch fallback: if pan tool active treat similar to mouse drag panning
                    const only = Array.from(activeTouchesRef.current.values())[0];
                    // We rely on fabric's mouse events for single-touch panning (when pan tool), so skip here
                }
            }
        };
        const endPointer = (e: PointerEvent) => {
            if (e.pointerType === 'touch') {
                activeTouchesRef.current.delete(e.pointerId);
                if (activeTouchesRef.current.size < 2 && pinchStateRef.current.active) {
                    // End pinch
                    pinchStateRef.current.active = false;
                    pinchStateRef.current.startDist = 0;
                    pinchStateRef.current.lastMid = null;
                    // Restore selection / target finding flags
                    canvas.selection = pinchStateRef.current.prevSelection;
                    canvas.skipTargetFind = pinchStateRef.current.prevSkipTargetFind;
                    canvas.requestRenderAll();
                }
            }
        };
        el.addEventListener('pointerdown', onPointerDown, { passive: false });
        el.addEventListener('pointermove', onPointerMove, { passive: false });
        el.addEventListener('pointerup', endPointer);
        el.addEventListener('pointercancel', endPointer);
        el.addEventListener('pointerleave', endPointer);
        canvas.on("mouse:down", (opt) => {
            const e = opt.e as any;
            const pt = canvas.getScenePoint(e); lastPointerRef.current = new fabric.Point(pt.x, pt.y);
            const activeTool = toolRef.current;
            const isMiddle = e && e.button === 1;
            const isRight = e && e.button === 2;
            const isTouch = !!e && (e.pointerType === 'touch' || e.type === 'touchstart');
            const wantsPan = isMiddle || (activeTool === 'pan' && (isTouch || isRight || e.button === 0));
            if (wantsPan) {
                if (e && e.preventDefault) e.preventDefault(); // avoid auto-scroll / context behavior
                canvas.isDragging = true;
                canvas.selection = false;
                canvas.lastPosX = e.clientX;
                canvas.lastPosY = e.clientY;
                // Avoid object selection on this gesture
                canvas.discardActiveObject();
                canvas.setCursor('grabbing');
                canvas.renderAll();
            } else if (activeTool === 'text' && e && e.button === 0) {
                // Insert a new editable text object at pointer and immediately enter editing.
                const textObj = new fabric.IText('', {
                    left: lastPointerRef.current!.x,
                    top: lastPointerRef.current!.y,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: 32,
                    fill: '#111827',
                    lineHeight: 1.15,
                    splitByGrapheme: true, // better caret positioning for complex scripts
                });
                canvas.add(textObj);
                canvas.setActiveObject(textObj);
                textObj.enterEditing();
                (textObj as any).hiddenTextarea && (textObj as any).hiddenTextarea.focus();
                textObj.on('editing:exited', () => {
                    // Remove empty text nodes to avoid clutter
                    if (!textObj.text || !textObj.text.trim()) {
                        canvas.remove(textObj);
                    }
                    canvas.requestRenderAll();
                    setSelectionFromCanvas(canvas);
                });
                canvas.requestRenderAll();
                setTool('pointer'); // revert to pointer after insertion for fluid workflow
                setSelectionFromCanvas(canvas);
            } else if (activeTool !== 'pointer' && activeTool !== 'pan' && activeTool !== 'text' && e && e.button === 0) {
                // Initiate shape creation (drag-based)
                beginCreation(activeTool as ShapeKind, new fabric.Point(lastPointerRef.current!.x, lastPointerRef.current!.y));
                // Avoid immediate selection flicker
                canvas.discardActiveObject();
            }
        });
        canvas.on("mouse:move", (opt) => {
            const e = opt.e as any;
            if (e) { const pt = canvas.getScenePoint(e); lastPointerRef.current = new fabric.Point(pt.x, pt.y); }
            if (!canvas.isDragging || !e) return;
            const vpt = canvas.viewportTransform; if (vpt && canvas.lastPosX != null && canvas.lastPosY != null) { vpt[4] += e.clientX - canvas.lastPosX; vpt[5] += e.clientY - canvas.lastPosY; canvas.requestRenderAll(); }
            canvas.lastPosX = e.clientX; canvas.lastPosY = e.clientY;
        });
        // Fabric does not expose a direct shift state here, so pull from native event
        canvas.on('mouse:move', (opt) => {
            const e = opt.e as any;
            if (creationRef.current && e) {
                const pt = canvas.getScenePoint(e); // world point
                updateCreation(new fabric.Point(pt.x, pt.y), e.shiftKey, !!e.altKey);
                // Ensure fabric's internal group selector is cleared (belt & suspenders)
                if ((canvas as any)._groupSelector) (canvas as any)._groupSelector = null;
            }
        });
        canvas.on("mouse:up", (opt) => {
            const wasDragging = canvas.isDragging;
            if (wasDragging) {
                if (canvas.viewportTransform) { canvas.setViewportTransform(canvas.viewportTransform); }
                canvas.isDragging = false;
                canvas.selection = true;
                canvas.setCursor('default');
                canvas.renderAll();
            }
            if (creationRef.current) {
                finalizeCreation();
                setSelectionFromCanvas(canvas);
            }
        });

        // Bridge fabric selection events -> store
        const pushSelection = () => setSelectionFromCanvas(canvas);
        canvas.on('selection:created', pushSelection);
        canvas.on('selection:updated', pushSelection);
        canvas.on('selection:cleared', pushSelection);
        canvas.on('text:editing:exited', pushSelection as any);
        pushSelection();

        return () => {
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("keydown", handleKeydown);
            window.removeEventListener('keyup', handleKeyup);
            window.removeEventListener("paste", handlePasteEvent);
            el.removeEventListener('pointerdown', onPointerDown);
            el.removeEventListener('pointermove', onPointerMove);
            el.removeEventListener('pointerup', endPointer);
            el.removeEventListener('pointercancel', endPointer);
            el.removeEventListener('pointerleave', endPointer);
            canvas.dispose();
            fabricCanvasRef.current = null;
        };
    }, [copy, cut, paste, getTargetPoint, notify, addToGallery]);

    return { canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>, copy, cut, paste, getCanvas: () => fabricCanvasRef.current, tool, setTool };
};
