"use client";

import React, { useCallback, useState } from "react";
import * as fabric from "fabric";
import { Button } from "@/components/ui/button";
import { Trash2, PaintBucket, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMainStore } from "@/store/mainStore";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CANVAS_COLOR_SWATCHES } from "@/lib/colors";

import { ColorPicker } from "./color-picker";

export const ActionsPanel: React.FC = () => {
    const selection = useMainStore(s => s.selection);
    const applyFillToSelection = useMainStore(s => s.applyFillToSelection);
    const deleteSelection = useMainStore(s => s.deleteSelection);

    const applyFill = useCallback((color: string) => {
        const canvas = (window as any).fabricCanvas as fabric.Canvas | undefined; if (!canvas) return;
        applyFillToSelection(canvas, color);
    }, [applyFillToSelection]);

    const handleDelete = useCallback(() => {
        const canvas = (window as any).fabricCanvas as fabric.Canvas | undefined; if (!canvas) return;
        deleteSelection(canvas);
    }, [deleteSelection]);

    const show = selection.has && !selection.editingText;
    if (!show) return null;

    const palette = (
        <div className="flex flex-wrap gap-1.5 items-center">
            {CANVAS_COLOR_SWATCHES.map(c => {
                const isActive = selection.fill?.toLowerCase() === c.toLowerCase();
                return (
                    <button
                        key={c}
                        onClick={() => applyFill(c)}
                        aria-label={`Set fill ${c}`}
                        className={cn(
                            "size-6 rounded-sm border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition",
                            isActive ? "ring-2 ring-ring border-ring" : "border-border/60 hover:border-foreground/50"
                        )}
                        style={{ background: c }}
                    />
                );
            })}
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        aria-label="Custom color"
                        className={cn(
                            "size-6 inline-flex items-center justify-center rounded-sm border border-border/60 bg-background/30 hover:border-foreground/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        )}
                        type="button"
                    >
                        <PaintBucket className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-4" side="right" align="start">
                    <div className="text-[11px] font-medium tracking-wide text-muted-foreground mb-2">Custom Color</div>
                    <ColorPicker
                        value={selection.fill || "#000000"}
                        onChange={applyFill}
                        inline
                        // hide swatches inside popover to avoid duplication
                        showSwatches={false}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );

    return (
        <div className="z-50 pointer-events-auto fixed top-1/2 -translate-y-1/2 left-4 hidden md:flex flex-col gap-3">
            <div className="flex flex-col gap-3 p-3 rounded-lg border bg-popover/90 backdrop-blur-md shadow-lg w-40">
                <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium tracking-wide text-muted-foreground">Fill</span>
                    {palette}
                </div>
                <Button
                    variant="destructive"
                    size="sm"
                    aria-label="Delete selection"
                    onClick={handleDelete}
                    className="justify-center"
                >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                </Button>
            </div>
        </div>
    );
};

// Separate mobile rendering to avoid layout complexity with Tailwind breakpoint utilities.
export const ActionsPanelMobile: React.FC = () => {
    const [open, setOpen] = useState(false);
    const selection = useMainStore(s => s.selection);
    const applyFillToSelection = useMainStore(s => s.applyFillToSelection);
    const deleteSelection = useMainStore(s => s.deleteSelection);

    const applyFill = useCallback((color: string) => {
        const canvas = (window as any).fabricCanvas as fabric.Canvas | undefined; if (!canvas) return;
        applyFillToSelection(canvas, color);
    }, [applyFillToSelection]);

    const handleDelete = useCallback(() => {
        const canvas = (window as any).fabricCanvas as fabric.Canvas | undefined; if (!canvas) return;
        deleteSelection(canvas); setOpen(false);
    }, [deleteSelection]);

    if (!selection.has) return null;

    return (
        <div className="fixed md:hidden bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(100%-1.5rem,480px)]">
            <div className="bg-popover/90 backdrop-blur-md border shadow-lg rounded-xl p-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground tracking-wide">Selection</div>
                    <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)} aria-label="Toggle actions" className="h-7 px-2">
                        <PaintBucket className="h-4 w-4" />
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open ? "rotate-180" : "")} />
                    </Button>
                </div>
                {open && (
                    <>
                        <ColorPicker value={selection.fill || "#000000"} onChange={applyFill} swatches={CANVAS_COLOR_SWATCHES} showTriggerButton={false} />
                        <Button variant="destructive" size="sm" onClick={handleDelete} aria-label="Delete selection" className="justify-center h-8">
                            <Trash2 className="h-4 w-4" /> Delete
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};

export default function CombinedActionsPanel() {
    return <>
        <ActionsPanel />
        <ActionsPanelMobile />
    </>;
}
