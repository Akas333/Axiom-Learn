import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleCheckIcon, CircleDashedIcon, CircleDotIcon, DumbbellIcon, FolderTreeIcon, MapIcon, PlayIcon } from "lucide-react";
import type { ArtifactPartProps, ChatKind, CourseContextData, CourseEntry, PlanNodeProgress, PlanTree } from "@/src/core";
import { PLAN_MAP_CHAT_WIDTH, PlanMap, planLayout } from "@/components/plan-map";
import { useServerEvent } from "@/components/server-events";
import { useRouter } from "@/lib/navigation";

/**
 * Courses (2026-10-29): a broad goal becomes a folder — the plan chat with
 * the course map, one chat per concept, a subfolder per composite concept.
 * These are its in-chat surfaces: the course card under the plan chat's
 * course_open (the map with each concept's live status, every concept one
 * click from its chat), the course-context card at the top of each
 * concept chat, and the Start bar of a concept chat nobody has opened yet.
 */

export interface CourseView {
	planChatId: string;
	tree: PlanTree | null;
	entries: CourseEntry[];
}

/** A course folder, live: refetched whenever a chat changes or a turn ends. */
export function useCourse(folderId: string | undefined): CourseView | null {
	const [course, setCourse] = useState<CourseView | null>(null);
	const refresh = useCallback(async () => {
		if (!folderId) return;
		try {
			const res = await fetch(`/api/folders/${encodeURIComponent(folderId)}/course`, { cache: "no-store" });
			if (res.ok) setCourse((await res.json()) as CourseView);
		} catch (err) {
			console.error("course fetch failed:", err);
		}
	}, [folderId]);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	useServerEvent("chats-changed", () => void refresh());
	useServerEvent("turn-settled", () => void refresh());
	return course;
}

/** What starting a course chat sends as the learner's first message. */
export function courseStartText(title: string, kind: ChatKind, plansSubcourse: boolean): string {
	if (plansSubcourse) return `Let's plan ${title}.`;
	return kind === "practice" ? `Let's practice ${title}.` : `Teach me ${title}.`;
}

/** Where opening a course entry goes: straight into its first turn when
 *  nobody has started it, otherwise just the chat. */
export function courseEntryHref(entry: CourseEntry): string | null {
	if (!entry.chatId) return null;
	const base = `/chat/${encodeURIComponent(entry.chatId)}`;
	if (entry.status !== "not-started") return base;
	return `${base}?prompt=${encodeURIComponent(courseStartText(entry.title, entry.kind, Boolean(entry.folderId)))}`;
}

const STATUS_PROGRESS: Record<CourseEntry["status"], PlanNodeProgress> = {
	done: "done",
	"in-progress": "current",
	"not-started": "upcoming",
};

function StatusIcon({ status }: { status: CourseEntry["status"] }) {
	if (status === "done") return <CircleCheckIcon className="size-4 shrink-0 text-primary" aria-label="Done" />;
	if (status === "in-progress") return <CircleDotIcon className="size-4 shrink-0 text-primary" aria-label="In progress" />;
	return <CircleDashedIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Not started" />;
}

interface CourseOpenOutput {
	folderId?: string;
	firstChatId?: string | null;
}

/** The course card: renders the plan chat's course_open call. */
export function CourseOpenCard({ part }: ArtifactPartProps) {
	const router = useRouter();
	const output = (part.state === "output-available" ? part.output : undefined) as CourseOpenOutput | undefined;
	const course = useCourse(output?.folderId);
	const layout = useMemo(() => (course?.tree && course.tree.nodes.length > 0 ? planLayout(course.tree) : null), [course?.tree]);

	// The course opens straight into its first concept — once per call
	// (a later visit to the plan chat stays here).
	const firstEntry = course?.entries.find((e) => e.chatId && e.chatId === output?.firstChatId);
	useEffect(() => {
		if (!firstEntry) return;
		const key = `lh:course-opened:${part.toolCallId}`;
		try {
			if (window.sessionStorage.getItem(key)) return;
			window.sessionStorage.setItem(key, "1");
		} catch {
			return; // no storage: never auto-navigate (the list still links)
		}
		const href = courseEntryHref(firstEntry);
		if (href) router.push(href);
	}, [firstEntry, part.toolCallId, router]);

	if (part.state === "output-error" || !output?.folderId) return null;
	const open = (entry: CourseEntry) => {
		const href = courseEntryHref(entry);
		if (href) router.push(href);
	};
	const byNode = new Map((course?.entries ?? []).map((e) => [e.nodeId, e]));
	const done = (course?.entries ?? []).filter((e) => e.status === "done").length;

	return (
		<section data-testid="course-card" className="lh-card-enter my-3 rounded-2xl border bg-card px-5 py-4">
			<div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
				<FolderTreeIcon className="size-3.5 text-primary" />
				Course
			</div>
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-base font-semibold text-foreground">Your course is ready</h3>
				{course && <span className="text-xs text-muted-foreground">{done} of {course.entries.length} concepts done</span>}
			</div>
			<p className="mt-1 text-sm text-muted-foreground">Each concept has its own chat in the sidebar folder. Pick any concept to open it.</p>
			{course?.tree && layout && (
				<div className={`mx-auto my-3 ${PLAN_MAP_CHAT_WIDTH}`}>
					<PlanMap
						tree={course.tree}
						layout={layout}
						progressOf={(id) => STATUS_PROGRESS[byNode.get(id)?.status ?? "not-started"]}
						viewingId={null}
						onSelect={(id) => {
							const entry = byNode.get(id);
							if (entry) open(entry);
						}}
					/>
				</div>
			)}
			<ol className="divide-y divide-border/60">
				{(course?.entries ?? []).map((entry, i) => (
					<li key={entry.nodeId}>
						<button
							type="button"
							data-testid="course-entry"
							disabled={!entry.chatId}
							onClick={() => open(entry)}
							className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
						>
							<StatusIcon status={entry.status} />
							<span className="min-w-0 flex-1 truncate text-foreground">{i + 1}. {entry.title}</span>
							{entry.folderId ? (
								<span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-400">Subfolder</span>
							) : entry.kind === "practice" ? (
								<span className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-xs text-teal-400">
									<DumbbellIcon className="size-3" />
									Practice
								</span>
							) : null}
						</button>
					</li>
				))}
			</ol>
		</section>
	);
}

/** The top of a course chat: which course, which concept, a way back. */
export function CourseContextCard({ data }: { data: CourseContextData }) {
	const router = useRouter();
	return (
		<div data-testid="course-context-card" className="my-2 flex items-center gap-3 rounded-xl border bg-card/60 px-4 py-3">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
					<MapIcon className="size-3.5 text-primary" />
					{data.role === "plan" ? "Part of the course" : "Concept in the course"} · {data.goal}
				</div>
				<div className="mt-0.5 text-sm font-medium text-foreground">{data.conceptTitle}</div>
				{data.after.length > 0 && <div className="text-xs text-muted-foreground">After {data.after.join(", ")}</div>}
			</div>
			<button
				type="button"
				onClick={() => router.push(`/chat/${encodeURIComponent(data.planChatId)}`)}
				className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<FolderTreeIcon className="size-3.5" />
				Course plan
			</button>
		</div>
	);
}

/** A course chat nobody has started: one click sends its opening message. */
export function CourseStartBar({ title, startText, onStart }: { title: string; startText: string; onStart: (text: string) => void }) {
	return (
		<div
			data-testid="course-start-bar"
			className="lh-card-enter my-4 ml-10 flex flex-wrap items-center gap-3 rounded-2xl border border-input/70 bg-card px-4 py-3"
		>
			<div className="mr-auto min-w-0">
				<div className="text-sm font-semibold text-foreground">Start: {title}</div>
				<div className="text-xs text-muted-foreground">This concept's chat picks up from the course's probe — you won't be asked your goal again.</div>
			</div>
			<button
				type="button"
				data-testid="course-start"
				onClick={() => onStart(startText)}
				className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
			>
				<PlayIcon className="size-4" />
				Start
			</button>
		</div>
	);
}

/** The next concept after this chat's, for the end-of-concept card. */
export function useCourseNext(folderId: string | undefined, conceptId: string | undefined): CourseEntry | null {
	const course = useCourse(folderId);
	if (!course || !conceptId) return null;
	const at = course.entries.findIndex((e) => e.nodeId === conceptId);
	return course.entries.slice(at + 1).find((e) => e.status !== "done" && e.chatId) ?? null;
}
