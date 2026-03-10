import { createStateIcon } from "./icons";
import {
	clamp,
	normalizeDuration,
	resolveAutopilot,
	resolvePlacement,
	type ToastPlacement,
} from "./internal";
import {
	TOAST_POSITIONS,
	type ToastButton,
	type ToastOptions,
	type ToastPosition,
	type ToastPromiseOptions,
	type ToastRenderable,
	type ToastRenderableValue,
	type ToastState,
	type ToasterHandle,
	type ToasterOffsetConfig,
	type ToasterOffsetValue,
	type ToasterOptions,
} from "./types";

const EXIT_DURATION = 260;
const SWIPE_DISMISS_DISTANCE = 30;
const SWIPE_MAX_TRANSLATE = 20;
const HOVER_RESUME_DELAY = 50;
const TOAST_FALLBACK_WIDTH = 350;
const TOAST_HEIGHT = 44;
const DEFAULT_ROUNDNESS = 18;
const BLUR_RATIO = 0.5;
const GOOEY_JOIN = 10;

interface InternalToastOptions extends ToastOptions {
	state?: ToastState;
}

interface ToastRecord extends InternalToastOptions {
	id: string;
	instanceId: string;
	exiting: boolean;
	autoExpandDelayMs?: number;
	autoCollapseDelayMs?: number;
}

interface ExitTimerRecord {
	remove?: number;
}

interface ToastViewCallbacks {
	onEnter: (id: string) => void;
	onLeave: (id: string) => void;
	onDismiss: (id: string) => void;
}

interface DismissState {
	timer: number | null;
	duration: number;
	remaining: number;
	startedAt: number | null;
}

type ToastListener = (toasts: ToastRecord[]) => void;

const store = {
	toasts: [] as ToastRecord[],
	listeners: new Set<ToastListener>(),
	position: "top-right" as ToastPosition,
	options: undefined as Partial<ToastOptions> | undefined,

	emit() {
		for (const listener of this.listeners) {
			listener(this.toasts);
		}
	},

	update(updater: (prev: ToastRecord[]) => ToastRecord[]) {
		this.toasts = updater(this.toasts);
		this.emit();
	},
};

const isBrowser = () =>
	typeof window !== "undefined" && typeof document !== "undefined";

let idCounter = 0;

const generateId = () =>
	`${++idCounter}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const isTimedDuration = (value: number | null | undefined): value is number =>
	value != null && value > 0;

const getNow = () =>
	typeof performance !== "undefined" && typeof performance.now === "function"
		? performance.now()
		: Date.now();

const timeoutKey = (item: ToastRecord) => `${item.id}:${item.instanceId}`;

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
	const duration = normalizeDuration(merged.duration);

	return {
		...merged,
		id,
		instanceId: generateId(),
		exiting: false,
		duration,
		position: merged.position ?? fallbackPosition ?? store.position,
		...resolveAutopilot(merged, duration),
	};
};

const createToast = (options: InternalToastOptions) => {
	const merged = mergeOptions(options);
	const id = merged.id ?? generateId();
	const existing = store.toasts.find((item) => item.id === id && !item.exiting);
	const next = buildToastRecord(merged, id, existing?.position);

	if (existing) {
		store.update((all) => all.map((item) => (item.id === id ? next : item)));
	} else {
		store.update((all) => [...all.filter((item) => item.id !== id), next]);
	}

	return { id };
};

const updateToast = (id: string, options: InternalToastOptions) => {
	const existing = store.toasts.find((item) => item.id === id);
	if (!existing) return;

	const merged = mergeOptions({ ...options, id });
	const next = buildToastRecord(merged, id, existing.position);

	store.update((all) => all.map((item) => (item.id === id ? next : item)));
};

const exitTimers = new Map<string, ExitTimerRecord>();

const dismissToast = (id: string) => {
	const existing = store.toasts.find((item) => item.id === id);
	if (!existing || existing.exiting) return;

	const key = timeoutKey(existing);

	store.update((all) =>
		all.map((item) => (item.id === id ? { ...item, exiting: true } : item)),
	);

	const prevTimers = exitTimers.get(key);
	if (prevTimers?.remove != null) {
		clearTimeout(prevTimers.remove);
	}

	const timers: ExitTimerRecord = {};
	timers.remove = window.setTimeout(() => {
		exitTimers.delete(key);
		store.update((all) =>
			all.filter(
				(item) => !(item.id === existing.id && item.instanceId === existing.instanceId),
			),
		);
	}, EXIT_DURATION);

	exitTimers.set(key, timers);
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

	if (resolved == null) {
		return createStateIcon(state);
	}

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
	private currentItem: ToastRecord;
	private placement: ToastPlacement;

	private readonly canvasEl: HTMLDivElement;
	private readonly svgEl: SVGSVGElement;
	private readonly blurNode: SVGFEGaussianBlurElement;
	private readonly pillRect: SVGRectElement;
	private readonly bodyRect: SVGRectElement;

	private readonly headerEl: HTMLDivElement;
	private readonly badgeEl: HTMLDivElement;
	private readonly titleEl: HTMLSpanElement;
	private readonly titleMeasureEl: HTMLSpanElement;
	private readonly timeoutTrackEl: HTMLSpanElement;
	private readonly timeoutFillEl: HTMLSpanElement;
	private readonly contentEl: HTMLDivElement;
	private readonly descriptionEl: HTMLDivElement;
	private sizeObserver: ResizeObserver | null = null;

	private readyRaf: number | null = null;
	private autoExpandTimer: number | null = null;
	private autoCollapseTimer: number | null = null;

	private pointerStartY: number | null = null;
	private hasContent = false;
	private expanded = false;
	private containerWidth = TOAST_FALLBACK_WIDTH;
	private headerWidth = TOAST_HEIGHT;
	private contentHeight = 0;

	constructor(
		item: ToastRecord,
		placement: ToastPlacement,
		callbacks: ToastViewCallbacks,
	) {
		this.id = item.id;
		this.currentItem = item;
		this.placement = placement;
		this.callbacks = callbacks;

		this.root = document.createElement("button");
		this.root.type = "button";
		this.root.setAttribute("data-gooey-toast", "");
		this.root.dataset.ready = "false";
		this.root.dataset.expanded = "false";
		this.root.dataset.exiting = String(Boolean(item.exiting));

		this.canvasEl = document.createElement("div");
		this.canvasEl.setAttribute("data-gooey-canvas", "");

		this.svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		this.svgEl.setAttribute("data-gooey-svg", "");
		this.svgEl.setAttribute("width", String(TOAST_FALLBACK_WIDTH));
		this.svgEl.setAttribute("height", String(TOAST_HEIGHT));
		this.svgEl.setAttribute(
			"viewBox",
			`0 0 ${TOAST_FALLBACK_WIDTH} ${TOAST_HEIGHT}`,
		);

		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
		const filterId = `gooey-toast-${item.id}-${item.instanceId}`;
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

		this.badgeEl = document.createElement("div");
		this.badgeEl.setAttribute("data-gooey-badge", "");

		this.titleEl = document.createElement("span");
		this.titleEl.setAttribute("data-gooey-title", "");

		this.titleMeasureEl = document.createElement("span");
		this.titleMeasureEl.setAttribute("data-gooey-title", "");
		this.titleMeasureEl.setAttribute("data-gooey-title-measure", "");

		this.timeoutTrackEl = document.createElement("span");
		this.timeoutTrackEl.setAttribute("data-gooey-time-track", "");
		this.timeoutTrackEl.hidden = true;

		this.timeoutFillEl = document.createElement("span");
		this.timeoutFillEl.setAttribute("data-gooey-time-fill", "");

		this.timeoutTrackEl.append(this.timeoutFillEl);
		this.headerEl.append(this.badgeEl, this.titleEl, this.timeoutTrackEl);

		this.contentEl = document.createElement("div");
		this.contentEl.setAttribute("data-gooey-content", "");
		this.contentEl.dataset.visible = "false";

		this.descriptionEl = document.createElement("div");
		this.descriptionEl.setAttribute("data-gooey-description", "");

		this.contentEl.append(this.descriptionEl);
		this.root.append(this.canvasEl, this.headerEl, this.contentEl, this.titleMeasureEl);

		this.root.addEventListener("mouseenter", this.handleMouseEnter);
		this.root.addEventListener("mouseleave", this.handleMouseLeave);
		this.root.addEventListener("pointerdown", this.handlePointerDown);
		this.root.addEventListener("pointermove", this.handlePointerMove, {
			passive: true,
		});
		this.root.addEventListener("pointerup", this.handlePointerUp, { passive: true });
		this.root.addEventListener("pointercancel", this.handlePointerCancel, {
			passive: true,
		});

		if (typeof ResizeObserver !== "undefined") {
			this.sizeObserver = new ResizeObserver(() => {
				this.syncMetrics();
			});
			this.sizeObserver.observe(this.root);
			this.sizeObserver.observe(this.headerEl);
			this.sizeObserver.observe(this.descriptionEl);
		}

		this.update(item, placement);

		this.readyRaf = requestAnimationFrame(() => {
			this.root.dataset.ready = "true";
			this.readyRaf = null;
			this.syncMetrics();
		});
	}

	update(item: ToastRecord, placement: ToastPlacement) {
		this.currentItem = item;
		this.applyPlacement(placement);
		this.root.dataset.exiting = String(Boolean(item.exiting));

		this.render(item);

		if (!item.exiting && !this.canExpand()) {
			this.setExpanded(false);
		}

		if (item.exiting) {
			this.clearAutoPilotTimers();
		} else {
			this.refreshAutopilot();
		}
	}

	destroy() {
		if (this.readyRaf != null) {
			cancelAnimationFrame(this.readyRaf);
			this.readyRaf = null;
		}

		this.sizeObserver?.disconnect();
		this.sizeObserver = null;

		this.clearAutoPilotTimers();
		this.pointerStartY = null;
		this.root.style.removeProperty("--gooey-drag-y");

		this.root.removeEventListener("mouseenter", this.handleMouseEnter);
		this.root.removeEventListener("mouseleave", this.handleMouseLeave);
		this.root.removeEventListener("pointerdown", this.handlePointerDown);
		this.root.removeEventListener("pointermove", this.handlePointerMove);
		this.root.removeEventListener("pointerup", this.handlePointerUp);
		this.root.removeEventListener("pointercancel", this.handlePointerCancel);

		this.root.remove();
	}

	private applyPlacement(placement: ToastPlacement) {
		this.placement = placement;
		this.root.dataset.position = placement.align;
		this.root.dataset.edge = placement.edge;
		this.applyGeometry();
	}

	private render(item: ToastRecord) {
		const state = item.state ?? "success";
		const title = item.title ?? state;
		const showTimeoutIndicator =
			Boolean(item.timeoutIndicator) && isTimedDuration(item.duration) && !item.exiting;

		this.root.dataset.state = state;

		if (item.fill) {
			this.root.style.setProperty("--gooey-fill", item.fill);
		} else {
			this.root.style.removeProperty("--gooey-fill");
		}

		if (item.roundness != null) {
			this.root.style.setProperty(
				"--gooey-radius",
				`${Math.max(0, item.roundness)}px`,
			);
		} else {
			this.root.style.removeProperty("--gooey-radius");
		}

		this.badgeEl.dataset.state = state;
		this.badgeEl.className = item.styles?.badge ?? "";
		this.badgeEl.replaceChildren(renderIcon(item.icon, state));

		this.titleEl.dataset.state = state;
		this.titleEl.className = item.styles?.title ?? "";
		this.titleEl.textContent = title;

		this.titleMeasureEl.dataset.state = state;
		this.titleMeasureEl.className = item.styles?.title ?? "";
		this.titleMeasureEl.textContent = title;

		this.timeoutTrackEl.dataset.state = state;
		this.timeoutFillEl.dataset.state = state;
		this.setTimeoutIndicator(showTimeoutIndicator, 1, false);

		this.descriptionEl.className = item.styles?.description ?? "";
		this.descriptionEl.replaceChildren();

		let hasContent = renderRenderable(this.descriptionEl, item.description);

		if (item.button) {
			this.descriptionEl.append(this.buildActionButton(item.button, state, item.styles?.button));
			hasContent = true;
		}

		this.hasContent = hasContent;
		this.contentEl.style.display = hasContent ? "" : "none";

		if (!hasContent) {
			this.expanded = false;
			this.root.dataset.expanded = "false";
			this.contentEl.dataset.visible = "false";
		}

		this.syncMetrics();
	}

	private buildActionButton(
		button: ToastButton,
		state: ToastState,
		className?: string,
	) {
		const action = document.createElement("button");
		action.type = "button";
		action.setAttribute("data-gooey-button", "");
		action.dataset.state = state;
		action.className = className ?? "";
		action.textContent = button.title;
		action.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			button.onClick();
		});
		return action;
	}

	setTimeoutIndicator(visible: boolean, progress: number, paused: boolean) {
		this.root.dataset.timeoutIndicator = String(visible);
		this.root.dataset.timeoutPaused = String(paused);
		this.timeoutTrackEl.hidden = !visible;
		this.timeoutFillEl.style.transform = `scaleX(${clamp(progress, 0, 1)})`;
  }

	private hasExpandableContent() {
		return this.hasContent && (this.currentItem.state ?? "success") !== "loading";
	}

	private canExpand() {
		if (!this.hasExpandableContent()) return false;
		if (this.currentItem.exiting) return false;
		return true;
	}

	private setExpanded(next: boolean) {
		const resolved = next && this.hasContent;
		if (this.expanded === resolved) return;

		this.expanded = resolved;
		this.root.dataset.expanded = String(resolved);
		this.contentEl.dataset.visible = String(resolved);
		this.applyGeometry();
	}

	private syncMetrics() {
		const width = this.root.getBoundingClientRect().width;
		if (width > 0) {
			this.containerWidth = Math.max(1, Math.round(width));
		}

		const nextHeaderWidth = this.measureHeaderWidth();
		if (nextHeaderWidth > 0) {
			this.headerWidth = clamp(nextHeaderWidth, TOAST_HEIGHT, this.containerWidth);
		}

		this.contentHeight = this.hasContent
			? Math.max(0, Math.ceil(this.descriptionEl.scrollHeight))
			: 0;

		this.applyGeometry();
	}

	private measureHeaderWidth() {
		const styles = window.getComputedStyle(this.headerEl);
		const gapRaw =
			styles.columnGap && styles.columnGap !== "normal" ? styles.columnGap : styles.gap;
		const gap = Number.parseFloat(gapRaw || "0") || 0;
		const paddingLeft = Number.parseFloat(styles.paddingLeft || "0") || 0;
		const paddingRight = Number.parseFloat(styles.paddingRight || "0") || 0;

		const badgeWidth = this.badgeEl.getBoundingClientRect().width;
		const titleWidth = Math.max(
			this.titleMeasureEl.getBoundingClientRect().width,
			this.titleEl.scrollWidth,
		);
		const safety = 2;

		return Math.ceil(badgeWidth + titleWidth + gap + paddingLeft + paddingRight + safety);
	}

	private alignedX(width: number) {
		if (this.placement.align === "right") {
			return this.containerWidth - width;
		}

		if (this.placement.align === "center") {
			return (this.containerWidth - width) / 2;
		}

		return 0;
	}

	private applyGeometry() {
		const canOpen = this.expanded && this.hasExpandableContent();
		const visibleContentHeight = canOpen ? this.contentHeight : 0;
		const visualHeight = TOAST_HEIGHT + visibleContentHeight;
		const totalHeight = visualHeight;
		const headerWidth = clamp(this.headerWidth, TOAST_HEIGHT, this.containerWidth);
		const bodyWidth = this.hasContent ? this.containerWidth : headerWidth;

		const headerX = this.alignedX(headerWidth);
		const bodyX = this.alignedX(bodyWidth);

		const isTopEdge = this.placement.edge === "top";
		const bodyHeight = canOpen ? visibleContentHeight + GOOEY_JOIN : 0;
		const pillY = isTopEdge ? 0 : visualHeight - TOAST_HEIGHT;
		const bodyY = isTopEdge ? TOAST_HEIGHT - GOOEY_JOIN : 0;

		const roundness = Math.max(0, this.currentItem.roundness ?? DEFAULT_ROUNDNESS);
		const blur = roundness * BLUR_RATIO;
		const fill = this.currentItem.fill ?? "#FFFFFF";

		this.root.style.setProperty("--_h", `${totalHeight}px`);
		this.root.style.setProperty("--_hx", `${headerX}px`);
		this.root.style.setProperty("--_hw", `${headerWidth}px`);
		this.root.style.setProperty("--_bx", `${bodyX}px`);
		this.root.style.setProperty("--_bw", `${bodyWidth}px`);

		this.contentEl.dataset.visible = String(canOpen);

		this.svgEl.setAttribute("width", String(this.containerWidth));
		this.svgEl.setAttribute("height", String(visualHeight));
		this.svgEl.setAttribute("viewBox", `0 0 ${this.containerWidth} ${visualHeight}`);
		this.blurNode.setAttribute("stdDeviation", String(blur));

		this.pillRect.setAttribute("x", String(headerX));
		this.pillRect.setAttribute("y", String(pillY));
		this.pillRect.setAttribute("width", String(headerWidth));
		this.pillRect.setAttribute("height", String(TOAST_HEIGHT));
		this.pillRect.setAttribute("rx", String(roundness));
		this.pillRect.setAttribute("ry", String(roundness));
		this.pillRect.setAttribute("fill", fill);

		this.bodyRect.setAttribute("x", String(bodyX));
		this.bodyRect.setAttribute("y", String(bodyY));
		this.bodyRect.setAttribute("width", String(bodyWidth));
		this.bodyRect.setAttribute("height", String(bodyHeight));
		this.bodyRect.setAttribute("rx", String(roundness));
		this.bodyRect.setAttribute("ry", String(roundness));
		this.bodyRect.setAttribute("fill", fill);
	}

	private refreshAutopilot() {
		this.clearAutoPilotTimers();

		if (!this.canExpand()) {
			return;
		}

		const expandDelay = this.currentItem.autoExpandDelayMs;
		const collapseDelay = this.currentItem.autoCollapseDelayMs;

		if (expandDelay == null && collapseDelay == null) {
			return;
		}

		if ((expandDelay ?? 0) <= 0) {
			this.setExpanded(true);
		} else {
			this.autoExpandTimer = window.setTimeout(() => {
				this.autoExpandTimer = null;
				this.setExpanded(true);
			}, expandDelay);
		}

		if (collapseDelay != null) {
			this.autoCollapseTimer = window.setTimeout(() => {
				this.autoCollapseTimer = null;
				this.setExpanded(false);
			}, collapseDelay);
		}
	}

	private clearAutoPilotTimers() {
		if (this.autoExpandTimer != null) {
			clearTimeout(this.autoExpandTimer);
			this.autoExpandTimer = null;
		}

		if (this.autoCollapseTimer != null) {
			clearTimeout(this.autoCollapseTimer);
			this.autoCollapseTimer = null;
		}
	}

	private handleMouseEnter = () => {
		this.callbacks.onEnter(this.id);
		this.clearAutoPilotTimers();

		if (this.canExpand()) {
			this.setExpanded(true);
		}
	};

	private handleMouseLeave = () => {
		this.callbacks.onLeave(this.id);
		this.setExpanded(false);
	};

	private handlePointerDown = (event: PointerEvent) => {
		if (this.currentItem.exiting) return;
		if (event.pointerType === "mouse" && event.button !== 0) return;

		const target = event.target as HTMLElement | null;
		if (target?.closest("[data-gooey-button]")) return;

		this.pointerStartY = event.clientY;
		this.root.setPointerCapture(event.pointerId);
	};

	private handlePointerMove = (event: PointerEvent) => {
		if (this.pointerStartY == null) return;

		const delta = event.clientY - this.pointerStartY;
		const sign = delta < 0 ? -1 : 1;
		const clamped = Math.min(Math.abs(delta), SWIPE_MAX_TRANSLATE) * sign;
		this.root.style.setProperty("--gooey-drag-y", `${clamped}px`);
	};

	private handlePointerUp = (event: PointerEvent) => {
		if (this.pointerStartY == null) return;

		const delta = event.clientY - this.pointerStartY;
		this.resetPointerState(event.pointerId);

		if (Math.abs(delta) >= SWIPE_DISMISS_DISTANCE) {
			this.callbacks.onDismiss(this.id);
		}
	};

	private handlePointerCancel = (event: PointerEvent) => {
		if (this.pointerStartY == null) return;
		this.resetPointerState(event.pointerId);
	};

	private resetPointerState(pointerId: number) {
		this.pointerStartY = null;
		this.root.style.removeProperty("--gooey-drag-y");

		if (this.root.hasPointerCapture(pointerId)) {
			this.root.releasePointerCapture(pointerId);
		}
	}
}

class ToasterManager {
	private target: HTMLElement;
	private position: ToastPosition;
	private offset?: ToasterOffsetValue | ToasterOffsetConfig;
	private defaultOptions?: Partial<ToastOptions>;

	private hovering = false;
	private hoverResumeTimer: number | null = null;

	private readonly viewports = new Map<ToastPosition, HTMLElement>();
	private readonly views = new Map<string, ToastView>();
	private readonly dismissStates = new Map<string, DismissState>();
	private indicatorRaf: number | null = null;

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
		this.clearDismissStates();
		this.stopIndicatorUpdates();

		if (this.hoverResumeTimer != null) {
			clearTimeout(this.hoverResumeTimer);
			this.hoverResumeTimer = null;
		}

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

		const toastIds = new Set(toasts.map((item) => item.id));
		for (const [id, view] of this.views) {
			if (!toastIds.has(id)) {
				view.destroy();
				this.views.delete(id);
			}
		}

		const byPosition = new Map<ToastPosition, ToastRecord[]>();

		for (const toast of toasts) {
			const position = toast.position ?? this.position;
			const bucket = byPosition.get(position);
			if (bucket) {
				bucket.push(toast);
			} else {
				byPosition.set(position, [toast]);
			}
		}

		for (const position of TOAST_POSITIONS) {
			const items = byPosition.get(position) ?? [];
			if (!items.length) {
				this.removeViewport(position);
				continue;
			}

			const viewport = this.ensureViewport(position);
			this.applyViewportOffset(viewport, position);

			const placement = resolvePlacement(position);

			for (const item of items) {
				const existing = this.views.get(item.id);

				if (existing) {
					existing.update(item, placement);
					viewport.append(existing.root);
					continue;
				}

				const view = new ToastView(item, placement, {
					onEnter: () => this.handleEnter(),
					onLeave: () => this.handleLeave(),
					onDismiss: (id) => dismissToast(id),
				});

				this.views.set(item.id, view);
				viewport.append(view.root);
			}
		}

		const dismissKeys = new Set<string>();

		for (const toast of toasts) {
			const duration = normalizeDuration(toast.duration);
			if (!toast.exiting && isTimedDuration(duration)) {
				const key = timeoutKey(toast);
				dismissKeys.add(key);
				this.ensureDismissState(toast, key, duration);
			}
		}

		for (const key of Array.from(this.dismissStates.keys())) {
			if (!dismissKeys.has(key)) {
				this.deleteDismissState(key);
			}
		}

		if (this.hovering && !this.isAnyToastHovered()) {
			this.hovering = false;
		}

		this.scheduleDismiss(toasts);
		this.syncTimeoutIndicators(toasts);
	}

	private ensureViewport(position: ToastPosition) {
		const existing = this.viewports.get(position);
		if (existing) {
			existing.dataset.position = position;
			return existing;
		}

		const section = document.createElement("section");
		section.setAttribute("data-gooey-viewport", "");
		section.dataset.position = position;
		section.setAttribute("aria-live", "polite");
		this.target.append(section);

		this.viewports.set(position, section);
		return section;
	}

	private removeViewport(position: ToastPosition) {
		const viewport = this.viewports.get(position);
		if (!viewport) return;

		viewport.remove();
		this.viewports.delete(position);
	}

	private applyViewportOffset(viewport: HTMLElement, position: ToastPosition) {
		if (this.offset === undefined) {
			viewport.style.top = "";
			viewport.style.right = "";
			viewport.style.bottom = "";
			viewport.style.left = "";
			return;
		}

		const value =
			typeof this.offset === "object"
				? this.offset
				: {
					top: this.offset,
					right: this.offset,
					bottom: this.offset,
					left: this.offset,
				  };

		const toCss = (entry: ToasterOffsetValue) =>
			typeof entry === "number" ? `${entry}px` : entry;

		viewport.style.top =
			position.startsWith("top") && value.top !== undefined ? toCss(value.top) : "";
		viewport.style.bottom =
			position.startsWith("bottom") && value.bottom !== undefined
				? toCss(value.bottom)
				: "";
		viewport.style.left =
			position.endsWith("left") && value.left !== undefined ? toCss(value.left) : "";
		viewport.style.right =
			position.endsWith("right") && value.right !== undefined
				? toCss(value.right)
				: "";
	}

	private ensureDismissState(
		toast: ToastRecord,
		key = timeoutKey(toast),
		duration = normalizeDuration(toast.duration),
	) {
		if (toast.exiting || !isTimedDuration(duration)) {
			return null;
		}

		const existing = this.dismissStates.get(key);
		if (existing) {
			return existing;
		}

		const state: DismissState = {
			timer: null,
			duration,
			remaining: duration,
			startedAt: null,
		};

		this.dismissStates.set(key, state);
		return state;
	}

	private deleteDismissState(key: string) {
		const state = this.dismissStates.get(key);
		if (!state) return;

		if (state.timer != null) {
			clearTimeout(state.timer);
		}

		this.dismissStates.delete(key);
	}

	private clearDismissStates() {
		for (const key of Array.from(this.dismissStates.keys())) {
			this.deleteDismissState(key);
		}
	}

	private getRemainingMs(state: DismissState, timestamp = getNow()) {
		if (state.startedAt == null) {
			return clamp(state.remaining, 0, state.duration);
		}

		return clamp(state.remaining - (timestamp - state.startedAt), 0, state.duration);
	}

	private stopIndicatorUpdates() {
		if (this.indicatorRaf != null) {
			cancelAnimationFrame(this.indicatorRaf);
			this.indicatorRaf = null;
		}
	}

	private syncTimeoutIndicators(toasts: ToastRecord[]) {
		this.stopIndicatorUpdates();

		const currentTime = getNow();
		let needsRaf = false;

		for (const toast of toasts) {
			const view = this.views.get(toast.id);
			if (!view) continue;

			const duration = normalizeDuration(toast.duration);
			const visible = Boolean(toast.timeoutIndicator) && !toast.exiting && isTimedDuration(duration);

			if (!visible) {
				view.setTimeoutIndicator(false, 1, false);
				continue;
			}

			const state = this.dismissStates.get(timeoutKey(toast));
			const remaining = state ? this.getRemainingMs(state, currentTime) : duration;
			const progress = remaining / duration;
			const paused = this.hovering || state?.timer == null;

			view.setTimeoutIndicator(true, progress, paused);

			if (!paused && progress > 0) {
				needsRaf = true;
			}
		}

		if (needsRaf) {
			this.indicatorRaf = requestAnimationFrame(() => {
				this.indicatorRaf = null;
				this.syncTimeoutIndicators(store.toasts);
			});
		}
	}

	private scheduleDismiss(toasts: ToastRecord[]) {
		if (this.hovering) return;

		for (const toast of toasts) {
			if (toast.exiting) continue;

			const duration = normalizeDuration(toast.duration);
			if (!isTimedDuration(duration)) continue;

			const key = timeoutKey(toast);
			const state = this.ensureDismissState(toast, key, duration);
			if (!state || state.timer != null) continue;

			state.remaining = clamp(state.remaining, 0, state.duration);
			state.startedAt = getNow();

			state.timer = window.setTimeout(() => {
				this.deleteDismissState(key);
				dismissToast(toast.id);
				this.syncTimeoutIndicators(store.toasts);
			}, state.remaining);
		}
	}

	private pauseDismissTimers() {
		const currentTime = getNow();

		for (const state of this.dismissStates.values()) {
			if (state.timer == null) continue;

			clearTimeout(state.timer);
			state.remaining = this.getRemainingMs(state, currentTime);
			state.startedAt = null;
			state.timer = null;
		}
	}

	private handleEnter() {
		if (this.hoverResumeTimer != null) {
			clearTimeout(this.hoverResumeTimer);
			this.hoverResumeTimer = null;
		}

		if (!this.hovering) {
			this.hovering = true;
			this.pauseDismissTimers();
			this.syncTimeoutIndicators(store.toasts);
		}
	}

	private handleLeave() {
		if (this.hoverResumeTimer != null) {
			clearTimeout(this.hoverResumeTimer);
		}

		this.hoverResumeTimer = window.setTimeout(() => {
			this.hoverResumeTimer = null;

			if (this.isAnyToastHovered()) {
				return;
			}

			this.hovering = false;
			this.scheduleDismiss(store.toasts);
			this.syncTimeoutIndicators(store.toasts);
		}, HOVER_RESUME_DELAY);
	}

	private isAnyToastHovered() {
		for (const view of this.views.values()) {
			if (view.root.matches(":hover")) {
				return true;
			}
		}

		return false;
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
	if (!manager) {
		return noopHandle;
	}

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

const showToast = (opts: ToastOptions, state?: ToastState) => {
	if (!isBrowser()) {
		return generateId();
	}

	ensureToastTarget();
	return createToast(state ? { ...opts, state } : opts).id;
};

const resolvePromiseOptions = <T,>(
	value: ToastOptions | ((payload: T) => ToastOptions),
	payload: T,
) => (typeof value === "function" ? value(payload) : value);

export const toast = {
	show: (opts: ToastOptions) => showToast(opts),

	success: (opts: ToastOptions) => showToast(opts, "success"),

	error: (opts: ToastOptions) => showToast(opts, "error"),

	warning: (opts: ToastOptions) => showToast(opts, "warning"),

	info: (opts: ToastOptions) => showToast(opts, "info"),

	action: (opts: ToastOptions) => showToast(opts, "action"),

	promise: <T,>(
		promise: Promise<T> | (() => Promise<T>),
		opts: ToastPromiseOptions<T>,
	): Promise<T> => {
		if (!isBrowser()) {
			return typeof promise === "function" ? promise() : promise;
		}

		ensureToastTarget();

		const id = createToast({
			...opts.loading,
			state: "loading",
			duration: null,
			position: opts.position,
		}).id;

		const pending = typeof promise === "function" ? promise() : promise;

		pending
			.then((data) => {
				if (opts.action) {
					const action = resolvePromiseOptions(opts.action, data);
					updateToast(id, {
						...action,
						state: "action",
						id,
					});
					return;
				}

				const success = resolvePromiseOptions(opts.success, data);
				updateToast(id, {
					...success,
					state: "success",
					id,
				});
			})
			.catch((error) => {
				const failure = resolvePromiseOptions(opts.error, error);
				updateToast(id, {
					...failure,
					state: "error",
					id,
				});
			});

		return pending;
	},

	dismiss: (id: string) => {
		if (!isBrowser()) return;
		dismissToast(id);
	},

	clear: (position?: ToastPosition) => {
		if (!isBrowser()) return;

		if (position) {
			store.update((all) => all.filter((item) => item.position !== position));
			return;
		}

		store.update(() => []);
	},
};

export const gooeyToast = toast;
