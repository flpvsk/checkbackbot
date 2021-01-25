import { OutgoingTweetType, TweetId, UserId } from './types'
import { storage } from './storage'
import * as twitter from './twitterWrapper'
import { formatDistance } from 'date-fns'
export const JOB_NAME = 'postTweets'

export async function run(): Promise<void> {
  const accessKey = process.env.TW_ACCESS_TOKEN
  const accessSecret = process.env.TW_ACCESS_TOKEN_SECRET
  const consumerKey = process.env.TW_API_KEY
  const consumerSecret = process.env.TW_API_SECRET_KEY

  if (
    !consumerKey ||
    !consumerSecret ||
    !accessKey ||
    !accessSecret
  ) {
    console.warn('[scrape] auth credentials missing, aborting')
    return
  }
  const twitterV1Auth = {
    consumerKey,
    consumerSecret,
    accessKey,
    accessSecret,
  }

  const token = process.env.TW_BEARER_TOKEN

  if (!token) {
    console.warn('[scrape] TW_BEARER_TOKEN not set, aborting')
    return
  }

  const botUserId = process.env.TW_BOT_USER_ID
  if (!botUserId) {
    console.warn('[scrape] TW_BOT_USER_ID not set, aborting')
    return
  }

  const data = await storage.listPendingTweets({
    toPostBefore: new Date(),
  })
  const userIds: Set<UserId> = new Set([botUserId])
  const userIdsByTweetId: Map<TweetId, UserId[]> = new Map()

  if (!data.length) {
    console.log('[post] no tweets to post')
    return
  }

  for (const entry of data) {
    const tweetUsers = Array.from(
      new Set([
        entry.tweetData.inReplyToAuthor.id,
        entry.tweetData.tweetAuthor.id,
      ]),
    )

    for (const uId of tweetUsers) {
      userIds.add(uId)
    }

    userIdsByTweetId.set(entry.tweetData.tweet.id, [
      entry.tweetData.tweetAuthor.id,
    ])
  }

  const usersMap = await twitter.getUsersByIds({
    userIds: Array.from(userIds),
    token,
  })

  let repostedN = 0
  let confirmedN = 0
  for (const entry of data) {
    const quoteTweetId = entry.tweetData.inReplyTo.id
    const quoteTweetUsername =
      usersMap.get(entry.tweetData.inReplyToAuthor.id)?.username ??
      'twitter'
    const botUserUsername =
      usersMap.get(entry.tweetData.tweet.author_id)?.username ??
      'twitter'
    const botUsername = usersMap.get(botUserId)?.username ?? 'twitter'

    if (entry.tweetType === OutgoingTweetType.repost) {
      const mentionUsernames =
        userIdsByTweetId
          .get(entry.tweetData.tweet.id)
          ?.map((uId) => usersMap.get(uId)?.username ?? '') ?? []

      if (!mentionUsernames) continue

      const distance = formatDistance(
        Date.parse(entry.tweetData.inReplyTo.created_at),
        new Date(),
      )

      const text = `following up on this tweet ${distance} after it was posted`

      const result = await twitter.quoteTweet(
        {
          mentionUsernames,
          text,
          quoteTweetId,
          quoteTweetUsername,
        },
        twitterV1Auth,
      )

      await storage.markPendingTweetPosted(entry.id, result)

      // send original request tweet
      await twitter.replyToTweet(
        {
          replyToTweetId: String(result.id),
          replyToUsername: botUsername,
          text: `@${botUserUsername}`,
          quoteTweetId: entry.tweetData.tweet.id,
          quoteTweetUsername: botUserUsername,
        },
        twitterV1Auth,
      )

      repostedN++
    }

    if (entry.tweetType === OutgoingTweetType.confirmation) {
      const text = `ok will follow up on the original tweet on ${entry.metaData.toPostOn}`

      const result = await twitter.replyToTweet(
        {
          replyToTweetId: entry.tweetData.tweet.id,
          replyToUsername: botUserUsername,
          text,
          quoteTweetId,
          quoteTweetUsername,
        },
        twitterV1Auth,
      )

      await storage.markPendingTweetPosted(entry.id, result)
      confirmedN++
    }
  }

  console.log(`[post] ${confirmedN} tweet confirmation(s) posted`)
  console.log(`[post] ${repostedN} tweet repost(s) posted`)
}
