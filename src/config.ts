import { BlockedActorError } from '@atproto/api/dist/client/types/app/bsky/feed/getAuthorFeed'
import { Database } from './db'
import { DidResolver } from '@atproto/identity'

export type AppContext = {
  db: Database
  didResolver: DidResolver
  cfg: Config
}

export type Config = {
  port: number
  listenhost: string
  hostname: string
  sqliteLocation: string
  subscriptionEndpoint: string
  serviceDid: string
  publisherDid: string
  subscriptionReconnectDelay: number
  redis: {
    host: string
    port: number
  }
}

const maybeStr = (val?: string) => {
  if (!val) return undefined
  return val
}

const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}

const hostname = maybeStr(process.env.FEEDGEN_HOSTNAME) ?? 'example.com'
const serviceDid =
  maybeStr(process.env.FEEDGEN_SERVICE_DID) ?? `did:web:${hostname}`

export const config = {
  port: maybeInt(process.env.FEEDGEN_PORT) ?? 3000,
  listenhost: maybeStr(process.env.FEEDGEN_LISTENHOST) ?? 'localhost',
  sqliteLocation: maybeStr(process.env.FEEDGEN_SQLITE_LOCATION) ?? ':memory:',
  subscriptionEndpoint:
    maybeStr(process.env.FEEDGEN_SUBSCRIPTION_ENDPOINT) ?? 'wss://bsky.network',
  publisherDid:
    maybeStr(process.env.FEEDGEN_PUBLISHER_DID) ?? 'did:example:alice',
  subscriptionReconnectDelay:
    maybeInt(process.env.FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,
  hostname,
  serviceDid,
  redis: {
    host: maybeStr(process.env.FEEDGEN_REDIS_HOST) ?? 'localhost',
    port: maybeInt(process.env.FEEDGEN_REDIS_PORT) ?? 6379,
  },
}
