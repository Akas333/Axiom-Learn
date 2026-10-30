/**
 * Onboarding illustrations, in the app's own ink: monochrome rounded
 * shapes in the foreground color at low opacity, some only outlined — the
 * same hollow stroke as the hero headings' outlined word. The welcome step
 * uses the home screen's dotted sphere instead. One shape per scene takes
 * the brand blue (the TYSA mark's), the onboarding's only accent. Purely decorative
 * (aria-hidden), shown only in the empty side panel on wide screens; a
 * slow drift moves a few shapes, and reduced motion stops it.
 */

import { SphereBackdrop } from "@/components/sphere-backdrop";
import type { OnboardingStep } from "@/components/onboarding";

/** Ink levels: faint fill, soft fill, and the outline stroke. */
const faint = { fill: "currentColor", fillOpacity: 0.06 } as const;
const soft = { fill: "currentColor", fillOpacity: 0.14 } as const;
const solid = { fill: "currentColor", fillOpacity: 0.32 } as const;
const line = { fill: "none", stroke: "currentColor", strokeOpacity: 0.55, strokeWidth: 1.5 } as const;
const blue = { fill: "#2e8bff" } as const;

function Methods() {
	return (
		<>
			<rect x="60" y="60" width="130" height="130" rx="28" {...soft} />
			<circle cx="125" cy="125" r="28" {...line} />
			<rect x="210" y="60" width="130" height="130" rx="28" {...line} />
			<rect x="236" y="96" width="78" height="10" rx="5" {...solid} />
			<rect x="236" y="118" width="56" height="10" rx="5" {...soft} />
			<rect x="236" y="140" width="66" height="10" rx="5" {...soft} />
			<rect x="60" y="210" width="130" height="130" rx="28" {...line} />
			<rect x="90" y="240" width="70" height="70" rx="18" {...blue} className="onb-drift" />
			<rect x="210" y="210" width="130" height="130" rx="28" {...soft} />
			<circle cx="248" cy="275" r="11" {...solid} />
			<circle cx="275" cy="275" r="11" {...soft} />
			<circle cx="302" cy="275" r="11" {...line} className="onb-drift onb-delay-1" />
		</>
	);
}

function Connect() {
	return (
		<>
			<rect x="197" y="110" width="6" height="180" rx="3" {...faint} />
			<rect x="110" y="197" width="180" height="6" rx="3" {...faint} />
			<rect x="150" y="150" width="100" height="100" rx="28" {...soft} />
			<rect x="150" y="150" width="100" height="100" rx="28" {...line} />
			<rect x="178" y="188" width="44" height="24" rx="12" {...blue} />
			<circle cx="200" cy="86" r="32" {...line} className="onb-drift" />
			<rect x="54" y="170" width="60" height="60" rx="18" {...line} className="onb-drift onb-delay-1" />
			<rect x="286" y="170" width="60" height="60" rx="30" {...soft} className="onb-drift onb-delay-2" />
			<rect x="160" y="290" width="80" height="44" rx="22" {...soft} />
		</>
	);
}

function Models() {
	return (
		<>
			{/* Three slots, one model each: the first is picked. */}
			<rect x="64" y="72" width="272" height="72" rx="24" {...line} />
			<circle cx="104" cy="108" r="16" {...blue} />
			<rect x="136" y="100" width="120" height="16" rx="8" {...solid} />
			<rect x="64" y="164" width="272" height="72" rx="24" {...soft} />
			<circle cx="104" cy="200" r="16" {...line} className="onb-drift" />
			<rect x="136" y="192" width="96" height="16" rx="8" {...soft} />
			<rect x="64" y="256" width="272" height="72" rx="24" {...faint} />
			<rect x="88" y="276" width="32" height="32" rx="10" {...line} className="onb-drift onb-delay-1" />
			<rect x="136" y="284" width="140" height="16" rx="8" {...faint} />
		</>
	);
}

function Preferences() {
	return (
		<>
			{/* A speech bubble over three sliders: say it, and the tutor adjusts. */}
			<rect x="72" y="60" width="256" height="116" rx="32" {...line} />
			<rect x="104" y="96" width="140" height="10" rx="5" {...solid} />
			<rect x="104" y="120" width="96" height="10" rx="5" {...soft} />
			<rect x="104" y="144" width="60" height="10" rx="5" {...faint} />
			<rect x="72" y="238" width="256" height="8" rx="4" {...faint} />
			<circle cx="188" cy="242" r="15" {...blue} className="onb-drift" />
			<rect x="72" y="284" width="256" height="8" rx="4" {...faint} />
			<circle cx="276" cy="288" r="15" {...line} className="onb-drift onb-delay-1" />
			<rect x="72" y="330" width="256" height="8" rx="4" {...faint} />
			<circle cx="124" cy="334" r="15" {...soft} className="onb-drift onb-delay-2" />
		</>
	);
}

const SCENES: Record<Exclude<OnboardingStep, "about">, () => React.ReactNode> = {
	methods: Methods,
	connect: Connect,
	models: Models,
	preferences: Preferences,
};

export function OnboardingArt({ step }: { step: OnboardingStep }) {
	if (step === "about") {
		return (
			<div className="onb-enter absolute inset-0">
				<SphereBackdrop />
			</div>
		);
	}
	const Scene = SCENES[step];
	return (
		<svg key={step} viewBox="0 0 400 400" className="onb-enter h-auto w-full max-w-[380px] text-foreground" aria-hidden>
			<Scene />
		</svg>
	);
}
