"use client";

import React from "react";
import { useFabricCanvas } from "@/hooks/useFabricCanvas";

const Canvas = () => {
  const { canvasRef, clipboardStatus } = useFabricCanvas();
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} />
      {clipboardStatus && (
        <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", color: "#fff", padding: "4px 8px", borderRadius: 4, fontSize: 12, pointerEvents: "none", fontFamily: "system-ui, sans-serif" }}>
          {clipboardStatus}
        </div>
      )}
    </div>
  );
};

export default Canvas;
