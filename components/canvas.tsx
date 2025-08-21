"use client";

import React from "react";
import { useFabricCanvas } from "@/hooks/useFabricCanvas";

const Canvas = () => {
  const { canvasRef } = useFabricCanvas();
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default Canvas;
