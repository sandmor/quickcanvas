"use client";

import { useEffect, useMemo, useState } from 'react';
import { useMainStore } from '@/store/mainStore';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Plus, FolderOpen, File as FileIcon, Check, Loader2, Trash2 } from 'lucide-react';
import * as fabric from 'fabric';
import { cn } from '@/lib/utils';

// Single source for obtaining canvas
const getCanvas = () => (typeof window !== 'undefined' ? window.fabricCanvas as fabric.Canvas | undefined : undefined);

export const DocumentMenu = () => {
    const docs = useMainStore(s => s.documents);
    const activeId = useMainStore(s => s.documentId);
    const name = useMainStore(s => s.documentName);
    const dirty = useMainStore(s => s.documentDirty);
    const loadDocuments = useMainStore(s => s.loadDocuments);
    const createDocument = useMainStore(s => s.createDocument);
    const loadDocument = useMainStore(s => s.loadDocument);
    const renameDocument = useMainStore(s => s.renameDocument);
    const deleteDocument = useMainStore(s => s.deleteDocument);
    const [openDialog, setOpenDialog] = useState(false);
    const [filter, setFilter] = useState('');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [loadingDoc, setLoadingDoc] = useState<string | null>(null);

    useEffect(() => { loadDocuments(); }, [loadDocuments]);

    const filtered = useMemo(() => docs.filter(d => d.name.toLowerCase().includes(filter.toLowerCase())), [docs, filter]);

    const handleCreate = async () => {
        await createDocument('Untitled');
    };
    const handleOpen = async (id: string) => {
        if (id === activeId) { setOpenDialog(false); return; }
        setLoadingDoc(id);
        try { await loadDocument(id, getCanvas()); } finally { setLoadingDoc(null); setOpenDialog(false); }
    };
    const startRename = (id: string, current: string) => { setRenamingId(id); setRenameValue(current); };
    const commitRename = async () => {
        if (!renamingId) return;
        const val = renameValue.trim() || 'Untitled';
        await renameDocument(renamingId, val);
        setRenamingId(null); setRenameValue('');
    };
    const handleDelete = async (id: string) => {
        if (!confirm('Delete this document?')) return;
        await deleteDocument(id, getCanvas());
    };

    const ActiveLabel = () => (
        <span className="truncate max-w-[140px] inline-flex items-center gap-1">
            {name}{dirty && <span className="text-orange-500">*</span>}
        </span>
    );

    return (
        <>
            {/* Desktop: top-left floating */}
            <div className="hidden md:flex fixed top-4 left-4 z-50">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="sm" className="h-8 px-3 font-medium">
                            <ActiveLabel />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                        <DropdownMenuItem onClick={handleCreate} className="gap-2">
                            <Plus className="h-4 w-4" /> New
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setOpenDialog(true)} className="gap-2">
                            <FolderOpen className="h-4 w-4" /> Open…
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Open Document</DialogTitle>
                        <DialogDescription>Select and manage your saved documents.</DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2 mb-3">
                        <Input placeholder="Filter by name" value={filter} onChange={e => setFilter(e.target.value)} className="h-8" />
                        <Button variant="outline" size="sm" onClick={handleCreate} className="h-8 gap-1">
                            <Plus className="h-4 w-4" /> New
                        </Button>
                    </div>
                    <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
                        {filtered.map(d => {
                            const isActive = d.id === activeId;
                            const isRenaming = renamingId === d.id;
                            return (
                                <div key={d.id} className={cn("flex items-center gap-2 px-3 py-2 text-sm", isActive && 'bg-accent/40')}>
                                    {d.preview ? <img src={d.preview} alt="preview" className="h-8 w-8 object-cover rounded-sm border" /> : <div className="h-8 w-8 flex items-center justify-center text-[10px] text-muted-foreground bg-muted rounded-sm">No</div>}
                                    <div className="flex-1 min-w-0">
                                        {isRenaming ? (
                                            <form onSubmit={(e) => { e.preventDefault(); commitRename(); }}>
                                                <Input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={commitRename} className="h-7 text-xs" />
                                            </form>
                                        ) : (
                                            <button onClick={() => handleOpen(d.id)} className="text-left w-full truncate font-medium text-xs leading-tight">
                                                {d.name}
                                            </button>
                                        )}
                                        <div className="text-[10px] text-muted-foreground">{new Date(d.updatedAt).toLocaleString()}</div>
                                    </div>
                                    {isActive && !isRenaming && <Check className="h-4 w-4 text-green-500" />}
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startRename(d.id, d.name)} aria-label="Rename"><FileIcon className="h-3.5 w-3.5" /></Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                                        <Button variant="secondary" size="sm" className="h-7 text-xs" disabled={loadingDoc === d.id} onClick={() => handleOpen(d.id)}>
                                            {loadingDoc === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Open'}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                        {filtered.length === 0 && (
                            <div className="py-10 text-center text-xs text-muted-foreground">No documents found</div>
                        )}
                    </div>
                    <DialogFooter className="mt-4 flex justify-end">
                        <Button variant="secondary" onClick={() => setOpenDialog(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default DocumentMenu;
