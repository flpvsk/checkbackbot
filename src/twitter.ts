import { default as needle }from "needle"
import { TweetId, UserId } from "./types"

export interface TwitterAuthArgs {
  token: string
}

export interface GetMentionsQuery extends TwitterAuthArgs {
  userId: UserId
  after?: TweetId
  token: string
}

interface MentionTweet {
  tweet: GetMentionTweetResult
  inReplyTo: GetMentionTweetResult
  tweetAuthor: GetMentionUserResult
  inReplyToAuthor: GetMentionUserResult
}

// "replied_to"
interface ReferencedTweetResult {
  id: TweetId
  type: string
}

interface GetMentionTweetResult {
  id: TweetId
  author_id: UserId
  created_at: string
  in_reply_to_user_id: UserId
  referenced_tweets: ReferencedTweetResult[],
}

interface GetMentionUserResult {
  id: UserId
  name: string
  username: string
}

interface GetMentionsQueryIncludes {
  tweets: GetMentionTweetResult[]
  users: GetMentionUserResult[]
}

interface QueryMeta {
  newest_id: TweetId
  next_token: string
  oldest_id: TweetId
  result_count: number
}

interface GetMentionsQueryResult {
  data: GetMentionTweetResult[]
  includes: GetMentionsQueryIncludes
  meta: QueryMeta
}

export async function* getMentions({
  userId,
  after,
  token
}: GetMentionsQuery): AsyncGenerator<MentionTweet> {
  let hasNextPage = true
  let nextToken: string | undefined = undefined
  const params: Record<string, string | number> = {
    max_results: 100,
    expansions: "author_id,referenced_tweets.id,referenced_tweets.id.author_id",
    "tweet.fields": "attachments,author_id,created_at,referenced_tweets,text",
    "user.fields": "id,name,username"
  }

  if (!!after) {
    params.since_id = after
  }

  while (hasNextPage) {
    const result = await getPage<GetMentionsQueryResult>({
      url: `https://api.twitter.com/2/users/${userId}/mentions`,
      token,
      nextToken,
      params
    })
    yield* result.data.map(tweet => ({
      tweet
    }))
    // hasNextPage = !!result.meta.next_token
    hasNextPage = false
  }
}

interface GetPageQuery {
  token: string,
  url: string,
  nextToken?: string,
  params: Record<string, string | number>
}

async function getPage<T>({ params, nextToken, url, token }: GetPageQuery): Promise<T> {
  if (!!nextToken) {
    params.next_token = nextToken
  }

  const res = await needle('get', url, params, {
    json: true,
    headers: {
      "authorization": `Bearer ${token}`
    }
  })

  if (res.statusCode !== 200) {
    console.log(`${res.statusCode}`)
    throw new Error(`[${res.statusCode}] ${res.body}`)
  }

  return res.body as T
}
