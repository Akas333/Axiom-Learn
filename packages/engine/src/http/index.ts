/**
 * The HTTP surface: every /api route, transport-neutral. Each handler takes a
 * web Request plus `{ params }` and returns a web Response, so any server
 * (the Hono server, the legacy Next app) can mount the same code.
 */
import * as activityAbort from "./routes/activity-abort.ts";
import * as activity from "./routes/activity.ts";
import * as chat from "./routes/chat.ts";
import * as chatsIdArtifactUi from "./routes/chats-id-artifact-ui.ts";
import * as chatsIdDismiss from "./routes/chats-id-dismiss.ts";
import * as chatsIdMarkdown from "./routes/chats-id-markdown.ts";
import * as chatsIdMode from "./routes/chats-id-mode.ts";
import * as chatsIdMaterials from "./routes/chats-id-materials.ts";
import * as chatsId from "./routes/chats-id.ts";
import * as chatsIdSettings from "./routes/chats-id-settings.ts";
import * as chatsIdSteer from "./routes/chats-id-steer.ts";
import * as chatsIdStream from "./routes/chats-id-stream.ts";
import * as chats from "./routes/chats.ts";
import * as events from "./routes/events.ts";
import * as folders from "./routes/folders.ts";
import * as foldersId from "./routes/folders-id.ts";
import * as foldersIdCourse from "./routes/folders-id-course.ts";
import * as foldersIdMaterials from "./routes/folders-id-materials.ts";
import * as materials from "./routes/materials.ts";
import * as materialsId from "./routes/materials-id.ts";
import * as graphCosts from "./routes/graph-costs.ts";
import * as graphCoverageExtract from "./routes/graph-coverage-extract.ts";
import * as graphImport from "./routes/graph-import.ts";
import * as graphNodesId from "./routes/graph-nodes-id.ts";
import * as graphPositions from "./routes/graph-positions.ts";
import * as graphRenderSettings from "./routes/graph-render-settings.ts";
import * as graph from "./routes/graph.ts";
import * as graphStatus from "./routes/graph-status.ts";
import * as jobs from "./routes/jobs.ts";
import * as keysId from "./routes/keys-id.ts";
import * as keys from "./routes/keys.ts";
import * as models from "./routes/models.ts";
import * as search from "./routes/search.ts";
import * as settingsSection from "./routes/settings-section.ts";
import * as settingsPromptsSegment from "./routes/settings-prompts-segment.ts";
import * as settingsPrompts from "./routes/settings-prompts.ts";
import * as preferences from "./routes/preferences.ts";
import * as settings from "./routes/settings.ts";
import * as sttToken from "./routes/stt-token.ts";
import * as subscriptionsBrowser from "./routes/subscriptions-browser.ts";
import * as subscriptions from "./routes/subscriptions.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type RouteHandler = (req: Request, ctx: { params: Promise<Record<string, string | string[]>> }) => Response | Promise<Response>;

export interface ApiRoute {
	/** Path pattern with `:param` segments; a trailing `*` is a catch-all. */
	path: string;
	/** Param name the catch-all segments are passed under (as string[]). */
	catchAll?: string;
	handlers: Partial<Record<HttpMethod, RouteHandler>>;
}

export const API_ROUTES: readonly ApiRoute[] = [
	{ path: "/api/activity/abort", handlers: { POST: activityAbort.POST as RouteHandler } },
	{ path: "/api/activity", handlers: { GET: activity.GET as RouteHandler } },
	{ path: "/api/chat", handlers: { POST: chat.POST as RouteHandler } },
	{ path: "/api/chats/:id/artifact-ui", handlers: { POST: chatsIdArtifactUi.POST as RouteHandler } },
	{ path: "/api/chats/:id/dismiss", handlers: { POST: chatsIdDismiss.POST as RouteHandler } },
	{ path: "/api/chats/:id/markdown", handlers: { GET: chatsIdMarkdown.GET as RouteHandler } },
	{ path: "/api/chats/:id/mode", handlers: { POST: chatsIdMode.POST as RouteHandler } },
	{ path: "/api/chats/:id/materials", handlers: { GET: chatsIdMaterials.GET as RouteHandler } },
	{ path: "/api/chats/:id", handlers: { GET: chatsId.GET as RouteHandler, PUT: chatsId.PUT as RouteHandler, DELETE: chatsId.DELETE as RouteHandler } },
	{ path: "/api/chats/:id/settings", handlers: { PUT: chatsIdSettings.PUT as RouteHandler } },
	{ path: "/api/chats/:id/steer", handlers: { POST: chatsIdSteer.POST as RouteHandler } },
	{ path: "/api/chats/:id/stream", handlers: { GET: chatsIdStream.GET as RouteHandler } },
	{ path: "/api/chats", handlers: { GET: chats.GET as RouteHandler, POST: chats.POST as RouteHandler } },
	{ path: "/api/events", handlers: { GET: events.GET as RouteHandler } },
	{ path: "/api/folders", handlers: { GET: folders.GET as RouteHandler, POST: folders.POST as RouteHandler } },
	{ path: "/api/folders/:id", handlers: { PUT: foldersId.PUT as RouteHandler, DELETE: foldersId.DELETE as RouteHandler } },
	{ path: "/api/folders/:id/course", handlers: { GET: foldersIdCourse.GET as RouteHandler } },
	{ path: "/api/folders/:id/materials", handlers: { GET: foldersIdMaterials.GET as RouteHandler } },
	{ path: "/api/materials/:id", handlers: { GET: materialsId.GET as RouteHandler, PUT: materialsId.PUT as RouteHandler, DELETE: materialsId.DELETE as RouteHandler } },
	{ path: "/api/materials", handlers: { POST: materials.POST as RouteHandler } },
	{ path: "/api/graph/costs", handlers: { GET: graphCosts.GET as RouteHandler } },
	{ path: "/api/graph/coverage/extract", handlers: { POST: graphCoverageExtract.POST as RouteHandler } },
	{ path: "/api/graph/import", handlers: { POST: graphImport.POST as RouteHandler } },
	{ path: "/api/graph/nodes/:id", handlers: { DELETE: graphNodesId.DELETE as RouteHandler } },
	{ path: "/api/graph/positions", handlers: { PUT: graphPositions.PUT as RouteHandler } },
	{ path: "/api/graph/render-settings", handlers: { GET: graphRenderSettings.GET as RouteHandler, PUT: graphRenderSettings.PUT as RouteHandler } },
	{ path: "/api/graph", handlers: { GET: graph.GET as RouteHandler } },
	{ path: "/api/graph/status", handlers: { GET: graphStatus.GET as RouteHandler } },
	{ path: "/api/jobs", handlers: { GET: jobs.GET as RouteHandler } },
	{ path: "/api/keys/:id", handlers: { PUT: keysId.PUT as RouteHandler, DELETE: keysId.DELETE as RouteHandler } },
	{ path: "/api/keys", handlers: { GET: keys.GET as RouteHandler } },
	{ path: "/api/models", handlers: { GET: models.GET as RouteHandler } },
	{ path: "/api/preferences", handlers: { GET: preferences.GET as RouteHandler, PUT: preferences.PUT as RouteHandler, DELETE: preferences.DELETE as RouteHandler } },
	{ path: "/api/search", handlers: { GET: search.GET as RouteHandler } },
	{ path: "/api/settings/:section", handlers: { PUT: settingsSection.PUT as RouteHandler } },
	{ path: "/api/settings/prompts/*", catchAll: "segment", handlers: { PUT: settingsPromptsSegment.PUT as RouteHandler, DELETE: settingsPromptsSegment.DELETE as RouteHandler } },
	{ path: "/api/settings/prompts", handlers: { GET: settingsPrompts.GET as RouteHandler } },
	{ path: "/api/settings", handlers: { GET: settings.GET as RouteHandler } },
	{ path: "/api/stt/token", handlers: { GET: sttToken.GET as RouteHandler } },
	{ path: "/api/subscriptions/browser", handlers: { GET: subscriptionsBrowser.GET as RouteHandler, POST: subscriptionsBrowser.POST as RouteHandler } },
	{ path: "/api/subscriptions", handlers: { GET: subscriptions.GET as RouteHandler, POST: subscriptions.POST as RouteHandler } },
];
