"use client";

import { useCallback } from "react";
import * as fabric from "fabric";
import { getCanvasCenterWorld } from "@/lib/fabric/utils";
import { useMainStore } from "@/store/mainStore";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MousePointer2, Square, Circle, Library } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "./ui/hover-card";
import { toast } from "sonner";

export const Toolbar = () => {
    const tool = useMainStore(s => s.tool);
    const setTool = useMainStore(s => s.setTool);

    const handleChange = useCallback((value: string) => {
        if (!value) return; // ignore unselect
        setTool(value as any);
    }, [setTool]);

    type ToolId = "pointer" | "rect" | "circle";
    const tools: { id: ToolId; label: string; icon: React.ComponentType<any>; }[] = [
        { id: "pointer", label: "Pointer (V)", icon: MousePointer2 },
        { id: "rect", label: "Rectangle (R)", icon: Square },
        { id: "circle", label: "Circle (C)", icon: Circle },
    ];
    const gallery = useMainStore(s => s.gallery);
    const kindLabels: Record<string, string> = { image: "Image", object: "Object", selection: "Group", unknown: "Resource" };
    const friendlyKind = (k: string): string => kindLabels[k] ?? "Resource";
    // Gallery insertion rehydrates serialized objects back onto the live fabric canvas
    const handleInsert = useCallback((itemId: string) => {
        const canvas = (window as any).fabricCanvas as fabric.Canvas | undefined;
        if (!canvas) return;
        const item = gallery.find(g => g.id === itemId); if (!item) return;
        const center = getCanvasCenterWorld(canvas);
        const addAndCenter = (objs: fabric.Object[]) => {
            objs.forEach(o => { o.set({ evented: true }); canvas.add(o); });
            if (objs.length === 1) {
                (objs[0] as any).setPositionByOrigin(center, 'center', 'center');
                canvas.setActiveObject(objs[0]);
            } else if (objs.length > 1) {
                const sel = new (fabric as any).ActiveSelection(objs, { canvas });
                sel.setPositionByOrigin(center, 'center', 'center');
                canvas.setActiveObject(sel);
            }
            canvas.requestRenderAll();
        };
        const descriptors = Array.isArray(item.payload) ? item.payload : [item.payload];
        Promise.resolve((fabric.util as any).enlivenObjects(descriptors))
            .then((objs: fabric.Object[]) => addAndCenter(objs))
            .catch((err: unknown) => {
                console.warn("Failed to insert gallery resource", { err, item });
                toast.error("Failed to insert resource – it may be invalid or incompatible.");
            });
    }, [gallery]);

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
            <TooltipProvider disableHoverableContent>
                <ToggleGroup type="single" value={tool} onValueChange={handleChange} className="bg-popover/90 backdrop-blur-md border rounded-lg shadow-lg p-1 flex items-stretch">
                    {tools.map(t => {
                        const Icon = t.icon;
                        return (
                            <ToggleGroupItem
                                key={t.id}
                                value={t.id}
                                aria-label={t.label}
                                className="size-9 p-0 flex items-center justify-center"
                            >
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="flex items-center justify-center w-full h-full">
                                            <Icon className="h-4 w-4" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" sideOffset={4}>{t.label}</TooltipContent>
                                </Tooltip>
                            </ToggleGroupItem>
                        );
                    })}
                    <Separator orientation="vertical" className="mx-1" />
                    <DropdownMenu>
                        <Tooltip>
                            <DropdownMenuTrigger asChild>
                                <button aria-label="Resources Gallery" className="size-9 rounded-md hover:bg-accent/50 inline-flex items-center justify-center text-foreground/80">
                                    <Library className="h-4 w-4" />
                                </button>
                            </DropdownMenuTrigger>
                            <TooltipContent side="bottom" sideOffset={4}>Resources Gallery</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent className="w-[340px] p-2">
                            <div className="text-xs font-medium text-muted-foreground px-1 pb-2 tracking-wide">
                                Recent Resources
                            </div>
                            <ScrollArea className="h-64 rounded-md">
                                <div className="grid grid-cols-3 gap-2 pr-1 pb-1">
                                    {gallery.length === 0 && (
                                        <div className="col-span-3 flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 py-8 text-center">
                                            <Library className="h-5 w-5 text-muted-foreground" />
                                            <p className="text-[11px] leading-tight text-muted-foreground px-6">
                                                Paste images or SVG content to build your reusable gallery.
                                            </p>
                                        </div>
                                    )}
                                    {gallery.map(item => (
                                        <HoverCard key={item.id} openDelay={120} closeDelay={80}>
                                            <HoverCardTrigger asChild>
                                                <button
                                                    type="button"
                                                    aria-label={`Insert ${friendlyKind(item.kind)}`}
                                                    title={friendlyKind(item.kind)}
                                                    onClick={() => handleInsert(item.id)}
                                                    className="group relative aspect-square w-full overflow-hidden rounded-md border bg-muted/30 backdrop-blur-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                                >
                                                    <div className="absolute inset-0 flex items-center justify-center p-1">
                                                        <img
                                                            src={item.preview}
                                                            alt={friendlyKind(item.kind)}
                                                            className="object-contain w-full h-full transition-transform duration-300 group-hover:scale-[1.04]"
                                                            draggable={false}
                                                        />
                                                    </div>
                                                    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-t from-background/70 via-background/10 to-transparent" />
                                                    <span className="pointer-events-none absolute bottom-1 left-1 inline-flex items-center rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
                                                        {friendlyKind(item.kind)}
                                                    </span>
                                                </button>
                                            </HoverCardTrigger>
                                            <HoverCardContent side="right" className="w-auto p-2">
                                                <div className="relative flex items-center justify-center rounded-md border bg-background/60 backdrop-blur-sm p-2 shadow-sm">
                                                    <img
                                                        src={item.preview}
                                                        alt={friendlyKind(item.kind)}
                                                        className="max-h-[260px] max-w-[260px] object-contain"
                                                        draggable={false}
                                                    />
                                                    <span className="absolute top-1 right-1 rounded-sm bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border/60">
                                                        {friendlyKind(item.kind)}
                                                    </span>
                                                </div>
                                            </HoverCardContent>
                                        </HoverCard>
                                    ))}
                                </div>
                            </ScrollArea>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </ToggleGroup>
            </TooltipProvider>
        </div>
    );
};

export default Toolbar;
