const assert = require("node:assert/strict");
const test = require("node:test");

const fc = require("fast-check");

const {
	DEFAULT_DURATION,
	clamp,
	normalizeDuration,
	resolveAutopilot,
	resolvePlacement,
} = require("../../dist/internal.js");
const { TOAST_POSITIONS } = require("../../dist/types.js");

const optionalInt = fc.option(fc.integer({ min: -20000, max: 20000 }), {
	nil: undefined,
});

test("clamp keeps values inside the requested range", () => {
	fc.assert(
		fc.property(fc.integer(), fc.integer(), fc.integer(), (value, a, b) => {
			const min = Math.min(a, b);
			const max = Math.max(a, b);
			const result = clamp(value, min, max);

			assert.ok(result >= min);
			assert.ok(result <= max);

			if (value < min) {
				assert.equal(result, min);
			}

			if (value > max) {
				assert.equal(result, max);
			}

			if (value >= min && value <= max) {
				assert.equal(result, value);
			}
		}),
	);
});

test("normalizeDuration only defaults undefined values", () => {
	assert.equal(normalizeDuration(undefined), DEFAULT_DURATION);

	fc.assert(
		fc.property(fc.oneof(fc.integer(), fc.constant(null)), (value) => {
			assert.equal(normalizeDuration(value), value);
		}),
	);
});

test("resolveAutopilot clamps timing values into the toast duration", () => {
	fc.assert(
		fc.property(optionalInt, optionalInt, fc.integer({ min: 1, max: 20000 }), (expand, collapse, duration) => {
			const result = resolveAutopilot({
				autopilot: {
					expand,
					collapse,
				},
			}, duration);

			assert.ok(result.autoExpandDelayMs >= 0);
			assert.ok(result.autoExpandDelayMs <= duration);
			assert.ok(result.autoCollapseDelayMs >= 0);
			assert.ok(result.autoCollapseDelayMs <= duration);
		}),
	);

	assert.deepEqual(resolveAutopilot({ autopilot: false }, 1000), {});
	assert.deepEqual(resolveAutopilot({ autopilot: true }, null), {});
	assert.deepEqual(resolveAutopilot({ autopilot: true }, 0), {});
});

test("resolvePlacement follows the exported toast position names", () => {
	for (const position of TOAST_POSITIONS) {
		const placement = resolvePlacement(position);

		assert.equal(
			placement.align,
			position.endsWith("left")
				? "left"
				: position.endsWith("center")
					? "center"
					: "right",
		);
		assert.equal(placement.edge, position.startsWith("top") ? "top" : "bottom");
	}
});
