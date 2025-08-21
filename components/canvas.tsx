"use client";

import React, { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";

const Canvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Use a ref to hold the fabric.Canvas instance
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  // Clipboard for copy/cut/paste
  const clipboardRef = useRef<fabric.Object | null>(null);
  // Track last known pointer (in canvas/world coordinates)
  const lastPointerRef = useRef<fabric.Point | null>(null);
  const [clipboardStatus, setClipboardStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: window.innerWidth,
      height: window.innerHeight,
      fireRightClick: true,
      stopContextMenu: true,
      selection: false,
    });
    fabricCanvasRef.current = canvas;

    // Add custom properties for panning
    (canvas as any).isDragging = false;
    (canvas as any).lastPosX = 0;
    (canvas as any).lastPosY = 0;

    const rect = new fabric.Rect({
      left: 100,
      top: 100,
      fill: "red",
      width: 200,
      height: 200,
    });
    canvas.add(rect);

    const circle = new fabric.Circle({
      radius: 100,
      fill: "green",
      left: 500,
      top: 300,
    });
    canvas.add(circle);

    const handleResize = () => {
      canvas.setWidth(window.innerWidth);
      canvas.setHeight(window.innerHeight);
      canvas.renderAll();
    };

    window.addEventListener("resize", handleResize);

    // Helpers
    const getCanvasCenterWorld = () => {
      const vpt = canvas.viewportTransform as number[] | null;
      const screenCenter = new fabric.Point(
        canvas.getWidth() / 2,
        canvas.getHeight() / 2
      );
      if (vpt) {
        const inv = (fabric as any).util.invertTransform(vpt);
        return (fabric as any).util.transformPoint(screenCenter, inv);
      }
      return screenCenter;
    };

    const getTargetPoint = (): fabric.Point =>
      lastPointerRef.current || getCanvasCenterWorld();

    const centerSelectionAt = (obj: any, target: fabric.Point) => {
      (obj as any).setPositionByOrigin(
        new fabric.Point(target.x, target.y),
        "center",
        "center"
      );
      obj.setCoords();
    };

    const addObjectsAsSelection = (objects: any[], target: fabric.Point) => {
      const selection = new (fabric as any).ActiveSelection(objects, { canvas });
      centerSelectionAt(selection, target);
      canvas.setActiveObject(selection);
      canvas.requestRenderAll();
    };

    const addSVGString = (rawSvg: string, target: fabric.Point) =>
      new Promise<void>(async (resolve, reject) => {
        try {
          const sanitized = rawSvg
            .replace(/<\?xml[^>]*?>/gi, "")
            .replace(/<!DOCTYPE[^>]*?>/gi, "")
            .trim();

          // Parse SVG with Fabric (promise API in v6)
          const parsed: any = await fabric.loadSVGFromString(sanitized);
          let objects: any[] = [];
          if (parsed) {
            if (Array.isArray(parsed.objects)) objects = parsed.objects;
            else if (Array.isArray(parsed)) objects = parsed;
          }
          if (!objects.length) {
            resolve();
            return;
          }

          // Build style lookup (id -> style decl string) from original markup
          const styleMap: Record<string, Record<string, string>> = {};
          const tagRegex = /<([a-zA-Z0-9:_-]+)([^>]*)>/g;
          let m: RegExpExecArray | null;
          while ((m = tagRegex.exec(sanitized))) {
            const attrs = m[2];
            const idMatch = attrs.match(/id=("|')([^"']+)("|')/i);
            const styleMatch = attrs.match(/style=("|')([^"']+)("|')/i);
            if (idMatch && styleMatch) {
              const id = idMatch[2];
              const styleDecls: Record<string, string> = {};
              styleMatch[2].split(/;+/).forEach((decl) => {
                const [k, v] = decl.split(":").map((s) => s && s.trim());
                if (k && v) styleDecls[k] = v;
              });
              styleMap[id] = styleDecls;
            }
          }

          // Apply missing basic styling attributes fill/stroke if absent on object
          objects.forEach((obj: any) => {
            const oid = obj.id || obj.name || obj._id;
            if (oid && styleMap[oid]) {
              const st = styleMap[oid];
              if (st.fill && (obj.fill == null || obj.fill === "")) obj.set("fill", st.fill);
              if (st.stroke && (obj.stroke == null || obj.stroke === "")) obj.set("stroke", st.stroke);
              if (st["stroke-width"] && (obj.strokeWidth == null || isNaN(obj.strokeWidth))) {
                const sw = parseFloat(st["stroke-width"]);
                if (!isNaN(sw)) obj.set("strokeWidth", sw);
              }
              if (st.opacity && (obj.opacity == null)) {
                const op = parseFloat(st.opacity);
                if (!isNaN(op)) obj.set("opacity", op);
              }
            }
            obj.set({ evented: true });
            canvas.add(obj);
          });

          if (objects.length === 1) {
            centerSelectionAt(objects[0], target);
            canvas.setActiveObject(objects[0]);
          } else {
            addObjectsAsSelection(objects, target);
          }
          canvas.requestRenderAll();
          resolve();
        } catch (err) {
          reject(err);
        }
      });

    const addImageBlob = async (blob: Blob, target: fabric.Point) => {
      setClipboardStatus("Pasting image...");
      const blobToDataURL = (b: Blob) =>
        new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onerror = () => rej(r.error);
          r.onload = () => res(r.result as string);
          r.readAsDataURL(b);
        });
      try {
        const dataUrl = await blobToDataURL(blob);
        const img: any = await (fabric.Image as any).fromURL(dataUrl, {
          crossOrigin: "anonymous",
        });
        if (!img) throw new Error("fromURL returned null image");
        img.set({ evented: true });
        centerSelectionAt(img, target);
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
        setClipboardStatus("Pasted image");
      } catch (err) {
        console.warn("Image paste failed", err, { blobType: blob.type, blobSize: blob.size });
        setClipboardStatus("Image paste failed");
      }
    };

    const exportSelectionToPNGBlob = async (active: any): Promise<Blob> => {
      const bounds = active.getBoundingRect(true, true);
      const tempEl = document.createElement("canvas");
      tempEl.width = Math.ceil(bounds.width);
      tempEl.height = Math.ceil(bounds.height);
      const tempCanvas = new fabric.Canvas(tempEl, {
        width: tempEl.width,
        height: tempEl.height,
        selection: false,
      });

      const cloned: any = await (active as any).clone();
      const objs: any[] = cloned.type === "activeSelection" ? cloned._objects || [] : [cloned];
      // Normalize to temp canvas with top-left at 0,0
      for (const o of objs) {
        try {
          const c: any = await (o as any).clone();
          c.set({ left: (c.left || 0) - bounds.left, top: (c.top || 0) - bounds.top });
          tempCanvas.add(c);
        } catch (e) {
          console.warn("Clone failed during PNG export", e);
        }
      }
      tempCanvas.requestRenderAll();
      const dataUrl = tempCanvas.toDataURL({ format: "png", multiplier: 1, enableRetinaScaling: false });
      // Convert dataURL to Blob
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      tempCanvas.dispose();
      return blob;
    };

    const exportSelectionToSVGString = async (active: any): Promise<string> => {
      const bounds = active.getBoundingRect(true, true);
      const tempEl = document.createElement("canvas");
      tempEl.width = Math.ceil(bounds.width);
      tempEl.height = Math.ceil(bounds.height);
      const tempCanvas = new fabric.Canvas(tempEl, {
        width: tempEl.width,
        height: tempEl.height,
        selection: false,
      });

      const cloned: any = await (active as any).clone();
      const objs: any[] = cloned.type === "activeSelection" ? cloned._objects || [] : [cloned];
      for (const o of objs) {
        try {
          const c: any = await (o as any).clone();
          c.set({ left: (c.left || 0) - bounds.left, top: (c.top || 0) - bounds.top });
          tempCanvas.add(c);
        } catch (e) {
          console.warn("Clone failed during SVG export", e);
        }
      }
      tempCanvas.requestRenderAll();
      let svg = tempCanvas.toSVG();
      // Ensure viewBox exists for proper scaling elsewhere
      if (!/viewBox=/i.test(svg)) {
        svg = svg.replace(
          /<svg(\s+[^>]*)?>/i,
          (m) =>
            m.replace(/>$/, '') +
            ` viewBox="0 0 ${Math.ceil(bounds.width)} ${Math.ceil(bounds.height)}">`
        );
      }
      tempCanvas.dispose();
      return svg;
    };

    const copyToSystemClipboard = async (activeObject: any) => {
      const items: Record<string, Blob> = {};
      let svg: string | null = null;

      // Fast path: single image
      if (activeObject.type === "image") {
        try {
          // Try to get original source if available
          const imgEl: HTMLImageElement | undefined = (activeObject as any)._element;
          if (imgEl && imgEl.src) {
            // If it's a data URL we can convert directly to blob
            if (imgEl.src.startsWith("data:")) {
              const res = await fetch(imgEl.src);
              const blob = await res.blob();
              if (blob.type) items[blob.type] = blob; else items["image/png"] = blob;
            } else {
              // Fetch the image URL (might require CORS)
              try {
                const res = await fetch(imgEl.src, { mode: "cors" });
                if (res.ok) {
                  const blob = await res.blob();
                  if (blob.type) items[blob.type] = blob; else items["image/png"] = blob;
                }
              } catch (e) {
                // Fallback: export current image as PNG from canvas object
              }
            }
          }
          if (!Object.keys(items).length) {
            // Fabric image toDataURL
            const dataUrl = (activeObject as any).toDataURL({ format: "png" });
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            items["image/png"] = blob;
          }
        } catch (e) {
          console.warn("Direct image copy failed, fallback to generic export", e);
        }
      } else {
        // Vector or selection path => build SVG and PNG
        try {
          svg = await exportSelectionToSVGString(activeObject);
          if (svg) {
            items["image/svg+xml"] = new Blob([svg], { type: "image/svg+xml" });
            items["text/plain"] = new Blob([svg], { type: "text/plain" });
            items["text/html"] = new Blob([svg], { type: "text/html" });
          }
        } catch (e) {
          console.warn("SVG export failed", e);
        }
        try {
          const pngBlob = await exportSelectionToPNGBlob(activeObject);
          items["image/png"] = pngBlob;
        } catch (e) {
          console.warn("PNG export failed", e);
        }
      }

      if (navigator.clipboard && (navigator.clipboard as any).write && Object.keys(items).length) {
        try {
          const clipboardItem = new (window as any).ClipboardItem(items);
          await (navigator.clipboard as any).write([clipboardItem]);
          setClipboardStatus("Copied to system clipboard");
          return true;
        } catch (err) {
          console.warn("Rich clipboard write failed, fallback to text", err);
        }
      }
      if (!Object.keys(items).length && svg && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(svg);
          setClipboardStatus("Copied SVG text");
          return true;
        } catch (err) {
          console.warn("Plain text clipboard write failed", err);
          setClipboardStatus("Clipboard blocked by browser");
          return false;
        }
      }
      if (!Object.keys(items).length) {
        setClipboardStatus("Clipboard API unavailable");
        return false;
      }
      return false;
    };

    const tryReadFromSystemClipboard = async (): Promise<boolean> => {
      const target = getTargetPoint();
      if (navigator.clipboard && (navigator.clipboard as any).read) {
        try {
          const items = await (navigator.clipboard as any).read();
          for (const item of items) {
            const types: string[] = item.types || [];
            // Prefer SVG
            if (types.includes("image/svg+xml")) {
              const blob = await item.getType("image/svg+xml");
              const text = await blob.text();
              await addSVGString(text, target);
              setClipboardStatus("Pasted SVG");
              return true;
            }
            // Then PNG/JPEG
            if (types.includes("image/png")) {
              try {
                const blob = await item.getType("image/png");
                await addImageBlob(blob, target);
                return true;
              } catch (e) {
                console.warn("PNG read failed", e);
              }
            }
            if (types.includes("image/jpeg")) {
              try {
                const blob = await item.getType("image/jpeg");
                await addImageBlob(blob, target);
                return true;
              } catch (e) {
                console.warn("JPEG read failed", e);
              }
            }
            // HTML with inline SVG
            if (types.includes("text/html")) {
              const blob = await item.getType("text/html");
              const html = await blob.text();
              const match = html.match(/<svg[\s\S]*?<\/svg>/i);
              if (match) {
                await addSVGString(match[0], target);
                setClipboardStatus("Pasted SVG");
                return true;
              }
            }
            // Plain text SVG
            if (types.includes("text/plain")) {
              const blob = await item.getType("text/plain");
              const txt = await blob.text();
              if (/^\s*<svg[\s\S]*<\/svg>\s*$/i.test(txt)) {
                await addSVGString(txt, target);
                setClipboardStatus("Pasted SVG");
                return true;
              }
            }
          }
        } catch (err) {
          // fall back to internal clipboard
          console.warn("System clipboard read failed", err);
          setClipboardStatus("Clipboard read blocked");
        }
      }
      return false;
    };

    // Copy, Cut, Paste helpers
    const doCopy = async () => {
      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;
      const cloned: any = await (activeObject as any).clone();
      clipboardRef.current = cloned as fabric.Object;
      // Try system clipboard as well
      await copyToSystemClipboard(activeObject);
    };

    const doCut = async () => {
      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;
      const cloned: any = await (activeObject as any).clone();
      clipboardRef.current = cloned as fabric.Object;
      // Try system clipboard as well
      await copyToSystemClipboard(activeObject);
      if ((activeObject as any).type === "activeSelection") {
        (activeObject as any).forEachObject((obj: fabric.Object) =>
          canvas.remove(obj)
        );
      } else {
        canvas.remove(activeObject);
      }
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    };

    const doPaste = async () => {
      // First, try system clipboard paste
      const didSystem = await tryReadFromSystemClipboard();
      if (didSystem) return;

      // Fallback to internal clipboard
      const clipboard = clipboardRef.current as any;
      if (!clipboard) return;
      const clonedObj: any = await clipboard.clone();
      canvas.discardActiveObject();
      const targetPoint = getTargetPoint();
      if (clonedObj.type === "activeSelection") {
        clonedObj.canvas = canvas;
        const pasted: any[] = [];
        clonedObj.forEachObject((obj: any) => {
          obj.set({ evented: true });
          canvas.add(obj);
          pasted.push(obj);
        });
        const selection = new (fabric as any).ActiveSelection(pasted, { canvas });
        centerSelectionAt(selection, targetPoint);
        canvas.setActiveObject(selection);
      } else {
        clonedObj.set({ evented: true });
        centerSelectionAt(clonedObj, targetPoint);
        canvas.add(clonedObj);
        canvas.setActiveObject(clonedObj);
      }
      canvas.requestRenderAll();
    };

    const handleKeydown = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "c") {
        e.preventDefault();
        doCopy();
      } else if (key === "x") {
        e.preventDefault();
        doCut();
      } else if (key === "v") {
        e.preventDefault();
        doPaste();
      }
    };

    window.addEventListener("keydown", handleKeydown);

    // Optional: also handle native paste events (e.g., Edit -> Paste)
    const handlePasteEvent = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const target = getTargetPoint();
      const dt = e.clipboardData;
      // Try image files
      for (const item of Array.from(dt.items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            await addImageBlob(file, target);
            return;
          }
        }
      }
      // Try HTML or plain SVG
      const html = dt.getData("text/html");
      if (html) {
        const match = html.match(/<svg[\s\S]*?<\/svg>/i);
        if (match) {
          e.preventDefault();
          await addSVGString(match[0], target);
          setClipboardStatus("Pasted SVG");
          return;
        }
      }
      const txt = dt.getData("text/plain");
      if (txt && /^\s*<svg[\s\S]*<\/svg>\s*$/i.test(txt)) {
        e.preventDefault();
        await addSVGString(txt, target);
        setClipboardStatus("Pasted SVG");
      }
    };
    window.addEventListener("paste", handlePasteEvent);

    canvas.on("mouse:wheel", (opt) => {
      if (!opt.e) return;
      const delta = (opt.e as WheelEvent).deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      if (zoom > 20) zoom = 20;
      if (zoom < 0.01) zoom = 0.01;
      canvas.zoomToPoint(
        new fabric.Point(
          (opt.e as WheelEvent).offsetX,
          (opt.e as WheelEvent).offsetY
        ),
        zoom
      );
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

    canvas.on("mouse:down", (opt) => {
      const e = opt.e as any;
      // Update last pointer position
      const pt = canvas.getPointer(e);
      lastPointerRef.current = new fabric.Point(pt.x, pt.y);
      if (e && e.altKey) {
        (canvas as any).isDragging = true;
        canvas.selection = false;
        (canvas as any).lastPosX = e.clientX;
        (canvas as any).lastPosY = e.clientY;
      }
    });

    canvas.on("mouse:move", (opt) => {
      const e = opt.e as any;
      if (e) {
        const pt = canvas.getPointer(e);
        lastPointerRef.current = new fabric.Point(pt.x, pt.y);
      }
      if (!(canvas as any).isDragging || !e) return;
      const vpt = canvas.viewportTransform;
      if (vpt) {
        vpt[4] += e.clientX - (canvas as any).lastPosX;
        vpt[5] += e.clientY - (canvas as any).lastPosY;
        canvas.requestRenderAll();
      }
      (canvas as any).lastPosX = e.clientX;
      (canvas as any).lastPosY = e.clientY;
    });

    canvas.on("mouse:up", () => {
      if ((canvas as any).isDragging) {
        if (canvas.viewportTransform) {
          canvas.setViewportTransform(canvas.viewportTransform);
        }
        (canvas as any).isDragging = false;
        canvas.selection = true;
      }
    });

    // Cleanup function
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("paste", handlePasteEvent);
      // Important: dispose of the canvas instance
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []); // Empty dependency array ensures this runs only once

  // Auto-hide clipboard status
  useEffect(() => {
    if (clipboardStatus) {
      const id = setTimeout(() => setClipboardStatus(null), 2000);
      return () => clearTimeout(id);
    }
  }, [clipboardStatus]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} />
      {clipboardStatus && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            padding: "4px 8px",
            borderRadius: 4,
            fontSize: 12,
            pointerEvents: "none",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {clipboardStatus}
        </div>
      )}
    </div>
  );
};

export default Canvas;
