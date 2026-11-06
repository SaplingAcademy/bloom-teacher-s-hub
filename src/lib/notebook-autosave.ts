import { normalizeDocument, type RichDocument } from "./workspace-notebooks";
export type SaveStatus = "saved" | "saving" | "error";
interface Draft { document: RichDocument; signature: string; persisted: string; revision: number; status: SaveStatus }
export interface SaveSnapshot { version: number; pending: boolean }

/** One in-flight write per notebook; drafts are page-scoped and survive switches/errors. */
export class NotebookAutosave {
  private drafts = new Map<string, Draft>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<boolean> | undefined;
  private snapshot: SaveSnapshot = { version: 0, pending: false };
  private disposed = false;
  constructor(private save: (id: string, document: RichDocument) => Promise<unknown>, private confirmed: (id: string, result: unknown) => void, private delay = 700) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private emit() { this.snapshot = { version: this.snapshot.version + 1, pending: [...this.drafts.values()].some((d) => d.signature !== d.persisted || d.status !== "saved") }; this.listeners.forEach((fn) => fn()); }
  seed(id: string, document: RichDocument) {
    if (this.drafts.has(id)) return;
    const clean = normalizeDocument(document), signature = JSON.stringify(clean);
    this.drafts.set(id, { document: clean, signature, persisted: signature, revision: 0, status: "saved" });
  }
  document(id: string) { return this.drafts.get(id)?.document; }
  status(id: string): SaveStatus { return this.drafts.get(id)?.status ?? "saved"; }
  edit(id: string, document: RichDocument) {
    if (this.disposed) return;
    const d = this.drafts.get(id);
    if (!d) throw new Error("page_not_loaded");
    const clean = normalizeDocument(document), signature = JSON.stringify(clean);
    if (signature === d.signature) return;
    d.document = clean; d.signature = signature; d.revision += 1;
    // Even a reverted draft must wait if an older version is currently in flight.
    d.status = signature === d.persisted && !this.running ? "saved" : "saving";
    this.emit();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }
  forget(id: string) { this.drafts.delete(id); this.emit(); }
  flush = async (): Promise<boolean> => {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.disposed) return !this.snapshot.pending;
    if (this.running) return this.running;
    const run = async () => {
      for (;;) {
        const entry = [...this.drafts.entries()].find(([, d]) => d.signature !== d.persisted);
        if (!entry || this.disposed) break;
        const [id, draft] = entry;
        const revision = draft.revision, signature = draft.signature, document = draft.document;
        draft.status = "saving"; this.emit();
        try {
          const result = await this.save(id, document);
          draft.persisted = signature;
          // An earlier response cannot replace a newer local document or cache version.
          if (draft.revision === revision) { draft.status = "saved"; this.confirmed(id, result); }
          this.emit();
        } catch {
          draft.status = "error"; this.emit(); return false;
        }
      }
      this.drafts.forEach((d) => { if (d.signature === d.persisted) d.status = "saved"; }); this.emit();
      return !this.snapshot.pending;
    };
    this.running = run();
    try { return await this.running; } finally { this.running = undefined; }
  };
  dispose() { this.disposed = true; if (this.timer) clearTimeout(this.timer); this.listeners.clear(); }
}