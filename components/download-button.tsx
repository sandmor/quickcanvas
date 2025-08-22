"use client";

import { useCallback, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportActiveOrCanvasToPNGBlob } from "@/lib/fabric/export";

/**
 * Floating download button. Exports active selection or all objects (cropped) to PNG.
 */
export const DownloadButton = () => {
    const [busy, setBusy] = useState(false);
    const handleDownload = useCallback(async () => {
        const canvas = (window as any).fabricCanvas as any;
        if (!canvas) { toast.error("Canvas not ready"); return; }
        try {
            setBusy(true);
            const blob = await exportActiveOrCanvasToPNGBlob(canvas);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const hasActive = !!canvas.getActiveObject();
            a.download = hasActive ? "selection.png" : "canvas.png";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("Download started");
        } catch (e) {
            console.warn("Download failed", e);
            toast.error("Download failed");
        } finally {
            setBusy(false);
        }
    }, []);
    return (
        <div className="fixed top-4 right-4 z-50">
            <Button
                variant="outline"
                size="icon"
                aria-label="Download PNG"
                title="Download PNG (active selection or all objects)"
                disabled={busy}
                onClick={handleDownload}
                className="backdrop-blur-md bg-popover/90 border shadow-lg hover:bg-accent/60"
            >
                <Download className="h-4 w-4" />
            </Button>
        </div>
    );
};

export default DownloadButton;
