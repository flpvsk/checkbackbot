import * as chrono from 'chrono-node';
import { TweetId } from './types';
import { storage } from './storage';
import * as twitter from './twitterWrapper';
export const JOB_NAME = 'scrapeMentions';

interface ScrapeMentionsJobData {
    mostRecentTweetId?: TweetId;
    error?: string;
}

export async function run(): Promise<void> {
    const lastRun = await storage.getLastJobData<ScrapeMentionsJobData>(JOB_NAME);

    const userId = process.env.TW_BOT_USER_ID;
    const token = process.env.TW_BEARER_TOKEN;

    if (!userId) {
        console.warn('TW_BOT_USER_ID not set, aborting');
        return;
    }

    if (!token) {
        console.warn('TW_BEARER_TOKEN not set, aborting');
        return;
    }

    const tweets = twitter.getMentions({
        after: lastRun?.mostRecentTweetId,
        userId,
        token,
    });

    let mostRecentTweetId: TweetId | undefined;
    let error: string | undefined;
    try {
        for await (const tweetInfo of tweets) {
            if (!mostRecentTweetId) {
                mostRecentTweetId = tweetInfo.tweet.id;
            }

            // it's a tweet for this bot
            /*
      if (tweetInfo.tweet.author_id === userId) {
        continue
      }
      */

            const toPostOn = chrono.parseDate(tweetInfo.tweet.text, new Date(tweetInfo.tweet.created_at), {
                forwardDate: true,
            });

            if (!toPostOn) {
                continue;
            }

            const meta = { toPostOn };
            await storage.insertIncomingTweet(tweetInfo, meta);
            await storage.insertRepost(tweetInfo, meta);
            await storage.insertConfirmation(tweetInfo, meta);
        }
    } catch (e) {
        console.warn('Error processing tweets', e);
        error = e.stack;
        mostRecentTweetId = lastRun?.mostRecentTweetId;
    }
    storage.insertJobData<ScrapeMentionsJobData>(JOB_NAME, {
        mostRecentTweetId: mostRecentTweetId ?? lastRun?.mostRecentTweetId,
        error,
    });
}
