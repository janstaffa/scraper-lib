// import { dbQuery } from './db.ts';
import fs from 'fs';
import { exit } from 'node:process';
import path from 'path';
import { Scraper } from './scraper.js';

import commandLineArgs from 'command-line-args';
import * as t from 'ts-interface-checker';
import ScraperTypes from './types/scraper-ti.js';
import type { ScraperInstructions } from './types/scraper.js';

async function run() {
	try {
		const options = commandLineArgs([
			{ name: 'input', alias: 'i', type: String },
			{ name: 'output', alias: 'o', type: String },
			{ name: 'testmode', alias: 't', type: Boolean, defaultValue: false },
			{ name: 'quiet', alias: 'q', type: Boolean, defaultValue: false },
		]);
		if (!options['input']) throw new Error('Invalid options');

		const { ScraperInstructions } = t.createCheckers(ScraperTypes);

		const input: ScraperInstructions[] | undefined = JSON.parse(
			fs.readFileSync(path.join(options.input), 'utf-8'),
		)?.srcs;

		if (!input) throw new Error('Invalid input');

		for (const src of input) ScraperInstructions?.check(src);

		const log = !options['quiet'];
		if (log) console.log(`Loaded scraping instructions with ${input.length} sources`);
		const scraper = await Scraper.init(input);
		if (log) console.log('Starting scraping...');
		const content = await scraper.runScraper([], log, options['testmode']);

		const output = {
			data: content,
		};
		const outputStr = JSON.stringify(output, undefined, 2);

		if (!options['output']) console.log(outputStr);
		else {
			fs.writeFileSync(path.join(options['output']), outputStr, {
				encoding: 'utf-8',
			});
			if (log) console.log(`Wrote to ${options['output']}`);
		}
		scraper.close();
		exit(0);
	} catch (e) {
		console.error(e);
		exit(1);
	}
}

run();
