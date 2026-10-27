/**
 * The app's button: Astryx Button (labelled) or IconButton (icon sizes),
 * behind the call-site API the app already uses (variant/size/children).
 */
import * as React from "react";
import { Button as AstryxButton } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";

type Variant = "default" | "primary" | "destructive" | "outline" | "secondary" | "ghost" | "link";
type Size = "default" | "xs" | "sm" | "md" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

const VARIANT: Record<Variant, "primary" | "secondary" | "ghost" | "destructive"> = {
	default: "primary",
	primary: "primary",
	destructive: "destructive",
	outline: "secondary",
	secondary: "secondary",
	ghost: "ghost",
	link: "ghost",
};

const SIZE: Record<Size, "sm" | "md" | "lg"> = {
	default: "md",
	md: "md",
	xs: "sm",
	sm: "sm",
	lg: "lg",
	icon: "md",
	"icon-xs": "sm",
	"icon-sm": "sm",
	"icon-lg": "lg",
};

/** Plain text of a React node, for the accessible label. */
function textOf(node: React.ReactNode): string {
	if (node == null || typeof node === "boolean") return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textOf).join("");
	if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
	return "";
}

export type ButtonProps = Omit<React.ComponentProps<"button">, "color"> & {
	variant?: Variant;
	size?: Size;
	/** Accessible label; defaults to aria-label or the children's text. */
	label?: string;
	isLoading?: boolean;
	tooltip?: string;
	ref?: React.Ref<HTMLButtonElement>;
};

function Button({
	variant = "default",
	size = "default",
	children,
	disabled,
	label,
	type = "button",
	isLoading,
	tooltip,
	...props
}: ButtonProps) {
	const text = (label ?? props["aria-label"] ?? (textOf(children).trim() || tooltip)) || "Button";
	const common = {
		...(props as Record<string, unknown>),
		type,
		variant: VARIANT[variant],
		size: SIZE[size],
		isDisabled: disabled,
		isLoading,
		tooltip,
		"data-variant": variant,
	};
	if (size.startsWith("icon")) {
		return <IconButton {...common} label={text} icon={children} />;
	}
	return (
		<AstryxButton {...common} label={text}>
			{typeof children === "string" ? undefined : children}
		</AstryxButton>
	);
}

export { Button };
