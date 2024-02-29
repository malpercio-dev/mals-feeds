import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { Record } from '../lexicon/types/app/bsky/feed/post'
import { CreateOp } from '../util/subscription'
import { Post } from '../db/schema'
import { isSelfLabels } from '../lexicon/types/com/atproto/label/defs'

// max 15 chars
export const shortname = 'alphabeticwords'

export const subscriptionFilter = (create: CreateOp<Record>): boolean => {
  const text = create.record.text

  // only top-level posts
  if (create.record.reply) {
    // console.log("not a top-level post")
    return false
  }

  // filter out anything labelled as nsfw etc
  if (isSelfLabels(create.record.labels)) {
    if (create.record.labels.values.some(v => v.val === 'porn' || v.val === 'sexual' || v.val === 'nudity')) {
      // console.log("contains nsfw labels")
      return false
    }
  }

  // filter out nsfw etc hashtags
  if (text.includes("#NSFW") || text.includes("#nsfw") || text.includes("#BDSM") || text.includes("#bdsm") || text.includes("#KINK") || text.includes("#kink")) {
    // console.log("contains nsfw hashtags")
    return false
  }

  // only allow ASCII for simplicity
  if (!isASCII(text, false)) {
    // console.log("contains non-ASCII characters")
    return false
  }

  const words = text.toLowerCase().split(" ")

  // we only want sentences, not single words
  if (words.length <= 1) {
    // console.log("single word")
    return false
  }

  // extract the first letter of each word, and lowercase for comparison
  const firstLetters = words.map(word => word.substring(0, 1).toLowerCase())

  // ignore any posts starting with a symbol
  if (!isAlphaNumeric(firstLetters[0])) {
    // console.log("first word not alphanumeric")
    return false
  }

  // ignore any posts where all words start with a symbol
  if (firstLetters.every(fl => !isAlphaNumeric(fl))) {
    // console.log("all words not alphanumeric")
    return false
  }

  // prepare another array with the letters sorted
  const sortedFirstLetters = [...firstLetters].sort()

  // check to see if all words are in alphabetical order
  for (var i = 0; i < firstLetters.length; ++i) {
    // console.log("words not in alphabetical order")
    if (firstLetters[i] !== sortedFirstLetters[i]) return false
  }

  // Huzzah! It's a match.

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
  return (extended ? /^[\x00-\xFF]*$/ : /^[\x00-\x7F]*$/).test(str)
}

function isAlphaNumeric(str: string): boolean {
  var code: number, i: number, len: number

  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i)
    if (!(code > 47 && code < 58) && // numeric (0-9)
      !(code > 64 && code < 91) && // upper alpha (A-Z)
      !(code > 96 && code < 123)) { // lower alpha (a-z)
      return false
    }
  }
  return true
}
