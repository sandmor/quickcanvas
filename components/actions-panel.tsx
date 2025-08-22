"use client";

import React, { useCallback, useState } from "react";
import * as fabric from "fabric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, Layers, FolderOpen, Plus, File as FileIcon, Check, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMainStore } from "@/store/mainStore";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { FillControl, CornerRadiusControl, LayerControls, DeleteControl } from './selection-controls';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
// (duplicate removed)

export const ActionsPanel: React.FC = () => {
    const selection = useMainStore(s => s.selection);
    const fns = {
        applyFillToSelection: useMainStore(s => s.applyFillToSelection),
        applyRectCornerRadiusToSelection: useMainStore(s => s.applyRectCornerRadiusToSelection),
        deleteSelection: useMainStore(s => s.deleteSelection),
        bringForward: useMainStore(s => s.bringForward),
        sendBackward: useMainStore(s => s.sendBackward),
        bringToFront: useMainStore(s => s.bringToFront),
        sendToBack: useMainStore(s => s.sendToBack),
    };
    if (!selection.has || selection.editingText) return null;
    return (
        <div aria-label="Selection actions" className="z-50 pointer-events-auto fixed top-1/2 -translate-y-1/2 left-4 hidden md:flex flex-col">
            <div className="flex flex-col gap-4 p-3 rounded-lg border bg-popover/90 backdrop-blur-md shadow-lg w-44">
                <FillControl selection={selection} fns={fns} size="sm" />
                <CornerRadiusControl selection={selection} fns={fns} size="sm" />
                <LayerControls selection={selection} fns={fns} size="sm" />
                <DeleteControl selection={selection} fns={fns} size="sm" />
            </div>
        </div>
    );
};

// Separate mobile rendering to avoid layout complexity with Tailwind breakpoint utilities.
export const ActionsPanelMobile: React.FC = () => {
    const [expanded, setExpanded] = useState(false);
    const selection = useMainStore(s => s.selection);
    // Document integration (reuse logic from document-menu but trimmed for mobile)
    const docs = useMainStore(s => s.documents);
    const activeId = useMainStore(s => s.documentId);
    const name = useMainStore(s => s.documentName);
    const dirty = useMainStore(s => s.documentDirty);
    const loadDocuments = useMainStore(s => s.loadDocuments);
    const createDocument = useMainStore(s => s.createDocument);
    const loadDocument = useMainStore(s => s.loadDocument);
    const renameDocument = useMainStore(s => s.renameDocument);
    const deleteDocument = useMainStore(s => s.deleteDocument);
    const saveDocument = useMainStore(s => s.saveDocument);
    const [docDialogOpen, setDocDialogOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
    React.useEffect(() => { loadDocuments(); }, [loadDocuments]);
    const filteredDocs = React.useMemo(() => docs.filter(d => d.name.toLowerCase().includes(filter.toLowerCase())), [docs, filter]);
    const openDoc = async (id: string) => { if (id === activeId) { setDocDialogOpen(false); return; } setLoadingDoc(id); try { await loadDocument(id, window.fabricCanvas); } finally { setLoadingDoc(null); setDocDialogOpen(false); } };
    const commitRename = async () => { if (!renamingId) return; const v = renameValue.trim() || 'Untitled'; await renameDocument(renamingId, v); setRenamingId(null); setRenameValue(''); };
    const deleteDoc = async (id: string) => { if (!confirm('Delete this document?')) return; await deleteDocument(id, window.fabricCanvas); };
    const saveNow = () => saveDocument(window.fabricCanvas, { force: true });
    const fns = {
        applyFillToSelection: useMainStore(s => s.applyFillToSelection),
        applyRectCornerRadiusToSelection: useMainStore(s => s.applyRectCornerRadiusToSelection),
        deleteSelection: useMainStore(s => s.deleteSelection),
        bringForward: useMainStore(s => s.bringForward),
        sendBackward: useMainStore(s => s.sendBackward),
        bringToFront: useMainStore(s => s.bringToFront),
        sendToBack: useMainStore(s => s.sendToBack),
    };
    const hasSelection = selection.has && !selection.editingText;
    return (
        <>
            <div className="fixed md:hidden bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(100%-1.5rem,560px)]">
                <div className="bg-popover/90 backdrop-blur-md border shadow-lg rounded-xl p-2 flex flex-col gap-2" aria-label="Mobile actions panel">
                    <div className="flex items-center justify-between gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="secondary" size="sm" className="h-8 px-3 font-medium">
                                    <span className="truncate max-w-[110px] inline-flex items-center gap-1">{name}{dirty && <span className="text-orange-500">*</span>}</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="top" align="start" className="w-56">
                                <DropdownMenuItem onClick={() => createDocument('Untitled')} className="gap-2"><Plus className="h-4 w-4" /> New</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDocDialogOpen(true)} className="gap-2"><FolderOpen className="h-4 w-4" /> Open…</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={saveNow} className="gap-2"><FileIcon className="h-4 w-4" /> Save Now</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {hasSelection && (
                            <Button variant="ghost" size="sm" onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls="qc-mobile-selection" aria-label="Toggle selection options" className="h-7 px-2 inline-flex items-center gap-1">
                                <Layers className="h-4 w-4" />
                                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded ? 'rotate-180' : '')} />
                            </Button>
                        )}
                    </div>
                    {hasSelection && (
                        <div id="qc-mobile-selection" className={cn("grid grid-cols-1 gap-3 pt-1 transition-[grid-template-rows,opacity] duration-300", expanded ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
                            {expanded && (
                                <>
                                    <FillControl selection={selection} fns={fns} size="sm" />
                                    <CornerRadiusControl selection={selection} fns={fns} size="sm" />
                                    <LayerControls selection={selection} fns={fns} size="sm" />
                                    <DeleteControl selection={selection} fns={fns} size="sm" onAfterDelete={() => setExpanded(false)} />
                                </>
                            )}
                        </div>
                    )}
                    {!hasSelection && (
                        <div className="px-1 pb-1 text-[11px] text-muted-foreground font-medium tracking-wide">Select an object to edit its properties</div>
                    )}
                </div>
            </div>
            <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Open Document</DialogTitle>
                        <DialogDescription>Manage saved documents.</DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2 mb-3">
                        <Input placeholder="Filter" value={filter} onChange={e => setFilter(e.target.value)} className="h-8" />
                        <Button variant="outline" size="sm" onClick={() => createDocument('Untitled')} className="h-8 gap-1"><Plus className="h-4 w-4" /> New</Button>
                    </div>
                    <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
                        {filteredDocs.map(d => {
                            const isActive = d.id === activeId;
                            const isRenaming = renamingId === d.id;
                            return (
                                <div key={d.id} className={cn('flex items-center gap-2 px-3 py-2 text-sm', isActive && 'bg-accent/40')}>
                                    {d.preview ? <img src={d.preview} alt='preview' className='h-8 w-8 object-cover rounded-sm border' /> : <div className='h-8 w-8 flex items-center justify-center text-[10px] text-muted-foreground bg-muted rounded-sm'>No</div>}
                                    <div className="flex-1 min-w-0">
                                        {isRenaming ? (
                                            <form onSubmit={(e) => { e.preventDefault(); commitRename(); }}>
                                                <Input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={commitRename} className='h-7 text-xs' />
                                            </form>
                                        ) : (
                                            <button onClick={() => openDoc(d.id)} className='text-left w-full truncate font-medium text-xs leading-tight'>
                                                {d.name}
                                            </button>
                                        )}
                                        <div className='text-[10px] text-muted-foreground'>{new Date(d.updatedAt).toLocaleString()}</div>
                                    </div>
                                    {isActive && !isRenaming && <Check className='h-4 w-4 text-green-500' />}
                                    <div className='flex items-center gap-1'>
                                        <Button variant='ghost' size='icon' className='h-7 w-7' onClick={() => { setRenamingId(d.id); setRenameValue(d.name); }} aria-label='Rename'><FileIcon className='h-3.5 w-3.5' /></Button>
                                        <Button variant='ghost' size='icon' className='h-7 w-7 text-destructive' onClick={() => deleteDoc(d.id)} aria-label='Delete'><Trash2 className='h-3.5 w-3.5' /></Button>
                                        <Button variant='secondary' size='sm' className='h-7 text-xs' disabled={loadingDoc === d.id} onClick={() => openDoc(d.id)}>
                                            {loadingDoc === d.id ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'Open'}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                        {filteredDocs.length === 0 && <div className='py-8 text-center text-xs text-muted-foreground'>No documents</div>}
                    </div>
                    <DialogFooter className='mt-4'>
                        <Button variant='secondary' onClick={() => setDocDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default function CombinedActionsPanel() {
    return <>
        <ActionsPanel />
        <ActionsPanelMobile />
    </>;
}

// Mobile-specific rectangle corner radius controls (kept separate for clarity & responsive concerns)
// (CornerRadiusMobileControls removed in favor of shared CornerRadiusControl)
