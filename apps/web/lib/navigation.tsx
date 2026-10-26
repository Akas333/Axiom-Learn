/**
 * Routing for the Vite front end. Components were written against Next's
 * `next/link` and `next/navigation`; this module offers the same small
 * surface they use (Link with href, useRouter().push/replace/back,
 * usePathname) on top of React Router.
 */
import type { AnchorHTMLAttributes } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
	href: string;
	/** Next's scroll-to-top opt-out; React Router keeps scroll by default. */
	scroll?: boolean;
};

export function Link({ href, scroll: _scroll, ...rest }: LinkProps) {
	return <RouterLink to={href} {...rest} />;
}

export interface AppRouter {
	push(href: string): void;
	replace(href: string): void;
	back(): void;
}

export function useRouter(): AppRouter {
	const navigate = useNavigate();
	return {
		push: (href) => void navigate(href),
		replace: (href) => void navigate(href, { replace: true }),
		back: () => void navigate(-1),
	};
}

export function usePathname(): string {
	return useLocation().pathname;
}
