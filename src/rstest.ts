// import * as B from "bun:test"
import * as R from '@rstest/core';
import { describe as rstestDescribe } from '@rstest/core';


// export type TestAPI = B.Test
export type TestAPI = typeof R.it

// Currently test options seep to be timeout only.
export type TestOptions = number

// We reexport the type of the test function from bun:test
// as extending it did not work properly..
export type TestFunction = (
  label: string,
  fn: (() => void | Promise<void>),
  options?: TestOptions
) => void

declare type MaybePromise<T> = T | Promise<T>;

export declare interface TestEachFn {
    <T extends readonly [unknown, ...Array<unknown>]>(cases: T): (description: string, fn: (...args: [...T]) => MaybePromise<void>, timeout?: number) => void;
}
export type SuiteCollector = any

export { it, beforeAll, afterAll, beforeEach, afterEach, expect } from '@rstest/core';


// We patch the describe function types, as they are faulty in the core package.
// Cases here should be T and not array of T, as T extends [unknown, ...Array<unknown>] already.
export declare interface DescribeEachFn {
    <T extends readonly [unknown, ...Array<unknown>]>(cases: T): (description: string, fn: (...args: [...T]) => MaybePromise<void>) => void;
}
declare type DescribeFnRstest = (description: string, fn?: () => void) => void;
export type DescribeFn = DescribeFnRstest & Omit<typeof rstestDescribe, "each"> & { each: DescribeEachFn }
export const describe: DescribeFn = rstestDescribe
