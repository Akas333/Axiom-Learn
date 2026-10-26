import { Outlet } from "react-router";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import UpdateBanner from "@/components/update-banner";

export default function RootLayout() {
	return (
		<>
			{/* The notification channel rides OUTSIDE everything: sidebar, dock,
			    and pages all subscribe to it. */}
			<ServerEventsProvider>
				<AppearanceProvider>
					<SidebarProvider>
						<ActivityProvider>
							<AppShell>
								<Outlet />
							</AppShell>
						</ActivityProvider>
					</SidebarProvider>
				</AppearanceProvider>
			</ServerEventsProvider>
			{/* Auto-update banner: fixed card, Electron-only pushes. */}
			<UpdateBanner />
		</>
	);
}
