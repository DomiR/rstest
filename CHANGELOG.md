# @domir/rstest

## 1.0.0

### Major Changes

- Move the `effect` peer dependency from `^3.15.2` to `^4.0.0-rc.112`, and the `@rstest/core` peer dependency from `^0.0.1` to `^0.11.12`.
- Drop `it.scoped` and `it.scopedLive`. `it.effect` and `it.live` now always run in a `Scope` (equivalent to the old `scoped`/`scopedLive` behavior), so the four-way effect/live/scoped/scopedLive split collapses into two testers.
- `it.effect`'s requirement is now `Scope.Scope` instead of `effect/TestServices`'s `TestServices`. The `effect/TestServices` and `effect/TestContext` modules no longer exist in `effect@4`; the test environment (`TestClock`/`TestConsole`) is provided directly as a `Layer`.
- `it.effect`, `it.live`, and every tester derived from them (`.skip`, `.skipIf`, `.runIf`, `.only`, `.fails`, `.each`, `.prop`) now pass rstest's own `TestContext` (`ctx`, with `ctx.signal`, `ctx.task`, `ctx.onTestFailed`, and so on) through to the test function, matching `@effect/vitest`. The underlying `Effect.runPromise` call is given `ctx.signal`, so a test that times out genuinely interrupts the running fiber (finalizers run) instead of leaving it running in the background.
- `it.effect.each`/`it.live.each` are now implemented on top of `@rstest/core`'s `it.for` instead of `it.each`, so a case that is itself an array or tuple is passed to the test function as one opaque value instead of being spread into multiple arguments.
- `src/utils.ts` assertion renames, following `effect`'s `Either` to `Result` rename:
  - `assertLeft`/`assertRight` (for `Either`) are replaced by `assertFailure`/`assertSuccess` (for `Result`).
  - The previous `assertFailure`/`assertSuccess` (for `Exit`) are renamed to `assertExitFailure`/`assertExitSuccess` to free up the names above.
  - Added `assertDefined`/`assertUndefined`.

### Patch Changes

- Run every package script with `bun run` instead of `pnpm`.
- `addEqualityTesters` is now a real implementation (`expect.addEqualityTesters([])` from `@rstest/core`) instead of a stub, since rstest's `expect` (backed by `@vitest/expect`) supports custom equality testers.
- Fix `it.prop` and `it.effect.prop` (array and record forms) to call the `Schema.toArbitrary` factory with the `fast-check` module, matching effect rc.112's `Schema.toArbitrary(schema)(fc)` shape. Passing a `Schema` through these testers previously produced a factory function instead of a fast-check `Arbitrary`, which broke property tests using schema arbitraries at runtime.
- Adapt to `@rstest/core@0.11.12`'s test/suite call shape, which now accepts a `TestOptions` object as the second argument (`it(name, options, fn)`) in addition to the legacy `(name, fn, timeout)` shape used by `@rstest/core@0.0.1`.
- `src/index.ts`'s `it` and `describeWrapped` are now built with a non-mutating `Proxy` wrapper (mirroring `@effect/vitest`) instead of `Object.assign`-ing custom testers directly onto the shared `@rstest/core` `it` singleton.
