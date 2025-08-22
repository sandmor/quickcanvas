import * as fabric from "fabric";
import { addObjectsAsSelection, centerObjectAt } from "./utils";
import { exportSelectionToPNGBlob, exportSelectionToSVGString } from "./export";
import { toast } from "sonner";

/** Parse and add an SVG string to the canvas at target point. Emits a toast on failure and never rejects. */
export const addSVGString = async (canvas: fabric.Canvas, rawSvg: string, target: fabric.Point): Promise<void> => {
    try {
        const sanitized = rawSvg
            .replace(/<\?xml[^>]*?>/gi, "")
            .replace(/<!DOCTYPE[^>]*?>/gi, "")
            .trim();

        const parsed: any = await fabric.loadSVGFromString(sanitized);
        let objects: any[] = [];
        if (parsed) {
            if (Array.isArray(parsed.objects)) objects = parsed.objects;
            else if (Array.isArray(parsed)) objects = parsed;
        }
        if (!objects.length) {
            toast.error("SVG contained no drawable objects");
            return;
        }

        const styleMap: Record<string, Record<string, string>> = {};
        const tagRegex = /<([a-zA-Z0-9:_-]+)([^>]*)>/g;
        let m: RegExpExecArray | null;
        while ((m = tagRegex.exec(sanitized))) {
            const attrs = m[2];
            const idMatch = attrs.match(/id=("|')([^"']+)("')/i);
            const styleMatch = attrs.match(/style=("|')([^"']+)("')/i);
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
            centerObjectAt(objects[0], target);
            canvas.setActiveObject(objects[0]);
        } else {
            addObjectsAsSelection(objects, canvas, target);
        }
        canvas.requestRenderAll();
    } catch (err) {
        console.warn("Failed to parse / add SVG", err);
        toast.error("Failed to paste SVG – content may be invalid.");
    }
};

export const addImageBlob = async (
    canvas: fabric.Canvas,
    blob: Blob,
    target: fabric.Point,
    setStatus: (s: string) => void
) => {
    setStatus("Pasting image...");
    const blobToDataURL = (b: Blob) =>
        new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onerror = () => rej(r.error);
            r.onload = () => res(r.result as string);
            r.readAsDataURL(b);
        });
    try {
        const dataUrl = await blobToDataURL(blob);
        const img: any = await (fabric.Image as any).fromURL(dataUrl, { crossOrigin: "anonymous" });
        if (!img) throw new Error("fromURL returned null image");
        img.set({ evented: true });
        centerObjectAt(img, target);
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
        setStatus("Pasted image");
    } catch (err) {
        console.warn("Image paste failed", err, { blobType: blob.type, blobSize: blob.size });
        setStatus("Image paste failed");
    }
};

export const copyToSystemClipboard = async (
    activeObject: any,
    setStatus: (s: string) => void
): Promise<boolean> => {
    const items: Record<string, Blob> = {};
    let svg: string | null = null;

    if (activeObject.type === "image") {
        try {
            const imgEl: HTMLImageElement | undefined = activeObject._element;
            if (imgEl && imgEl.src) {
                if (imgEl.src.startsWith("data:")) {
                    const res = await fetch(imgEl.src);
                    const blob = await res.blob();
                    if (blob.type) items[blob.type] = blob; else items["image/png"] = blob;
                } else {
                    try {
                        const res = await fetch(imgEl.src, { mode: "cors" });
                        if (res.ok) {
                            const blob = await res.blob();
                            if (blob.type) items[blob.type] = blob; else items["image/png"] = blob;
                        }
                    } catch (e) {
                        // fallback below
                    }
                }
            }
            if (!Object.keys(items).length) {
                const dataUrl = activeObject.toDataURL({ format: "png" });
                const res = await fetch(dataUrl);
                const blob = await res.blob();
                items["image/png"] = blob;
            }
        } catch (e) {
            console.warn("Direct image copy failed, fallback to generic export", e);
        }
    } else {
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
            const clipboardItem = new window.ClipboardItem(items as any);
            await (navigator.clipboard as any).write([clipboardItem]);
            setStatus("Copied to system clipboard");
            return true;
        } catch (err) {
            console.warn("Rich clipboard write failed, fallback to text", err);
        }
    }
    if (!Object.keys(items).length && svg && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(svg);
            setStatus("Copied SVG text");
            return true;
        } catch (err) {
            console.warn("Plain text clipboard write failed", err);
            setStatus("Clipboard blocked by browser");
            return false;
        }
    }
    if (!Object.keys(items).length) {
        setStatus("Clipboard API unavailable");
        return false;
    }
    return false;
};

export const tryReadFromSystemClipboard = async (
    canvas: fabric.Canvas,
    target: fabric.Point,
    setStatus: (s: string) => void,
    addImageBlobFn: (blob: Blob) => Promise<void>,
    addSVGStringFn: (svg: string) => Promise<void>
): Promise<boolean> => {
    if (navigator.clipboard && (navigator.clipboard as any).read) {
        try {
            const items = await (navigator.clipboard as any).read();
            for (const item of items) {
                const types: string[] = item.types || [];
                if (types.includes("image/svg+xml")) {
                    const blob = await item.getType("image/svg+xml");
                    const text = await blob.text();
                    await addSVGStringFn(text);
                    setStatus("Pasted SVG");
                    return true;
                }
                if (types.includes("image/png")) {
                    try {
                        const blob = await item.getType("image/png");
                        await addImageBlobFn(blob);
                        return true;
                    } catch (e) { console.warn("PNG read failed", e); }
                }
                if (types.includes("image/jpeg")) {
                    try {
                        const blob = await item.getType("image/jpeg");
                        await addImageBlobFn(blob);
                        return true;
                    } catch (e) { console.warn("JPEG read failed", e); }
                }
                if (types.includes("text/html")) {
                    const blob = await item.getType("text/html");
                    const html = await blob.text();
                    const match = html.match(/<svg[\s\S]*?<\/svg>/i);
                    if (match) {
                        await addSVGStringFn(match[0]);
                        setStatus("Pasted SVG");
                        return true;
                    }
                }
                if (types.includes("text/plain")) {
                    const blob = await item.getType("text/plain");
                    const txt = await blob.text();
                    if (/^\s*<svg[\s\S]*<\/svg>\s*$/i.test(txt)) {
                        await addSVGStringFn(txt);
                        setStatus("Pasted SVG");
                        return true;
                    }
                }
            }
        } catch (err) {
            console.warn("System clipboard read failed", err);
            setStatus("Clipboard read blocked");
        }
    }
    return false;
};
