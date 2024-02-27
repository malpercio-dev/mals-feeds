import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { Record } from '../lexicon/types/app/bsky/feed/post'
import { CreateOp } from '../util/subscription'
import { Post } from '../db/schema'

// max 15 chars
export const shortname = 'alphabeticwords'

export const subscriptionFilter = (create: CreateOp<Record>): boolean => {
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
  console.log(text)
  return true
}

export const mapToPost = (create: CreateOp<Record>): Post => {
  return {
    uri: create.uri,
    cid: create.cid,
    feed: shortname,
    replyParent: create.record?.reply?.parent.uri ?? null,
    replyRoot: create.record?.reply?.root.uri ?? null,
    indexedAt: new Date().toISOString(),
  }
}

export const handler = async (ctx: AppContext, params: QueryParams) => {
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('feed', '=', shortname)
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit)

  if (params.cursor) {
    const [indexedAt, cid] = params.cursor.split('::')
    if (!indexedAt || !cid) {
      throw new InvalidRequestError('malformed cursor')
    }
    const timeStr = new Date(parseInt(indexedAt, 10)).toISOString()
    builder = builder
      .where('post.indexedAt', '<', timeStr)
      .orWhere((qb) => qb.where('post.indexedAt', '=', timeStr))
      .where('post.cid', '<', cid)
  }
  const res = await builder.execute()

  const feed = res.map((row) => ({
    post: row.uri,
  }))

  let cursor: string | undefined
  const last = res.at(-1)
  if (last) {
    cursor = `${new Date(last.indexedAt).getTime()}::${last.cid}`
  }

  return {
    cursor,
    feed,
  }
}

function isASCII(str: string, extended: boolean): boolean {
  return (extended ? /^[\x00-\xFF]*$/ : /^[\x00-\x7F]*$/).test(str);
}
