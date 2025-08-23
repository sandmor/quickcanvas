import { Dexie, Table } from 'dexie';
import { stableHash } from '@/lib/utils';

export interface DocumentRecord {
    id: string;               // uuid
    name: string;             // user supplied title
    createdAt: number;        // epoch ms
    updatedAt: number;        // epoch ms (content or name change)
    // Fabric JSON snapshot (canvas.toJSON). We purposely exclude viewport state for now (future opt-in)
    data: any;                // structured clone safe JSON
    // Lightweight preview PNG (dataURL) for quick switcher; may be regenerated lazily
    preview?: string;         // data:image/png;base64,...
    // Hash of stable structural content (object geometry & styles) for fast change detection
    contentHash: string;      // stable hash used for dirty detection / dedupe
    // Optional width/height of original canvas to allow aspect aware thumbnail framing on restore
    width?: number;
    height?: number;
}

class QCDB extends Dexie {
    documents!: Table<DocumentRecord, string>;
    constructor() {
        super('quickcanvas');
        (this as any).version(1).stores({
            // by updatedAt desc queries (Dexie supports compound indexes, keep simple now; we can add migrations later)
            documents: 'id, updatedAt, createdAt'
        });
    }
}

export const db = new QCDB();

// Utility: safe stable hash import (dynamic to avoid SSR issues if window undefined)
export const computeStableHash = async (payload: any): Promise<string> => {
    try { return await stableHash(payload); } catch { return Math.random().toString(36).slice(2); }
};

export const generateId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
