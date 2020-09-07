const fs = require('fs').promises
const path = require('path')
const vm = require('vm')
const Module = require('module')
const CopyPlugin = require('copy-webpack-plugin')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')

const slsw = require('serverless-webpack')
const glob = require('glob')
const decomment = require('decomment')

/**
 * 프로젝트의 패키지 JSON 입니다.
 */
const originPackages = require(`${process.cwd()}/package.json`)

/**
 * 람다 모듈 설정입니다.
 */
const lambdaModules = require(`${process.cwd()}/lambda/lambda-module.json`)

/**
 * 로컬용 빌드인지 참 거짓 값이 담깁니다.
 */
const isLocal = slsw.lib.webpack.isLocal

/**
 * 웹팩 경로가 명시됩니다.
 */
const webpackPath = path.join(process.cwd(), '/.webpack')

/**
 * JS 문법이 맞는지를 검증합니다.
 * (주석 삭제 도중 파일이 초기화되는 오류를 방지하기 위한 검증입니다.)
 * @param {*} source
 * @param {*} filename
 */
const checkScriptSyntax = (source, filename) => {
  source = Module.wrap(source)
  new vm.Script(source, { displayErrors: false, filename: filename })
}

/**
 * 폴더 주소와 glob 패턴을 같이 받아서
 * 해당 폴더 아래의 일치하는 파일들의 주석들을 삭제합니다.
 * @param {*} pattern
 */
const removeComments = async pattern => {
  try {
    /**
     * 확인 된 처리할 파일들의 경로 목록
     */
    const filePaths = glob.sync(pattern)
    console.log(`👀 총 ${filePaths.length} 개 파일의 주석 삭제를 시작합니다.`)

    /**
     * 처리한 파일 갯수
     */
    let fileCount = 0

    /**
     * 삭제과정을 프로미스로 감싸서
     * 동기적으로 실행이 될 수 있게 합니다.
     * @param {*} filePath
     */
    const removePromise = async filePath => {
      console.log(`👀 ${fileCount}/${filePaths.length} 처리 중 ${filePath}`)
      /**
       * 주석 삭제 전 코드
       */
      const beforeCode = String(await fs.readFile(filePath))
      /**
       * 주석 삭제 후 코드
       */
      const afterCode = decomment(beforeCode)

      // 주석 삭제 도중 너무 최신 문법이 쓰인 파일의 경우
      // 코드가 초기화되는 문제가 있어서
      // 코드가 정상적인 JS 문법인지를 검증합니다.
      try {
        checkScriptSyntax(afterCode)
      } catch (e) {
        console.log(
          `👀 ${++fileCount}/${filePaths.length} 처리실패 ${filePath}`
        )
        return
      }

      // 정상적인 경우에만 파일로 저장합니다.
      await fs.writeFile(filePath, afterCode)
      console.log(`👀 ${++fileCount}/${filePaths.length} 처리완료 ${filePath}`)
    }

    // 모든 폴더 경로의 주석을 삭제합니다.
    for (let filePath of filePaths) {
      try {
        await removePromise(filePath)
      } catch (e) {}
    }

    console.log(
      `👀 총 ${filePaths.length} 개 파일의 주석 삭제를 완료 하였습니다.`
    )
  } catch (e) {
    console.log(e)
  }
}

/**
 * 웹팩 빌드가 모두 완료된 후 실행되는 함수 입니다.
 */
const postBuild = async () => {
  console.log('👀 포스트컴파일 테스트 작동')

  // 복제된 노드 모듈 폴더 안 파일들의 주석들을 삭제합니다.
  await removeComments(
    `${webpackPath}/service/node_modules/**/*.?(js|mjs|cjs|ejs|jsx|ts|tsx)`
  )

  // 복제된 넉스트용 client 폴더 안 파일들의 주석들을 삭제합니다.
  await removeComments(
    `${webpackPath}/service/client/**/*.?(js|mjs|cjs|ejs|jsx|ts|tsx)`
  )

  // 복제된 넉스트용 .nuxt 폴더 안 파일들의 주석들을 삭제합니다.
  await removeComments(
    `${webpackPath}/service/.nuxt/**/*.?(js|mjs|cjs|ejs|jsx|ts|tsx)`
  )

  console.log('👀 포스트컴파일 테스트 완료')
}

/**
 * 웹팩 설정이 명시됩니다.
 */
const config = {
  // 로컬 테스트 용인 경우에만 개발 모드를 활성화합니다.
  mode: isLocal ? 'development' : 'production',

  // 서버리스 함수의 소스코드 경로가 지정됩니다.
  entry: slsw.lib.entries,

  // 웹팩 번들에 내장시키지 않을 노드 모듈 명이 담깁니다.
  // (아래에서 동적으로 추가하기 위해 배열 만을 선언해놓습니다.)
  externals: [],

  // 번들링에서 해석할 소스코드 확장자를 명시합니다.
  resolve: {
    extensions: ['.js', '.json', '.ts']
  },

  // 내보낼 번들의 설정을 명시합니다.
  output: {
    // commonjs2 형태를 사용합니다.
    libraryTarget: 'commonjs2',

    // 웹팩 폴더 안에 담습니다.
    path: webpackPath,

    // 파일 주소를 사용합니다.
    filename: '[name].js'
  },

  // 노드용으로 번들 파일을 구성합니다.
  target: 'node',

  // 웹팩에서 사용할 모듈들을 명시합니다.
  module: {
    rules: [
      {
        test: /\.(ts|js)?$/,
        exclude: /node_modules/,
        use: [
          // 웹팩 빌드 시 캐싱을 사용합니다.
          {
            loader: 'cache-loader',
            options: {
              cacheDirectory: path.resolve('.webpackCache')
            }
          },
          // 웹팩 빌드 시 바벨 변환을 적용합니다.
          {
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-env',
                  {
                    targets: {
                      // ESModules 를 꼭 명시해주어야합니다.
                      esmodules: true,
                      node: '12'
                    }
                  }
                ],
                // 타입스크립트 변환도 사용합니다.
                ['@babel/preset-typescript']
              ]
            }
          }
        ]
      },

      // 트리 셰이킹을 해제합니다.
      {
        test: /\.(ts|js)?$/,
        sideEffects: true
      }
    ]
  },
  plugins: [
    // 타입스크립트 체킹을 적용합니다.
    new ForkTsCheckerWebpackPlugin(),

    // 웹팩 빌드 이후 폴더를 복사합니다.
    new CopyPlugin({
      patterns: [
        // .nuxt 폴더를 복사해넣습니다.
        {
          from: '.nuxt',
          to: '.nuxt'
        },
        // client 폴더를 복사해넣습니다.
        {
          from: 'client',
          to: 'client',
          globOptions: {
            // md 파일은 복사하지 않습니다.
            ignore: ['**/*.md']
          }
        }
      ]
    }),
    {
      // 웹팩 플러그인을 임의로 하나 작성합니다.
      apply: compiler => {
        if (compiler.hooks)
          compiler.hooks.done.tapAsync(
            // 임의로 존재하지 않을 것 같은 플러그인 명을 명시합니다. (충돌방지)
            'lambda-lambda-nuxt-a113-plugin',

            // 웹팩 빌드가 끝난 후를 후킹합니다.
            async (compilation, callback) => {
              // 포스트 빌드를 실행합니다.
              await postBuild()

              // 후킹 처리가 끝났음을 알립니다.
              callback()
            }
          )
      }
    }
  ],

  // 웹팩 최적화 설정이 담깁니다.
  optimization: {
    // 미니파이를 적용합니다.
    minimize: true,
    // 노드 env 설정들을 번들링하지 않습니다.
    nodeEnv: false
  }
}

/**
 * 사용하는 서브 모듈을 모두 찾아 목록으로 반환합니다.
 * @param {*} modules
 */
const findAllSubModule = modules => {
  let subModules = [...modules]
  try {
    subModules = [...subModules, ...Object.keys(originPackages.dependencies)]
  } catch (e) {}
  let cantFindModules = []
  let beforeModuleCount = undefined
  while (true) {
    for (const module of subModules) {
      const targetPath = `${process.cwd()}/node_modules/${module}`
      try {
        const dependencies = require(`${targetPath}/package.json`).dependencies
        try {
          for (let subModuleName of Object.keys(dependencies)) {
            if (subModules.indexOf(subModuleName) == -1)
              subModules.push(subModuleName)
          }
        } catch (e) {}
      } catch (e) {
        if (cantFindModules.indexOf(module) == -1) cantFindModules.push(module)
      }
    }
    if (beforeModuleCount == subModules.length) break
    beforeModuleCount = subModules.length
  }

  for (let cantFindModule of cantFindModules) {
    let index = subModules.indexOf(cantFindModule)
    if (index != -1) subModules.splice(index, 1)
  }
  return subModules
}

// 웹팩에 번들링 되지 않아야 할
// 모듈 목록을 구성해서 번들 용량을 최소화합니다.
const includeModule = findAllSubModule(lambdaModules.include)
config.externals = [
  ...config.externals,
  ...lambdaModules.exclude,
  ...includeModule
]

// 반드시 웹팩에 번들링 추가해넣어야 할
// 모듈 목록을 구성해서 번들 오류를 방지합니다.
let patterns = []
for (let includeItem of includeModule) {
  let includePath = `node_modules/${includeItem}`
  patterns.push({
    from: includePath,
    to: includePath,
    globOptions: {
      ignore: lambdaModules.ignore
    }
  })
}
config.plugins = [
  ...config.plugins,
  new CopyPlugin({
    patterns
  })
]

// 설정들을 내보냅니다.
module.exports = config
