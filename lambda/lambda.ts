import serverless from 'serverless-http'
import { Nuxt } from 'nuxt-start'
import config from '../nuxt.config.js'

/**
 * Nuxt 인스턴스를 생성합니다.
 */
const nuxt = new Nuxt({ ...config, dev: false })

/**
 * 서버리스 함수에서 요청과 응답 객체를 받아서
 * 넉스트 서버에 이를 바인딩 합니다.
 */
const nuxtHandler = (req, res) => {
  nuxt.ready().then(() => {
    nuxt.server.app(req, res)
  })
}

/**
 * serverless-http 를 통해서
 * http 요청 처리를 구성합니다.
 */
export const handler = serverless(nuxtHandler, {
  // 요청 & 응답 시 허용할 포멧 목록입니다.
  binary: [
    'application/javascript',
    'application/json',
    'application/manifest+json',
    'application/octet-stream',
    'application/xml',
    'font/eot',
    'font/opentype',
    'font/otf',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/svg+xml',
    'image/x-icon',
    'text/comma-separated-values',
    'text/css',
    'text/html',
    'text/javascript',
    'text/plain',
    'text/text',
    'text/xml',
    'application/rss+xml',
    'application/atom+xml'
  ]
})
