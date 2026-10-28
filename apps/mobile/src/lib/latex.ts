/**
 * Readable plain text from common LaTeX (no math engine on the phone yet):
 * Greek letters, operators, fractions, roots, sub/superscripts. Anything it
 * doesn't know keeps its command name without the backslash.
 */
const SYMBOLS: Record<string, string> = {
	alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
	theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π",
	rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
	Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
	cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥", neq: "≠", ne: "≠",
	approx: "≈", sim: "∼", equiv: "≡", propto: "∝", infty: "∞", partial: "∂", nabla: "∇", sum: "Σ", prod: "∏",
	int: "∫", oint: "∮", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐",
	leftrightarrow: "↔", iff: "⇔", implies: "⇒", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", cup: "∪",
	cap: "∩", forall: "∀", exists: "∃", emptyset: "∅", angle: "∠", circ: "∘", degree: "°", ldots: "…",
	cdots: "⋯", dots: "…", quad: "  ", qquad: "    ", hbar: "ħ", ell: "ℓ", prime: "′", perp: "⊥", parallel: "∥",
	langle: "⟨", rangle: "⟩", neg: "¬", land: "∧", lor: "∨", vec: "", hat: "", bar: "", dot: "",
};

const SUP: Record<string, string> = {
	"0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
	"+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", T: "ᵀ",
};
const SUB: Record<string, string> = {
	"0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
	"+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", i: "ᵢ", j: "ⱼ", k: "ₖ", n: "ₙ", o: "ₒ", x: "ₓ",
};

function script(s: string, map: Record<string, string>, mark: string): string {
	const chars = [...s];
	if (chars.every((c) => map[c] !== undefined)) return chars.map((c) => map[c]).join("");
	return chars.length === 1 ? `${mark}${s}` : `${mark}(${s})`;
}

/** Read one {group} or a single token starting at i; returns [content, nextIndex]. */
function readArg(src: string, i: number): [string, number] {
	while (src[i] === " ") i++;
	if (src[i] === "{") {
		let depth = 0;
		for (let j = i; j < src.length; j++) {
			if (src[j] === "{") depth++;
			else if (src[j] === "}" && --depth === 0) return [src.slice(i + 1, j), j + 1];
		}
		return [src.slice(i + 1), src.length];
	}
	if (src[i] === "\\") {
		const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
		if (m) return [m[0], i + m[0].length];
	}
	return [src[i] ?? "", i + 1];
}

export function latexToText(src: string): string {
	let out = "";
	let i = 0;
	while (i < src.length) {
		const c = src[i]!;
		if (c === "\\") {
			const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
			if (!m) {
				i++;
				continue;
			}
			const name = m[1]!;
			i += m[0].length;
			if (name === "frac" || name === "dfrac" || name === "tfrac") {
				const [a, j] = readArg(src, i);
				const [b, k] = readArg(src, j);
				i = k;
				const na = latexToText(a);
				const nb = latexToText(b);
				const wrap = (s: string) => (/^[\w.′]+$/u.test(s) ? s : `(${s})`);
				out += `${wrap(na)}/${wrap(nb)}`;
			} else if (name === "sqrt") {
				const [a, j] = readArg(src, i);
				i = j;
				out += `√(${latexToText(a)})`;
			} else if (["text", "mathrm", "mathbf", "mathit", "operatorname", "textbf", "mathcal", "boldsymbol", "mathsf"].includes(name)) {
				const [a, j] = readArg(src, i);
				i = j;
				out += name.startsWith("text") ? a : latexToText(a);
			} else if (name === "left" || name === "right" || name === "big" || name === "Big" || name === "bigl" || name === "bigr") {
				// size hints: keep the delimiter that follows
			} else if (name === "," || name === ";" || name === ":" || name === "!" || name === " ") {
				out += name === "!" ? "" : " ";
			} else if (name === "{" || name === "}" || name === "%" || name === "$" || name === "_" || name === "&" || name === "#") {
				out += name;
			} else if (name === "\\") {
				out += "\n";
			} else {
				out += SYMBOLS[name] ?? name;
			}
			continue;
		}
		if (c === "^" || c === "_") {
			const [a, j] = readArg(src, i + 1);
			i = j;
			out += script(latexToText(a), c === "^" ? SUP : SUB, c);
			continue;
		}
		if (c === "{" || c === "}") {
			i++;
			continue;
		}
		if (c === "&") {
			out += " ";
			i++;
			continue;
		}
		out += c;
		i++;
	}
	return out.replace(/[ \t]{2,}/g, " ").trim();
}
