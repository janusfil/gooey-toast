import { readFileSync } from "node:fs";

const allowedInstallScriptPackages = new Set(["esbuild"]);
const allowedRegistryHosts = new Set(["registry.npmjs.org"]);

const lockfilePath = new URL("../package-lock.json", import.meta.url);
const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8"));
const packages = Object.entries(lockfile.packages ?? {});

const installScriptViolations = [];
const registryViolations = [];

for (const [packagePath, pkg] of packages) {
	if (!pkg || typeof pkg !== "object") {
		continue;
	}

	if (typeof pkg.resolved === "string") {
		try {
			const resolvedUrl = new URL(pkg.resolved);

			if (
				resolvedUrl.protocol !== "https:" ||
				!allowedRegistryHosts.has(resolvedUrl.host)
			) {
				registryViolations.push(`${packagePath || "<root>"} -> ${pkg.resolved}`);
			}
		} catch {
			registryViolations.push(`${packagePath || "<root>"} -> ${pkg.resolved}`);
		}
	}

	if (pkg.hasInstallScript) {
		const packageName = getPackageName(packagePath);

		if (!allowedInstallScriptPackages.has(packageName)) {
			installScriptViolations.push(`${packageName} (${packagePath || "<root>"})`);
		}
	}
}

if (registryViolations.length > 0 || installScriptViolations.length > 0) {
	if (registryViolations.length > 0) {
		console.error("Unexpected package registry entries:");
		for (const violation of registryViolations) {
			console.error(`- ${violation}`);
		}
	}

	if (installScriptViolations.length > 0) {
		console.error("Unexpected install scripts in lockfile:");
		for (const violation of installScriptViolations) {
			console.error(`- ${violation}`);
		}
		console.error(
			`Allowed install-script packages: ${Array.from(allowedInstallScriptPackages).join(", ")}`,
		);
	}

	process.exit(1);
}

console.log(`Supply-chain checks passed for ${packages.length} lockfile entries.`);

function getPackageName(packagePath) {
	if (!packagePath) {
		return "<root>";
	}

	const segments = packagePath.split("node_modules/").filter(Boolean);
	const lastSegment = segments.at(-1);

	if (!lastSegment) {
		return packagePath;
	}

	const parts = lastSegment.split("/");

	if (lastSegment.startsWith("@")) {
		return parts.slice(0, 2).join("/");
	}

	return parts[0];
}
