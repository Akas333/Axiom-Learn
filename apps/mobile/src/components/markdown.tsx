import type { Nodes, Parents, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { mathFromMarkdown } from "mdast-util-math";
import { math } from "micromark-extension-math";
import { memo, useMemo, type ReactNode } from "react";
import { Linking, StyleSheet, Text, View, type TextStyle } from "react-native";
import { repairMathForDisplay, transformMathDelimiters } from "@/src/core";
import { colors, fonts, text } from "@/theme";
import { latexToText } from "@/lib/latex";

/**
 * Tutor prose: the same pre-processing as the web's MessageResponse (math
 * repair + delimiter normalization), parsed to mdast and drawn with native
 * Text/View. Math renders as readable Unicode text (lib/latex.ts).
 */
export const Markdown = memo(function Markdown({ children, size = text.prose }: { children: string; size?: number }) {
	const tree = useMemo<Root | null>(() => {
		try {
			const src = transformMathDelimiters(repairMathForDisplay(children));
			return fromMarkdown(src, { extensions: [math()], mdastExtensions: [mathFromMarkdown()] });
		} catch {
			return null;
		}
	}, [children]);
	if (!tree) return <Text style={[styles.p, { fontSize: size }]}>{children}</Text>;
	const base: TextStyle = { fontSize: size, lineHeight: Math.round(size * 1.5) };
	return <View style={styles.root}>{blocks(tree, base)}</View>;
});

function blocks(parent: Parents, base: TextStyle, depth = 0): ReactNode[] {
	return parent.children.map((node, i) => block(node, base, i, depth));
}

function block(node: Nodes, base: TextStyle, key: number, depth: number): ReactNode {
	switch (node.type) {
		case "paragraph":
			return (
				<Text key={key} style={[styles.p, base]}>
					{inlines(node, base)}
				</Text>
			);
		case "heading": {
			const size = node.depth <= 1 ? 22 : node.depth === 2 ? 19 : 17;
			return (
				<Text key={key} style={[styles.p, styles.heading, { fontSize: size, lineHeight: Math.round(size * 1.35) }]}>
					{inlines(node, base)}
				</Text>
			);
		}
		case "list":
			return (
				<View key={key} style={styles.list}>
					{node.children.map((item, i) => (
						<View key={i} style={styles.listItem}>
							<Text style={[styles.bullet, base]}>{node.ordered ? `${(node.start ?? 1) + i}.` : "•"}</Text>
							<View style={styles.listBody}>{blocks(item, base, depth + 1)}</View>
						</View>
					))}
				</View>
			);
		case "blockquote":
			return (
				<View key={key} style={styles.quote}>
					{blocks(node, base, depth)}
				</View>
			);
		case "code":
			return (
				<View key={key} style={styles.codeBlock}>
					<Text style={styles.codeText} selectable>
						{node.value}
					</Text>
				</View>
			);
		case "math":
			return (
				<View key={key} style={styles.mathBlock}>
					<Text style={[styles.mathText, { fontSize: base.fontSize }]} selectable>
						{latexToText(node.value)}
					</Text>
				</View>
			);
		case "thematicBreak":
			return <View key={key} style={styles.hr} />;
		case "html":
			return (
				<Text key={key} style={[styles.p, base]}>
					{node.value}
				</Text>
			);
		case "table":
			return (
				<View key={key} style={styles.table}>
					{node.children.map((row, ri) => (
						<View key={ri} style={[styles.tableRow, ri === 0 && styles.tableHead]}>
							{row.children.map((cell, ci) => (
								<Text key={ci} style={[styles.tableCell, { fontSize: text.sm }]}>
									{inlines(cell, base)}
								</Text>
							))}
						</View>
					))}
				</View>
			);
		default:
			if ("children" in node) {
				return (
					<Text key={key} style={[styles.p, base]}>
						{inlines(node as Parents, base)}
					</Text>
				);
			}
			return null;
	}
}

function inlines(parent: Parents, base: TextStyle): ReactNode[] {
	return parent.children.map((node, i) => inline(node, base, i));
}

function inline(node: Nodes, base: TextStyle, key: number): ReactNode {
	switch (node.type) {
		case "text":
			return node.value;
		case "strong":
			return (
				<Text key={key} style={styles.strong}>
					{inlines(node, base)}
				</Text>
			);
		case "emphasis":
			return (
				<Text key={key} style={styles.em}>
					{inlines(node, base)}
				</Text>
			);
		case "delete":
			return (
				<Text key={key} style={styles.del}>
					{inlines(node, base)}
				</Text>
			);
		case "inlineCode":
			return (
				<Text key={key} style={styles.inlineCode}>
					{` ${node.value} `}
				</Text>
			);
		case "inlineMath":
			return (
				<Text key={key} style={styles.inlineMath}>
					{latexToText(node.value)}
				</Text>
			);
		case "break":
			return "\n";
		case "link":
			return (
				<Text key={key} style={styles.link} onPress={() => void Linking.openURL(node.url)}>
					{inlines(node, base)}
				</Text>
			);
		case "image":
			return node.alt ? `[${node.alt}]` : null;
		case "html":
			return node.value;
		default:
			return "children" in node ? (
				<Text key={key}>{inlines(node as Parents, base)}</Text>
			) : "value" in node ? (
				String((node as { value: unknown }).value)
			) : null;
	}
}

const styles = StyleSheet.create({
	root: { gap: 10 },
	p: { color: colors.foreground, fontFamily: fonts.regular },
	heading: { fontFamily: fonts.semibold, marginTop: 4 },
	strong: { fontFamily: fonts.semibold },
	em: { fontStyle: "italic" },
	del: { textDecorationLine: "line-through" },
	inlineCode: { fontFamily: fonts.mono, fontSize: 14, backgroundColor: colors.accent, color: colors.foreground },
	inlineMath: { fontFamily: fonts.regular, fontStyle: "italic", color: colors.foreground },
	link: { color: colors.primarySoft, textDecorationLine: "underline" },
	list: { gap: 6 },
	listItem: { flexDirection: "row", gap: 8 },
	bullet: { color: colors.foreground, fontFamily: fonts.regular, minWidth: 14 },
	listBody: { flex: 1, gap: 6 },
	quote: { borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: 12, gap: 8 },
	codeBlock: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12 },
	codeText: { fontFamily: fonts.mono, fontSize: 13, color: colors.foreground, lineHeight: 19 },
	mathBlock: { paddingVertical: 6, alignItems: "center" },
	mathText: { fontFamily: fonts.regular, fontStyle: "italic", color: colors.foreground, textAlign: "center" },
	hr: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 6 },
	table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden" },
	tableRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border },
	tableHead: { backgroundColor: colors.card, borderTopWidth: 0 },
	tableCell: { flex: 1, padding: 8, color: colors.foreground, fontFamily: fonts.regular },
});
