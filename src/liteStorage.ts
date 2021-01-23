import { Storage } from "./types"
import * as sqlite3 from "sqlite3"
sqlite3.verbose()

const V = {
  tweets: 1,
  jobs: 1
}

let db: sqlite3.Database | undefined;

async function getDb(): Promise<sqlite3.Database> {
  if (!!db) return db

  db = new sqlite3.Database(process.env.SQLITE_DB ?? ":memory:")
  db.exec(`
CREATE TABLE IF NOT EXISTS tweets_v${V.tweets} (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  processingStage TEXT NOT NULL,
  processingData TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs_v${V.jobs} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jobName TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idxTweetsProcessingStage_v${V.tweets}
ON tweets_v${V.tweets} (processingStage);
`)

  return db
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
            reject(err)
            return
          }
          if (!row.id) {
            resolve(undefined)
            return
          }
          resolve(JSON.parse(row.data) as T)
        }
      )
    })
  }
}
