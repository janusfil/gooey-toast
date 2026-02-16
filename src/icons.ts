import type { ToastState } from "./types";

const SVG_NS = "http://www.w3.org/2000/svg";

const createSvgNode = <T extends keyof SVGElementTagNameMap>(
	tag: T,
): SVGElementTagNameMap[T] => document.createElementNS(SVG_NS, tag);

const setAttrs = (el: Element, attrs: Record<string, string>) => {
	for (const [key, value] of Object.entries(attrs)) {
		el.setAttribute(key, value);
	}
};

const createIcon = (title: string) => {
	const svg = createSvgNode("svg");
	setAttrs(svg, {
		xmlns: SVG_NS,
		width: "16",
		height: "16",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "2",
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
	});

	const titleEl = createSvgNode("title");
	titleEl.textContent = title;
	svg.append(titleEl);

	return svg;
};

const appendPath = (svg: SVGSVGElement, d: string) => {
	const path = createSvgNode("path");
	path.setAttribute("d", d);
	svg.append(path);
};

const appendCircle = (svg: SVGSVGElement, cx: string, cy: string, r: string) => {
	const circle = createSvgNode("circle");
	setAttrs(circle, { cx, cy, r });
	svg.append(circle);
};

const appendLine = (
	svg: SVGSVGElement,
	x1: string,
	x2: string,
	y1: string,
	y2: string,
) => {
	const line = createSvgNode("line");
	setAttrs(line, { x1, x2, y1, y2 });
	svg.append(line);
};

const createArrowRight = () => {
	const svg = createIcon("Arrow Right");
	appendPath(svg, "M5 12h14");
	appendPath(svg, "m12 5 7 7-7 7");
	return svg;
};

const createLifeBuoy = () => {
	const svg = createIcon("Life Buoy");
	appendCircle(svg, "12", "12", "10");
	appendPath(svg, "m4.93 4.93 4.24 4.24");
	appendPath(svg, "m14.83 9.17 4.24-4.24");
	appendPath(svg, "m14.83 14.83 4.24 4.24");
	appendPath(svg, "m9.17 14.83-4.24 4.24");
	appendCircle(svg, "12", "12", "4");
	return svg;
};

const createLoaderCircle = () => {
	const svg = createIcon("Loader Circle");
	svg.setAttribute("data-sileo-icon", "spin");
	svg.setAttribute("aria-hidden", "true");
	appendPath(svg, "M21 12a9 9 0 1 1-6.219-8.56");
	return svg;
};

const createX = () => {
	const svg = createIcon("X");
	appendPath(svg, "M18 6 6 18");
	appendPath(svg, "m6 6 12 12");
	return svg;
};

const createCircleAlert = () => {
	const svg = createIcon("Circle Alert");
	appendCircle(svg, "12", "12", "10");
	appendLine(svg, "12", "12", "8", "12");
	appendLine(svg, "12", "12.01", "16", "16");
	return svg;
};

const createCheck = () => {
	const svg = createIcon("Check");
	appendPath(svg, "M20 6 9 17l-5-5");
	return svg;
};

export const createStateIcon = (state: ToastState): SVGSVGElement => {
	switch (state) {
		case "success":
			return createCheck();
		case "loading":
			return createLoaderCircle();
		case "error":
			return createX();
		case "warning":
			return createCircleAlert();
		case "info":
			return createLifeBuoy();
		case "action":
			return createArrowRight();
		default:
			return createCheck();
	}
};
