/**
 * Run after `npm --prefix cli run build`:
 *   node cli/tests/calc.test.mjs
 */
import { strict as assert } from "node:assert";
import {
  applyCaps,
  missedUsdEstimate,
  userEarningPerImpression,
} from "../dist/calc.js";

assert.equal(userEarningPerImpression(0.01), 0.005);
assert.equal(applyCaps(1000, 10, 30), 200); // 10 sessions × 20 cap
assert.equal(applyCaps(50, 2, 30), 40); // 2 sessions × 20
assert.equal(missedUsdEstimate(100, 0.01), 0.5);

console.log("ok - calc");
