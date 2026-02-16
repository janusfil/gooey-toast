export type ToastState =
	| "success"
	| "loading"
	| "error"
	| "warning"
	| "info"
	| "action";

export interface ToastStyles {
	title?: string;
	description?: string;
	badge?: string;
	button?: string;
}

export interface ToastButton {
	title: string;
	onClick: () => void;
}

export const TOAST_POSITIONS = [
	"top-left",
	"top-center",
	"top-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
] as const;

export type ToastPosition = (typeof TOAST_POSITIONS)[number];

export type ToastRenderableValue =
	| string
	| number
	| Node
	| DocumentFragment
	| null
	| undefined;

export type ToastRenderable =
	| ToastRenderableValue
	| (() => ToastRenderableValue);

export interface ToastAutopilot {
	expand?: number;
	collapse?: number;
}

export interface ToastOptions {
	id?: string;
	title?: string;
	description?: ToastRenderable;
	position?: ToastPosition;
	duration?: number | null;
	icon?: ToastRenderable | null;
	styles?: ToastStyles;
	fill?: string;
	roundness?: number;
	autopilot?: boolean | ToastAutopilot;
	button?: ToastButton;
}

export interface ToastPromiseOptions<T = unknown> {
	loading: Pick<ToastOptions, "title" | "icon">;
	success: ToastOptions | ((data: T) => ToastOptions);
	error: ToastOptions | ((err: unknown) => ToastOptions);
	action?: ToastOptions | ((data: T) => ToastOptions);
	position?: ToastPosition;
}

export type ToasterOffsetValue = number | string;
export type ToasterOffsetConfig = Partial<
	Record<"top" | "right" | "bottom" | "left", ToasterOffsetValue>
>;

export interface ToasterOptions {
	target?: HTMLElement;
	position?: ToastPosition;
	offset?: ToasterOffsetValue | ToasterOffsetConfig;
	options?: Partial<ToastOptions>;
}

export interface ToasterHandle {
	update: (options: ToasterOptions) => void;
	unmount: () => void;
}
