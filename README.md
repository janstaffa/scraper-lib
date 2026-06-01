# Generic web scraping client for both Node.js and CLI

## Usage

### a) CLI
```sh
node dist/index.js -i <PATH_TO_INPUT_INSTRUCTIONS>

# Other options:
#   -o <PATH_TO_OUTPUT_FILE>    Specifies where scraped data should be stored (in JSON format). If ommited outputs to stdout.
#   -t  (testmode)              Enables "test mode" - the scraper only processes the first link from each source. (default: false)
#   -q  (quiet)                 Enables "quiet mode" - all logs are suppressed. (default: false)

```

### b) Library

```js
import { Scraper, type ScraperInstructions } from 'scraper-lib';

const input = JSON.parse(fs.readFileSync(path.join('./input.json'), 'utf-8')).srcs as ScraperInstructions[];
      
const scraper = await Scraper.init(input);

const result= await scraper.runScraper();

console.log(result)
```


### Input Scraper Instructions
Seee `examples/instructions.json` for more information.


```ts
interface ScraperInstructions {
	url: string; // URL of the page where links can be found.
	linkScraper: {
		strategy: 'simple' | 'paginateURL' | 'paginateButton' | 'infiniteScroll';
		scraperConfig: object;
	};
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
```