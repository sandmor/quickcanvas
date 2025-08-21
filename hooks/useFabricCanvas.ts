"use client";

import { useEffect, useRef, useCallback } from "react";
import * as fabric from "fabric";
import { addImageBlob, addSVGString, copyToSystemClipboard, tryReadFromSystemClipboard } from "@/lib/fabric/clipboard";
import { addObjectsAsSelection, centerObjectAt, getCanvasCenterWorld } from "@/lib/fabric/utils";
import { classifyClipboardObject, FabricClipboardEntry } from "@/lib/fabric/types";
import { toast } from "sonner";

export interface FabricCanvasHook {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    copy: () => Promise<void>;
    cut: () => Promise<void>;
    paste: () => Promise<void>;
    getCanvas: () => fabric.Canvas | null;
}

export const useFabricCanvas = (): FabricCanvasHook => {
    // Use explicit possibly-null element ref but cast on return to align with consumer expectations
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const clipboardRef = useRef<FabricClipboardEntry | null>(null);
    const lastPointerRef = useRef<fabric.Point | null>(null);
    // Track a transient toast id for long-running operations (e.g. image paste)
    const inFlightToastIdRef = useRef<string | number | null>(null);
    // Suppress DOM paste handler if we've already handled via programmatic paste (Ctrl/Cmd+V)
    const suppressNextDomPasteRef = useRef(false);

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
        const cloned: any = await (activeObject as any).clone();
        clipboardRef.current = classifyClipboardObject(cloned);
        await copyToSystemClipboard(activeObject, notify);
    }, []);

    const cut = useCallback(async () => {
        const canvas = fabricCanvasRef.current; if (!canvas) return;
        const activeObject = canvas.getActiveObject();
        if (!activeObject) return;
        const cloned: any = await (activeObject as any).clone();
        clipboardRef.current = classifyClipboardObject(cloned);
        await copyToSystemClipboard(activeObject, notify);
        if ((activeObject as any).type === "activeSelection") {
            (activeObject as any).forEachObject((obj: fabric.Object) => canvas.remove(obj));
        } else {
            canvas.remove(activeObject);
        }
        canvas.discardActiveObject();
        canvas.requestRenderAll();
    }, [notify]);

    const paste = useCallback(async () => {
        const canvas = fabricCanvasRef.current; if (!canvas) return;
        const targetPoint = getTargetPoint();
        const didSystem = await tryReadFromSystemClipboard(
            canvas,
            targetPoint,
            notify,
            async (blob) => addImageBlob(canvas, blob, targetPoint, notify),
            async (svg) => { await addSVGString(canvas, svg, targetPoint); /* notify handled inside tryReadFromSystemClipboard */ }
        );
        if (didSystem) return;
        const entry = clipboardRef.current;
        if (!entry) return;
        const clonedObj: any = await (entry.clone as any).clone();
        canvas.discardActiveObject();
        if (entry.kind === "selection" && clonedObj.type === "activeSelection") {
            clonedObj.canvas = canvas;
            const pasted: any[] = [];
            clonedObj.forEachObject((obj: any) => {
                obj.set({ evented: true });
                canvas.add(obj); pasted.push(obj);
            });
            const selection = new (fabric as any).ActiveSelection(pasted, { canvas });
            centerObjectAt(selection, targetPoint);
            canvas.setActiveObject(selection);
        } else if (entry.kind === "image" || entry.kind === "object") {
            clonedObj.set({ evented: true });
            centerObjectAt(clonedObj, targetPoint);
            canvas.add(clonedObj);
            canvas.setActiveObject(clonedObj);
        }
        canvas.requestRenderAll();
    }, [getTargetPoint, notify]);

    // Initialization + events
    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = new fabric.Canvas(canvasRef.current, {
            width: window.innerWidth,
            height: window.innerHeight,
            fireRightClick: true,
            stopContextMenu: true,
            selection: false,
        });
        fabricCanvasRef.current = canvas;
        (canvas as any).isDragging = false; (canvas as any).lastPosX = 0; (canvas as any).lastPosY = 0;

        // Demo objects
        canvas.add(new fabric.Rect({ left: 100, top: 100, fill: "red", width: 200, height: 200 }));
        canvas.add(new fabric.Circle({ radius: 100, fill: "green", left: 500, top: 300 }));

        const handleResize = () => { canvas.setWidth(window.innerWidth); canvas.setHeight(window.innerHeight); canvas.renderAll(); };
        window.addEventListener("resize", handleResize);

        const handleKeydown = (e: KeyboardEvent) => {
            const meta = e.ctrlKey || e.metaKey; if (!meta) return;
            const key = e.key.toLowerCase();
            if (key === "c") { e.preventDefault(); copy(); }
            else if (key === "x") { e.preventDefault(); cut(); }
            else if (key === "v") { e.preventDefault(); suppressNextDomPasteRef.current = true; paste(); }
        };
        window.addEventListener("keydown", handleKeydown);

        const handlePasteEvent = async (e: ClipboardEvent) => {
            if (suppressNextDomPasteRef.current) { suppressNextDomPasteRef.current = false; return; }
            if (!e.clipboardData) return; const dt = e.clipboardData; const target = getTargetPoint();
            for (const item of Array.from(dt.items)) {
                if (item.type.startsWith("image/")) { const file = item.getAsFile(); if (file) { e.preventDefault(); await addImageBlob(canvas, file, target, notify); return; } }
            }
            const html = dt.getData("text/html");
            if (html) { const match = html.match(/<svg[\s\S]*?<\/svg>/i); if (match) { e.preventDefault(); await addSVGString(canvas, match[0], target); notify("Pasted SVG"); return; } }
            const txt = dt.getData("text/plain");
            if (txt && /^\s*<svg[\s\S]*<\/svg>\s*$/i.test(txt)) { e.preventDefault(); await addSVGString(canvas, txt, target); notify("Pasted SVG"); }
        };
        window.addEventListener("paste", handlePasteEvent);

        canvas.on("mouse:wheel", (opt) => {
            if (!opt.e) return; const delta = (opt.e as WheelEvent).deltaY; let zoom = canvas.getZoom(); zoom *= 0.999 ** delta; zoom = Math.min(20, Math.max(0.01, zoom));
            canvas.zoomToPoint(new fabric.Point((opt.e as WheelEvent).offsetX, (opt.e as WheelEvent).offsetY), zoom);
            opt.e.preventDefault(); opt.e.stopPropagation();
        });
        canvas.on("mouse:down", (opt) => {
            const e = opt.e as any; const pt = canvas.getScenePoint(e); lastPointerRef.current = new fabric.Point(pt.x, pt.y);
            if (e && e.altKey) { (canvas as any).isDragging = true; canvas.selection = false; (canvas as any).lastPosX = e.clientX; (canvas as any).lastPosY = e.clientY; }
        });
        canvas.on("mouse:move", (opt) => {
            const e = opt.e as any; if (e) { const pt = canvas.getScenePoint(e); lastPointerRef.current = new fabric.Point(pt.x, pt.y); }
            if (!(canvas as any).isDragging || !e) return; const vpt = canvas.viewportTransform; if (vpt) { vpt[4] += e.clientX - (canvas as any).lastPosX; vpt[5] += e.clientY - (canvas as any).lastPosY; canvas.requestRenderAll(); }
            (canvas as any).lastPosX = e.clientX; (canvas as any).lastPosY = e.clientY;
        });
        canvas.on("mouse:up", () => { if ((canvas as any).isDragging) { if (canvas.viewportTransform) { canvas.setViewportTransform(canvas.viewportTransform); } (canvas as any).isDragging = false; canvas.selection = true; } });

        return () => {
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("keydown", handleKeydown);
            window.removeEventListener("paste", handlePasteEvent);
            canvas.dispose();
            fabricCanvasRef.current = null;
        };
    }, [copy, cut, paste, getTargetPoint, notify]);

    return { canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>, copy, cut, paste, getCanvas: () => fabricCanvasRef.current };
};
