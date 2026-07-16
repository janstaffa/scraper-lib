import puppeteer from 'puppeteer';
import type { LinkScraper, ScraperInstructions } from './types/scraper.js';
import {
  getContentFromPage,
  getImageFromPage,
  getLinksFromPage,
  getMultiContentFromPage,
  isElementHidden,
  normalizeContent,
  removeFromPhrase as removeAfterPhrase,
  removeNewlines,
  sleep,
} from './utils.js';

// Reexport types to main API
export type * from './types/scraper.js';

type LinkScrapingStrategy = LinkScraper['strategy'];

// Generates types for link scraping functions
type LinkScrapingStrategies = {
	[TStrategy in LinkScrapingStrategy]: (
		url: string,
		scraperConfig: Extract<
			LinkScraper,
			{ strategy: TStrategy }
		>['scraperConfig'],
	) => Promise<string[]>;
};

interface ScraperResult {
	source: string;
	content: string;
	imageURL: string | null;
	metadata: { [key: string]: any };
}

export class Scraper {
	private browser: puppeteer.Browser | undefined = undefined;
	private page: puppeteer.Page | undefined = undefined;
	private instructions: ScraperInstructions[] = [];

	private constructor(
		browser: puppeteer.Browser,
		page: puppeteer.Page,
		scrapingInstructions: ScraperInstructions[],
	) {
		this.browser = browser;
		this.page = page;
		this.instructions = scrapingInstructions;
	}

	static async init(scrapingInstructions: ScraperInstructions[]) {
		const b = await puppeteer.launch({ headless: true });
		return new Scraper(b, await b.newPage(), scrapingInstructions);
	}
	async close() {
		await this.browser?.close();
	}
	private DEFAULT_PAGINATE_WAIT_TIME = 1000;
	private linkScrapingStrategies: LinkScrapingStrategies = {
		/**
		 * Scrapes all links from the page.
		 */
		simple: async (url, scraperConfig) => {
			if (!this.page || !this.browser) throw 'Scraper not Ready';

			return await getLinksFromPage(
				this.page,
				scraperConfig.containerSelector,
				scraperConfig.linkSelector,
				url,
			);
		},

		/**
		 * Changes the URL by setting the `scraperConfig.nextPageQueryParam` to `scraperConfig.startingPage` + k * `scraperConfig.delta` untill no more links can be extracted.
		 */
		paginateURL: async (url, scraperConfig) => {
			if (!this.page || !this.browser) throw 'Scraper not Ready';

			const links: string[] = [];

			let currentPage = scraperConfig.startingPage ?? 1;
			const delta = scraperConfig.delta ?? 1;

			// Paginate while links can be found
			while (true) {
				const ls = await getLinksFromPage(
					this.page,
					scraperConfig.containerSelector,
					scraperConfig.linkSelector,
					url,
				);
				if (ls.length === 0) break;
				ls.forEach((l) => links.push(l));

				const newURL = new URL(await this.page.url());

				currentPage += delta;
				newURL.searchParams.set(
					scraperConfig.nextPageQueryParam,
					currentPage.toString(),
				);

				await this.page.goto(newURL.toString());
				await sleep(scraperConfig.waitMs ?? this.DEFAULT_PAGINATE_WAIT_TIME);
			}
			return links;
		},

		/**
		 * Clicks the button specified by  `scraperConfig.nextPageButtonSelector` untill no more items can be extracted from the page or the button disappears.
		 */
		paginateButton: async (url, scraperConfig) => {
			if (!this.page || !this.browser) throw 'Scraper not Ready';

			const links: string[] = [];

			// Loop over pages until all data is loaded
			while (true) {
				const ls = await getLinksFromPage(
					this.page,
					scraperConfig.containerSelector,
					scraperConfig.linkSelector,
					url,
				);

				ls.forEach((l) => links.push(l));

				const nextBtn = await this.page.$(scraperConfig.nextPageButtonSelector);
				if (ls.length === 0 || !nextBtn || (await isElementHidden(nextBtn)))
					break;

				// Go to next page
				await nextBtn.evaluate((el) => (el as HTMLAnchorElement).click());
				await sleep(scraperConfig.waitMs ?? this.DEFAULT_PAGINATE_WAIT_TIME);
			}
			return links;
		},

		/**
		 * Scrolls `scraperConfig.scrollCount` times to load all the data, then extracts all at once.
		 */
		infiniteScroll: async (url, scraperConfig) => {
			if (!this.page || !this.browser) throw 'Scraper not Ready';

			// Scroll n times (to load infinite scroll)
			for (let i = 0; i < scraperConfig.scrollCount; i++) {
				await this.page.evaluate(() => {
					window.scrollTo(0, document.body.scrollHeight);
				});
				await sleep(500);
			}

			return await getLinksFromPage(
				this.page,
				scraperConfig.containerSelector,
				scraperConfig.linkSelector,
				url,
			);
		},
	};

	private async scrapeContent(
		url: string,
		scraperInstructions: ScraperInstructions['contentScraper'],
	): Promise<ScraperResult> {
		if (!this.page || !this.browser) throw 'Scraper not Ready';

		await this.page.goto(url, {
			waitUntil: 'networkidle2',
		});

		let content = '';

		for (const inst of scraperInstructions.contentElements) {
			let cnt: (string | null)[] = inst.multiple
				? await getMultiContentFromPage(this.page, inst.selector)
				: [await getContentFromPage(this.page, inst.selector)];

			if (cnt.length === 0 || !cnt[0])
				if (inst.required ?? true) throw 'Failed to find required content';
				else continue;

			let text = '';
			for (let c of cnt) {
				if (inst.flatten) c = removeNewlines(c!);
				if (inst.normalize) c = normalizeContent(c!);
				if (inst.skipFront) c = c!.split('\n').slice(inst.skipFront).join('\n');
				if (inst.skipBack)
					c = c!.split('\n').slice(0, -inst.skipBack).join('\n');
				if (inst.trimAfter) c = removeAfterPhrase(c!, inst.trimAfter);
				text += c! + '\n';
			}

			content += (inst.label ? `${inst.label}: ` : '') + text + '\n';
		}

		const imageURL = scraperInstructions.imageSelector
			? await getImageFromPage(this.page, scraperInstructions.imageSelector)
			: null;

		return {
			source: url,
			content,
			imageURL,
			metadata: {},
		};
	}

	/**
	 * Runs the scraper across all configured sources.
	 *
	 * @param ignoreSrcs List of source urls to skip during scraping.
	 * @param log Whether to log scraping progress and status messages.
	 * @param testMode Whether to run in test mode (only scrape 1 page per source).
	 * @param limit Maximum number of sources to scrape. If omitted, all eligible sources are scraped.
	 * @param scrapingDelay Delay in milliseconds to wait between scraping pages from one sources.
	 */
	async runScraper(
		ignoreSrcs: string[] = [],
		log = true,
		testMode = false,
		limit?: number,
		scrapingDelay: number = 0,
	): Promise<ScraperResult[]> {
		if (!this.page || !this.browser || this.instructions.length === 0)
			throw 'Scraper not Ready';

		const results: ScraperResult[] = [];

		let totalScrapedCount = 0;

		const linksToScrape: {
			url: string;
			contentScraper: ScraperInstructions['contentScraper'];
			metadata: ScraperInstructions['metadata'];
		}[] = [];

		for (const { url, linkScraper, contentScraper, metadata } of this
			.instructions) {
			if (log) console.log(`Started scraping links from ${url}`);
			try {
				await this.page.goto(url, {
					waitUntil: 'networkidle2',
				});

				const ls = Array.from(
					new Set(
						await this.linkScrapingStrategies[linkScraper.strategy](
							url,
							linkScraper.scraperConfig as any,
						),
					),
				);

				if (log) console.log(`Extracted ${ls.length} links from ${url}`);

				if (ls.length === 0) continue;

				if (testMode)
					linksToScrape.push({
						url: ls[0]!,
						contentScraper,
						metadata,
					});
				else
					linksToScrape.push(
						...ls.map((l) => ({
							url: l,
							contentScraper,
							metadata,
						})),
					);
			} catch (e) {
				console.error(`Failed to scrape links from ${url}: `, e);
			}
		}

		// Shuffle links
		linksToScrape.sort((_, __) => Math.random() - 0.5);

		let ignoredCount = 0;
		let errorCount = 0;

		for (const { url, contentScraper, metadata } of linksToScrape) {
			// Exit early if limit was reached
			if (limit && totalScrapedCount >= limit) {
				console.log(`Scraping limit reached - stopping (limit ${limit})`);
				break;
			}

			if (ignoreSrcs.includes(url)) {
				ignoredCount++;
				continue;
			}

			try {
				results.push({
					...(await this.scrapeContent(url, contentScraper)),
					metadata,
				});
				totalScrapedCount++;
				if (log) console.log(`Scraped content from ${url}`);
			} catch (e) {
				console.error(`Failed to scrape content from ${url}: `, e);
				errorCount++;
			}
			await sleep(scrapingDelay);
		}
		if (log)
			console.log(
				`Finished scraping: ${totalScrapedCount} scraped, ${ignoredCount} ignored, ${errorCount} errors`,
			);

		return results;
	}
}
