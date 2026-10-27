
import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack, Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ChatDeleteMode, ChatListItem } from "@/src/core";

/** The graph-traces checkbox copy (owner, 2026-09-24 flow rework — was
 *  the delete-nodes option's body in the two-button design): the
 *  graph-touching consequence says so, shared-topic survival included.
 *  Exported pure for render pins: the copy is design, not implementation. */
export const TRACES_COPY = {
	testid: "delete-traces",
	checkbox: "delete-traces-checkbox",
	title: "Also remove its graph traces",
	body: "This session’s topics, links, and events leave the graph too. Topics other sessions or imported notes also cover survive; topics only this session created are removed entirely.",
};

/**
 * Session deletion: an Astryx Dialog with one unchecked-by-default
 * checkbox "Also remove its graph traces" (unchecked = preserve-graph,
 * checked = delete-nodes) and Cancel + destructive Delete.
 *
 * Retryable failures (409 turn/jobs running, 503 extraction winding down)
 * show the server's line verbatim with a Try-again, which is just Delete
 * pressed again — the mode re-derives from the checkbox.
 */
export function DeleteSessionDialog({
	chat,
	onClose,
	onDeleted,
}: {
	/** The session up for deletion; null = closed. */
	chat: Pick<ChatListItem, "id" | "title"> | null;
	onClose: () => void;
	/** Success path — the sidebar owns navigation + list patching. */
	onDeleted: (id: string, mode: ChatDeleteMode, graphRevision: number) => void;
}) {
	const [traces, setTraces] = useState(false);
	const [busy, setBusy] = useState(false);
	// Retry IS pressing Delete again: the mode always derives from the
	// checkbox's current state (a toggle between failure and retry is a
	// change of intent, honored as such — the checkbox is disabled while
	// busy, so no mid-flight switches).
	const [failure, setFailure] = useState<{ code: string; error: string } | null>(null);

	// Fresh state per session: closing resets, opening a new chat starts clean.
	useEffect(() => {
		if (!chat) {
			setTraces(false);
			setBusy(false);
			setFailure(null);
		}
	}, [chat]);

	// Esc closes (claimed — a menu/dialog Esc must not also abort a turn).
	useEffect(() => {
		if (!chat) return;
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
	}, [chat, onClose]);

	const run = async () => {
		if (!chat || busy) return;
		const mode: ChatDeleteMode = traces ? "delete-nodes" : "preserve-graph";
		setBusy(true);
		setFailure(null);
		try {
			const res = await fetch(`/api/chats/${chat.id}?mode=${mode}`, { method: "DELETE" });
			const body = (await res.json()) as {
				ok?: boolean;
				error?: string;
				code?: string;
				graphRevision?: number;
			};
			if (!res.ok) {
				// 409 (turn/jobs running) and 503 (extraction winding down) are
				// both retryable — keep the dialog open, show the server's line.
				setFailure({ code: body.code ?? "error", error: body.error ?? `Delete failed (${res.status})` });
				setBusy(false);
				return;
			}
			onDeleted(chat.id, mode, body.graphRevision ?? 0);
		} catch {
			setFailure({ code: "network", error: "Delete failed — network error. Try again." });
			setBusy(false);
		}
	};

	// Keep the last session's title while the dialog animates closed.
	const [shown, setShown] = useState(chat);
	useEffect(() => {
		if (chat) setShown(chat);
	}, [chat]);

	return (
		<Dialog
			isOpen={chat !== null}
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
			width={480}
			purpose="form"
		>
			{shown && (
				<DeleteSessionBody
					chat={shown}
					traces={traces}
					busy={busy}
					failure={failure}
					onTraces={(next) => setTraces(next)}
					onClose={onClose}
					onRun={() => void run()}
				/>
			)}
		</Dialog>
	);
}

/** The dialog's pure body — exported for SSR pins (the settings-dialog /
 *  node-dialog body pattern). The wrapper owns state + effects + portal. */
export function DeleteSessionBody({
	chat,
	traces,
	busy,
	failure,
	onTraces,
	onClose,
	onRun,
}: {
	chat: Pick<ChatListItem, "id" | "title">;
	/** The graph-traces checkbox — unchecked by default (preserve-graph). */
	traces: boolean;
	busy: boolean;
	failure: { code: string; error: string } | null;
	onTraces: (next: boolean) => void;
	onClose: () => void;
	onRun: () => void;
}) {
	return (
		<Layout
			data-testid="delete-session-dialog"
			header={<DialogHeader title="Delete session?" subtitle={<code data-testid="session-name-code" className="font-mono">{chat.title}</code>} onOpenChange={() => !busy && onClose()} />}
			content={
				<LayoutContent>
					<VStack gap={4}>
						<Text type="body" color="secondary">
							This permanently removes the session — its messages, background jobs, and extraction records.
							Everything it added to the graph stays unless you check below. This cannot be undone.
						</Text>
						<CheckboxInput
							data-testid={TRACES_COPY.checkbox}
							label={TRACES_COPY.title}
							description={TRACES_COPY.body}
							value={traces}
							isDisabled={busy}
							onChange={(next) => onTraces(next)}
						/>
						{failure && (
							<Banner
								data-testid="delete-failure"
								status="error"
								title={failure.error}
								collapsible={false}
								endContent={<Button data-testid="delete-retry" label="Try again" size="sm" variant="secondary" isDisabled={busy} onClick={onRun} />}
							/>
						)}
					</VStack>
				</LayoutContent>
			}
			footer={
				<LayoutFooter>
					<HStack gap={2} hAlign="end">
						<Button data-testid="delete-cancel" label="Cancel" variant="secondary" isDisabled={busy} onClick={onClose} />
						<Button data-testid="delete-confirm" label="Delete" variant="destructive" isLoading={busy} onClick={onRun} />
					</HStack>
				</LayoutFooter>
			}
		/>
	);
}
