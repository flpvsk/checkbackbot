export type TweetId = string;
export type UserId = string;

export enum OutgoingTweetType {
    confirmation = 'confirmation',
    repost = 'repost',
}

export interface MentionTweet {
    tweet: GetMentionTweetResult;
    inReplyTo: GetMentionTweetResult;
    tweetAuthor: TwitterUser;
    inReplyToAuthor: TwitterUser;
}

export interface GetMentionTweetResult {
    id: TweetId;
    author_id: UserId;
    created_at: string;
    in_reply_to_user_id: UserId;
    referenced_tweets?: ReferencedTweetResult[];
    text: string;
}

export interface PostedTweetInfo {
    id: TweetId;
    created_at: string;
}

export interface TwitterUser {
    id: UserId;
    name: string;
    username: string;
}

// "replied_to"
interface ReferencedTweetResult {
    id: TweetId;
    type: string;
}

interface RepostMeta {
    toPostOn: Date;
}

export interface PendingTweet {
    id: string;
    tweetData: MentionTweet;
    metaData: RepostMeta;
    tweetType: OutgoingTweetType;
}

interface ListPendingQuery {
    toPostBefore: Date;
}

export interface Storage {
    getLastJobData<T>(jobName: string): Promise<T | undefined>;
    insertJobData<T>(jobName: string, data: T): Promise<void>;
    insertIncomingTweet(tweetInfo: MentionTweet, meta: RepostMeta): Promise<void>;
    insertRepost(tweetInfo: MentionTweet, meta: RepostMeta): Promise<void>;
    insertConfirmation(tweetInfo: MentionTweet, meta: RepostMeta): Promise<void>;
    listPendingTweets({ toPostBefore }: ListPendingQuery): Promise<PendingTweet[]>;
    markPendingTweetPosted(id: string, info: PostedTweetInfo): Promise<void>;
}
