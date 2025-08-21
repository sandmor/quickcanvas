"use client";

import React, { useEffect, useRef } from "react";
import * as fabric from "fabric";

const Canvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Use a ref to hold the fabric.Canvas instance
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

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
      const e = opt.e as MouseEvent;
      if (e && e.altKey) {
        (canvas as any).isDragging = true;
        canvas.selection = false;
        (canvas as any).lastPosX = e.clientX;
        (canvas as any).lastPosY = e.clientY;
      }
    });

    canvas.on("mouse:move", (opt) => {
      const e = opt.e as MouseEvent;
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
      // Important: dispose of the canvas instance
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []); // Empty dependency array ensures this runs only once

  return <canvas ref={canvasRef} />;
};

export default Canvas;
