/**
 * The material readers (2026-10-29): material_read (a slice of one
 * attached material — by pages or by heading — or all of it when short)
 * and material_search (lines matching a query across everything this chat
 * can read: its own attachments and its folders'). Read-only; the
 * transcription itself arrives in the transcript as the material marker.
 */
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";
import { MATERIAL_READ_CAP, materialSlice, type MaterialRecord } from "../../core/contracts/materials.ts";

export interface MaterialToolContext {
	chatId: string;
	/** Everything this chat may read (server/materials.ts readableMaterials). */
	readable: (chatId: string) => MaterialRecord[];
}

const materialReadInput = Type.Object({
	materialId: Type.String({ description: "The material's id, as its marker shows it ([mat_…])." }),
	pages: Type.Optional(Type.String({ description: "A page or page range, e.g. '3' or '2-5'." })),
	heading: Type.Optional(Type.String({ description: "A heading (or part of one) — returns that section." })),
});

const materialSearchInput = Type.Object({
	query: Type.String({ description: "Words to find (case-insensitive), e.g. 'coaxial' or 'Illustration 4.16'." }),
});

function cap(text: string): string {
	return text.length <= MATERIAL_READ_CAP ? text : `${text.slice(0, MATERIAL_READ_CAP)}\n\n[… cut at ${MATERIAL_READ_CAP} characters — read a narrower range]`;
}

export function materialTools(ctx: MaterialToolContext): Record<string, AgentTool<any>> {
	return {
		material_read: {
			name: "material_read",
			label: "material_read",
			description:
				"Read the learner's attached material (a transcribed image or PDF): pass pages ('2-5') or a heading for one section; " +
				"omit both for the whole text (long ones are cut — read them by range).",
			parameters: materialReadInput,
			execute: serverExecute("material_read", materialReadInput, async (input) => {
				const material = ctx.readable(ctx.chatId).find((m) => m.id === input.materialId);
				if (!material) return `ERROR: no material ${input.materialId} is attached to this chat or its folders.`;
				if (material.status !== "ready") return `The material is ${material.status === "extracting" ? "still being transcribed" : "not readable (transcription failed)"}.`;
				const slice = materialSlice(material.markdown, { pages: input.pages, heading: input.heading });
				if (!slice) return `ERROR: nothing matches ${input.pages ? `pages ${input.pages}` : `heading "${input.heading}"`} in ${material.name}.`;
				return cap(slice);
			}),
		},
		material_search: {
			name: "material_search",
			label: "material_search",
			description: "Search all the material attached to this chat and its folders; returns matching lines with their material, page and nearby heading.",
			parameters: materialSearchInput,
			execute: serverExecute("material_search", materialSearchInput, async (input) => {
				const needle = input.query.trim().toLowerCase();
				if (!needle) return "ERROR: empty query.";
				const hits: string[] = [];
				for (const material of ctx.readable(ctx.chatId)) {
					if (material.status !== "ready") continue;
					let page: string | null = null;
					let heading: string | null = null;
					for (const line of material.markdown.split("\n")) {
						const mark = /^<!-- page (\d+) -->$/.exec(line.trim());
						if (mark) page = mark[1]!;
						if (/^#{1,4}\s/.test(line)) heading = line.replace(/^#+\s*/, "");
						if (line.toLowerCase().includes(needle)) {
							hits.push(`[${material.id}] ${material.name}${page ? ` p.${page}` : ""}${heading ? ` § ${heading}` : ""}: ${line.trim()}`);
							if (hits.length >= 40) return cap(`${hits.join("\n")}\n[… first 40 hits — narrow the query]`);
						}
					}
				}
				return hits.length > 0 ? cap(hits.join("\n")) : `No line matches "${input.query}".`;
			}),
		},
	};
}
