import { configure } from "@testing-library/dom";

/**
 * Testing Library's async utilities (`findBy*`, `waitFor`) have their own 1000ms
 * budget, entirely independent of vitest's `testTimeout`. Raising testTimeout
 * therefore does nothing for them.
 *
 * Under full-suite contention a component render can take several seconds on its
 * own — a `findByRole` in feedback-ui.test.tsx failed with the whole test at
 * 7.6s, well inside the 30s testTimeout, because the 1s async budget expired
 * while the render was still settling. The same suite passes 9/9 in isolation.
 *
 * 5s is generous enough to absorb that contention while still failing a
 * genuinely broken query quickly.
 */
configure({ asyncUtilTimeout: 5000 });
