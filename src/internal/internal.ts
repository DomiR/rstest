/**
 * @since 1.0.0
 */

import * as Cause from 'effect/Cause';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { constVoid, flow, pipe } from 'effect/Function';
import * as Layer from 'effect/Layer';
import * as Schedule from 'effect/Schedule';
import type * as Schema from 'effect/Schema';
import * as Scope from 'effect/Scope';
import * as TestClock from 'effect/testing/TestClock';
import * as TestConsole from 'effect/testing/TestConsole';
import * as Arbitrary from 'effect/Arbitrary';
import * as R from '../rstest.js';
import type * as Rstest from '../index.js';

const runPromise: <E, A>(_: Effect.Effect<A, E, never>, ctx?: R.TestContext | undefined) => Promise<A> =
	Effect.fnUntraced(
		function* <E, A>(effect: Effect.Effect<A, E>, _ctx?: R.TestContext) {
			const exit = yield* Effect.exit(effect);
			if (Exit.isFailure(exit)) {
				const errors = Cause.prettyErrors(exit.cause);
				for (let i = 0; i < errors.length; i++) {
					yield* Effect.logError(errors[i]);
				}
			}
			return yield* exit;
		},
		(effect, _, ctx) => Effect.runPromise(effect, { signal: ctx?.signal })
	);

/** @internal */
const runTest =
	(ctx?: R.TestContext) =>
	<E, A>(effect: Effect.Effect<A, E>) => {
		const promise = runPromise(effect, ctx);
		if (ctx) {
			// rstest stops awaiting the test promise once the signal aborts (timeout or
			// cancellation), so only then add a hook that waits for the finalizers.
			// Registering it unconditionally would change the teardown of every test.
			const onAbort = () => ctx.onTestFinished(() => promise.then(constVoid, constVoid));
			ctx.signal.addEventListener('abort', onAbort, { once: true });
			const cleanup = () => ctx.signal.removeEventListener('abort', onAbort);
			promise.then(cleanup, cleanup);
			// A retry after a timed-out attempt reuses the aborted signal, so no event fires.
			if (ctx.signal.aborted) onAbort();
		}
		return promise;
	};

const TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer());

/** @internal */
export const addEqualityTesters = () => {
	R.expect.addEqualityTesters([]);
};

/** @internal */
const testOptions = (timeout?: number | R.TestOptions) => (typeof timeout === 'number' ? { timeout } : (timeout ?? {}));

const hookTimeout = (timeout?: Duration.Input) =>
	timeout === undefined ? undefined : Duration.toMillis(Duration.fromInputUnsafe(timeout));

type PropertyTimeout =
	| number
	| (R.TestOptions & {
			readonly arbitrary?: Arbitrary.CheckOptions | undefined;
	  });

type ArbitraryInput = Schema.Schema<any> | Arbitrary.Arbitrary<unknown>;

type Arbitraries = Array<ArbitraryInput> | { [K in string]: ArbitraryInput };

const propertyTestOptions = (timeout: PropertyTimeout | undefined): Exclude<PropertyTimeout, number> | undefined =>
	typeof timeout === 'number' ? undefined : timeout;

const checkOptions = (timeout: PropertyTimeout | undefined): Arbitrary.CheckOptions | undefined =>
	propertyTestOptions(timeout)?.arbitrary;

const compileArbitraryInput = (input: ArbitraryInput): Arbitrary.Arbitrary<any> =>
	Arbitrary.isArbitrary(input) ? input : Arbitrary.schema(input);

const makeArbitrary = (arbitraries: Arbitraries): Arbitrary.Arbitrary<any> =>
	Arbitrary.all(
		Array.isArray(arbitraries)
			? arbitraries.map(compileArbitraryInput)
			: Object.fromEntries(Object.entries(arbitraries).map(([key, input]) => [key, compileArbitraryInput(input)]))
	);

const normalizeProperty = <A, E, R>(
	property: (value: A) => boolean | Effect.Effect<boolean, E, R>,
	value: A
): Effect.Effect<boolean, E | Cause.Cause<E>, R> =>
	Effect.catchCause(
		Effect.suspend(() => {
			const output = property(value);
			return Effect.isEffect(output) ? output : Effect.succeed(output);
		}),
		(cause): Effect.Effect<never, E | Cause.Cause<E>> =>
			Cause.hasInterrupts(cause) ? Effect.failCause(cause) : Effect.fail(cause)
	);

const runCheck = <A, E>(
	ctx: R.TestContext,
	arbitrary: Arbitrary.Arbitrary<A>,
	property: (value: A) => boolean | Effect.Effect<boolean, E>,
	options: Arbitrary.CheckOptions | undefined
): Promise<void> =>
	runTest(ctx)(
		Effect.flatMapEager(
			Arbitrary.checkEffect(arbitrary, (value) => normalizeProperty(property, value), options),
			(result) => {
				const failure = Arbitrary.formatCheckFailure(result);
				return failure === undefined ? Effect.void : Effect.die(new Error(failure));
			}
		)
	);

const makeItProxy = <Methods extends object>(it: R.TestAPI, overrides: Methods): Methods & R.TestAPI =>
	new Proxy(it as Methods & R.TestAPI, {
		apply(target, thisArg, argArray) {
			return Reflect.apply(target as any, thisArg, argArray);
		},
		get(target, property, receiver) {
			if (Object.hasOwn(overrides, property)) {
				return Reflect.get(overrides, property);
			}
			// do not bind: binding would strip rstest's static helpers (e.g. `describe.each`)
			return Reflect.get(target, property, receiver);
		}
	});

/** @internal */
const makeTester = <R2>(
	mapEffect: <A, E>(self: Effect.Effect<A, E, R2>) => Effect.Effect<A, E, never>,
	it: R.TestAPI = R.it
): Rstest.Rstest.Tester<R2> => {
	const run = <A, E, TestArgs extends Array<unknown>>(
		ctx: R.TestContext & object,
		args: TestArgs,
		self: Rstest.Rstest.TestFunction<A, E, R2, TestArgs>
	) =>
		pipe(
			Effect.suspend(() => self(...args)),
			mapEffect,
			runTest(ctx)
		);

	const f: Rstest.Rstest.Test<R2> = (name, self, timeout) =>
		it(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self) as any);

	const skip: Rstest.Rstest.Tester<R2>['skip'] = (name, self, timeout) =>
		it.skip(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self) as any);

	const skipIf: Rstest.Rstest.Tester<R2>['skipIf'] = (condition) => (name, self, timeout) =>
		it.skipIf(Boolean(condition))(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self) as any);

	const runIf: Rstest.Rstest.Tester<R2>['runIf'] = (condition) => (name, self, timeout) =>
		it.runIf(Boolean(condition))(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self) as any);

	const only: Rstest.Rstest.Tester<R2>['only'] = (name, self, timeout) =>
		it.only(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self) as any);

	const each: Rstest.Rstest.Tester<R2>['each'] = (cases) => (name, self, timeout) =>
		it.for(cases as any)(name, testOptions(timeout), (args: any, ctx: any) => run(ctx, [args], self) as any);

	const fails: Rstest.Rstest.Tester<R2>['fails'] = (name, self, timeout) =>
		it.fails(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self) as any);

	const prop: Rstest.Rstest.Tester<R2>['prop'] = (name, arbitraries, self, timeout) => {
		const arbitrary = makeArbitrary(arbitraries);
		return it(name, testOptions(timeout), (ctx) =>
			runCheck(
				ctx,
				arbitrary,
				(values) =>
					Effect.mapEager(
						mapEffect(Effect.suspend(() => self(values as any, ctx))),
						(value) => (value as unknown) !== false
					),
				checkOptions(timeout)
			)
		);
	};

	return Object.assign(f, { skip, skipIf, runIf, only, each, fails, prop });
};

/** @internal */
export const prop: Rstest.Rstest.Methods['prop'] = (name, arbitraries, self, timeout) => {
	const arbitrary = makeArbitrary(arbitraries);
	return R.it(name, testOptions(timeout), (ctx) =>
		runCheck(ctx, arbitrary, (values) => (self(values as any, ctx) as unknown) !== false, checkOptions(timeout))
	);
};

/** @internal */
export const layer =
	<R2, E>(
		layer_: Layer.Layer<R2, E>,
		options?: {
			readonly memoMap?: Layer.MemoMap;
			readonly timeout?: Duration.Input;
			readonly excludeTestServices?: boolean;
		}
	): {
		(f: (it: Rstest.Rstest.MethodsNonLive<R2>) => void): void;
		(name: string, f: (it: Rstest.Rstest.MethodsNonLive<R2>) => void): void;
	} =>
	(
		...args:
			| [name: string, f: (it: Rstest.Rstest.MethodsNonLive<R2>) => void]
			| [f: (it: Rstest.Rstest.MethodsNonLive<R2>) => void]
	) => {
		const excludeTestServices = options?.excludeTestServices ?? false;
		const withTestEnv = excludeTestServices ? (layer_ as Layer.Layer<R2, E>) : Layer.provideMerge(layer_, TestEnv);
		const memoMap = options?.memoMap ?? Effect.runSync(Layer.makeMemoMap);
		const scope = Effect.runSync(Scope.make());
		const contextEffect = Layer.buildWithMemoMap(withTestEnv, memoMap, scope).pipe(
			Effect.orDie,
			Effect.cached,
			Effect.runSync
		);
		let closed = false;
		const closeScope = () => {
			if (closed) {
				return Promise.resolve();
			}
			closed = true;
			// Layer cleanup must outlive the last test's already-aborted signal.
			return runPromise(Scope.close(scope, Exit.void));
		};

		const makeIt = (it: R.TestAPI): Rstest.Rstest.MethodsNonLive<R2> =>
			makeItProxy(it, {
				effect: makeTester<R2 | Scope.Scope>(
					(effect) => Effect.flatMap(contextEffect, (context) => effect.pipe(Effect.scoped, Effect.provide(context))),
					it
				),
				prop,
				flakyTest,
				layer<R3, E2>(
					nestedLayer: Layer.Layer<R3, E2, R2>,
					options?: {
						readonly timeout?: Duration.Input;
					}
				) {
					return layer(Layer.provideMerge(nestedLayer, withTestEnv), {
						...options,
						memoMap: Layer.forkMemoMapUnsafe(memoMap),
						excludeTestServices
					});
				}
			});

		// rstest's beforeAll/afterAll need to be called in a describe block to reliably
		// run before and after all tests. When no label is provided, we still wrap in
		// an empty describe so the lifecycle hooks behave as expected.
		const label = args.length === 1 ? '' : args[0];

		return R.describe(label, () => {
			R.beforeAll(() => runPromise(Effect.asVoid(contextEffect)), hookTimeout(options?.timeout));
			R.afterAll(() => closeScope(), hookTimeout(options?.timeout));
			return (args.length === 1 ? args[0] : args[1])(makeIt(R.it));
		});
	};

/** @internal */
export const flakyTest = <A, E, R2>(
	self: Effect.Effect<A, E, R2 | Scope.Scope>,
	timeout: Duration.Input = Duration.seconds(30)
) =>
	pipe(
		self,
		Effect.scoped,
		Effect.sandbox,
		Effect.retry(
			pipe(
				Schedule.recurs(10),
				Schedule.while((_) =>
					Effect.succeed(
						Duration.isLessThanOrEqualTo(Duration.fromInputUnsafe(_.elapsed), Duration.fromInputUnsafe(timeout))
					)
				)
			)
		),
		Effect.orDie
	);

/** @internal */
export const makeMethods = (it: R.TestAPI): Rstest.Rstest.Methods =>
	makeItProxy(it, {
		effect: makeTester<Scope.Scope>(flow(Effect.scoped, Effect.provide(TestEnv)), it),
		live: makeTester<Scope.Scope>(Effect.scoped, it),
		flakyTest,
		layer,
		prop
	});

/** @internal */
export const {
	/** @internal */
	effect,
	/** @internal */
	live
} = makeMethods(R.it);

/** @internal */
export const describeWrapped = (name: string, f: (it: Rstest.Rstest.Methods) => void): R.SuiteCollector =>
	R.describe(name, () => f(makeMethods(R.it)));
