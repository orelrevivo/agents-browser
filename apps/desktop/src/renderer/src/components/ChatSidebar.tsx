import { useState } from "react";
import type { Conversation } from "@groubot/db";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, ScrollArea } from "@groubot/ui";
import { MessageSquare, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2 } from "lucide-react";

export function ChatSidebar({ conversations, activeId, collapsed, onToggle, onNew, onSelect, onRename, onDelete }: {
  conversations: Conversation[];
  activeId?: string;
  collapsed: boolean;
  onToggle: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [renameTarget, setRenameTarget] = useState<Conversation>();
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Conversation>();
  return <aside className={`flex shrink-0 flex-col overflow-hidden border-r border-border/70 bg-card/20 transition-[width] duration-200 ease-out ${collapsed ? "w-12" : "w-64"}`}>
    <div className={`flex items-center border-b border-border/60 py-3 ${collapsed ? "justify-center px-1" : "justify-between px-3"}`}>{!collapsed && <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Chats</span>}<Button aria-label={collapsed ? "Expand chat sidebar" : "Collapse chat sidebar"} className="size-7 shrink-0" onClick={onToggle} size="icon" variant="ghost">{collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</Button></div>
    {!collapsed && <>
    <div className="p-3"><Button className="h-9 w-full justify-start gap-2" onClick={onNew} variant="secondary"><Plus className="size-4" /> New chat</Button></div>
    <ScrollArea className="min-h-0 flex-1 px-2"><div className="space-y-1 pb-3">{conversations.length === 0 ? <p className="px-3 py-8 text-center text-xs leading-5 text-muted-foreground">Your conversations will appear here.</p> : conversations.map((conversation) => <div className={`group flex items-center gap-1 rounded-lg px-2 py-1 ${activeId === conversation.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`} key={conversation.id}><button className="min-w-0 flex-1 truncate py-2 text-left text-sm" onClick={() => onSelect(conversation.id)}>{conversation.title}</button><div className="flex opacity-0 transition-opacity group-hover:opacity-100"><Button aria-label={`Rename ${conversation.title}`} className="size-7" onClick={() => { setRenameTarget(conversation); setRenameValue(conversation.title); }} size="icon" variant="ghost"><Pencil className="size-3.5" /></Button><Button aria-label={`Delete ${conversation.title}`} className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(conversation)} size="icon" variant="ghost"><Trash2 className="size-3.5" /></Button></div></div>)}</div></ScrollArea>
    <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => { if (!open) setRenameTarget(undefined); }}><DialogContent><DialogHeader><DialogTitle>Rename chat</DialogTitle><DialogDescription>Give this conversation a short, recognizable name.</DialogDescription></DialogHeader><Input autoFocus onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void (async () => { if (renameTarget && renameValue.trim()) { await onRename(renameTarget.id, renameValue); setRenameTarget(undefined); } })(); } }} value={renameValue} /><DialogFooter><Button onClick={() => setRenameTarget(undefined)} variant="ghost">Cancel</Button><Button disabled={!renameValue.trim()} onClick={() => void (async () => { if (renameTarget) { await onRename(renameTarget.id, renameValue); setRenameTarget(undefined); } })()}>Save</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this chat?</AlertDialogTitle><AlertDialogDescription>This permanently removes the conversation and its local messages.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void (async () => { if (deleteTarget) { await onDelete(deleteTarget.id); setDeleteTarget(undefined); } })()}>Delete chat</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>}
  </aside>;
}
