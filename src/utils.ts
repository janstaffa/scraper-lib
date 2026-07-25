import type { ElementHandle, Page } from 'puppeteer';

// If multiple phrases provided trim the first one that appears in the text
export function removeFromPhrase(str: string, phrase: string | string[]) {
	let index: number | undefined;
	if (typeof phrase === 'object') {
		for (const p of phrase) {
			const idx = str.indexOf(p);
			if (index === undefined || idx < index) index = idx;
		}
	} else {
		index = str.indexOf(phrase);
	}

	if (index === -1) return str;
	return str.slice(0, index);
}
export const sleep = (ms: number) =>
	new Promise((res, _) => setTimeout(() => res(1), ms));

export const removeNewlines = (text: string) =>
	text.replace(/\n+/g, ' ').trim();

export const normalizeContent = (text: string) =>
	text.replace(/[ \t]+/g, ' ').trim();

export const toAbsolutePath = (href: string, root: string) =>
	new URL(href, new URL(root).origin).href;

export const getHref = async (
	el: ElementHandle<Element>,
	query: string,
	root: string,
) => {
	const href = await (
		await el.$(query)
	)?.evaluate((a) => a.getAttribute('href'));
	return href ? toAbsolutePath(href, root) : null;
};

export const getLinksFromPage = async (
	page: Page,
	pageQuery: string,
	linkQuery: string,
	root: string,
) => {
	const ls = [];
	for (const el of await page.$$(pageQuery)) {
		const href = await getHref(el, linkQuery, root);
		if (href) ls.push(href);
	}
	return ls;
};

export const getMultiContentFromPage = async (
	page: Page,
	pageQuery: string,
) => {
	const content = await page.$$(pageQuery);
	return await Promise.all(
		content.map(async (c) =>
			c.evaluate((e) => (e as HTMLDivElement).innerText),
		),
	);
};

export const getContentFromPage = async (page: Page, pageQuery: string) => {
	const content = await page.$(pageQuery);
	return (
		(await content?.evaluate((e) => (e as HTMLDivElement).innerText)) ?? null
	);
};

const IMAGE_LOAD_TIMEOUT = 5000;

// Tries to first get image from the src property then from computed styles backgroundImage
export const getImageSrcFromPage = async (page: Page, imageQuery: string) => {
	const img = await page.$(imageQuery);
	if (!img) return null;

	// Scroll in order to ensure load
	await img.scrollIntoView();

	return img.evaluate(async (element, timeout) => {
		const isValidImageUrl = (url: string | null | undefined) =>
			!!url && !url.startsWith('data:') && !url.startsWith('blob:');

		// If element is a image get url from currentSrc/src
		if (element instanceof HTMLImageElement) {
			// If not loaded wait for the image to load (or timeout)
			if (!element.complete) {
				await Promise.race([
					// Wait for load
					new Promise<void>((resolve) => {
						element.addEventListener('load', () => resolve(), { once: true });
						element.addEventListener('error', () => resolve(), { once: true });
					}),
					// If timeout reached return
					new Promise<void>((resolve) => setTimeout(resolve, timeout)),
				]);
			}

			const url = element.currentSrc || element.src;
			return isValidImageUrl(url) ? url : null;
		}

		// Otherwise try to get from css background image
		const backgroundImage = getComputedStyle(element).backgroundImage;
		if (!backgroundImage || backgroundImage === 'none') return null;

		const match = backgroundImage.match(/url\(["']?(.*?)["']?\)/);
		const url = match?.[1];
		return isValidImageUrl(url) ? url! : null;
	}, IMAGE_LOAD_TIMEOUT);
};

export const isElementHidden = async (el: ElementHandle<Element>) => {
	const styles = await el.evaluate((e) => window.getComputedStyle(e));
	const rect = await el.evaluate((e) => e.getBoundingClientRect());
	return (
		styles.display === 'none' ||
		styles.opacity === '0' ||
		styles.visibility === 'hidden' ||
		(rect.width === 0 && rect.height === 0)
	);
};
