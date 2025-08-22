"use client";

import React, { useState, useMemo, useRef, useCallback } from "react";
import { ChevronsUpDown } from "lucide-react";
import chroma from "chroma-js";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CANVAS_COLOR_SWATCHES } from "@/lib/colors";

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  inline?: boolean; // if true render full controls inline (desktop panel)
  swatches?: string[]; // override default palette
  showSwatches?: boolean;
  showTriggerButton?: boolean; // for embedded mobile usage, hide the redundant header button
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  inline = false,
  swatches = CANVAS_COLOR_SWATCHES,
  showSwatches = true,
  showTriggerButton = true,
}) => {
  const [internalHex, setInternalHex] = useState(value);

  const hsv = useMemo(() => {
    const hsvColor = chroma(value).hsv();
    if (isNaN(hsvColor[0])) hsvColor[0] = 0;
    return hsvColor;
  }, [value]);

  const svPickerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const handleSvChange = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
      if (!svPickerRef.current) return;
      const rect = svPickerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
      const newSaturation = x / rect.width;
      const newValue = 1 - y / rect.height;
      onChange(chroma.hsv(hsv[0], newSaturation, newValue).hex());
    },
    [hsv, onChange]
  );

  const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHue = parseFloat(e.target.value);
    onChange(chroma.hsv(newHue, hsv[1], hsv[2]).hex());
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHex = e.target.value;
    setInternalHex(newHex);
    if (chroma.valid(newHex)) {
      onChange(newHex);
    }
  };

  const handleHexBlur = () => {
    if (!chroma.valid(internalHex)) {
      setInternalHex(value);
    }
  };

  const handleDefaultColorClick = (color: string) => {
    onChange(color);
  };

  const hueGradient =
    "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

  const svBlock = (
    <div
      ref={svPickerRef}
      className="w-full h-40 rounded-md cursor-pointer relative select-none"
      style={{
        background: `linear-gradient(to top, rgba(0,0,0,1), transparent), linear-gradient(to right, white, ${chroma
          .hsv(hsv[0], 1, 1)
          .hex()})`,
      }}
      onMouseDown={(e) => {
        isDraggingRef.current = true;
        handleSvChange(e);
        const handleMouseMove = (e: MouseEvent) => { if (isDraggingRef.current) handleSvChange(e); };
        const handleMouseUp = () => { isDraggingRef.current = false; window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
      }}
    >
      <div
        className="absolute w-3 h-3 rounded-full border-2 border-white shadow-md"
        style={{
          left: `${hsv[1] * 100}%`,
          top: `${100 - hsv[2] * 100}%`,
          transform: 'translate(-50%, -50%)',
          backgroundColor: value,
        }}
      />
    </div>
  );

  const hueSlider = (
    <input
      type="range"
      min={0}
      max={360}
      value={hsv[0]}
      onChange={handleHueChange}
      className="w-full h-2 bg-transparent appearance-none cursor-pointer"
      style={{ background: hueGradient, borderRadius: '9999px' }}
    />
  );

  const hexInput = (
    <Input
      value={internalHex.toUpperCase()}
      onChange={handleHexChange}
      onBlur={handleHexBlur}
      className="w-full text-center text-sm font-mono tracking-widest"
    />
  );

  const swatchesGrid = showSwatches && (
    <div className="grid grid-cols-6 gap-1.5 pt-2">
      {swatches.map(color => (
        <button
          key={color}
          type="button"
          className={cn(
            'aspect-square w-full rounded-sm border transition',
            value.toUpperCase() === color.toUpperCase() ? 'ring-2 ring-ring border-ring' : 'border-border/60 hover:border-foreground/50'
          )}
          style={{ backgroundColor: color }}
          onClick={() => handleDefaultColorClick(color)}
          aria-label={`Set color ${color}`}
        />
      ))}
    </div>
  );

  if (inline) {
    return (
      <div className="flex flex-col gap-3">
        {svBlock}
        {hueSlider}
        {hexInput}
        {swatchesGrid}
      </div>
    );
  }

  // Compact button + expandable (consumer controls expansion for mobile panel)
  return (
    <div className="flex flex-col gap-2 w-full">
      {showTriggerButton && (
        <Button variant="outline" className="justify-start font-normal px-2 py-1 h-8" aria-label="Current color">
          <span className="flex items-center gap-2 w-full">
            <span className="h-4 w-4 rounded-sm border" style={{ background: value }} />
            <span className="text-xs font-mono tracking-wide">{value.toUpperCase()}</span>
            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </Button>
      )}
      <div className="flex flex-col gap-3">
        {svBlock}
        {hueSlider}
        {hexInput}
        {swatchesGrid}
      </div>
    </div>
  );
};
