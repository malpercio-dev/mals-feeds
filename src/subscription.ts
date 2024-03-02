import { Queue } from 'bullmq'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import {
  CreateOp,
  DeleteOp,
  FirehoseSubscriptionBase,
  getOpsByType,
} from './util/subscription'
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post'
import { Database } from './db'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  constructor(
    public db: Database,
    public service: string,
    public deletionQueue: Queue<DeleteOp>,
    public creationQueue: Queue<CreateOp<PostRecord>>,
  ) {
    super(db, service)
  }
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt).catch((e) => {
      console.error('repo subscription could not handle message', e)
      return undefined
    })

    if (!ops) return

    await Promise.allSettled([
      ...ops.posts.deletes.map((del) => this.deletionQueue.add(del.uri, del)),
      ...ops.posts.creates.map((create) =>
        this.creationQueue.add(create.cid, create),
      ),
    ])
  }
}
