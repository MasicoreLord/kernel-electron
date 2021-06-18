import logger from "kernel/logger";
import flipTree from "kernel/utilities/flipTree";
import fs from "fs-extra";
import path from "path";
import chokidar from "chokidar";
import _ from "lodash";

const packagesFolder = path.join(__dirname, "..", "packages");

const watcher = chokidar.watch("all", {
	persistent: true,
	ignoreInitial: true,
	followSymlinks: true,
});

export function getPackages() {
	// Yeeeeaaaaah, gonna see if I can make this faster later.
	return fs
		.readdirSync(packagesFolder, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name)
		.map((packageName) => {
			let packageJSON;
			try {
				packageJSON = fs.readJSONSync(
					path.join(packagesFolder, packageName, "index.json")
				);
			} catch {
				logger.error(`Package has no index.json.`);
			}
			return packageJSON;
		})
		.reduce(
			(packages, pack) => (
				(packages[pack.id] = (() => (delete pack.id, pack))()), packages
			),
			{}
		);
}

function walk(node, callback) {
	if (typeof node === "object") {
		for (const child of Object.values(node)) {
			if (typeof child === "object") {
				walk(child, callback);
			}
		}
	}
	callback(node);
}

function treeDepth(object) {
	if (typeof object !== "object") return 0;
	let depth = 1;
	for (const child of Object.values(object)) {
		if (typeof child === "object") {
			const childDepth = treeDepth(child) + 1;
			depth = Math.max(childDepth, depth);
		}
	}
	return depth;
}

/**
 * @typedef {object[(string|Ogre)]} Ogre
 */

export /**
	Ogres are like onions. They have layers.
	Each layer loads sync to make sure deps load first, but everything in that layer loads async.
	This function constructs those layers as a tree based on the package data you give it.
	They're also ugly, just like how these packages have to load.
	@returns {Ogre}
*/ function getOgre(
	packs = getPackages(),
	allPacks = getPackages(),
	first = true
) {
	let tree = {};

	for (const packName in packs) {
		const pack = allPacks[packName];
		if (!pack) {
			logger.error(`Missing dependency ${packName}.`);
			continue;
		}
		if (Boolean(pack.dependencies) && pack.dependencies.length > 0) {
			const deepOgre = getOgre(
				pack.dependencies.reduce(
					(depPacks, dep) => ((depPacks[dep] = packs[dep]), depPacks),
					{}
				),
				allPacks,
				false
			);
			if (Object.keys(deepOgre).length === pack.dependencies.length) {
				tree[packName] = deepOgre;
			} else {
				logger.error(
					`Failed load ${packName} because of missing dependencies.`
				);
			}
			continue;
		}
		tree[packName] = true;
	}

	if (first) {
		let ogre = [];

		walk(tree, (node) => {
			for (const [key, value] of Object.entries(node)) {
				const depth = treeDepth(value);
				if (!ogre[depth]) ogre[depth] = [key];
				else ogre[depth].push(key);
			}
		});

		const found = new Set();
		for (let i = 0; i < ogre.length; i++) {
			ogre[i] = [...new Set(ogre[i].filter((id) => !found.has(id)))];
			for (const id of ogre[i]) {
				found.add(id);
			}
		}

		return ogre;
	}
	return tree;
}

export function load(dir) {}

logger.time("Retrieved packages in");

const packages = getPackages();

watcher.on("change", (path, stats) => {});

logger.log(getOgre(packages));

logger.timeEnd("Retrieved packages in");
