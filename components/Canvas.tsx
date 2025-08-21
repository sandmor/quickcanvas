"use client";

import React, { useEffect, useRef } from "react";
import * as fabric from "fabric";

const Canvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Use a ref to hold the fabric.Canvas instance
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  // Clipboard for copy/cut/paste
  const clipboardRef = useRef<fabric.Object | null>(null);
  // Track last known pointer (in canvas/world coordinates)
  const lastPointerRef = useRef<fabric.Point | null>(null);

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

    // Copy, Cut, Paste helpers
    const doCopy = async () => {
      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;
      const cloned: any = await (activeObject as any).clone();
      clipboardRef.current = cloned as fabric.Object;
    };

    const doCut = async () => {
      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;
      const cloned: any = await (activeObject as any).clone();
      clipboardRef.current = cloned as fabric.Object;
      if ((activeObject as any).type === "activeSelection") {
        (activeObject as any).forEachObject((obj: fabric.Object) =>
          canvas.remove(obj)
        );
      } else {
        canvas.remove(activeObject);
      }
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    };

    const doPaste = async () => {
      const clipboard = clipboardRef.current as any;
      if (!clipboard) return;
      const clonedObj: any = await clipboard.clone();
      canvas.discardActiveObject();
      // Compute target point: last cursor position or canvas center in world coords
      const getCanvasCenterWorld = () => {
        const vpt = canvas.viewportTransform as number[] | null;
        const screenCenter = new fabric.Point(
          canvas.getWidth() / 2,
          canvas.getHeight() / 2
        );
        if (vpt) {
          const inv = (fabric as any).util.invertTransform(vpt);
          return (fabric as any).util.transformPoint(screenCenter, inv);
        }
        return screenCenter;
      };
      const targetPoint: fabric.Point =
        lastPointerRef.current || getCanvasCenterWorld();

      if (clonedObj.type === "activeSelection") {
        clonedObj.canvas = canvas;
        const pasted: any[] = [];
        clonedObj.forEachObject((obj: any) => {
          obj.set({ evented: true });
          canvas.add(obj);
          pasted.push(obj);
        });
        // Rebuild and position active selection so its center is at targetPoint
        const selection = new (fabric as any).ActiveSelection(pasted, { canvas });
        (selection as any).setPositionByOrigin(
          new fabric.Point(targetPoint.x, targetPoint.y),
          "center",
          "center"
        );
        selection.setCoords();
        canvas.setActiveObject(selection);
      } else {
        clonedObj.set({ evented: true });
        (clonedObj as any).setPositionByOrigin(
          new fabric.Point(targetPoint.x, targetPoint.y),
          "center",
          "center"
        );
        clonedObj.setCoords();
        canvas.add(clonedObj);
        canvas.setActiveObject(clonedObj);
      }
      canvas.requestRenderAll();
      // Keep clipboard unchanged; paste location is driven by cursor/center
    };

    const handleKeydown = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "c") {
        e.preventDefault();
        doCopy();
      } else if (key === "x") {
        e.preventDefault();
        doCut();
      } else if (key === "v") {
        e.preventDefault();
        doPaste();
      }
    };

    window.addEventListener("keydown", handleKeydown);

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
      const e = opt.e as any;
      // Update last pointer position
      const pt = canvas.getPointer(e);
      lastPointerRef.current = new fabric.Point(pt.x, pt.y);
      if (e && e.altKey) {
        (canvas as any).isDragging = true;
        canvas.selection = false;
        (canvas as any).lastPosX = e.clientX;
        (canvas as any).lastPosY = e.clientY;
      }
    });

    canvas.on("mouse:move", (opt) => {
      const e = opt.e as any;
      if (e) {
        const pt = canvas.getPointer(e);
        lastPointerRef.current = new fabric.Point(pt.x, pt.y);
      }
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
      window.removeEventListener("keydown", handleKeydown);
      // Important: dispose of the canvas instance
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []); // Empty dependency array ensures this runs only once

  return <canvas ref={canvasRef} />;
};

export default Canvas;
