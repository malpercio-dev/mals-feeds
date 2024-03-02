import http from 'http'
import events from 'events'
import express from 'express'
import { DidResolver, MemoryCache } from '@atproto/identity'
import { createServer } from './lexicon'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import { createDb, Database, migrateToLatest } from './db'
import { FirehoseSubscription } from './subscription'
import { AppContext, Config } from './config'
import wellKnown from './well-known'
import { SubscriptionWorkers } from './subscriptionWorkers'
import { ExpressAdapter } from '@bull-board/express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { Queue } from 'bullmq'

export class FeedGenerator {
  public app: express.Application
  public server?: http.Server
  public db: Database
  public firehose: FirehoseSubscription
  public cfg: Config
  public subscriptionWorkers: SubscriptionWorkers

  constructor(
    app: express.Application,
    db: Database,
    firehose: FirehoseSubscription,
    cfg: Config,
    subscriptionWorkers: SubscriptionWorkers,
  ) {
    this.app = app
    this.db = db
    this.firehose = firehose
    this.cfg = cfg
    this.subscriptionWorkers = subscriptionWorkers
  }

  static create(cfg: Config) {
    const app = express()
    const db = createDb(cfg.sqliteLocation)

    const queueOpts = {
      autorun: true,
      connection: {
        host: cfg.redis.host,
        port: cfg.redis.port,
      },
      removeOnComplete: {
        age: 3600, // keep up to 1 hour
        count: 1000, // keep up to 1000 jobs
      },
      removeOnFail: {
        age: 24 * 3600, // keep up to 24 hours
      },
    }

    const deletesQueue = new Queue('deletes', queueOpts)
    const createsQueue = new Queue('creates', queueOpts)
    const firehose = new FirehoseSubscription(
      db,
      cfg.subscriptionEndpoint,
      deletesQueue,
      createsQueue,
    )

    const didCache = new MemoryCache()
    const didResolver = new DidResolver({
      plcUrl: 'https://plc.directory',
      didCache,
    })

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024, // 5mb
      },
    })
    const ctx: AppContext = {
      db,
      didResolver,
      cfg,
    }
    feedGeneration(server, ctx)
    describeGenerator(server, ctx)
    app.use(server.xrpc.router)
    app.use(wellKnown(ctx))

    const serverAdapter = new ExpressAdapter()
    serverAdapter.setBasePath('/admin/queues')

    createBullBoard({
      queues: [
        new BullMQAdapter(deletesQueue, { readOnlyMode: true }),
        new BullMQAdapter(createsQueue, { readOnlyMode: true }),
      ],
      serverAdapter: serverAdapter,
      options: {
        uiConfig: {
          boardTitle: "Mal's Feeds",
        },
      },
    })

    app.use('/admin/queues', serverAdapter.getRouter())

    const subscriptionWorkers = new SubscriptionWorkers(db)

    return new FeedGenerator(app, db, firehose, cfg, subscriptionWorkers)
  }

  async start(): Promise<http.Server> {
    await migrateToLatest(this.db)
    this.firehose.run(this.cfg.subscriptionReconnectDelay)
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')
    await this.subscriptionWorkers.initialize()
    return this.server
  }
}

export default FeedGenerator
