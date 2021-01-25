import { Storage, OutgoingTweetType, PostedTweetInfo, PendingTweet } from './types';
import * as sqlite3 from 'sqlite3';
sqlite3.verbose();

const V = {
    incoming: 1,
    outgoing: 1,
    jobs: 1,
};

let db: sqlite3.Database | undefined;

async function getDb(): Promise<sqlite3.Database> {
    if (!!db) return db;

    db = new sqlite3.Database(process.env.SQLITE_DB ?? ':memory:');
    db.exec(`
CREATE TABLE IF NOT EXISTS incoming_tweets_v${V.incoming} (
  id TEXT PRIMARY KEY NOT NULL,
  tweetData TEXT NOT NULL,
  metaData TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outgoing_tweets_v${V.outgoing} (
  id TEXT PRIMARY KEY NOT NULL,
  triggerTweetId TEXT NOT NULL,
  tweetType TEXT,
  toPostOn TEXT,
  postedOn TEXT,
  postedId TEXT
);

CREATE TABLE IF NOT EXISTS jobs_v${V.jobs} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jobName TEXT NOT NULL,
  data TEXT NOT NULL
);
`);

    return db;
}

export const liteStorage: Storage = {
    async getLastJobData<T>(jobName: string): Promise<T | undefined> {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            db.get(
                `select max(id) as id, data from jobs_v${V.jobs} where jobName = $jobName`,
                { $jobName: jobName },
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (!row.id) {
                        resolve(undefined);
                        return;
                    }
                    resolve(JSON.parse(row.data) as T);
                },
            );
        });
    },

    async insertJobData<T>(jobName: string, data: T): Promise<void> {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            db.run(
                `insert into jobs_v${V.jobs} (jobName, data) values ($jobName, $data)`,
                { $jobName: jobName, $data: JSON.stringify(data) },
                (err) => {
                    if (err) return reject(err);
                    resolve();
                },
            );
        });
    },

    async insertIncomingTweet(tweetInfo, meta) {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            db.run(
                `insert or ignore into incoming_tweets_v${V.incoming} ` +
                    `  (id, tweetData, metaData)` +
                    `values ` +
                    `  ($id, $tweetData, $metaData);`,
                {
                    $id: `${tweetInfo.tweet.id}`,
                    $tweetData: JSON.stringify(tweetInfo),
                    $metaData: JSON.stringify(meta),
                },
                (err) => {
                    if (err) return reject(err);
                    resolve();
                },
            );
        });
    },

    async insertRepost(tweetInfo, { toPostOn }): Promise<void> {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            db.run(
                `insert or ignore into outgoing_tweets_v${V.outgoing} ` +
                    `  (id, triggerTweetId, tweetType, toPostOn, postedOn)` +
                    `values ` +
                    `  ($id, $triggerTweetId, $tweetType, $toPostOn, $postedOn);`,
                {
                    $id: `${tweetInfo.tweet.id}-repost`,
                    $triggerTweetId: tweetInfo.tweet.id,
                    $tweetType: OutgoingTweetType.repost,
                    $toPostOn: toPostOn.toISOString(),
                    $postedOn: null,
                },
                (err) => {
                    if (err) return reject(err);
                    resolve();
                },
            );
        });
    },

    async insertConfirmation(tweetInfo): Promise<void> {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            db.run(
                `insert or ignore into outgoing_tweets_v${V.outgoing} ` +
                    `  (id, triggerTweetId, tweetType, toPostOn, postedOn)` +
                    `values ` +
                    `  ($id, $triggerTweetId, $tweetType, $toPostOn, $postedOn);`,
                {
                    $id: `${tweetInfo.tweet.id}-confirmation`,
                    $triggerTweetId: tweetInfo.tweet.id,
                    $tweetType: 'confirmation',
                    $toPostOn: new Date().toISOString(),
                    $postedOn: null,
                },
                (err) => {
                    if (err) return reject(err);
                    resolve();
                },
            );
        });
    },

    async listPendingTweets({ toPostBefore }): Promise<PendingTweet[]> {
        const db = await getDb();
        /*
        id: string
        tweetData: MentionTweet
        metaData: RepostMeta
        tweetType: OutgoingTweetType
    */

        return new Promise((resolve, reject) => {
            db.all(
                `select o.id, i.tweetData, i.metaData, o.tweetType ` +
                    `from outgoing_tweets_v${V.outgoing} o ` +
                    `inner join incoming_tweets_v${V.incoming} i ` +
                    `on i.id = o.triggerTweetId ` +
                    `where ` +
                    `    o.postedId is null ` +
                    `and o.toPostOn < $toPostBefore;`,
                { $toPostBefore: toPostBefore.toISOString() },
                (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    console.log(rows);

                    if (!rows || !rows.length) {
                        resolve([]);
                        return;
                    }

                    const entries: PendingTweet[] = rows.map((r) => ({
                        ...r,
                        tweetData: JSON.parse(r.tweetData),
                        metaData: JSON.parse(r.metaData),
                    }));
                    resolve(entries);
                },
            );
        });
    },

    async markPendingTweetPosted(id: string, info: PostedTweetInfo): Promise<void> {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            db.run(
                `update outgoing_tweets_v${V.outgoing} ` +
                    `set postedId = $postedId, postedOn = $postedOn ` +
                    `where id = $id`,
                { $id: id, $postedId: String(info.id), $postedOn: info.created_at },
                (err) => {
                    if (err) return reject(err);
                    resolve();
                },
            );
        });
    },
};
