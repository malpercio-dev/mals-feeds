import { SandboxedJob } from 'bullmq'
import { CreateOp } from '../util/subscription'
import { Record as PostRecord } from '../lexicon/types/app/bsky/feed/post'
import { createDb } from '../db'
import { config } from '../config'
import * as alphabeticalWords from '../algos/alphabetical-words'

const db = createDb(config.sqliteLocation)

module.exports = async (job: SandboxedJob<CreateOp<PostRecord>>) => {
  const create = job.data
  if (alphabeticalWords.subscriptionFilter(create)) {
    const postToCreate = alphabeticalWords.mapToPost(create)
    await db
      .insertInto('post')
      .values(postToCreate)
      .onConflict((oc) => oc.doNothing())
      .execute()
  }
}
