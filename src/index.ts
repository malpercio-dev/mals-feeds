import dotenv from 'dotenv'
import FeedGenerator from './server'
import { config } from './config'

const run = async () => {
  dotenv.config()
  const server = FeedGenerator.create(config)
  await server.start()
  console.log(
    `🤖 running feed generator at http://${server.cfg.listenhost}:${server.cfg.port}`,
  )
}

run()
