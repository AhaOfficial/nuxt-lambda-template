import fs from 'fs'
// @ts-ignore
import config from '../nuxt.config.ts'
import postbuild from '../postbuild'

// * 프로젝트에서 사용하는 모듈을 트랜스파일링 합니다.
config.build.transpile = postbuild()

// * 타입스크립트 설정을 읽어서 JSON 문자열로 변환합니다.
const configString = JSON.stringify(config, null, 2)

// * 동적 설정들을 주입합니다.
const injectModule = `
const webpack = require('webpack')
const config = ${configString}

const plugins = []
plugins.push(new webpack.IgnorePlugin(new RegExp('/vuex/')))
config.build.plugins = plugins

module.exports = config`

// * JS 설정 파일로 내보냅니다.
fs.writeFileSync(`${process.cwd()}/nuxt.config.js`, injectModule)
