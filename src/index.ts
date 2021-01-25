import * as dotenv from 'dotenv';
dotenv.config();

import * as scrapeMentionsJob from './scrapeMentionsJob';
import * as postTweetsJob from './postTweetsJob';

async function main() {
    await scrapeMentionsJob.run();
    await postTweetsJob.run();
}

main().catch((e) => console.error(e));
