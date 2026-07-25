export type LinkScraper =
	| {
			strategy: 'simple';
			scraperConfig: {
				containerSelector: string;
				linkSelector: string;
			};
	  }
	| {
			strategy: 'paginateURL';
			scraperConfig: {
				containerSelector: string;
				linkSelector: string;
				nextPageQueryParam: string;
				startingPage?: number;
				delta?: number;
				waitMs?: number;
			};
	  }
	| {
			strategy: 'paginateButton';
			scraperConfig: {
				containerSelector: string;
				linkSelector: string;
				nextPageButtonSelector: string;
				waitMs?: number;
			};
	  }
	| {
			strategy: 'infiniteScroll';
			scraperConfig: {
				containerSelector: string;
				linkSelector: string;
				scrollCount: number;
				waitMs?: number;
			};
	  }
	| {
			strategy: 'infiniteScrollBtn';
			scraperConfig: {
				containerSelector: string;
				linkSelector: string;
				nextPageButtonSelector: string;
				waitMs?: number;
			};
	  };

export interface ScraperInstructions {
	url: string;
	linkScraper: LinkScraper;
	contentScraper: {
		contentElements: {
			required?: boolean; // Default true
			selector: string;
			label?: string;
			skipFront?: number;
			skipBack?: number;
			normalize?: boolean; // Default true
			trimAfter?: string | string[]; // Remove all characters after the first occurance of the specified string
			multiple?: boolean; // Default false (if true, all matched elements are scraped)
			flatten?: boolean;
		}[];
		imageSelector?: string;
	};
	metadata: { [key: string]: any }; // Gets added to each scraper result
}
