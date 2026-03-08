import {
	configureToaster,
	mountToaster,
	toast,
	type ToastOptions,
	type ToastPosition,
} from "../src";

type ToastStateButton = "success" | "error" | "warning" | "info" | "action";

type SnapshotToast = {
	id: number;
	state: string;
	position: string;
	edge: string;
	expanded: string;
	exiting: string;
	ready: string;
	title: string;
	description: string;
	heightVar: string;
	pillWidthVar: string;
};

type SnapshotPayload = {
	timestamp: string;
	viewportCount: number;
	toastCount: number;
	viewports: Array<{
		position: string;
		children: number;
	}>;
	toasts: SnapshotToast[];
};

type DebugApi = {
	refresh: () => SnapshotPayload;
	snapshot: () => SnapshotPayload;
	logs: () => string[];
	clearLogs: () => void;
	burst: (count?: number) => string[];
	dismissLast: () => void;
	clear: () => void;
};

declare global {
	interface Window {
		__gooeyToastDebug?: DebugApi;
	}
}

const getById = <T extends HTMLElement>(id: string): T => {
	const el = document.getElementById(id);
	if (!el) {
		throw new Error(`Missing required element: #${id}`);
	}
	return el as T;
};

const runtimeInfoEl = getById<HTMLParagraphElement>("runtimeInfo");
const positionSelect = getById<HTMLSelectElement>("positionSelect");
const durationInput = getById<HTMLInputElement>("durationInput");
const roundnessInput = getById<HTMLInputElement>("roundnessInput");
const fillInput = getById<HTMLInputElement>("fillInput");
const descriptionToggle = getById<HTMLInputElement>("descriptionToggle");
const buttonToggle = getById<HTMLInputElement>("buttonToggle");
const autopilotToggle = getById<HTMLInputElement>("autopilotToggle");
const autopilotExpandInput = getById<HTMLInputElement>("autopilotExpandInput");
const autopilotCollapseInput = getById<HTMLInputElement>("autopilotCollapseInput");
const refreshSnapshotBtn = getById<HTMLButtonElement>("refreshSnapshotBtn");
const clearLogBtn = getById<HTMLButtonElement>("clearLogBtn");
const snapshotOutput = getById<HTMLPreElement>("snapshotOutput");
const logOutput = getById<HTMLOListElement>("logOutput");

const stateButtons = Array.from(
	document.querySelectorAll<HTMLButtonElement>("[data-toast-state]"),
);
const actionButtons = Array.from(
	document.querySelectorAll<HTMLButtonElement>("[data-action]"),
);

const POSITION_VALUES: ToastPosition[] = [
	"top-left",
	"top-center",
	"top-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
];

const STATE_TITLE: Record<ToastStateButton, string> = {
	success: "Save complete",
	error: "Publish failed",
	warning: "Retry recommended",
	info: "Background sync",
	action: "Input required",
};

const STATE_DESCRIPTIONS: Record<ToastStateButton, string> = {
	success: "Document was stored and replicated.",
	error: "Service returned status 500 for this simulation.",
	warning: "Queue depth is high. Keep an eye on processing time.",
	info: "Latest batch started a few moments ago.",
	action: "Review pending records before deployment.",
};

const LOG_LIMIT = 140;
const logEntries: string[] = [];

let lastToastId: string | null = null;
let latestSnapshot: SnapshotPayload | null = null;
let snapshotRaf: number | null = null;

const nowLabel = () => {
	const now = new Date();
	const ms = String(now.getMilliseconds()).padStart(3, "0");
	return `${now.toLocaleTimeString("cs-CZ", { hour12: false })}.${ms}`;
};

const toJson = (value: unknown) => {
	if (value instanceof Error) {
		return JSON.stringify(
			{
				name: value.name,
				message: value.message,
			},
			null,
			0,
		);
	}

	try {
		return JSON.stringify(value, null, 0);
	} catch {
		return String(value);
	}
};

const pushLog = (event: string, details?: unknown) => {
	const suffix = details === undefined ? "" : ` ${toJson(details)}`;
	const row = `${nowLabel()} ${event}${suffix}`;
	logEntries.unshift(row);
	if (logEntries.length > LOG_LIMIT) {
		logEntries.length = LOG_LIMIT;
	}
	renderLogs();
};

const renderLogs = () => {
	logOutput.replaceChildren();
	for (const entry of logEntries) {
		const item = document.createElement("li");
		item.textContent = entry;
		logOutput.append(item);
	}
};

const readNumber = (
	input: HTMLInputElement,
	fallback: number,
	options?: {
		min?: number;
	},
) => {
	const parsed = Number(input.value);
	if (!Number.isFinite(parsed)) return fallback;

	if (options?.min !== undefined && parsed < options.min) {
		return options.min;
	}

	return parsed;
};

const readPosition = (): ToastPosition => {
	const value = positionSelect.value as ToastPosition;
	if (POSITION_VALUES.includes(value)) {
		return value;
	}
	return "top-right";
};

const readAutopilot = (): ToastOptions["autopilot"] => {
	if (!autopilotToggle.checked) {
		return false;
	}

	const expand = readNumber(autopilotExpandInput, 150, { min: 0 });
	const collapse = readNumber(autopilotCollapseInput, 4000, { min: 0 });
	return { expand, collapse };
};

const buildOptions = (state: ToastStateButton): ToastOptions => {
	const withDescription = descriptionToggle.checked;
	const withButton = buttonToggle.checked;

	const options: ToastOptions = {
		title: STATE_TITLE[state],
		description: withDescription ? STATE_DESCRIPTIONS[state] : undefined,
		position: readPosition(),
		duration: readNumber(durationInput, 6000, { min: 0 }),
		roundness: readNumber(roundnessInput, 18, { min: 0 }),
		fill: fillInput.value,
		autopilot: readAutopilot(),
	};

	if (withButton && state === "action") {
		options.button = {
			title: "Open details",
			onClick: () => {
				pushLog("button:onClick", { id: lastToastId });
			},
		};
	}

	return options;
};

const createStateToast = (state: ToastStateButton) => {
	const options = buildOptions(state);

	const id =
		state === "success"
			? toast.success(options)
			: state === "error"
				? toast.error(options)
				: state === "warning"
					? toast.warning(options)
					: state === "info"
						? toast.info(options)
						: toast.action(options);

	lastToastId = id;
	pushLog(`toast.${state}`, {
		id,
		position: options.position,
		duration: options.duration,
		autopilot: options.autopilot,
	});
	scheduleSnapshotRefresh();
	return id;
};

const dismissLast = () => {
	if (!lastToastId) {
		pushLog("toast.dismiss skipped", "No last toast id");
		return;
	}

	toast.dismiss(lastToastId);
	pushLog("toast.dismiss", { id: lastToastId });
	scheduleSnapshotRefresh();
};

const updateLast = () => {
	if (!lastToastId) {
		pushLog("toast.update skipped", "No last toast id");
		return;
	}

	const next = toast.info({
		...buildOptions("info"),
		id: lastToastId,
		title: `Updated #${lastToastId.slice(0, 8)}`,
		description: descriptionToggle.checked
			? "This toast reused the same id and swapped visual payload."
			: undefined,
	});

	lastToastId = next;
	pushLog("toast.update", { id: next });
	scheduleSnapshotRefresh();
};

const clearAll = () => {
	toast.clear();
	pushLog("toast.clear");
	scheduleSnapshotRefresh();
};

const burst = (count = 5) => {
	const states: ToastStateButton[] = ["success", "error", "warning", "info", "action"];
	const ids: string[] = [];

	for (let i = 0; i < count; i += 1) {
		ids.push(createStateToast(states[i % states.length]));
	}

	pushLog("toast.burst", { count, ids });
	return ids;
};

const simulatedRequest = (ok: boolean) =>
	new Promise<{ requestId: string }>((resolve, reject) => {
		const delay = 900 + Math.round(Math.random() * 900);
		window.setTimeout(() => {
			if (ok) {
				resolve({ requestId: `req_${Math.random().toString(36).slice(2, 8)}` });
				return;
			}
			reject(new Error("Simulated failure from debug playground"));
		}, delay);
	});

const runPromise = async (ok: boolean) => {
	pushLog("toast.promise:start", { ok });

	try {
		const result = await toast.promise(simulatedRequest(ok), {
			position: readPosition(),
			loading: {
				title: "Uploading chunk",
			},
			success: (data) => ({
				title: "Upload complete",
				description: `Server id: ${data.requestId}`,
				duration: readNumber(durationInput, 6000, { min: 0 }),
				autopilot: readAutopilot(),
			}),
			error: (error) => ({
				title: "Upload failed",
				description:
					error instanceof Error
						? error.message
						: "Unknown promise rejection in simulation",
				duration: readNumber(durationInput, 6000, { min: 0 }),
				autopilot: readAutopilot(),
			}),
		});

		pushLog("toast.promise:resolved", result);
	} catch (error) {
		pushLog("toast.promise:rejected", error);
	}

	scheduleSnapshotRefresh();
};

const wait = (ms: number) =>
	new Promise<void>((resolve) => {
		window.setTimeout(resolve, ms);
	});

const runSmokeSuite = async () => {
	pushLog("suite:start", "Smoke suite started");
	clearAll();

	const states: ToastStateButton[] = ["success", "warning", "error", "info", "action"];
	for (const state of states) {
		createStateToast(state);
		await wait(220);
	}

	await runPromise(true);
	await runPromise(false);

	pushLog("suite:done", "Smoke suite finished");
	refreshSnapshot();
};

const buildSnapshot = (): SnapshotPayload => {
	const toastNodes = Array.from(
		document.querySelectorAll<HTMLElement>("[data-gooey-toast]"),
	);
	const viewportNodes = Array.from(
		document.querySelectorAll<HTMLElement>("[data-gooey-viewport]"),
	);

	const toasts: SnapshotToast[] = toastNodes.map((node, index) => {
		const title =
			node.querySelector<HTMLElement>("[data-gooey-title]")?.textContent?.trim() ?? "";
		const description =
			node
				.querySelector<HTMLElement>("[data-gooey-description]")
				?.textContent?.trim() ?? "";

		return {
			id: index,
			state: node.dataset.state ?? "",
			position: node.dataset.position ?? "",
			edge: node.dataset.edge ?? "",
			expanded: node.dataset.expanded ?? "",
			exiting: node.dataset.exiting ?? "",
			ready: node.dataset.ready ?? "",
			title,
			description,
			heightVar: node.style.getPropertyValue("--_h"),
			pillWidthVar: node.style.getPropertyValue("--_pw"),
		};
	});

	return {
		timestamp: nowLabel(),
		viewportCount: viewportNodes.length,
		toastCount: toasts.length,
		viewports: viewportNodes.map((node) => ({
			position: node.dataset.position ?? "",
			children: node.children.length,
		})),
		toasts,
	};
};

const refreshSnapshot = () => {
	latestSnapshot = buildSnapshot();
	snapshotOutput.textContent = JSON.stringify(latestSnapshot, null, 2);

	runtimeInfoEl.textContent = [
		`position=${readPosition()}`,
		`toasts=${latestSnapshot.toastCount}`,
		`autopilot=${autopilotToggle.checked ? "on" : "off"}`,
	].join(" | ");

	return latestSnapshot;
};

const scheduleSnapshotRefresh = () => {
	if (snapshotRaf != null) return;
	snapshotRaf = window.requestAnimationFrame(() => {
		snapshotRaf = null;
		refreshSnapshot();
	});
};

const syncAutopilotInputs = () => {
	const disabled = !autopilotToggle.checked;
	autopilotExpandInput.disabled = disabled;
	autopilotCollapseInput.disabled = disabled;
};

const actionHandlers: Record<string, () => void> = {
	"update-last": updateLast,
	"dismiss-last": dismissLast,
	burst: () => {
		burst(5);
	},
	"promise-success": () => {
		void runPromise(true);
	},
	"promise-error": () => {
		void runPromise(false);
	},
	"smoke-suite": () => {
		void runSmokeSuite();
	},
	"clear-all": clearAll,
};

mountToaster({
	position: readPosition(),
});

stateButtons.forEach((button) => {
	button.addEventListener("click", () => {
		const state = button.dataset.toastState as ToastStateButton | undefined;
		if (!state) return;
		createStateToast(state);
	});
});

actionButtons.forEach((button) => {
	button.addEventListener("click", () => {
		const action = button.dataset.action;
		if (!action) return;
		actionHandlers[action]?.();
	});
});

positionSelect.addEventListener("change", () => {
	const position = readPosition();
	configureToaster({ position });
	pushLog("toaster.configure", { position });
	scheduleSnapshotRefresh();
});

[
	durationInput,
	roundnessInput,
	fillInput,
	descriptionToggle,
	buttonToggle,
	autopilotToggle,
	autopilotExpandInput,
	autopilotCollapseInput,
].forEach((node) => {
	node.addEventListener("input", () => {
		syncAutopilotInputs();
		scheduleSnapshotRefresh();
	});
});

refreshSnapshotBtn.addEventListener("click", () => {
	pushLog("snapshot:manual-refresh");
	refreshSnapshot();
});

clearLogBtn.addEventListener("click", () => {
	logEntries.length = 0;
	renderLogs();
	pushLog("log:cleared");
});

const observer = new MutationObserver(() => {
	scheduleSnapshotRefresh();
});

observer.observe(document.body, {
	childList: true,
	subtree: true,
	attributes: true,
	attributeFilter: [
		"data-ready",
		"data-expanded",
		"data-exiting",
		"data-state",
		"data-position",
		"data-edge",
	],
});

window.__gooeyToastDebug = {
	refresh: () => refreshSnapshot(),
	snapshot: () => latestSnapshot ?? refreshSnapshot(),
	logs: () => [...logEntries],
	clearLogs: () => {
		logEntries.length = 0;
		renderLogs();
	},
	burst,
	dismissLast,
	clear: clearAll,
};

syncAutopilotInputs();
refreshSnapshot();
pushLog("playground:ready", {
	help: "window.__gooeyToastDebug",
});
