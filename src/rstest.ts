/**
 * @since 1.0.0
 */
import * as R from "@rstest/core"

/**
 * @since 1.0.0
 */
export type TestAPI = typeof R.it

/**
 * @since 1.0.0
 */
export type TestOptions = R.TestOptions

/**
 * @since 1.0.0
 */
export type TestContext = R.TestContext

/**
 * @since 1.0.0
 */
export type TestFunction = (
  label: string,
  fn: (() => void | Promise<void>) | ((context: TestContext) => void | Promise<void>),
  options?: number | TestOptions
) => void

/**
 * @since 1.0.0
 */
export type SuiteCollector = any

/**
 * @since 1.0.0
 */
export const it: TestAPI = R.it

/**
 * @since 1.0.0
 */
export const describe = R.describe

/**
 * `beforeAll`/`afterAll` are re-exported (rather than assigned to a local
 * `const`) because their `@rstest/core` listener types reference an
 * unexported `SuiteContext` type; declaration emit can't name that type from
 * an inferred `const` binding, but a re-export statement doesn't need to.
 *
 * @since 1.0.0
 */
export { afterAll, beforeAll } from "@rstest/core"

/**
 * @since 1.0.0
 */
export const beforeEach = R.beforeEach

/**
 * @since 1.0.0
 */
export const afterEach = R.afterEach

/**
 * @since 1.0.0
 */
export const expect = R.expect
