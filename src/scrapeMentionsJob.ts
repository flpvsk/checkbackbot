import { TweetId } from "./types"
import { storage } from "./storage"
import { twitter } from "./twitter"
const JOB_NAME = "scrapeMentions"

interface ScrapeMentionsJobData {
  newest_id: TweetId
}

export async function run(): Promise<void> {
  const lastRun = await storage.getLastJobData<ScrapeMentionsJobData>(JOB_NAME)
  const tweets = twitter.getMentions({
    after: lastRun?.newest_id,
    userId: process.env.TW_BOT_USER_ID,
    token: process.env.TW_BEARER_TOKEN
  })
  for await (const tweet of tweets) {
    console.log(tweet)
  }
  // get [last] scaped mention id
  // [page] in pages
  //    get mentions since [last] for [page]
  //    save mentions to db
  //    [newLast] = lastMentionTweetIdSaved
  // save [newLast]
}
