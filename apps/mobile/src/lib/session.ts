import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { ChatInput, LhMessage, QuestionAnswerData } from "@/src/core";
// The web app's session state machine, shared verbatim (pure TS, injectable fetch).
import { SessionModel, type SessionState } from "../../../web/components/session-core";
export { visibleQueuedSteers } from "../../../web/components/session-core";

/** React adapter over the shared SessionModel (mirrors apps/web/components/session.ts). */
export function useChatSession(opts: {
	chatId: string;
	initialMessages: LhMessage[];
	initialError?: string;
	initiallyInFlight?: boolean;
	api: typeof globalThis.fetch;
}) {
	const modelRef = useRef<SessionModel | null>(null);
	if (modelRef.current === null) {
		modelRef.current = new SessionModel({
			chatId: opts.chatId,
			initialMessages: opts.initialMessages,
			initialError: opts.initialError,
			fetch: opts.api,
		});
	}
	const model = modelRef.current;
	const [version, bump] = useReducer((n: number) => n + 1, 0);

	useEffect(() => {
		model.onChange = bump;
		return () => {
			model.onChange = undefined;
		};
	}, [model]);

	// Reattach on mount; release the stream connection on unmount (the turn
	// keeps running server-side).
	useEffect(() => {
		if (opts.initiallyInFlight) void model.resumeStream(false);
		return () => model.stop();
		// mount-only
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [model]);

	const state = useMemo<SessionState>(() => model.getState(), [model, version]);

	return {
		...state,
		model,
		send: useCallback((input: ChatInput) => void model.send(input), [model]),
		continueIfOwed: useCallback((record: readonly LhMessage[]) => void model.continueIfOwed(record), [model]),
		steer: useCallback((text: string) => void model.steer(text), [model]),
		submitAnswer: useCallback(
			(tool: string, toolCallId: string, output: QuestionAnswerData) => void model.submitAnswer(tool, toolCallId, output),
			[model],
		),
		dismissQuestion: useCallback((toolCallId: string, answer: QuestionAnswerData) => void model.dismissQuestion(toolCallId, answer), [model]),
		setMessages: useCallback((record: LhMessage[], turnError?: string) => model.setMessages(record, turnError), [model]),
		stop: useCallback(() => model.stop(), [model]),
		clearError: useCallback(() => model.clearError(), [model]),
		resumeStream: useCallback((refetchFirst = true) => void model.resumeStream(refetchFirst), [model]),
		setReattachSettled: useCallback((fn: () => void) => model.setReattachSettled(fn), [model]),
	};
}
