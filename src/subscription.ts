import { shortname } from './algos/alphabetical-words';
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

function isASCII(str: string, extended: boolean): boolean {
  return (extended ? /^[\x00-\xFF]*$/ : /^[\x00-\x7F]*$/).test(str);
}

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt).catch(e => {
      console.error('repo subscription could not handle message', e);
      return undefined;
    });

    if (!ops) return;

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        const text = create.record.text

        // only allow ASCII for simplicity
        if (!isASCII(text, true)) return false

        const words = text.toLowerCase().split(" ")

        // we only want sentences, not single words
        if (words.length <= 1) return false

        // check to see if all words are in alphabetical order
        const firstLetters = words.map(word => word.substring(0, 1))
        const sortedFirstLetters = [...firstLetters].sort()
        for (var i = 0; i < firstLetters.length; ++i) {
          if (firstLetters[i] !== sortedFirstLetters[i]) return false
        }
        // This logs the text of every post off the firehose that matches.
        // Just for fun :)
        // Delete before actually using
        console.log(text)
        return true
      })
      .map((create) => {
        // map posts to a db row
        return {
          uri: create.uri,
          cid: create.cid,
          feed: shortname,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
