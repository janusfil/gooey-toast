import type { ToastOptions, ToastPosition } from "./types";

export const DEFAULT_DURATION = 6000;
export const AUTO_EXPAND_DELAY = 150;
export const AUTO_COLLAPSE_DELAY = 4000;

export interface ToastPlacement {
	align: "left" | "center" | "right";
	edge: "top" | "bottom";
}

export const normalizeDuration = (value: number | null | undefined) =>
	value === undefined ? DEFAULT_DURATION : value;

export const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export const resolvePlacement = (position: ToastPosition): ToastPlacement => ({
	align: position.endsWith("left")
		? "left"
		: position.endsWith("center")
			? "center"
			: "right",
	edge: position.startsWith("top") ? "top" : "bottom",
});

export const resolveAutopilot = (
	options: Pick<ToastOptions, "autopilot">,
	duration: number | null,
) => {
	if (options.autopilot === false || duration == null || duration <= 0) {
		return {};
	}

	const cfg = typeof options.autopilot === "object" ? options.autopilot : undefined;

	return {
		autoExpandDelayMs: clamp(cfg?.expand ?? AUTO_EXPAND_DELAY, 0, duration),
		autoCollapseDelayMs: clamp(cfg?.collapse ?? AUTO_COLLAPSE_DELAY, 0, duration),
	};
};
