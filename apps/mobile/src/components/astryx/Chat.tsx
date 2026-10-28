/**
 * Astryx Chat components, native. Props follow the Astryx specs
 * (`npx astryx component ChatLayout ChatMessage ChatComposer`):
 * https://astryx.atmeta.com/components — rendered with React Native views and
 * the neutral theme tokens (theme.ts) instead of DOM + CSS variables.
 */
import { ArrowDown, ArrowUp, Square } from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
import {
	Animated,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, radius, shadows, spacing, text } from "@/theme";

// ── ChatLayout ──────────────────────────────────────────────────────────────

export interface ChatLayoutProps {
	/** Messages (a ChatMessageList or any column of ChatMessage). */
	children: ReactNode;
	/** The docked composer (ChatComposer, or a question/practice dock). */
	composer: ReactNode;
	/** Shown when there are no messages. */
	emptyState?: ReactNode;
	isEmpty?: boolean;
	/** Optional header above the message area. */
	header?: ReactNode;
	/** Keeps the view pinned to the newest message while content grows. */
	scrollRef?: RefObject<ComponentRef<typeof ScrollView> | null>;
}

/** Messages in a scroll area, composer docked at the bottom; scroll button when away from the end. */
export function ChatLayout({ children, composer, emptyState, isEmpty, header, scrollRef }: ChatLayoutProps) {
	const insets = useSafeAreaInsets();
	const ownRef = useRef<ComponentRef<typeof ScrollView>>(null);
	const ref = scrollRef ?? ownRef;
	const atBottom = useRef(true);
	const [showScroll, setShowScroll] = useState(false);
	const [unread, setUnread] = useState(false);

	const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
		const distance = contentSize.height - contentOffset.y - layoutMeasurement.height;
		atBottom.current = distance < 80;
		setShowScroll(!atBottom.current);
		if (atBottom.current) setUnread(false);
	};

	const onContentSizeChange = () => {
		if (atBottom.current) ref.current?.scrollToEnd({ animated: false });
		else setUnread(true);
	};

	return (
		<KeyboardAvoidingView style={layout.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
			{header}
			{isEmpty && emptyState ? (
				<View style={layout.empty}>{emptyState}</View>
			) : (
				<ScrollView
					ref={ref}
					style={layout.scroll}
					contentContainerStyle={layout.content}
					onScroll={onScroll}
					scrollEventThrottle={64}
					onContentSizeChange={onContentSizeChange}
					keyboardShouldPersistTaps="handled"
				>
					{children}
				</ScrollView>
			)}
			<View style={[layout.dock, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
				<ChatLayoutScrollButton
					isVisible={showScroll && !isEmpty}
					label={unread ? "New messages" : undefined}
					onClick={() => {
						ref.current?.scrollToEnd({ animated: true });
						setUnread(false);
					}}
				/>
				{composer}
			</View>
		</KeyboardAvoidingView>
	);
}

// ── ChatLayoutScrollButton ──────────────────────────────────────────────────

export function ChatLayoutScrollButton({ isVisible, label, onClick }: { isVisible: boolean; label?: string; onClick: () => void }) {
	const opacity = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		Animated.timing(opacity, { toValue: isVisible ? 1 : 0, duration: 150, useNativeDriver: true }).start();
	}, [isVisible, opacity]);
	return (
		<Animated.View pointerEvents={isVisible ? "auto" : "none"} style={[layout.scrollBtnWrap, { opacity }]}>
			<Pressable accessibilityLabel={label ?? "Scroll to bottom"} onPress={onClick} style={[layout.scrollBtn, shadows.med]}>
				<ArrowDown size={16} color={label ? colors.primary : colors.foreground} />
				{label ? <Text style={layout.scrollLabel}>{label}</Text> : null}
			</Pressable>
		</Animated.View>
	);
}

// ── ChatMessage / ChatMessageBubble ─────────────────────────────────────────

export interface ChatMessageProps {
	sender: "user" | "assistant" | "system";
	children: ReactNode;
	avatar?: ReactNode;
	name?: ReactNode;
	metadata?: ReactNode;
}

/** Sender wrapper: avatar + name + body + metadata, aligned by role. */
export function ChatMessage({ sender, children, avatar, name, metadata }: ChatMessageProps) {
	if (sender === "user") {
		return (
			<View style={msg.userRow}>
				{children}
				{metadata ? <View style={msg.meta}>{metadata}</View> : null}
			</View>
		);
	}
	return (
		<View style={msg.assistantRow}>
			<View style={msg.avatarSlot}>{avatar}</View>
			<View style={msg.body}>
				{name ? (typeof name === "string" ? <Text style={msg.name}>{name}</Text> : name) : null}
				{children}
				{metadata ? <View style={msg.meta}>{metadata}</View> : null}
			</View>
		</View>
	);
}

/** Bubble: filled for the learner, ghost (no frame) for the tutor's long-form prose. */
export function ChatMessageBubble({
	sender,
	children,
	variant = sender === "user" ? "filled" : "ghost",
}: {
	sender: "user" | "assistant" | "system";
	children: ReactNode;
	variant?: "filled" | "ghost";
}) {
	const isUser = sender === "user";
	return (
		<View
			style={[
				variant === "filled" && msg.bubble,
				variant === "filled" && {
					backgroundColor: isUser ? colors.userBubble : colors.surface,
					borderBottomRightRadius: isUser ? radius.sm : radius.lg,
					borderBottomLeftRadius: isUser ? radius.lg : radius.sm,
				},
				variant === "filled" && !isUser && { borderWidth: 1, borderColor: colors.border },
			]}
		>
			{typeof children === "string" ? <Text style={[msg.text, isUser && { color: colors.primaryForeground }]}>{children}</Text> : children}
		</View>
	);
}

// ── ChatComposer ────────────────────────────────────────────────────────────

export interface ChatComposerProps {
	onSubmit: (value: string) => void;
	onStop?: () => void;
	isStopShown?: boolean;
	value?: string;
	onChange?: (value: string) => void;
	placeholder?: string;
	isDisabled?: boolean;
	/** Slot above the input (context chips, queued messages). */
	drawer?: ReactNode;
	/** Slot right of the header row (usage, phase). */
	headerContext?: ReactNode;
	/** Slot left of the footer row (mode selector etc). */
	footerActions?: ReactNode;
	status?: { type: "error" | "warning"; message?: string };
	/** Emphasize the send button (the home screen's primary action). */
	primarySend?: boolean;
}

export function ChatComposer({
	onSubmit,
	onStop,
	isStopShown = false,
	value: controlled,
	onChange,
	placeholder = "Type a message...",
	isDisabled = false,
	drawer,
	headerContext,
	footerActions,
	status,
	primarySend,
}: ChatComposerProps) {
	const [own, setOwn] = useState("");
	const value = controlled ?? own;
	const setValue = (v: string) => (onChange ? onChange(v) : setOwn(v));
	const canSend = value.trim().length > 0 && !isDisabled;

	const submit = () => {
		if (!canSend) return;
		onSubmit(value.trim());
		setValue("");
	};

	return (
		<View style={comp.frame}>
			{drawer}
			<View style={[comp.body, shadows.low]}>
				{headerContext ? <View style={comp.header}>{headerContext}</View> : null}
				<TextInput
					value={value}
					onChangeText={setValue}
					placeholder={placeholder}
					placeholderTextColor={colors.disabled}
					style={comp.input}
					multiline
					editable={!isDisabled}
				/>
				<View style={comp.footer}>
					<View style={comp.footerActions}>{footerActions}</View>
					{isStopShown && onStop ? (
						<Pressable accessibilityLabel="Stop" onPress={onStop} style={[comp.send, { backgroundColor: colors.pill }]}>
							<Square size={13} color={colors.foreground} fill={colors.foreground} />
						</Pressable>
					) : (
						<Pressable
							accessibilityLabel="Send"
							onPress={submit}
							disabled={!canSend}
							style={({ pressed }) => [
								comp.send,
								{ backgroundColor: canSend || primarySend ? colors.primary : colors.pill, opacity: !canSend && primarySend ? 0.5 : pressed ? 0.85 : 1 },
							]}
						>
							<ArrowUp size={17} color={canSend || primarySend ? colors.primaryForeground : colors.disabled} />
						</Pressable>
					)}
				</View>
			</View>
			{status ? (
				<Text style={[comp.status, { color: status.type === "error" ? colors.destructive : colors.warning }]}>{status.message}</Text>
			) : null}
		</View>
	);
}

const layout = StyleSheet.create({
	root: { flex: 1, backgroundColor: colors.background },
	scroll: { flex: 1 },
	content: { paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[6], gap: spacing[3] },
	empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing[6] },
	dock: { paddingHorizontal: spacing[3], paddingTop: spacing[1], backgroundColor: colors.background },
	scrollBtnWrap: { position: "absolute", top: -48, alignSelf: "center", zIndex: 2 },
	scrollBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		height: 36,
		minWidth: 36,
		paddingHorizontal: 10,
		justifyContent: "center",
		borderRadius: radius.pill,
		backgroundColor: colors.popover,
		borderWidth: 1,
		borderColor: colors.border,
	},
	scrollLabel: { color: colors.primary, fontFamily: fonts.medium, fontSize: text.sm },
});

const msg = StyleSheet.create({
	userRow: { alignItems: "flex-end", marginVertical: spacing[2] },
	assistantRow: { flexDirection: "row", gap: spacing[3] },
	avatarSlot: { width: 28, paddingTop: 2 },
	body: { flex: 1, minWidth: 0, gap: spacing[2] },
	name: { color: colors.foreground, fontFamily: fonts.semibold, fontSize: text.sm, height: 28, lineHeight: 28 },
	meta: { marginTop: spacing[1] },
	bubble: { maxWidth: "85%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg },
	text: { color: colors.foreground, fontFamily: fonts.regular, fontSize: text.prose - 1, lineHeight: 22 },
});

const comp = StyleSheet.create({
	frame: { gap: spacing[1] },
	body: {
		backgroundColor: colors.card,
		borderRadius: radius.xl,
		borderWidth: 1,
		borderColor: colors.input,
		paddingHorizontal: spacing[2],
		paddingTop: spacing[2],
		paddingBottom: spacing[1] + 2,
	},
	header: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing[1], paddingBottom: spacing[1] },
	input: {
		color: colors.foreground,
		fontFamily: fonts.regular,
		fontSize: text.prose,
		minHeight: 40,
		maxHeight: 140,
		paddingHorizontal: spacing[2],
		paddingVertical: spacing[1],
		textAlignVertical: "top",
	},
	footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[1] },
	footerActions: { flexDirection: "row", alignItems: "center", gap: spacing[2], flexShrink: 1 },
	send: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
	status: { fontFamily: fonts.regular, fontSize: text.xs, paddingHorizontal: spacing[3] },
});
