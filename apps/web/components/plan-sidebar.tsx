import { useEffect, useMemo, useState, type ReactNode } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { List, ListItem } from "@astryxdesign/core/List";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack } from "@astryxdesign/core/HStack";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ActivitySection } from "@/components/activity-dock";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, Maximize2Icon, PanelRightCloseIcon } from "lucide-react";
import { derivePlanStatuses, nodeProgress, type PlanNodeProgress } from "@/src/core";
import { latestTree, type PopupMessage } from "@/components/plan-block";
import { conceptNumbers, PlanMap, planLayout } from "@/components/plan-map";
import { cn } from "@/lib/utils";

/** The latest recap per node, from the concept_done cards in the transcript. */
function recapsByNode(messages: readonly PopupMessage[]): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const m of messages) {
		for (const part of (m as { parts?: Array<{ type: string; state?: string; input?: unknown }> }).parts ?? []) {
			if (part.type !== "tool-concept_done" || part.state !== "output-available") continue;
			const input = part.input as { nodeId?: string; recap?: string[] } | undefined;
			if (input?.nodeId && Array.isArray(input.recap)) out.set(input.nodeId, input.recap.filter((l) => l.trim()));
		}
	}
	return out;
}

/** Has any check been tagged with this node yet? */
function taught(messages: readonly PopupMessage[], nodeId: string): boolean {
	return messages.some((m) =>
		((m as { parts?: Array<{ type: string; input?: unknown }> }).parts ?? []).some(
			(part) =>
				(part.type === "tool-quiz" || part.type === "tool-explain") &&
				(part.input as { nodeId?: unknown } | undefined)?.nodeId === nodeId,
		),
	);
}

/** Recap lines are markdown; the compact list shows them as plain text. */
function plainText(md: string): string {
	return md
		.replace(/\$\$?([^$]+)\$\$?/g, "$1")
		.replace(/(\*\*|__)(.+?)\1/g, "$2")
		.replace(/(\*|_)(.+?)\1/g, "$2")
		.replace(/`([^`]+)`/g, "$1");
}

/**
 * The plan, docked at the right of the session: progress, the map, and the
 * concepts in the same numbered order with their recaps. Everything derives
 * from the transcript on each render, so it moves the moment a check is
 * tagged or a concept is closed. `viewingId` is the concept the transcript
 * is scrolled to; clicking a concept jumps there.
 */
export function PlanSidebar({
	messages,
	viewingId,
	onJump,
	onClose,
	onExpand,
}: {
	messages: readonly PopupMessage[];
	viewingId: string | null;
	onJump: (nodeId: string) => void;
	onClose: () => void;
	onExpand: () => void;
}) {
	// Below 1280px the panel floats over the session (backdrop, Esc closes)
	// instead of taking a column the transcript can't spare.
	const [overlay, setOverlay] = useState(() => typeof window !== "undefined" && window.matchMedia(OVERLAY_QUERY).matches);
	useEffect(() => {
		const mq = window.matchMedia(OVERLAY_QUERY);
		const on = () => setOverlay(mq.matches);
		mq.addEventListener("change", on);
		return () => mq.removeEventListener("change", on);
	}, []);
	useEffect(() => {
		if (!overlay) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [overlay, onClose]);

	return (
		<>
			{overlay && <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />}
			<aside
				data-testid="plan-sidebar"
				aria-label="Session panel"
				className={cn(
					"flex shrink-0 flex-col bg-body",
					overlay
						? "fixed inset-y-0 right-0 z-50 w-[min(22rem,calc(100vw-3rem))] border-l border-border pt-(--safe-top) pr-(--safe-right) pb-(--safe-bottom) shadow-2xl"
						: "h-full w-[22rem]",
				)}
			>
				{/* Inline, the top bar's toggle closes the panel; as a slide-over
				    that toggle sits under the backdrop, so the panel brings its own. */}
				{overlay && (
					<div className="flex h-15 shrink-0 items-center justify-end px-3">
						<IconButton label="Hide the side panel" tooltip="Hide the side panel" variant="ghost" size="sm" data-testid="plan-sidebar-close" icon={<PanelRightCloseIcon className="size-4" />} onClick={onClose} />
					</div>
				)}
				<div className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3", !overlay && "pt-3")}>
					<PlanCard messages={messages} viewingId={viewingId} onJump={onJump} onExpand={onExpand} />
					<ActivitySection variant="card" />
				</div>
			</aside>
		</>
	);
}

const OVERLAY_QUERY = "(max-width: 1279px)";

/** The Plan card: progress, the map, and the concepts in order with their
 *  recaps. Collapsible from its header. Renders nothing before a plan. */
function PlanCard({
	messages,
	viewingId,
	onJump,
	onExpand,
}: {
	messages: readonly PopupMessage[];
	viewingId: string | null;
	onJump: (nodeId: string) => void;
	onExpand: () => void;
}) {
	const [collapsed, setCollapsed] = useState(false);
	const tree = useMemo(() => latestTree(messages), [messages]);
	const statuses = useMemo(
		() => (tree ? derivePlanStatuses(tree, messages as Parameters<typeof derivePlanStatuses>[1]) : null),
		[tree, messages],
	);
	const recaps = useMemo(() => recapsByNode(messages), [messages]);
	const layout = useMemo(() => (tree ? planLayout(tree) : null), [tree]);
	if (!tree || !layout || tree.nodes.length === 0) return null;

	const byId = new Map(tree.nodes.map((n) => [n.id, n]));
	const progressOf = (id: string): PlanNodeProgress => (statuses ? nodeProgress(statuses, id) : "upcoming");
	const doneCount = tree.nodes.filter((n) => progressOf(n.id) === "done").length;
	// Right after a concept_done the current node waits on Continue: nothing
	// has been taught (tagged) on it yet.
	const waitingOnContinue = doneCount > 0 && !!statuses?.current && !taught(messages, statuses.current);
	const { order, number } = conceptNumbers(tree, layout, messages as Parameters<typeof conceptNumbers>[2], statuses?.current);

	return (
		<Card padding={3} data-testid="plan-card" aria-label="Lesson plan">
			<VStack gap={2}>
				<HStack gap={2} align="center">
					<Button
						variant="ghost"
						size="sm"
						label="Plan"
						aria-expanded={!collapsed}
						endContent={<Icon icon={collapsed ? ChevronRightIcon : ChevronDownIcon} />}
						onClick={() => setCollapsed((v) => !v)}
					/>
					<Text type="supporting" hasTabularNumbers className="ml-auto">
						{doneCount} / {tree.nodes.length} done
					</Text>
					<IconButton label="Open the full map" tooltip="Open the full map" variant="ghost" size="sm" icon={<Maximize2Icon className="size-4" />} onClick={onExpand} />
				</HStack>
				<ProgressBar label="Plan progress" isLabelHidden value={doneCount} max={tree.nodes.length} />
				{!collapsed && (
					<>
						<div className="border-b border-border pb-2 pt-1" data-testid="plan-sidebar-map">
							<PlanMap tree={tree} layout={layout} numbers={number} progressOf={progressOf} viewingId={viewingId} onSelect={onJump} />
						</div>
						<List listStyle="none" density="compact" edge="outset">
							{order.map((id) => {
								const node = byId.get(id)!;
								const p = progressOf(id);
								const recap = recaps.get(id);
								const viewing = viewingId === id;
								const eyebrow = p === "current" ? (waitingOnContinue ? "Up next" : "Now learning") : viewing ? "Viewing" : null;
								return (
									<ListItem
										key={id}
										data-testid={`plan-step-${id}`}
										data-progress={p}
										data-viewing={viewing || undefined}
										isSelected={p === "current" || viewing}
										align="start"
										onClick={() => onJump(id)}
										startContent={<StepMarker progress={p} number={number.get(id)!} />}
										label={
											<VStack gap={0.5}>
												{eyebrow && <Text type="label" color={p === "current" ? "accent" : "secondary"}>{eyebrow}</Text>}
												<Text type="body" color={p === "upcoming" && !viewing ? "secondary" : "primary"} weight={p === "current" ? "medium" : undefined}>
													{node.title}
												</Text>
											</VStack>
										}
										description={
											p === "current" && node.summary
												? node.summary
												: p === "done" && recap && recap.length > 0
													? recap.map((line) => plainText(line)).join(" · ")
													: undefined
										}
									/>
								);
							})}
						</List>
					</>
				)}
			</VStack>
		</Card>
	);
}


/** Same marker language as the map: solid white check when done, filled blue
 *  number when current, outlined number otherwise. */
function StepMarker({ progress, number }: { progress: PlanNodeProgress; number: number }) {
	if (progress === "done") return <Icon icon={CheckIcon} size="sm" color="primary" aria-label={`${number}, done`} />;
	return (
		<Text type="label" hasTabularNumbers color={progress === "current" ? "accent" : "secondary"}>
			{number}
		</Text>
	);
}
