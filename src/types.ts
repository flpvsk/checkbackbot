export type TweetId = string
export type UserId = string

export interface Storage {
  getLastJobData<T>(jobName: string): Promise<T | undefined>
}

