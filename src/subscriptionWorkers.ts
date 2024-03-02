import { Worker } from 'bullmq'
import { Database } from './db'
import { CreateOp, DeleteOp } from './util/subscription'
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post'
import path from 'path'
import { config } from './config'

export class SubscriptionWorkers {
  deletesWorker: Worker<DeleteOp>
  createsWorker: Worker<CreateOp<PostRecord>>

  constructor(
    public db: Database,
    workerOpts = {
      autorun: false,
      connection: {
        host: config.redis.host,
        port: config.redis.port,
      },
      removeOnComplete: {
        age: 3600, // keep up to 1 hour
        count: 1000, // keep up to 1000 jobs
      },
      removeOnFail: {
        age: 24 * 3600, // keep up to 24 hours
      },
    },
  ) {
    this.deletesWorker = new Worker(
      'deletes',
      path.join(__dirname, './workers/deletes.js'),
      workerOpts,
    )
    this.createsWorker = new Worker(
      'creates',
      path.join(__dirname, './workers/creates.js'),
      workerOpts,
    )
  }

  async initialize() {
    wireWorkers(this.deletesWorker)
    wireWorkers(this.createsWorker)
    this.deletesWorker.run()
    this.createsWorker.run()
  }
}

const wireWorkers = (worker: Worker) => {
  // worker.on('completed', (job) => {
  //   console.log(`${job.id} has completed!`)
  // })
  worker.on('failed', (job, err) => {
    console.log(`${job?.id} has failed with ${JSON.stringify(err)}`)
  })

  // process.on('SIGINT', () => gracefulShutdown('SIGINT', worker))
  // process.on('SIGTERM', () => gracefulShutdown('SIGTERM', worker))
}

const gracefulShutdown = async (signal: string, worker: Worker) => {
  console.log(`Received ${signal}, closing server...`)
  await worker.close()
}
