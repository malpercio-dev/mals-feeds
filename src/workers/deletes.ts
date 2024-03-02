import { SandboxedJob } from 'bullmq'
import { DeleteOp } from '../util/subscription'
import { createDb } from '../db'
import { config } from '../config'

const db = createDb(config.sqliteLocation)

module.exports = async (job: SandboxedJob<DeleteOp>) => {
  await db.deleteFrom('post').where('uri', 'in', [job.data.uri]).execute()
}
