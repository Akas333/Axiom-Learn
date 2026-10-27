
import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack, Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

/** The 409 extraction_running line (owner phrasing, node interlude):
 *  the server's error names the extraction; the ACTIVITY DOCK is the
 *  surface the user actually watches drain. Exported pure for pins. */
export const EXTRACTION_RETRY_LINE = "An extraction is running — try again when the activity dock drains.";

/**
 * Node deletion — an Astryx Dialog in the session-delete dialog's shape. FULL DEATH by owner ruling: the node, every edge
 * touching it, every event naming it, its position.
 *
 * MINIMAL BY OWNER RULING (2026-09-30): NO pre-flight impact read —
 * what full death takes is obvious (the edges die with the node), the
 * fetch flickered the dialog open-closed, and richer facts would only
 * grow more confusing as deletion semantics evolve (rewiring talk is
 * on the table). The screen is: title, names, one permanence line,
 * Cancel / Delete. The 409 extraction_running still gets the dock
 * phrasing with a Try-again — the run is never aborted server-side,
 * it clears on its own; other failures state themselves plainly.
 *
 * WORDING: "node"/"nodes" — THE UI word for graph objects (owner
 * ruling, same day, standardized everywhere in the UI).
 */
/** The dialog's pure body — exported for SSR pins (the settings-dialog
 *  body pattern). The wrapper owns state + effects + the portal. */
export function DeleteNodeBody({
	nodes,
	busy,
	failure,
	onClose,
	onRun,
}: {
	/** One node (the canvas context menu) or many (the chain table's
	 *  selection). One names it alone; many pluralize the title and
	 *  list the names. */
	nodes: { id: string; name: string }[];
	busy: boolean;
	failure: { code: string; error: string } | null;
	onClose: () => void;
	onRun: () => void;
}) {
	const one = nodes.length === 1;
	return (
		<Layout
			data-testid="delete-node-dialog"
			header={
				<DialogHeader
					title={one ? "Delete node?" : `Delete ${nodes.length} nodes?`}
					subtitle={
						<code data-testid={one ? "node-name-code" : "node-names-code"} className="font-mono">
							{one
								? nodes[0]?.name
								: nodes.slice(0, 8).map((n) => n.name).join(", ") +
									(nodes.length > 8 ? `, and ${nodes.length - 8} more` : "")}
						</code>
					}
					onOpenChange={() => !busy && onClose()}
				/>
			}
			content={
				<LayoutContent>
					<VStack gap={4}>
						<Text type="body" color="secondary" data-testid="node-permanence-line">
							{one
								? "This permanently deletes the node — this cannot be undone."
								: `This permanently deletes all ${nodes.length} nodes — this cannot be undone.`}
						</Text>
						{failure && (
							<Banner
								data-testid="node-delete-failure"
								status="error"
								title={failure.code === "extraction_running" ? EXTRACTION_RETRY_LINE : failure.error}
								collapsible={false}
								endContent={<Button data-testid="node-delete-retry" label="Try again" size="sm" variant="secondary" isDisabled={busy} onClick={onRun} />}
							/>
						)}
					</VStack>
				</LayoutContent>
			}
			footer={
				<LayoutFooter>
					<HStack gap={2} hAlign="end">
						<Button data-testid="node-delete-cancel" label="Cancel" variant="secondary" isDisabled={busy} onClick={onClose} />
						<Button data-testid="node-delete-confirm" label="Delete" variant="destructive" isLoading={busy} onClick={onRun} />
					</HStack>
				</LayoutFooter>
			}
		/>
	);
}

export function DeleteNodeDialog({
	nodes,
	onClose,
	onDeleted,
}: {
	/** The nodes up for deletion; null/empty = closed. One (the canvas
	 *  context menu) or many (the chain table's selection). Names from
	 *  the client's snapshot — what the user sees is what the dialog
	 *  names. */
	nodes: { id: string; name: string }[] | null;
	onClose: () => void;
	/** Success path — the callers announce lh:graph-revision so the
	 *  snapshot refetches. The deleted ids ride along so
	 *  selection-side callers can prune. */
	onDeleted: (nodeIds: string[], graphRevision: number) => void;
}) {
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<{ code: string; error: string } | null>(null);

	// Fresh state per dialog: closing resets.
	useEffect(() => {
		if (!nodes || nodes.length === 0) {
			setBusy(false);
			setFailure(null);
		}
	}, [nodes]);

	// Esc closes (claimed — a dialog Esc must not also abort a turn).
	useEffect(() => {
		if (!nodes || nodes.length === 0) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				// THE ONE-ESC LAW (keyboard round 2026-10-06): claim at the
				// document level — a window-level stopPropagation cannot stop
				// the earlier-registered global window listener.
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [nodes, onClose]);

	// Sequential full deaths — never parallel (the store's revision
	// counter and the sweep must observe them in order). A failure STOPS
	// the run: what died, died; the failure line names why the rest
	// still stands (extraction_running especially must not be plowed
	// through). onDeleted fires with everything that actually died.
	const run = async () => {
		if (!nodes || nodes.length === 0 || busy) return;
		setBusy(true);
		setFailure(null);
		const dead: string[] = [];
		let revision = 0;
		try {
			for (const n of nodes) {
				const res = await fetch(`/api/graph/nodes/${encodeURIComponent(n.id)}`, { method: "DELETE" });
				const body = (await res.json()) as {
					error?: string;
					code?: string;
					graphRevision?: number;
				};
				if (!res.ok) {
					setFailure({ code: body.code ?? "error", error: body.error ?? `Delete failed (${res.status})` });
					setBusy(false);
					if (dead.length > 0) onDeleted(dead, revision);
					return;
				}
				dead.push(n.id);
				revision = body.graphRevision ?? revision;
			}
			onDeleted(dead, revision);
		} catch {
			setFailure({ code: "network", error: "Delete failed — network error. Try again." });
			setBusy(false);
			if (dead.length > 0) onDeleted(dead, revision);
		}
	};

	// Keep the last selection's names while the dialog animates closed.
	const open = !!nodes && nodes.length > 0;
	const [shown, setShown] = useState(nodes);
	useEffect(() => {
		if (open) setShown(nodes);
	}, [open, nodes]);

	return (
		<Dialog
			isOpen={open}
			onOpenChange={(next) => {
				if (!next && !busy) onClose();
			}}
			width={480}
			purpose="form"
		>
			{shown && shown.length > 0 && (
				<DeleteNodeBody nodes={shown} busy={busy} failure={failure} onClose={onClose} onRun={() => void run()} />
			)}
		</Dialog>
	);
}
