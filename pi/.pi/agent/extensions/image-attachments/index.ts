import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
	loadImageContentFromPath,
	maybeResizeImage,
	readImageContentFromPathAsync,
	type ImageResizer,
} from "./src/image-content.ts";
import { registerImagePreviewExtension } from "./src/extension-runtime.ts";
import { debugLog } from "./src/debug.ts";

let cachedResizerPromise: Promise<ImageResizer | null> | undefined;

async function loadPiImageResizer(): Promise<ImageResizer | null> {
	if (cachedResizerPromise) return cachedResizerPromise;

	cachedResizerPromise = (async () => {
		try {
			const require = createRequire(import.meta.url);
			const piEntry = require.resolve("@earendil-works/pi-coding-agent");
			const distDir = path.dirname(piEntry);
			const moduleUrl = pathToFileURL(
				path.join(distDir, "utils", "image-resize.js"),
			).href;
			const mod = (await import(moduleUrl)) as {
				resizeImage?: (image: {
					type: "image";
					data: string;
					mimeType: string;
				}) => Promise<{ data: string; mimeType: string }>;
			};
			if (!mod.resizeImage) return null;
			return async (image) => {
				const resized = await mod.resizeImage!(image);
				return {
					type: "image",
					data: resized.data,
					mimeType: resized.mimeType,
				};
			};
		} catch (err) {
			debugLog("Failed to load pi image resizer", err);
			return null;
		}
	})();

	return cachedResizerPromise;
}

export default function (pi: any): void {
	registerImagePreviewExtension(pi, {
		readImageContentFromPathAsync,
		maybeResizeImage: async (image) =>
			maybeResizeImage(image, await loadPiImageResizer()),
		loadImageContentFromPath: async (filePath) =>
			loadImageContentFromPath(filePath, await loadPiImageResizer()),
	});
}
