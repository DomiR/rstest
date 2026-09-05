/**
 * @since 1.0.0
 */
import type * as Duration from "effect/Duration"
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import type * as FC from "effect/testing/FastCheck"
import * as R from "./rstest.js"
import * as internal from "./internal/internal.js"

/**
 * @since 1.0.0
 */
export * from "./rstest.js"

/**
 * @since 1.0.0
 */
export interface API extends R.TestAPI {}

/**
 * @since 1.0.0
 */
export namespace Rstest {
  /**
   * @since 1.0.0
   */
  export interface TestFunction<A, E, R, TestArgs extends Array<any>> {
    (...args: TestArgs): Effect.Effect<A, E, R>
  }

  /**
   * @since 1.0.0
   */
  export interface Test<R> {
    <A, E>(
      name: string,
      self: TestFunction<A, E, R, [R.TestContext]>,
      timeout?: number | R.TestOptions
    ): void
  }

  /**
   * @since 1.0.0
   */
  export type Arbitraries =
    | Array<Schema.Schema<any> | FC.Arbitrary<any>>
    | { [K in string]: Schema.Schema<any> | FC.Arbitrary<any> }

  /**
   * @since 1.0.0
   */
  export interface Tester<R> extends Rstest.Test<R> {
    skip: Rstest.Test<R>
    skipIf: (condition: unknown) => Rstest.Test<R>
    runIf: (condition: unknown) => Rstest.Test<R>
    only: Rstest.Test<R>
    each: <T>(
      cases: ReadonlyArray<T>
    ) => <A, E>(name: string, self: TestFunction<A, E, R, Array<T>>, timeout?: number | R.TestOptions) => void
    fails: Rstest.Test<R>

    /**
     * @since 1.0.0
     */
    prop: <const Arbs extends Arbitraries, A, E>(
      name: string,
      arbitraries: Arbs,
      self: TestFunction<
        A,
        E,
        R,
        [
          {
            [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T
              : Arbs[K] extends Schema.Schema<infer T> ? T
              : never
          },
          R.TestContext
        ]
      >,
      timeout?:
        | number
        | R.TestOptions & {
          fastCheck?: FC.Parameters<
            {
              [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T : Arbs[K] extends Schema.Schema<infer T> ? T
              : never
            }
          >
        }
    ) => void
  }

  /**
   * @since 1.0.0
   */
  export interface MethodsNonLive<R = never> extends API {
    readonly effect: Rstest.Tester<R | Scope.Scope>
    readonly flakyTest: <A, E, R2>(
      self: Effect.Effect<A, E, R2 | Scope.Scope>,
      timeout?: Duration.Input
    ) => Effect.Effect<A, never, R2>
    readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>, options?: {
      readonly timeout?: Duration.Input
    }) => {
      (f: (it: Rstest.MethodsNonLive<R | R2>) => void): void
      (
        name: string,
        f: (it: Rstest.MethodsNonLive<R | R2>) => void
      ): void
    }

    /**
     * @since 1.0.0
     */
    readonly prop: <const Arbs extends Arbitraries>(
      name: string,
      arbitraries: Arbs,
      self: (
        properties: {
          [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T : Arbs[K] extends Schema.Schema<infer T> ? T
          : never
        },
        ctx: R.TestContext
      ) => void,
      timeout?:
        | number
        | R.TestOptions & {
          fastCheck?: FC.Parameters<
            {
              [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T : Arbs[K] extends Schema.Schema<infer T> ? T
              : never
            }
          >
        }
    ) => void
  }

  /**
   * @since 1.0.0
   */
  export interface Methods<R = never> extends MethodsNonLive<R> {
    readonly live: Rstest.Tester<Scope.Scope | R>
    readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>, options?: {
      readonly memoMap?: Layer.MemoMap
      readonly timeout?: Duration.Input
      readonly excludeTestServices?: boolean
    }) => {
      (f: (it: Rstest.MethodsNonLive<R | R2>) => void): void
      (
        name: string,
        f: (it: Rstest.MethodsNonLive<R | R2>) => void
      ): void
    }
  }
}

/**
 * @since 1.0.0
 */
export const addEqualityTesters: () => void = internal.addEqualityTesters

/**
 * @since 1.0.0
 */
export const effect: Rstest.Tester<Scope.Scope> = internal.effect

/**
 * @since 1.0.0
 */
export const live: Rstest.Tester<Scope.Scope> = internal.live

/**
 * Share a `Layer` between multiple tests, optionally wrapping
 * the tests in a `describe` block if a name is provided.
 *
 * @since 1.0.0
 *
 * ```ts
 * import { expect, layer } from "@domir/rstest"
 * import { Effect, Layer, Context } from "effect"
 *
 * class Foo extends Context.Service<Foo, "foo">()("Foo") {
 *   static Live = Layer.succeed(Foo, "foo")
 * }
 *
 * class Bar extends Context.Service<Bar, "bar">()("Bar") {
 *   static Live = Layer.effect(
 *     Bar,
 *     Effect.map(Effect.service(Foo), () => "bar" as const)
 *   )
 * }
 *
 * layer(Foo.Live)("layer", (it) => {
 *   it.effect("adds context", () =>
 *     Effect.gen(function*() {
 *       const foo = yield* Foo
 *       expect(foo).toEqual("foo")
 *     }))
 *
 *   it.layer(Bar.Live)("nested", (it) => {
 *     it.effect("adds context", () =>
 *       Effect.gen(function*() {
 *         const foo = yield* Foo
 *         const bar = yield* Bar
 *         expect(foo).toEqual("foo")
 *         expect(bar).toEqual("bar")
 *       }))
 *   })
 * })
 * ```
 */
export const layer: <R, E>(
  layer_: Layer.Layer<R, E>,
  options?: {
    readonly memoMap?: Layer.MemoMap
    readonly timeout?: Duration.Input
    readonly excludeTestServices?: boolean
  }
) => {
  (f: (it: Rstest.MethodsNonLive<R>) => void): void
  (name: string, f: (it: Rstest.MethodsNonLive<R>) => void): void
} = internal.layer

/**
 * @since 1.0.0
 */
export const flakyTest: <A, E, R>(
  self: Effect.Effect<A, E, R | Scope.Scope>,
  timeout?: Duration.Input
) => Effect.Effect<A, never, R> = internal.flakyTest

/**
 * @since 1.0.0
 */
export const prop: Rstest.Methods["prop"] = internal.prop

/**
 * @since 1.0.0
 */
export const it: Rstest.Methods = internal.makeMethods(R.it)

/**
 * @since 1.0.0
 */
export const makeMethods: (it: R.TestAPI) => Rstest.Methods = internal.makeMethods

/**
 * @since 1.0.0
 */
export const describeWrapped: (name: string, f: (it: Rstest.Methods) => void) => R.SuiteCollector =
  internal.describeWrapped
