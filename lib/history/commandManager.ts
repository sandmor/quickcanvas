import * as fabric from 'fabric';

const ensureObjectId = (obj: fabric.Object): string => {
    const anyObj = obj as any;
    if (!anyObj.qcId) {
        anyObj.qcId = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2, 11);
    }
    return anyObj.qcId;
};

export interface SerializedState { qcId: string; json: any; }

const serializeObject = (obj: fabric.Object): SerializedState => {
    const qcId = ensureObjectId(obj);
    const json = obj.toObject?.() ?? {};
    (json as any).qcId = qcId;
    return { qcId, json };
};
const serializeObjects = (objs: fabric.Object[]): SerializedState[] => objs.map(serializeObject);

const findObjectById = (canvas: fabric.Canvas, id: string): fabric.Object | undefined =>
    canvas.getObjects().find(o => (o as any).qcId === id);

const applyStateToExisting = (canvas: fabric.Canvas, state: SerializedState) => {
    const target = findObjectById(canvas, state.qcId);
    if (!target) return false;
    const json = { ...state.json };
    delete (json as any).objects; // safety
    Object.entries(json).forEach(([k, v]) => {
        if (['type', 'version', 'qcId'].includes(k)) return;
        (target as any)[k] = v;
    });
    target.setCoords();
    return true;
};

const enlivenState = (canvas: fabric.Canvas, state: SerializedState): Promise<fabric.Object> => new Promise((resolve, reject) => {
    try {
        (fabric as any).util.enlivenObjects([state.json], (objs: fabric.Object[]) => {
            const obj = objs[0];
            if (!obj) { reject(new Error('Failed to enliven object')); return; }
            (obj as any).qcId = state.qcId;
            canvas.add(obj);
            resolve(obj);
        });
    } catch (e) { reject(e); }
});

export interface Command {
    id: string;
    label: string;
    stamp: number;
    execute: () => Promise<void> | void; // do action
    undo: () => Promise<void> | void;    // revert action
}

class HistoryManager {
    private undoStack: Command[] = [];
    private redoStack: Command[] = [];
    private maxDepth = 250;

    clear() { this.undoStack = []; this.redoStack = []; }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    getUndoLabel() { return this.undoStack.at(-1)?.label || ''; }
    getRedoLabel() { return this.redoStack.at(-1)?.label || ''; }

    async perform(cmd: Command, alreadyExecuted = false) {
        if (!alreadyExecuted) await cmd.execute();
        this.undoStack.push(cmd);
        if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
        this.redoStack = [];
    }
    async undo() {
        const cmd = this.undoStack.pop(); if (!cmd) return;
        await cmd.undo();
        this.redoStack.push(cmd);
    }
    async redo() {
        const cmd = this.redoStack.pop(); if (!cmd) return;
        await cmd.execute();
        this.undoStack.push(cmd);
    }
}

export const commandManager = new HistoryManager();

// ================= Concrete Command Builders =================

export const snapshotObjects = (objects: fabric.Object[] | fabric.Object): SerializedState[] => {
    const arr = Array.isArray(objects) ? objects : [objects];
    return serializeObjects(arr);
};

export const recordAddObjects = async (canvas: fabric.Canvas, objects: fabric.Object[] | fabric.Object, label = 'Add', alreadyAdded = true) => {
    const arr = Array.isArray(objects) ? objects : [objects]; arr.forEach(ensureObjectId);
    const states = serializeObjects(arr);
    const cmd: Command = {
        id: Math.random().toString(36).slice(2),
        label,
        stamp: Date.now(),
        execute: () => {
            // Ensure objects are present or re-enliven
            arr.forEach(o => { if (!canvas.getObjects().includes(o)) canvas.add(o); });
            const missing = states.filter(st => !findObjectById(canvas, st.qcId));
            if (missing.length) return missing.reduce<Promise<any>>((p, st) => p.then(() => enlivenState(canvas, st)), Promise.resolve()).then(() => { canvas.requestRenderAll(); });
            canvas.requestRenderAll();
        },
        undo: () => {
            arr.forEach(o => canvas.remove(o));
            canvas.discardActiveObject();
            canvas.requestRenderAll();
        }
    };
    await commandManager.perform(cmd, alreadyAdded);
};

export const recordRemoveObjects = async (canvas: fabric.Canvas, objects: fabric.Object[] | fabric.Object, label = 'Delete', alreadyRemoved = true) => {
    const arr = Array.isArray(objects) ? objects : [objects]; arr.forEach(ensureObjectId);
    const states = serializeObjects(arr);
    if (!alreadyRemoved) { arr.forEach(o => canvas.remove(o)); canvas.requestRenderAll(); }
    const cmd: Command = {
        id: Math.random().toString(36).slice(2),
        label,
        stamp: Date.now(),
        execute: () => { // removal
            arr.forEach(o => { const existing = findObjectById(canvas, (o as any).qcId); if (existing) canvas.remove(existing); });
            canvas.discardActiveObject();
            canvas.requestRenderAll();
        },
        undo: () => {
            arr.forEach(o => { if (!canvas.getObjects().includes(o)) canvas.add(o); });
            const missing = states.filter(st => !findObjectById(canvas, st.qcId));
            if (missing.length) return missing.reduce<Promise<any>>((p, st) => p.then(() => enlivenState(canvas, st)), Promise.resolve()).then(() => canvas.requestRenderAll());
            canvas.requestRenderAll();
        }
    };
    await commandManager.perform(cmd, alreadyRemoved);
};

export const recordModify = async (canvas: fabric.Canvas, before: SerializedState[], after: SerializedState[], label = 'Modify', alreadyApplied = true) => {
    if (!after.length) return;
    const cmd: Command = {
        id: Math.random().toString(36).slice(2),
        label,
        stamp: Date.now(),
        execute: () => {
            after.forEach(st => { if (!applyStateToExisting(canvas, st)) enlivenState(canvas, st); });
            canvas.requestRenderAll();
        },
        undo: () => {
            before.forEach(st => { if (!applyStateToExisting(canvas, st)) enlivenState(canvas, st); });
            canvas.requestRenderAll();
        }
    };
    await commandManager.perform(cmd, alreadyApplied);
};

