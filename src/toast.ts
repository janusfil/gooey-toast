import { createStateIcon } from "./icons";
import {
	TOAST_POSITIONS,
	type ToastButton,
	type ToastOptions,
	type ToastPosition,
	type ToastPromiseOptions,
	type ToastRenderable,
	type ToastRenderableValue,
	type ToastState,
	type ToastStyles,
	type ToasterHandle,
	type ToasterOffsetConfig,
	type ToasterOffsetValue,
	type ToasterOptions,
} from "./types";

const DEFAULT_DURATION = 6000;
const EXIT_DURATION = DEFAULT_DURATION * 0.1;
const AUTO_EXPAND_DELAY = DEFAULT_DURATION * 0.025;
const AUTO_COLLAPSE_DELAY = DEFAULT_DURATION - 2000;

const HEIGHT = 40;
const WIDTH = 350;
const DEFAULT_ROUNDNESS = 18;
const BLUR_RATIO = 0.5;
const PILL_PADDING = 10;
const MIN_EXPAND_RATIO = 2.25;
const SWAP_COLLAPSE_MS = 200;
const HEADER_EXIT_MS = 150;
const SWIPE_DISMISS = 30;
const SWIPE_MAX = 20;

interface InternalToastOptions extends ToastOptions {
	state?: ToastState;
}

interface ToastRecord extends InternalToastOptions {
	id: string;
	instanceId: string;
	exiting?: boolean;
	autoExpandDelayMs?: number;
	autoCollapseDelayMs?: number;
}

interface ToastVisual {
	title: string;
	description?: ToastRenderable;
	state: ToastState;
	icon?: ToastRenderable | null;
	styles?: ToastStyles;
	button?: ToastButton;
	fill: string;
	roundness?: number;
}

interface ToastPlacement {
	align: "left" | "center" | "right";
	expand: "top" | "bottom";
}

interface ToastViewCallbacks {
	onEnter: (id: string) => void;
	onLeave: (id: string) => void;
	onDismiss: (id: string) => void;
}

type ToastListener = (toasts: ToastRecord[]) => void;

const store = {
	toasts: [] as ToastRecord[],
	listeners: new Set<ToastListener>(),
	position: "top-right" as ToastPosition,
	options: undefined as Partial<ToastOptions> | undefined,

	emit() {
		for (const fn of this.listeners) {
			fn(this.toasts);
		}
	},

	update(fn: (prev: ToastRecord[]) => ToastRecord[]) {
		this.toasts = fn(this.toasts);
		this.emit();
	},
};

const isBrowser = () =>
	typeof window !== "undefined" && typeof document !== "undefined";

let idCounter = 0;
const generateId = () =>
	`${++idCounter}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const timeoutKey = (t: ToastRecord) => `${t.id}:${t.instanceId}`;

const pillAlign = (pos: ToastPosition): ToastPlacement["align"] => {
	if (pos.includes("right")) return "right";
	if (pos.includes("center")) return "center";
	return "left";
};

const expandDir = (pos: ToastPosition): ToastPlacement["expand"] =>
	pos.startsWith("top") ? "bottom" : "top";

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const resolveAutopilot = (
	opts: InternalToastOptions,
	duration: number | null,
): { expandDelayMs?: number; collapseDelayMs?: number } => {
	if (opts.autopilot === false || duration == null || duration <= 0) {
		return {};
	}

	const cfg = typeof opts.autopilot === "object" ? opts.autopilot : undefined;
	return {
		expandDelayMs: clamp(cfg?.expand ?? AUTO_EXPAND_DELAY, 0, duration),
		collapseDelayMs: clamp(cfg?.collapse ?? AUTO_COLLAPSE_DELAY, 0, duration),
	};
};

const mergeOptions = (options: InternalToastOptions): InternalToastOptions => ({
	...store.options,
	...options,
	styles: {
		...(store.options?.styles ?? {}),
		...(options.styles ?? {}),
	},
});

const buildToastRecord = (
	merged: InternalToastOptions,
	id: string,
	fallbackPosition?: ToastPosition,
): ToastRecord => {
	const duration = merged.duration ?? DEFAULT_DURATION;
	const auto = resolveAutopilot(merged, duration);

	return {
		...merged,
		id,
		instanceId: generateId(),
		position: merged.position ?? fallbackPosition ?? store.position,
		autoExpandDelayMs: auto.expandDelayMs,
		autoCollapseDelayMs: auto.collapseDelayMs,
	};
};

const createToast = (options: InternalToastOptions) => {
	const live = store.toasts.filter((t) => !t.exiting);
	const merged = mergeOptions(options);

	const id = merged.id ?? generateId();
	const prev = live.find((t) => t.id === id);
	const item = buildToastRecord(merged, id, prev?.position);

	if (prev) {
		store.update((all) => all.map((t) => (t.id === id ? item : t)));
	} else {
		store.update((all) => [...all.filter((t) => t.id !== id), item]);
	}

	return { id, duration: merged.duration ?? DEFAULT_DURATION };
};

const updateToast = (id: string, options: InternalToastOptions) => {
	const existing = store.toasts.find((t) => t.id === id);
	if (!existing) return;

	const merged = mergeOptions({ ...options, id });
	const item = buildToastRecord(merged, id, existing.position);
	store.update((all) => all.map((t) => (t.id === id ? item : t)));
};

const dismissToast = (id: string) => {
	const item = store.toasts.find((t) => t.id === id);
	if (!item || item.exiting) return;

	store.update((all) => all.map((t) => (t.id === id ? { ...t, exiting: true } : t)));

	setTimeout(() => {
		store.update((all) => all.filter((t) => t.id !== id));
	}, EXIT_DURATION);
};

const resolveRenderableValue = (
	input: ToastRenderable | null | undefined,
): ToastRenderableValue => {
	let value: ToastRenderable | ToastRenderableValue = input;
	while (typeof value === "function") {
		value = value();
	}
	return value;
};

const isNode = (value: unknown): value is Node =>
	typeof Node !== "undefined" && value instanceof Node;

const renderRenderable = (
	container: Element,
	value: ToastRenderable | null | undefined,
): boolean => {
	const resolved = resolveRenderableValue(value);
	if (resolved == null) return false;

	if (typeof resolved === "string" || typeof resolved === "number") {
		const text = String(resolved);
		if (!text.trim()) return false;
		container.append(document.createTextNode(text));
		return true;
	}

	if (isNode(resolved)) {
		container.append(resolved.cloneNode(true));
		return true;
	}

	return false;
};

const renderIcon = (
	value: ToastRenderable | null | undefined,
	state: ToastState,
): Node => {
	const resolved = resolveRenderableValue(value);
	if (resolved == null) return createStateIcon(state);
	if (typeof resolved === "string" || typeof resolved === "number") {
		return document.createTextNode(String(resolved));
	}
	if (isNode(resolved)) {
		return resolved.cloneNode(true);
	}
	return createStateIcon(state);
};

class ToastView {
	readonly id: string;
	readonly root: HTMLButtonElement;

	private readonly callbacks: ToastViewCallbacks;
	private placement: ToastPlacement;
	private currentItem: ToastRecord;
	private view: ToastVisual;

	private readonly canvasEl: HTMLDivElement;
	private readonly svgEl: SVGSVGElement;
	private readonly blurNode: SVGFEGaussianBlurElement;
	private readonly pillRect: SVGRectElement;
	private readonly bodyRect: SVGRectElement;

	private readonly headerEl: HTMLDivElement;
	private readonly headerStackEl: HTMLDivElement;
	private currentHeaderEl: HTMLDivElement | null = null;

	private readonly contentEl: HTMLDivElement;
	private readonly descriptionEl: HTMLDivElement;

	private headerObserver: ResizeObserver | null = null;
	private contentObserver: ResizeObserver | null = null;

	private headerExitTimer: number | null = null;
	private autoExpandTimer: number | null = null;
	private autoCollapseTimer: number | null = null;
	private swapTimer: number | null = null;
	private readyRaf: number | null = null;

	private pendingView: { payload: ToastVisual } | null = null;
	private lastRefreshKey: string;

	private headerPaddingPx: number | null = null;
	private pillWidth = HEIGHT;
	private contentHeight = 0;
	private frozenExpanded = HEIGHT * MIN_EXPAND_RATIO;
	private pointerStartY: number | null = null;

	private hasDescriptionContent = false;
	private isExpanded = false;
	private canExpand = true;

	constructor(
		item: ToastRecord,
		placement: ToastPlacement,
		canExpand: boolean,
		callbacks: ToastViewCallbacks,
	) {
		this.id = item.id;
		this.currentItem = item;
		this.placement = placement;
		this.callbacks = callbacks;
		this.view = this.createVisual(item);
		this.lastRefreshKey = item.instanceId;
		this.canExpand = canExpand;

		this.root = document.createElement("button");
		this.root.type = "button";
		this.root.setAttribute("data-gooey-toast", "");
		this.root.dataset.ready = "false";
		this.root.dataset.expanded = "false";
		this.root.dataset.exiting = String(Boolean(item.exiting));
		this.root.dataset.state = this.view.state;
		this.root.dataset.position = placement.align;
		this.root.dataset.edge = placement.expand;

		this.canvasEl = document.createElement("div");
		this.canvasEl.setAttribute("data-gooey-canvas", "");

		this.svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		this.svgEl.setAttribute("data-gooey-svg", "");
		this.svgEl.setAttribute("width", String(WIDTH));
		this.svgEl.setAttribute("height", String(HEIGHT));
		this.svgEl.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

		const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
		title.textContent = "Gooey Toast Notification";
		this.svgEl.append(title);

		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
		const filterId = `gooey-toast-${this.id}-${item.instanceId}`;
		filter.setAttribute("id", filterId);
		filter.setAttribute("x", "-20%");
		filter.setAttribute("y", "-20%");
		filter.setAttribute("width", "140%");
		filter.setAttribute("height", "140%");
		filter.setAttribute("color-interpolation-filters", "sRGB");

		this.blurNode = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"feGaussianBlur",
		);
		this.blurNode.setAttribute("in", "SourceGraphic");
		this.blurNode.setAttribute("stdDeviation", String(DEFAULT_ROUNDNESS * BLUR_RATIO));
		this.blurNode.setAttribute("result", "blur");

		const colorMatrix = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"feColorMatrix",
		);
		colorMatrix.setAttribute("in", "blur");
		colorMatrix.setAttribute("mode", "matrix");
		colorMatrix.setAttribute(
			"values",
			"1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10",
		);
		colorMatrix.setAttribute("result", "goo");

		const composite = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"feComposite",
		);
		composite.setAttribute("in", "SourceGraphic");
		composite.setAttribute("in2", "goo");
		composite.setAttribute("operator", "atop");

		filter.append(this.blurNode, colorMatrix, composite);
		defs.append(filter);

		const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
		group.setAttribute("filter", `url(#${filterId})`);

		this.pillRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		this.pillRect.setAttribute("data-gooey-pill", "");

		this.bodyRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		this.bodyRect.setAttribute("data-gooey-body", "");

		group.append(this.pillRect, this.bodyRect);
		this.svgEl.append(defs, group);
		this.canvasEl.append(this.svgEl);

		this.headerEl = document.createElement("div");
		this.headerEl.setAttribute("data-gooey-header", "");

		this.headerStackEl = document.createElement("div");
		this.headerStackEl.setAttribute("data-gooey-header-stack", "");
		this.headerEl.append(this.headerStackEl);

		this.contentEl = document.createElement("div");
		this.contentEl.setAttribute("data-gooey-content", "");

		this.descriptionEl = document.createElement("div");
		this.descriptionEl.setAttribute("data-gooey-description", "");
		this.contentEl.append(this.descriptionEl);

		this.root.append(this.canvasEl, this.headerEl, this.contentEl);

		this.root.addEventListener("mouseenter", this.handleMouseEnter);
		this.root.addEventListener("mouseleave", this.handleMouseLeave);
		this.root.addEventListener("transitionend", this.handleTransitionEnd);
		this.root.addEventListener("pointerdown", this.handlePointerDown);
		this.root.addEventListener("pointermove", this.handlePointerMove, {
			passive: true,
		});
		this.root.addEventListener("pointerup", this.handlePointerUp, { passive: true });

		if (typeof ResizeObserver !== "undefined") {
			this.contentObserver = new ResizeObserver(() => {
				this.measureContent();
			});
			this.contentObserver.observe(this.descriptionEl);
		}

		this.applyPlacement(placement);
		this.applyVisual(this.view, false);
		this.root.dataset.exiting = String(Boolean(item.exiting));
		if (item.exiting || !canExpand) {
			this.setExpanded(false);
		}
		this.refreshAutoPilot();

		this.readyRaf = requestAnimationFrame(() => {
			this.root.dataset.ready = "true";
			this.readyRaf = null;
		});
	}

	update(item: ToastRecord, placement: ToastPlacement, canExpand: boolean) {
		this.currentItem = item;
		this.canExpand = canExpand;
		this.applyPlacement(placement);
		this.root.dataset.exiting = String(Boolean(item.exiting));

		const nextVisual = this.createVisual(item);
		const refreshKey = item.instanceId;

		if (refreshKey !== this.lastRefreshKey) {
			this.lastRefreshKey = refreshKey;

			if (this.swapTimer != null) {
				clearTimeout(this.swapTimer);
				this.swapTimer = null;
			}

			if (this.isOpen()) {
				this.pendingView = { payload: nextVisual };
				this.setExpanded(false);
				this.swapTimer = window.setTimeout(() => {
					this.swapTimer = null;
					this.applyPendingView();
				}, SWAP_COLLAPSE_MS);
			} else {
				this.pendingView = null;
				this.applyVisual(nextVisual, true);
			}
		} else {
			this.applyVisual(nextVisual, true);
		}

		if (item.exiting || !canExpand) {
			this.setExpanded(false);
		}

		this.refreshAutoPilot();
	}

	updateCanExpand(canExpand: boolean) {
		this.canExpand = canExpand;
		if (!canExpand) {
			this.setExpanded(false);
		}
		this.refreshAutoPilot();
	}

	destroy() {
		if (this.readyRaf != null) {
			cancelAnimationFrame(this.readyRaf);
			this.readyRaf = null;
		}

		this.clearInternalTimers();

		this.headerObserver?.disconnect();
		this.headerObserver = null;
		this.contentObserver?.disconnect();
		this.contentObserver = null;

		this.root.removeEventListener("mouseenter", this.handleMouseEnter);
		this.root.removeEventListener("mouseleave", this.handleMouseLeave);
		this.root.removeEventListener("transitionend", this.handleTransitionEnd);
		this.root.removeEventListener("pointerdown", this.handlePointerDown);
		this.root.removeEventListener("pointermove", this.handlePointerMove);
		this.root.removeEventListener("pointerup", this.handlePointerUp);

		this.root.remove();
	}

	private createVisual(item: ToastRecord): ToastVisual {
		const state = item.state ?? "success";
		return {
			title: item.title ?? state,
			description: item.description,
			state,
			icon: item.icon,
			styles: item.styles,
			button: item.button,
			fill: item.fill ?? "#FFFFFF",
			roundness: item.roundness,
		};
	}

	private applyPlacement(placement: ToastPlacement) {
		this.placement = placement;
		this.root.dataset.position = placement.align;
		this.root.dataset.edge = placement.expand;
		this.canvasEl.dataset.edge = placement.expand;
		this.headerEl.dataset.edge = placement.expand;
		this.contentEl.dataset.edge = placement.expand;
		this.applyGeometry();
	}

	private applyVisual(view: ToastVisual, animateHeader: boolean) {
		this.view = view;
		this.root.dataset.state = view.state;
		this.renderHeader(view, animateHeader);
		this.renderContent(view);
		this.applyGeometry();
	}

	private renderHeader(view: ToastVisual, animateHeader: boolean) {
		for (const prev of this.headerStackEl.querySelectorAll('[data-layer="prev"]')) {
			prev.remove();
		}

		const next = document.createElement("div");
		next.setAttribute("data-gooey-header-inner", "");
		next.dataset.layer = "current";

		const badge = document.createElement("div");
		badge.setAttribute("data-gooey-badge", "");
		badge.dataset.state = view.state;
		badge.className = view.styles?.badge ?? "";
		badge.replaceChildren(renderIcon(view.icon, view.state));

		const title = document.createElement("span");
		title.setAttribute("data-gooey-title", "");
		title.dataset.state = view.state;
		title.className = view.styles?.title ?? "";
		title.textContent = view.title;

		next.append(badge, title);

		if (this.currentHeaderEl) {
			const current = this.currentHeaderEl;
			if (animateHeader) {
				current.dataset.layer = "prev";
				current.dataset.exiting = "true";
				if (this.headerExitTimer != null) {
					clearTimeout(this.headerExitTimer);
				}
				this.headerExitTimer = window.setTimeout(() => {
					this.headerExitTimer = null;
					current.remove();
				}, HEADER_EXIT_MS);
			} else {
				current.remove();
			}
		}

		this.currentHeaderEl = next;
		this.headerStackEl.append(next);
		this.observeHeader();
		this.measureHeader();
	}

	private renderContent(view: ToastVisual) {
		this.descriptionEl.className = view.styles?.description ?? "";
		this.descriptionEl.replaceChildren();

		let hasContent = renderRenderable(this.descriptionEl, view.description);

		if (view.button) {
			const action = document.createElement("a");
			action.href = "#";
			action.setAttribute("data-gooey-button", "");
			action.dataset.state = view.state;
			action.className = view.styles?.button ?? "";
			action.textContent = view.button.title;
			action.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				view.button?.onClick();
			});
			this.descriptionEl.append(action);
			hasContent = true;
		}

		this.hasDescriptionContent = hasContent;
		this.contentEl.style.display = hasContent ? "" : "none";
		if (!hasContent) {
			this.contentHeight = 0;
		}
		this.measureContent();
	}

	private observeHeader() {
		if (!this.currentHeaderEl || typeof ResizeObserver === "undefined") return;

		this.headerObserver?.disconnect();
		this.headerObserver = new ResizeObserver(() => {
			this.measureHeader();
		});
		this.headerObserver.observe(this.currentHeaderEl);
	}

	private measureHeader() {
		if (!this.currentHeaderEl) return;

		if (this.headerPaddingPx == null) {
			const style = getComputedStyle(this.headerEl);
			this.headerPaddingPx =
				parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
		}

		const width = this.currentHeaderEl.scrollWidth + this.headerPaddingPx + PILL_PADDING;
		if (width > 0 && this.pillWidth !== width) {
			this.pillWidth = width;
			this.applyGeometry();
		}
	}

	private measureContent() {
		const nextHeight = this.hasDescriptionContent ? this.descriptionEl.scrollHeight : 0;
		if (this.contentHeight !== nextHeight) {
			this.contentHeight = nextHeight;
			this.applyGeometry();
		}
	}

	private isOpen() {
		if (!this.hasDescriptionContent) return false;
		if (this.view.state === "loading") return false;
		return this.isExpanded;
	}

	private setExpanded(next: boolean) {
		if (this.isExpanded === next) return;
		this.isExpanded = next;
		this.applyGeometry();
	}

	private applyPendingView() {
		if (!this.pendingView) return;
		const pending = this.pendingView;
		this.pendingView = null;
		this.applyVisual(pending.payload, true);
	}

	private refreshAutoPilot() {
		if (this.autoExpandTimer != null) {
			clearTimeout(this.autoExpandTimer);
			this.autoExpandTimer = null;
		}

		if (this.autoCollapseTimer != null) {
			clearTimeout(this.autoCollapseTimer);
			this.autoCollapseTimer = null;
		}

		if (!this.hasDescriptionContent) return;

		const allowExpand = this.view.state !== "loading" && this.canExpand;
		if (this.currentItem.exiting || !allowExpand) {
			this.setExpanded(false);
			return;
		}

		if (
			this.currentItem.autoExpandDelayMs == null &&
			this.currentItem.autoCollapseDelayMs == null
		) {
			return;
		}

		const expandDelay = this.currentItem.autoExpandDelayMs ?? 0;
		const collapseDelay = this.currentItem.autoCollapseDelayMs ?? 0;

		if (expandDelay > 0) {
			this.autoExpandTimer = window.setTimeout(() => {
				this.autoExpandTimer = null;
				this.setExpanded(true);
			}, expandDelay);
		} else {
			this.setExpanded(true);
		}

		if (collapseDelay > 0) {
			this.autoCollapseTimer = window.setTimeout(() => {
				this.autoCollapseTimer = null;
				this.setExpanded(false);
			}, collapseDelay);
		}
	}

	private applyGeometry() {
		const open = this.isOpen();
		const roundness = Math.max(0, this.view.roundness ?? DEFAULT_ROUNDNESS);
		const blur = roundness * BLUR_RATIO;

		const minExpanded = HEIGHT * MIN_EXPAND_RATIO;
		const rawExpanded = this.hasDescriptionContent
			? Math.max(minExpanded, HEIGHT + this.contentHeight)
			: minExpanded;

		if (open) {
			this.frozenExpanded = rawExpanded;
		}

		const expanded = open ? rawExpanded : this.frozenExpanded;
		const svgHeight = this.hasDescriptionContent ? Math.max(expanded, minExpanded) : HEIGHT;
		const expandedContent = Math.max(0, expanded - HEIGHT);
		const resolvedPillWidth = Math.max(this.pillWidth || HEIGHT, HEIGHT);
		const pillHeight = HEIGHT + blur * 3;
		const pillX =
			this.placement.align === "right"
				? WIDTH - resolvedPillWidth
				: this.placement.align === "center"
					? (WIDTH - resolvedPillWidth) / 2
					: 0;

		this.root.style.setProperty("--_h", `${open ? expanded : HEIGHT}px`);
		this.root.style.setProperty("--_pw", `${resolvedPillWidth}px`);
		this.root.style.setProperty("--_px", `${pillX}px`);
		this.root.style.setProperty("--_sy", `${open ? 1 : HEIGHT / pillHeight}`);
		this.root.style.setProperty("--_ph", `${pillHeight}px`);
		this.root.style.setProperty("--_by", `${open ? 1 : 0}`);
		this.root.style.setProperty(
			"--_ht",
			`translateY(${open ? (this.placement.expand === "bottom" ? 3 : -3) : 0}px) scale(${open ? 0.9 : 1})`,
		);
		this.root.style.setProperty("--_co", `${open ? 1 : 0}`);

		this.root.dataset.expanded = String(open);
		this.contentEl.dataset.visible = String(open);

		this.svgEl.setAttribute("height", String(svgHeight));
		this.svgEl.setAttribute("viewBox", `0 0 ${WIDTH} ${svgHeight}`);

		this.blurNode.setAttribute("stdDeviation", String(blur));

		this.pillRect.setAttribute("x", String(pillX));
		this.pillRect.setAttribute("rx", String(roundness));
		this.pillRect.setAttribute("ry", String(roundness));
		this.pillRect.setAttribute("width", String(resolvedPillWidth));
		this.pillRect.setAttribute("height", String(pillHeight));
		this.pillRect.setAttribute("fill", this.view.fill);

		this.bodyRect.setAttribute("y", String(HEIGHT));
		this.bodyRect.setAttribute("width", String(WIDTH));
		this.bodyRect.setAttribute("height", String(expandedContent));
		this.bodyRect.setAttribute("rx", String(roundness));
		this.bodyRect.setAttribute("ry", String(roundness));
		this.bodyRect.setAttribute("fill", this.view.fill);
	}

	private clearInternalTimers() {
		if (this.headerExitTimer != null) {
			clearTimeout(this.headerExitTimer);
			this.headerExitTimer = null;
		}

		if (this.autoExpandTimer != null) {
			clearTimeout(this.autoExpandTimer);
			this.autoExpandTimer = null;
		}

		if (this.autoCollapseTimer != null) {
			clearTimeout(this.autoCollapseTimer);
			this.autoCollapseTimer = null;
		}

		if (this.swapTimer != null) {
			clearTimeout(this.swapTimer);
			this.swapTimer = null;
		}
	}

	private handleMouseEnter = () => {
		this.callbacks.onEnter(this.id);
		if (this.hasDescriptionContent) {
			this.setExpanded(true);
		}
	};

	private handleMouseLeave = () => {
		this.callbacks.onLeave(this.id);
		this.setExpanded(false);
	};

	private handleTransitionEnd = (event: TransitionEvent) => {
		if (event.propertyName !== "height" && event.propertyName !== "transform") {
			return;
		}
		if (this.isOpen()) return;
		this.applyPendingView();
	};

	private handlePointerDown = (event: PointerEvent) => {
		if (this.currentItem.exiting) return;

		const target = event.target as HTMLElement | null;
		if (target?.closest("[data-gooey-button]")) return;

		this.pointerStartY = event.clientY;
		this.root.setPointerCapture(event.pointerId);
	};

	private handlePointerMove = (event: PointerEvent) => {
		if (this.pointerStartY == null) return;
		const dy = event.clientY - this.pointerStartY;
		const sign = dy > 0 ? 1 : -1;
		const clamped = Math.min(Math.abs(dy), SWIPE_MAX) * sign;
		this.root.style.transform = `translateY(${clamped}px)`;
	};

	private handlePointerUp = (event: PointerEvent) => {
		if (this.pointerStartY == null) return;

		const dy = event.clientY - this.pointerStartY;
		this.pointerStartY = null;
		this.root.style.transform = "";

		if (Math.abs(dy) > SWIPE_DISMISS) {
			this.callbacks.onDismiss(this.id);
		}
	};
}

class ToasterManager {
	private target: HTMLElement;
	private position: ToastPosition;
	private offset?: ToasterOffsetValue | ToasterOffsetConfig;
	private defaultOptions?: Partial<ToastOptions>;

	private activeId: string | undefined;
	private hovering = false;

	private readonly viewports = new Map<ToastPosition, HTMLElement>();
	private readonly views = new Map<string, ToastView>();
	private readonly timers = new Map<string, number>();

	private readonly listener: ToastListener;
	private mounted = true;

	constructor(options: ToasterOptions = {}) {
		this.target = options.target ?? document.body;
		this.position = options.position ?? store.position;
		this.offset = options.offset;
		this.defaultOptions = options.options;

		store.position = this.position;
		store.options = this.defaultOptions;

		this.listener = (toasts) => {
			this.render(toasts);
		};

		store.listeners.add(this.listener);
		this.render(store.toasts);
	}

	configure(options: ToasterOptions = {}) {
		if (options.target && options.target !== this.target) {
			for (const viewport of this.viewports.values()) {
				options.target.append(viewport);
			}
			this.target = options.target;
		}

		if (options.position) {
			this.position = options.position;
		}

		if (options.offset !== undefined) {
			this.offset = options.offset;
		}

		if (options.options !== undefined) {
			this.defaultOptions = options.options;
		}

		store.position = this.position;
		store.options = this.defaultOptions;

		this.render(store.toasts);
	}

	unmount() {
		if (!this.mounted) return;
		this.mounted = false;

		store.listeners.delete(this.listener);
		this.clearAllTimers();

		for (const view of this.views.values()) {
			view.destroy();
		}
		this.views.clear();

		for (const viewport of this.viewports.values()) {
			viewport.remove();
		}
		this.viewports.clear();
	}

	private render(toasts: ToastRecord[]) {
		if (!this.mounted) return;

		const latest = this.findLatest(toasts);
		if (!this.hovering) {
			this.activeId = latest;
		}

		const toastIds = new Set(toasts.map((toast) => toast.id));
		for (const [id, view] of this.views) {
			if (!toastIds.has(id)) {
				view.destroy();
				this.views.delete(id);
			}
		}

		const byPosition = new Map<ToastPosition, ToastRecord[]>();
		for (const toast of toasts) {
			const pos = toast.position ?? this.position;
			const bucket = byPosition.get(pos);
			if (bucket) {
				bucket.push(toast);
			} else {
				byPosition.set(pos, [toast]);
			}
		}

		for (const pos of TOAST_POSITIONS) {
			const items = byPosition.get(pos) ?? [];
			if (!items.length) {
				this.removeViewport(pos);
				continue;
			}

			const viewport = this.ensureViewport(pos);
			this.applyViewportOffset(viewport, pos);

			const placement: ToastPlacement = {
				align: pillAlign(pos),
				expand: expandDir(pos),
			};

			for (const item of items) {
				const canExpand = this.activeId == null || this.activeId === item.id;
				const existing = this.views.get(item.id);

				if (existing) {
					existing.update(item, placement, canExpand);
					viewport.append(existing.root);
					continue;
				}

				const view = new ToastView(item, placement, canExpand, {
					onEnter: (id) => this.handleEnter(id),
					onLeave: (id) => this.handleLeave(id),
					onDismiss: (id) => dismissToast(id),
				});

				this.views.set(item.id, view);
				viewport.append(view.root);
			}
		}

		const keys = new Set(toasts.map(timeoutKey));
		for (const [key, timer] of this.timers) {
			if (!keys.has(key)) {
				clearTimeout(timer);
				this.timers.delete(key);
			}
		}

		this.schedule(toasts);
	}

	private findLatest(toasts: ToastRecord[]) {
		for (let i = toasts.length - 1; i >= 0; i -= 1) {
			if (!toasts[i].exiting) {
				return toasts[i].id;
			}
		}
		return undefined;
	}

	private ensureViewport(pos: ToastPosition) {
		const existing = this.viewports.get(pos);
		if (existing) return existing;

		const section = document.createElement("section");
		section.setAttribute("data-gooey-viewport", "");
		section.dataset.position = pos;
		section.setAttribute("aria-live", "polite");
		this.target.append(section);

		this.viewports.set(pos, section);
		return section;
	}

	private removeViewport(pos: ToastPosition) {
		const viewport = this.viewports.get(pos);
		if (!viewport) return;
		viewport.remove();
		this.viewports.delete(pos);
	}

	private applyViewportOffset(viewport: HTMLElement, pos: ToastPosition) {
		if (this.offset === undefined) {
			viewport.style.top = "";
			viewport.style.right = "";
			viewport.style.bottom = "";
			viewport.style.left = "";
			return;
		}

		const offset =
			typeof this.offset === "object"
				? this.offset
				: {
					top: this.offset,
					right: this.offset,
					bottom: this.offset,
					left: this.offset,
				  };

		const toPx = (value: ToasterOffsetValue) =>
			typeof value === "number" ? `${value}px` : value;

		viewport.style.top =
			pos.startsWith("top") && offset.top !== undefined ? toPx(offset.top) : "";
		viewport.style.bottom =
			pos.startsWith("bottom") && offset.bottom !== undefined
				? toPx(offset.bottom)
				: "";
		viewport.style.left =
			pos.endsWith("left") && offset.left !== undefined ? toPx(offset.left) : "";
		viewport.style.right =
			pos.endsWith("right") && offset.right !== undefined
				? toPx(offset.right)
				: "";
	}

	private clearAllTimers() {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
	}

	private schedule(toasts: ToastRecord[]) {
		if (this.hovering) return;

		for (const toast of toasts) {
			if (toast.exiting) continue;

			const key = timeoutKey(toast);
			if (this.timers.has(key)) continue;

			const duration = toast.duration ?? DEFAULT_DURATION;
			if (duration == null || duration <= 0) continue;

			const timer = window.setTimeout(() => {
				this.timers.delete(key);
				dismissToast(toast.id);
			}, duration);

			this.timers.set(key, timer);
		}
	}

	private handleEnter(id: string) {
		this.activeId = id;
		if (!this.hovering) {
			this.hovering = true;
			this.clearAllTimers();
		}

		for (const [toastId, view] of this.views) {
			view.updateCanExpand(toastId === id);
		}
	}

	private handleLeave(_: string) {
		this.hovering = false;
		this.activeId = this.findLatest(store.toasts);

		for (const [toastId, view] of this.views) {
			view.updateCanExpand(this.activeId == null || toastId === this.activeId);
		}

		this.schedule(store.toasts);
	}
}

let singletonManager: ToasterManager | null = null;

const ensureManager = () => {
	if (!isBrowser()) return null;
	if (!singletonManager) {
		singletonManager = new ToasterManager();
	}
	return singletonManager;
};

const noopHandle: ToasterHandle = {
	update: () => {},
	unmount: () => {},
};

export const createToaster = (options: ToasterOptions = {}): ToasterHandle => {
	const manager = ensureManager();
	if (!manager) return noopHandle;

	manager.configure(options);

	return {
		update: (next) => manager.configure(next),
		unmount: () => {
			if (singletonManager === manager) {
				singletonManager = null;
			}
			manager.unmount();
		},
	};
};

export const mountToaster = createToaster;

export const configureToaster = (options: ToasterOptions = {}) => {
	const manager = ensureManager();
	if (!manager) return;
	manager.configure(options);
};

export const unmountToaster = () => {
	if (!singletonManager) return;
	singletonManager.unmount();
	singletonManager = null;
};

const ensureToastTarget = () => {
	ensureManager();
};

export const toast = {
	show: (opts: ToastOptions) => {
		if (!isBrowser()) return generateId();
		ensureToastTarget();
		return createToast(opts).id;
	},

	success: (opts: ToastOptions) => {
		if (!isBrowser()) return generateId();
		ensureToastTarget();
		return createToast({ ...opts, state: "success" }).id;
	},

	error: (opts: ToastOptions) => {
		if (!isBrowser()) return generateId();
		ensureToastTarget();
		return createToast({ ...opts, state: "error" }).id;
	},

	warning: (opts: ToastOptions) => {
		if (!isBrowser()) return generateId();
		ensureToastTarget();
		return createToast({ ...opts, state: "warning" }).id;
	},

	info: (opts: ToastOptions) => {
		if (!isBrowser()) return generateId();
		ensureToastTarget();
		return createToast({ ...opts, state: "info" }).id;
	},

	action: (opts: ToastOptions) => {
		if (!isBrowser()) return generateId();
		ensureToastTarget();
		return createToast({ ...opts, state: "action" }).id;
	},

	promise: <T,>(
		promise: Promise<T> | (() => Promise<T>),
		opts: ToastPromiseOptions<T>,
	): Promise<T> => {
		if (!isBrowser()) {
			return typeof promise === "function" ? promise() : promise;
		}

		ensureToastTarget();

		const { id } = createToast({
			...opts.loading,
			state: "loading",
			duration: null,
			position: opts.position,
		});

		const next = typeof promise === "function" ? promise() : promise;

		next
			.then((data) => {
				if (opts.action) {
					const actionOpts =
						typeof opts.action === "function" ? opts.action(data) : opts.action;
					updateToast(id, { ...actionOpts, state: "action", id });
					return;
				}

				const successOpts =
					typeof opts.success === "function" ? opts.success(data) : opts.success;
				updateToast(id, { ...successOpts, state: "success", id });
			})
			.catch((error) => {
				const errorOpts =
					typeof opts.error === "function" ? opts.error(error) : opts.error;
				updateToast(id, { ...errorOpts, state: "error", id });
			});

		return next;
	},

	dismiss: (id: string) => {
		if (!isBrowser()) return;
		dismissToast(id);
	},

	clear: (position?: ToastPosition) => {
		if (!isBrowser()) return;
		store.update((all) =>
			position ? all.filter((toast) => toast.position !== position) : [],
		);
	},
};

export const gooeyToast = toast;
