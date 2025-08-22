"use client";

import React, { useCallback, useState } from "react";
import * as fabric from "fabric";
import { Button } from "@/components/ui/button";
import { Trash2, PaintBucket, ChevronDown, Layers, ArrowUp, ArrowDown, ArrowUpToLine, ArrowDownToLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMainStore } from "@/store/mainStore";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CANVAS_COLOR_SWATCHES } from "@/lib/colors";

import { ColorPicker } from "./color-picker";
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export const ActionsPanel: React.FC = () => {
    const selection = useMainStore(s => s.selection);
    const applyFillToSelection = useMainStore(s => s.applyFillToSelection);
    const deleteSelection = useMainStore(s => s.deleteSelection);
    const bringForward = useMainStore(s => s.bringForward);
    const sendBackward = useMainStore(s => s.sendBackward);
    const bringToFront = useMainStore(s => s.bringToFront);
    const sendToBack = useMainStore(s => s.sendToBack);

    const applyFill = useCallback((color: string) => {
        const canvas = window.fabricCanvas; if (!canvas) return;
        applyFillToSelection(canvas, color);
    }, [applyFillToSelection]);

    const handleDelete = useCallback(() => {
        const canvas = window.fabricCanvas; if (!canvas) return;
        deleteSelection(canvas);
    }, [deleteSelection]);

    const show = selection.has && !selection.editingText;
    if (!show) return null;

    const palette = (
        <div className="flex flex-wrap gap-1.5 items-center justify-center w-full">
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

    // Derive z-order disable flags
    const computeLayerDisables = (): { bfwd: boolean; fwd: boolean; bwd: boolean; bback: boolean } => {
        const canvas = window.fabricCanvas; if (!canvas) return { bfwd: true, fwd: true, bwd: true, bback: true };
        const stack = canvas._objects;
        if (stack.length <= 1) return { bfwd: true, fwd: true, bwd: true, bback: true }; // only object
        const active = canvas.getActiveObject(); if (!active) return { bfwd: true, fwd: true, bwd: true, bback: true };
        const objs: fabric.Object[] = [];
        if (active.type === 'activeSelection') (active as fabric.ActiveSelection).forEachObject(o => objs.push(o)); else objs.push(active);
        const set = new Set(objs);
        const indices = objs.map(o => stack.indexOf(o)).filter(i => i >= 0).sort((a, b) => a - b);
        if (!indices.length) return { bfwd: true, fwd: true, bwd: true, bback: true };
        const min = indices[0];
        const max = indices[indices.length - 1];
        const atTop = max === stack.length - 1 && (indices.length === 1 || stack.slice(max + 1).length === 0);
        const atBottom = min === 0 && (indices.length === 1 || stack.slice(0, min).length === 0);
        // Bring forward disabled if every object either is topmost or immediately followed by another selected object
        const disableBringForward = atTop || indices.every(i => i === stack.length - 1 || set.has(stack[i + 1]));
        // Send backward disabled similarly for downward movement
        const disableSendBackward = atBottom || indices.every(i => i === 0 || set.has(stack[i - 1]));
        // Bring to front disabled if all objects above selection are also selected
        const disableBringToFront = max === stack.length - 1 || stack.slice(max + 1).every(o => set.has(o));
        // Send to back disabled if all objects below selection are also selected
        const disableSendToBack = min === 0 || stack.slice(0, min).every(o => set.has(o));
        return { bfwd: disableBringToFront, fwd: disableBringForward, bwd: disableSendBackward, bback: disableSendToBack };
    };
    const layerDisables = computeLayerDisables();

    return (
        <div className="z-50 pointer-events-auto fixed top-1/2 -translate-y-1/2 left-4 hidden md:flex flex-col gap-3">
            <div className="flex flex-col gap-3 p-3 rounded-lg border bg-popover/90 backdrop-blur-md shadow-lg w-40">
                <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium tracking-wide text-muted-foreground">Fill</span>
                    {palette}
                </div>
                <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium tracking-wide text-muted-foreground">Layer</span>
                    <div className="grid grid-cols-2 gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    aria-label="Bring to front"
                                    disabled={layerDisables.bfwd}
                                    onClick={() => { const c = window.fabricCanvas as fabric.Canvas | undefined; if (c) bringToFront(c); }}
                                    className={cn("h-8 px-2 transition-transform hover:shadow-sm active:scale-[0.94]", layerDisables.bfwd && "opacity-50")}
                                >
                                    <ArrowUpToLine className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Bring to front</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    aria-label="Bring forward"
                                    disabled={layerDisables.fwd}
                                    onClick={() => { const c = window.fabricCanvas; if (c) bringForward(c); }}
                                    className={cn("h-8 px-2 transition-transform hover:shadow-sm active:scale-[0.94]", layerDisables.fwd && "opacity-50")}
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Bring forward</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    aria-label="Send backward"
                                    disabled={layerDisables.bwd}
                                    onClick={() => { const c = window.fabricCanvas; if (c) sendBackward(c); }}
                                    className={cn("h-8 px-2 transition-transform hover:shadow-sm active:scale-[0.94]", layerDisables.bwd && "opacity-50")}
                                >
                                    <ArrowDown className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Send backward</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    aria-label="Send to back"
                                    disabled={layerDisables.bback}
                                    onClick={() => { const c = window.fabricCanvas; if (c) sendToBack(c); }}
                                    className={cn("h-8 px-2 transition-transform hover:shadow-sm active:scale-[0.94]", layerDisables.bback && "opacity-50")}
                                >
                                    <ArrowDownToLine className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Send to back</TooltipContent>
                        </Tooltip>
                    </div>
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
    const bringForward = useMainStore(s => s.bringForward);
    const sendBackward = useMainStore(s => s.sendBackward);
    const bringToFront = useMainStore(s => s.bringToFront);
    const sendToBack = useMainStore(s => s.sendToBack);

    const applyFill = useCallback((color: string) => {
        const canvas = window.fabricCanvas; if (!canvas) return;
        applyFillToSelection(canvas, color);
    }, [applyFillToSelection]);

    const handleDelete = useCallback(() => {
        const canvas = window.fabricCanvas; if (!canvas) return;
        deleteSelection(canvas); setOpen(false);
    }, [deleteSelection]);

    const computeLayerDisables = (): { bfwd: boolean; fwd: boolean; bwd: boolean; bback: boolean } => {
        if (typeof window === "undefined") return { bfwd: false, fwd: false, bwd: false, bback: false };

        const canvas = window.fabricCanvas; if (!canvas) return { bfwd: true, fwd: true, bwd: true, bback: true };
        const stack = canvas._objects;
        if (stack.length <= 1) return { bfwd: true, fwd: true, bwd: true, bback: true };
        const active = canvas.getActiveObject(); if (!active) return { bfwd: true, fwd: true, bwd: true, bback: true };
        const objs: fabric.Object[] = [];
        if (active.type === 'activeSelection') (active as fabric.ActiveSelection).forEachObject(o => objs.push(o)); else objs.push(active);
        const set = new Set(objs);
        const indices = objs.map(o => stack.indexOf(o)).filter(i => i >= 0).sort((a, b) => a - b);
        if (!indices.length) return { bfwd: true, fwd: true, bwd: true, bback: true };
        const min = indices[0];
        const max = indices[indices.length - 1];
        const atTop = max === stack.length - 1;
        const atBottom = min === 0;
        const disableBringForward = atTop || indices.every(i => i === stack.length - 1 || set.has(stack[i + 1]));
        const disableSendBackward = atBottom || indices.every(i => i === 0 || set.has(stack[i - 1]));
        const disableBringToFront = max === stack.length - 1 || stack.slice(max + 1).every(o => set.has(o));
        const disableSendToBack = min === 0 || stack.slice(0, min).every(o => set.has(o));
        return { bfwd: disableBringToFront, fwd: disableBringForward, bwd: disableSendBackward, bback: disableSendToBack };
    };
    const layerDisables = computeLayerDisables();

    if (!selection.has) return null;

    return (
        <div className="fixed md:hidden bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(100%-1.5rem,480px)]">
            <div className="bg-popover/90 backdrop-blur-md border shadow-lg rounded-xl p-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground tracking-wide">Selection</div>
                    <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)} aria-label="Toggle actions" className="h-7 px-2">
                        <Layers className="h-4 w-4" />
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open ? "rotate-180" : "")} />
                    </Button>
                </div>
                {open && (
                    <>
                        <ColorPicker value={selection.fill || "#000000"} onChange={applyFill} swatches={CANVAS_COLOR_SWATCHES} showTriggerButton={false} />
                        <div className="grid grid-cols-4 gap-1">
                            <Button variant="secondary" size="sm" disabled={layerDisables.bfwd} onClick={() => { const c = window.fabricCanvas; c && bringToFront(c); }} aria-label="Bring to front" className={cn("h-8 px-0 transition-transform hover:shadow-sm active:scale-[0.94]", layerDisables.bfwd && "opacity-50")}> <ArrowUpToLine className="h-4 w-4" /></Button>
                            <Button variant="secondary" size="sm" disabled={layerDisables.fwd} onClick={() => { const c = window.fabricCanvas; c && bringForward(c); }} aria-label="Bring forward" className={cn("h-8 px-0 transition-transform hover:shadow-sm active:scale-[0.94]", layerDisables.fwd && "opacity-50")}> <ArrowUp className="h-4 w-4" /></Button>
                            <Button variant="secondary" size="sm" disabled={layerDisables.bwd} onClick={() => { const c = window.fabricCanvas; c && sendBackward(c); }} aria-label="Send backward" className={cn("h-8 px-0 transition-transform hover:shadow-sm active:scale-[0.94]", layerDisables.bwd && "opacity-50")}> <ArrowDown className="h-4 w-4" /></Button>
                            <Button variant="secondary" size="sm" disabled={layerDisables.bback} onClick={() => { const c = window.fabricCanvas; c && sendToBack(c); }} aria-label="Send to back" className={cn("h-8 px-0 transition-transform hover:shadow-sm active:scale-[0.94]", layerDisables.bback && "opacity-50")}> <ArrowDownToLine className="h-4 w-4" /></Button>
                        </div>
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
