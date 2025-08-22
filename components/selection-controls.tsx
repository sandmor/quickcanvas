"use client";

import React from 'react';
import * as fabric from 'fabric';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Trash2, PaintBucket, Link2, Link2Off, ArrowUpToLine, ArrowUp, ArrowDown, ArrowDownToLine } from 'lucide-react';
import { CANVAS_COLOR_SWATCHES } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { ColorPicker } from './color-picker';

// Shared types (lightweight subset)
export interface SelectionSnapshot {
    has: boolean;
    editingText: boolean;
    fill: string | null;
    shape?: { kind: string; rect?: { rx: number | null; ry: number | null } } | null;
    capabilities?: { fill?: boolean; cornerRadius?: boolean };
}

interface CommonFns {
    applyFillToSelection: (canvas: fabric.Canvas, color: string) => void;
    applyRectCornerRadiusToSelection: (canvas: fabric.Canvas, r: { rx?: number; ry?: number }, opts?: { record?: boolean }) => void;
    bringForward: (canvas: fabric.Canvas) => void;
    sendBackward: (canvas: fabric.Canvas) => void;
    bringToFront: (canvas: fabric.Canvas) => void;
    sendToBack: (canvas: fabric.Canvas) => void;
    deleteSelection: (canvas: fabric.Canvas) => void;
}

// ----- Fill Swatches -----
export const FillControl: React.FC<{ selection: SelectionSnapshot; fns: CommonFns; size?: 'sm' | 'md'; className?: string; }> = ({ selection, fns, size = 'md', className }) => {
    if (!selection.capabilities?.fill) return null;
    const apply = (c: string) => { const canvas = window.fabricCanvas; if (canvas) fns.applyFillToSelection(canvas, c); };
    const swatchSize = size === 'sm' ? 'size-6' : 'size-7';
    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground">Fill</span>
            <div className="flex flex-wrap gap-1.5 items-center">
                {CANVAS_COLOR_SWATCHES.map(c => {
                    const active = selection.fill?.toLowerCase() === c.toLowerCase();
                    return (
                        <button
                            key={c}
                            onClick={() => apply(c)}
                            aria-label={`Set fill ${c}`}
                            className={cn(
                                swatchSize,
                                'rounded-sm border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition',
                                active ? 'ring-2 ring-ring border-ring' : 'border-border/60 hover:border-foreground/50'
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
                                swatchSize,
                                'inline-flex items-center justify-center rounded-sm border border-border/60 bg-background/30 hover:border-foreground/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                            )}
                            type="button"
                        >
                            <PaintBucket className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4', 'text-muted-foreground')} />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-4" side="top" align="start">
                        <div className="text-[11px] font-medium tracking-wide text-muted-foreground mb-2">Custom Color</div>
                        <ColorPicker
                            value={selection.fill || '#000000'}
                            onChange={apply}
                            inline
                            showSwatches={false}
                        />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
};

// ----- Corner Radius -----
export const CornerRadiusControl: React.FC<{ selection: SelectionSnapshot; fns: CommonFns; size?: 'sm' | 'md'; className?: string; presets?: number[]; }> = ({ selection, fns, size = 'md', className, presets = [0, 4, 8, 16, 24, 32] }) => {
    // Always establish hooks (no early return) to preserve consistent hook order across renders.
    const rectRx = selection.shape?.kind === 'rect' ? selection.shape?.rect?.rx ?? null : null;
    const rectRy = selection.shape?.kind === 'rect' ? selection.shape?.rect?.ry ?? null : null;
    const [lockRadius, setLockRadius] = React.useState(true);
    const [tempRx, setTempRx] = React.useState('');
    const [tempRy, setTempRy] = React.useState('');
    React.useEffect(() => {
        if (rectRx != null) setTempRx(String(rectRx)); else setTempRx('');
        if (rectRy != null) setTempRy(String(rectRy)); else setTempRy('');
    }, [rectRx, rectRy, selection.shape?.kind]);
    const enabled = !!selection.capabilities?.cornerRadius && selection.shape?.kind === 'rect';
    if (!enabled) return null;

    const commit = (which: 'rx' | 'ry', v: string, record = false) => {
        const canvas = window.fabricCanvas; if (!canvas) return;
        const num = parseFloat(v); if (isNaN(num)) return;
        if (lockRadius) {
            fns.applyRectCornerRadiusToSelection(canvas, { rx: num, ry: num }, { record });
        } else {
            fns.applyRectCornerRadiusToSelection(canvas, which === 'rx' ? { rx: num } : { ry: num }, { record });
        }
    };
    const inputClass = cn('h-8 text-xs px-2', size === 'sm' && 'h-8');
    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground">Corners</span>
                <button
                    type="button"
                    aria-label={lockRadius ? 'Unlock aspect' : 'Lock aspect'}
                    onClick={() => setLockRadius(l => !l)}
                    className={cn('inline-flex items-center justify-center rounded-md border border-border/60 bg-background/40 hover:bg-accent hover:text-accent-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', size === 'sm' ? 'h-7 w-7' : 'h-6 w-6')}
                >
                    {lockRadius ? <Link2 className={cn(size === 'sm' ? 'h-4 w-4' : 'h-3.5 w-3.5')} /> : <Link2Off className={cn(size === 'sm' ? 'h-4 w-4' : 'h-3.5 w-3.5')} />}
                </button>
            </div>
            {presets?.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 mb-1">
                    {presets.map(p => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => {
                                const canvas = window.fabricCanvas; if (!canvas) return;
                                fns.applyRectCornerRadiusToSelection(canvas, { rx: p, ry: p }, { record: true });
                            }}
                            className={cn('h-7 rounded-md text-[11px] font-medium border transition-colors flex items-center justify-center',
                                (rectRx === p && rectRy === p) ? 'bg-accent text-accent-foreground border-transparent shadow-sm' : 'bg-background/40 hover:bg-accent/40 border-border/60')}
                            aria-pressed={rectRx === p && rectRy === p}
                        >{p}</button>
                    ))}
                </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
                <Input
                    type="number"
                    min={0}
                    step={1}
                    value={tempRx}
                    placeholder={rectRx == null ? '—' : undefined}
                    onChange={e => { const v = e.target.value; setTempRx(v); if (lockRadius) setTempRy(v); if (v !== '' && !isNaN(Number(v))) commit('rx', v, false); }}
                    onBlur={e => commit('rx', e.target.value, true)}
                    className={inputClass}
                    aria-label="Horizontal corner radius"
                />
                <Input
                    type="number"
                    min={0}
                    step={1}
                    value={tempRy}
                    placeholder={rectRy == null ? '—' : undefined}
                    onChange={e => { const v = e.target.value; setTempRy(v); if (lockRadius) setTempRx(v); if (!lockRadius && v !== '' && !isNaN(Number(v))) commit('ry', v, false); }}
                    onBlur={e => commit('ry', e.target.value, true)}
                    disabled={lockRadius}
                    className={cn(inputClass, 'disabled:opacity-60')}
                    aria-label="Vertical corner radius"
                />
            </div>
        </div>
    );
};

// ----- Layer Controls -----
export const LayerControls: React.FC<{ selection: SelectionSnapshot; fns: CommonFns; size?: 'sm' | 'md'; className?: string; }> = ({ selection, fns, size = 'md', className }) => {
    if (!selection.has) return null;
    const computeLayerDisables = (): { bfwd: boolean; fwd: boolean; bwd: boolean; bback: boolean } => {
        const canvas = window.fabricCanvas; if (!canvas) return { bfwd: true, fwd: true, bwd: true, bback: true };
        const stack = canvas._objects; if (stack.length <= 1) return { bfwd: true, fwd: true, bwd: true, bback: true };
        const active = canvas.getActiveObject(); if (!active) return { bfwd: true, fwd: true, bwd: true, bback: true };
        const objs: fabric.Object[] = [];
        if (active.type === 'activeSelection') (active as fabric.ActiveSelection).forEachObject(o => objs.push(o)); else objs.push(active);
        const set = new Set(objs);
        const indices = objs.map(o => stack.indexOf(o)).filter(i => i >= 0).sort((a, b) => a - b);
        if (!indices.length) return { bfwd: true, fwd: true, bwd: true, bback: true };
        const min = indices[0]; const max = indices[indices.length - 1];
        const atTop = max === stack.length - 1;
        const atBottom = min === 0;
        const disableBringForward = atTop || indices.every(i => i === stack.length - 1 || set.has(stack[i + 1]));
        const disableSendBackward = atBottom || indices.every(i => i === 0 || set.has(stack[i - 1]));
        const disableBringToFront = max === stack.length - 1 || stack.slice(max + 1).every(o => set.has(o));
        const disableSendToBack = min === 0 || stack.slice(0, min).every(o => set.has(o));
        return { bfwd: disableBringToFront, fwd: disableBringForward, bwd: disableSendBackward, bback: disableSendToBack };
    };
    const disables = computeLayerDisables();
    const btnSize = size === 'sm' ? 'h-8 px-0' : 'h-8 px-2';
    const iconClass = 'h-4 w-4';
    const act = (fn: (c: fabric.Canvas) => void) => { const canvas = window.fabricCanvas; if (canvas) fn(canvas); };
    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground">Layer</span>
            <div className="grid grid-cols-4 gap-1">
                <Tooltip><TooltipTrigger asChild><Button variant="secondary" size="sm" aria-label="Bring to front" disabled={disables.bfwd} onClick={() => act(fns.bringToFront)} className={cn(btnSize, 'transition-transform hover:shadow-sm active:scale-[0.94]', disables.bfwd && 'opacity-50')}><ArrowUpToLine className={iconClass} /></Button></TooltipTrigger><TooltipContent side="top">Bring to front</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button variant="secondary" size="sm" aria-label="Bring forward" disabled={disables.fwd} onClick={() => act(fns.bringForward)} className={cn(btnSize, 'transition-transform hover:shadow-sm active:scale-[0.94]', disables.fwd && 'opacity-50')}><ArrowUp className={iconClass} /></Button></TooltipTrigger><TooltipContent side="top">Bring forward</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button variant="secondary" size="sm" aria-label="Send backward" disabled={disables.bwd} onClick={() => act(fns.sendBackward)} className={cn(btnSize, 'transition-transform hover:shadow-sm active:scale-[0.94]', disables.bwd && 'opacity-50')}><ArrowDown className={iconClass} /></Button></TooltipTrigger><TooltipContent side="top">Send backward</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button variant="secondary" size="sm" aria-label="Send to back" disabled={disables.bback} onClick={() => act(fns.sendToBack)} className={cn(btnSize, 'transition-transform hover:shadow-sm active:scale-[0.94]', disables.bback && 'opacity-50')}><ArrowDownToLine className={iconClass} /></Button></TooltipTrigger><TooltipContent side="top">Send to back</TooltipContent></Tooltip>
            </div>
        </div>
    );
};

// ----- Delete -----
export const DeleteControl: React.FC<{ selection: SelectionSnapshot; fns: CommonFns; size?: 'sm' | 'md'; className?: string; onAfterDelete?: () => void; }> = ({ selection, fns, size = 'md', className, onAfterDelete }) => {
    if (!selection.has) return null;
    const act = () => { const canvas = window.fabricCanvas; if (canvas) { fns.deleteSelection(canvas); onAfterDelete?.(); } };
    return (
        <Button variant="destructive" size="sm" aria-label="Delete selection" onClick={act} className={cn('justify-center', size === 'sm' ? 'h-8' : 'h-8', className)}>
            <Trash2 className="h-4 w-4" /> <span className="sr-only">Delete</span>
        </Button>
    );
};
