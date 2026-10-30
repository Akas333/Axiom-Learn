import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { LhMark } from "@/components/lh-mark";

/** The hosted app's sign-in page: an emailed sign-in link, or Google. */
export default function SignInPage({ supabase }: { supabase: SupabaseClient }) {
	const [email, setEmail] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [sentTo, setSentTo] = useState("");
	const [error, setError] = useState("");

	const redirectTo = window.location.origin + window.location.pathname;

	const sendLink = async () => {
		setError("");
		const address = email.trim();
		if (!/^\S+@\S+\.\S+$/.test(address)) {
			setError("Enter a valid email address.");
			return;
		}
		setIsSending(true);
		const { error: err } = await supabase.auth.signInWithOtp({ email: address, options: { emailRedirectTo: redirectTo } });
		setIsSending(false);
		if (err) setError(err.message);
		else setSentTo(address);
	};

	const google = async () => {
		setError("");
		const { error: err } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
		if (err) setError(err.message);
	};

	return (
		<div className="flex min-h-full items-center justify-center bg-background p-6">
			<div className="flex w-full max-w-[400px] flex-col items-center gap-4">
				<div className="flex flex-col items-center gap-2">
					<LhMark />
					<span className="text-lg font-bold">Kapany</span>
				</div>

				<div className="flex w-full flex-col gap-4 rounded-xl border bg-card p-8">
					<div className="flex flex-col items-center gap-1 text-center">
						<h2 className="text-xl font-semibold">Sign in</h2>
						<p className="text-sm text-muted-foreground">Your lessons and knowledge graph follow you to any device.</p>
					</div>

					{error && (
						<div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
							{error}
						</div>
					)}
					{sentTo && (
						<div role="status" className="rounded-lg border px-3 py-2 text-sm">
							<div className="font-medium">Check your email</div>
							<div className="text-muted-foreground">We sent a sign-in link to {sentTo}.</div>
						</div>
					)}

					<Button variant="outline" size="lg" className="w-full" onClick={google}>
						Continue with Google
					</Button>

					<div className="flex items-center gap-3 text-xs text-muted-foreground">
						<Separator className="flex-1" />
						or
						<Separator className="flex-1" />
					</div>

					<label className="flex flex-col gap-1.5 text-sm font-medium">
						Email
						<Input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && void sendLink()}
							placeholder="you@example.com"
							className="h-10"
						/>
					</label>

					<Button size="lg" className="w-full" disabled={isSending} onClick={sendLink}>
						{isSending ? "Sending…" : "Email me a sign-in link"}
					</Button>
				</div>
			</div>
		</div>
	);
}
