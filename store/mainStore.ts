"use client";
import { create } from "zustand";
import { CanvasTool } from "@/hooks/useFabricCanvas";

interface Mainstore {
    tool: CanvasTool;
    setTool: (t: CanvasTool) => void;
}

export const useMainStore = create<Mainstore>()(
    (set) => ({
        tool: "pointer",
        setTool: (t) => set({ tool: t }),
    })
);
