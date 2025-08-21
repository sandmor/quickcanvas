"use client";

import { useCallback } from "react";
import { useMainStore } from "@/store/mainStore";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MousePointer2, Square, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Toolbar = () => {
    const tool = useMainStore(s => s.tool);
    const setTool = useMainStore(s => s.setTool);

    const handleChange = useCallback((value: string) => {
        if (!value) return; // ignore unselect
        setTool(value as any);
    }, [setTool]);

    const tools: { id: string; label: string; icon: any; }[] = [
        { id: "pointer", label: "Pointer (V)", icon: MousePointer2 },
        { id: "rect", label: "Rectangle (R)", icon: Square },
        { id: "circle", label: "Circle (C)", icon: Circle },
    ];

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
            <TooltipProvider disableHoverableContent>
                <ToggleGroup type="single" value={tool} onValueChange={handleChange} className="bg-popover/90 backdrop-blur-md border rounded-lg shadow-lg p-1">
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
                </ToggleGroup>
            </TooltipProvider>
        </div>
    );
};

export default Toolbar;
