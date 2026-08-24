/**
 * 领域引擎：与存储无关的纯函数层。
 * 服务端用它执行与校验一切变更（actor 由会话注入）；
 * 客户端用它的选择器读取缓存状态。
 */
export * from './selectors'
export * from './mutations'
