import { default as Twitter } from 'twitter'
import { default as needle } from 'needle'
import {
  TweetId,
  UserId,
  MentionTweet,
  GetMentionTweetResult,
  TwitterUser,
  PostedTweetInfo,
} from './types'

export interface TwitterAuthArgs {
  token: string
}

export interface GetMentionsQuery extends TwitterAuthArgs {
  userId: UserId
  after?: TweetId
  token: string
}

interface GetMentionsQueryIncludes {
  tweets?: GetMentionTweetResult[]
  users?: TwitterUser[]
}

interface QueryMeta {
  newest_id: TweetId
  next_token: string
  oldest_id: TweetId
  result_count: number
}

interface GetMentionsQueryResult {
  data: GetMentionTweetResult[]
  includes?: GetMentionsQueryIncludes
  meta: QueryMeta
}

export async function* getMentions({
  userId,
  after,
  token,
}: GetMentionsQuery): AsyncGenerator<MentionTweet> {
  let hasNextPage = true
  let nextToken: string | undefined = undefined
  const params: Record<string, string | number> = {
    max_results: 100,
    expansions:
      'author_id,referenced_tweets.id,referenced_tweets.id.author_id',
    'tweet.fields':
      'attachments,author_id,created_at,referenced_tweets,text',
    'user.fields': 'id,name,username',
  }

  if (!!after) {
    params.since_id = after
  }

  while (hasNextPage) {
    const result: GetMentionsQueryResult = await getPage<GetMentionsQueryResult>(
      {
        url: `https://api.twitter.com/2/users/${userId}/mentions`,
        token,
        nextToken,
        params,
      },
    )

    if (!result.data || !result.data.length) {
      hasNextPage = false
      continue
    }

    for (const tweet of result.data) {
      const replyToId = tweet.referenced_tweets?.find(
        (t) => t.type === 'replied_to',
      )?.id

      if (!replyToId) {
        console.warn(
          `${tweet.id} is not in reply to any tweet, skipping`,
        )
        continue
      }
      const replyToTweet = result.includes?.tweets?.find(
        (t) => t.id === replyToId,
      )
      if (!replyToTweet) {
        console.warn(
          `${tweet.id} replyToTweet is not included, skipping`,
        )
        continue
      }

      const tweetAuthor = result.includes?.users?.find(
        (u) => u.id === tweet.author_id,
      )
      if (!tweetAuthor) {
        console.warn(`${tweet.id} author is not included, skipping`)
        continue
      }

      const inReplyToAuthor = result.includes?.users?.find(
        (u) => u.id === replyToTweet.author_id,
      )
      if (!inReplyToAuthor) {
        console.warn(
          `${tweet.id} in reply to author is not included, skipping`,
        )
        continue
      }

      yield {
        tweet,
        inReplyTo: replyToTweet,
        tweetAuthor,
        inReplyToAuthor,
      }
    }

    hasNextPage = !!result.meta.next_token
    nextToken = result.meta.next_token
  }
}

interface MapUserIdsToUsernamesQuery {
  userIds: UserId[]
  token: string
}

export async function getUsersByIds({
  userIds,
  token,
}: MapUserIdsToUsernamesQuery): Promise<Map<UserId, TwitterUser>> {
  const result: Map<UserId, TwitterUser> = new Map()
  if (userIds.length === 0) {
    return result
  }

  const url = 'https://api.twitter.com/2/users'
  const params = {
    ids: userIds.join(','),
  }
  const options = {
    headers: {
      authorization: `Bearer ${token}`,
    },
  }

  const res = await needle('get', url, params, options)
  const data = res?.body?.data
  if (!data) {
    return result
  }

  return (data as TwitterUser[]).reduce((acc, u) => {
    acc.set(u.id, u)
    return acc
  }, result)
}

interface QuoteTweetArgs {
  mentionUsernames: string[]
  text: string
  quoteTweetId: TweetId
  quoteTweetUsername: string
}

export async function quoteTweet(
  {
    mentionUsernames,
    text,
    quoteTweetId,
    quoteTweetUsername,
  }: QuoteTweetArgs,
  auth: TwitterV1Auth,
): Promise<PostedTweetInfo> {
  const twitter = getV1Client(auth)
  const mentionsString = mentionUsernames
    .map((u) => `@${u}`)
    .join(' ')
  const tweet = await twitter.post('statuses/update', {
    status:
      `${mentionsString} ` +
      `${text} ` +
      `https://twitter.com/${quoteTweetUsername}/status/${quoteTweetId}`,
  })

  return {
    id: tweet.id_str,
    created_at: tweet.created_at,
  }
}

interface ReplyToTweetArgs {
  text: string
  replyToTweetId: TweetId
  replyToUsername: string
  quoteTweetId: TweetId
  quoteTweetUsername: string
}

export async function replyToTweet(
  {
    replyToTweetId,
    replyToUsername,
    quoteTweetId,
    quoteTweetUsername,
    text,
  }: ReplyToTweetArgs,
  auth: TwitterV1Auth,
): Promise<PostedTweetInfo> {
  const twitter = getV1Client(auth)
  const tweet = await twitter.post('statuses/update', {
    in_reply_to_status_id: replyToTweetId,
    status:
      `@${replyToUsername} ` +
      `${text} ` +
      `https://twitter.com/${quoteTweetUsername}/status/${quoteTweetId}`,
  })

  return {
    id: tweet.id_str,
    created_at: tweet.created_at,
  }
}

interface GetPageQuery {
  token: string
  url: string
  nextToken?: string
  params: Record<string, string | number>
}

async function getPage<T>({
  params,
  nextToken,
  url,
  token,
}: GetPageQuery): Promise<T> {
  if (!!nextToken) {
    params.pagination_token = nextToken
  }

  const options = {
    headers: {
      authorization: `Bearer ${token}`,
    },
  }

  const res = await needle('get', url, params, options)

  if (res.statusCode !== 200) {
    console.warn(`${res.statusCode}`)
    throw new Error(`[${res.statusCode}] ${res.body}`)
  }

  return res.body as T
}

interface TwitterV1Auth {
  consumerKey: string
  consumerSecret: string
  accessKey: string
  accessSecret: string
}

function getV1Client({
  consumerKey,
  consumerSecret,
  accessKey,
  accessSecret,
}: TwitterV1Auth): Twitter {
  return new Twitter({
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
    access_token_key: accessKey,
    access_token_secret: accessSecret,
  })
}
