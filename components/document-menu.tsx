"use client";

import { useEffect, useMemo, useState } from 'react';
import * as fabric from 'fabric';
import { Plus, FolderOpen, File as FileIcon, Check, Loader2, Trash2, RefreshCcw } from 'lucide-react';
import { useMainStore } from '@/store/mainStore';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { commandManager } from '@/lib/history/commandManager';

const getCanvas = () => (typeof window !== 'undefined' ? (window as any).fabricCanvas as fabric.Canvas | undefined : undefined);

export const DocumentMenu = () => {
    // Store bindings
    const docs = useMainStore(s => s.documents);
    const activeId = useMainStore(s => s.documentId);
    const name = useMainStore(s => s.documentName);
    const dirty = useMainStore(s => s.documentDirty);
    const loadDocuments = useMainStore(s => s.loadDocuments);
    const createDocument = useMainStore(s => s.createDocument);
    const saveDocument = useMainStore(s => s.saveDocument);
    const loadDocument = useMainStore(s => s.loadDocument);
    const renameDocument = useMainStore(s => s.renameDocument);
    const deleteDocument = useMainStore(s => s.deleteDocument);

    // UI state
    const [browserOpen, setBrowserOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
    const [resetOpen, setResetOpen] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [resetMode, setResetMode] = useState<'idle' | 'pending'>('idle');

    useEffect(() => { loadDocuments(); }, [loadDocuments]);

    const filtered = useMemo(() => docs.filter(d => d.name.toLowerCase().includes(filter.toLowerCase())), [docs, filter]);

    // Actions
    const handleCreate = async () => { await createDocument('Untitled'); };
    const handleOpen = async (id: string) => {
        if (id === activeId) { setBrowserOpen(false); return; }
        setLoadingDoc(id);
        try { await loadDocument(id, getCanvas()); } finally { setLoadingDoc(null); setBrowserOpen(false); }
    };
    const startRename = (id: string, current: string) => { setRenamingId(id); setRenameValue(current); };
    const commitRename = async () => {
        if (!renamingId) return;
        const val = renameValue.trim() || 'Untitled';
        await renameDocument(renamingId, val);
        setRenamingId(null); setRenameValue('');
    };

    // Reset Handling (dialog based)
    const triggerReset = () => {
        const canvas = getCanvas();
        const hasContent = !!canvas && canvas.getObjects().length > 0;
        if (!hasContent) {
            // Fast path: just spawn a new blank doc and clear
            createDocument('Untitled').then(() => { canvas?.clear(); canvas?.renderAll(); commandManager.clear(); });
            return;
        }
        setResetMode('pending');
        setResetOpen(true);
    };
    const resetSave = async () => {
        const canvas = getCanvas();
        await saveDocument(canvas, { force: true });
        await createDocument('Untitled');
        canvas?.clear(); canvas?.renderAll();
        commandManager.clear();
        setResetOpen(false); setResetMode('idle');
    };
    const resetDiscard = async () => {
        const canvas = getCanvas();
        if (activeId) await deleteDocument(activeId, canvas);
        canvas?.clear(); canvas?.renderAll();
        commandManager.clear();
        setResetOpen(false); setResetMode('idle');
    };

    // Delete Handling
    const requestDelete = (id: string) => setPendingDeleteId(id);
    const confirmDelete = async () => { if (!pendingDeleteId) return; await deleteDocument(pendingDeleteId, getCanvas()); setPendingDeleteId(null); };

    const ActiveLabel = () => (
        <span className="truncate max-w-[140px] inline-flex items-center gap-1">{name}{dirty && <span className="text-orange-500">*</span>}</span>
    );

    return (
        <>
            <div className="hidden md:flex fixed top-4 left-4 z-50">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="sm" className="h-8 px-3 font-medium"><ActiveLabel /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                        <DropdownMenuItem onClick={handleCreate} className="gap-2"><Plus className="h-4 w-4" /> New</DropdownMenuItem>
                        <DropdownMenuItem onClick={triggerReset} className="gap-2"><RefreshCcw className="h-4 w-4" /> Reset Canvas</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setBrowserOpen(true)} className="gap-2"><FolderOpen className="h-4 w-4" /> Open…</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Document Browser */}
            <Dialog open={browserOpen} onOpenChange={setBrowserOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Open Document</DialogTitle>
                        <DialogDescription>Manage your saved documents.</DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2 mb-3">
                        <Input placeholder="Filter by name" value={filter} onChange={e => setFilter(e.target.value)} className="h-8" />
                        <Button variant="outline" size="sm" onClick={handleCreate} className="h-8 gap-1"><Plus className="h-4 w-4" /> New</Button>
                    </div>
                    <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
                        {filtered.map(d => {
                            const isActive = d.id === activeId;
                            const isRenaming = renamingId === d.id;
                            return (
                                <div key={d.id} className={cn('flex items-center gap-2 px-3 py-2 text-sm', isActive && 'bg-accent/40')}>
                                    {d.preview ? <img src={d.preview} alt="preview" className="h-8 w-8 object-cover rounded-sm border" /> : <div className="h-8 w-8 flex items-center justify-center text-[10px] text-muted-foreground bg-muted rounded-sm">No</div>}
                                    <div className="flex-1 min-w-0">
                                        {isRenaming ? (
                                            <form onSubmit={(e) => { e.preventDefault(); commitRename(); }}>
                                                <Input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={commitRename} className="h-7 text-xs" />
                                            </form>
                                        ) : (
                                            <button onClick={() => handleOpen(d.id)} className="text-left w-full truncate font-medium text-xs leading-tight">{d.name}</button>
                                        )}
                                        <div className="text-[10px] text-muted-foreground">{new Date(d.updatedAt).toLocaleString()}</div>
                                    </div>
                                    {isActive && !isRenaming && <Check className="h-4 w-4 text-green-500" />}
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startRename(d.id, d.name)} aria-label="Rename"><FileIcon className="h-3.5 w-3.5" /></Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => requestDelete(d.id)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                                        <Button variant="secondary" size="sm" className="h-7 text-xs" disabled={loadingDoc === d.id} onClick={() => handleOpen(d.id)}>{loadingDoc === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Open'}</Button>
                                    </div>
                                </div>
                            );
                        })}
                        {filtered.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">No documents found</div>}
                    </div>
                    <DialogFooter className="mt-4 flex justify-end">
                        <Button variant="secondary" onClick={() => setBrowserOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reset Dialog */}
            <Dialog open={resetOpen} onOpenChange={(o) => { if (!o) { setResetOpen(false); setResetMode('idle'); } }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Reset Canvas</DialogTitle>
                        <DialogDescription>Start a new blank document? Save changes first or discard them.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 flex flex-col sm:flex-row justify-end">
                        <Button variant="outline" onClick={() => { setResetOpen(false); setResetMode('idle'); }}>Cancel</Button>
                        <Button variant="destructive" onClick={resetDiscard}>Discard</Button>
                        <Button onClick={resetSave}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog open={!!pendingDeleteId} onOpenChange={(o) => { if (!o) setPendingDeleteId(null); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete Document</DialogTitle>
                        <DialogDescription>This action cannot be undone.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 flex flex-col sm:flex-row justify-end">
                        <Button variant="outline" onClick={() => setPendingDeleteId(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default DocumentMenu;
