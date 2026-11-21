import { describe, expect, test } from "bun:test";

import { type EvalCase, loadCases } from "./cases";
import { matchesAny } from "./match";

// Checks the labels themselves: every label must be grounded in its post,
// so a typo in expected.json can't quietly skew the scores.

const cases: EvalCase[] = await loadCases();
const lower = (s: string) => s.toLowerCase();

describe("eval cases", () => {
  test("there are 10 labelled cases", () => {
    expect(cases).toHaveLength(10);
  });

  for (const c of cases) {
    describe(c.id, () => {
      const post = lower(c.post);
      const { expected } = c;

      test("title appears in the post", () => {
        expect(post).toContain(lower(expected.title));
      });

      test("every requirement concept matches the post", () => {
        for (const concept of [...expected.mustHave, ...expected.niceToHave]) {
          expect({
            id: concept.id,
            found: matchesAny(c.post, concept.anyOf),
          }).toEqual({
            id: concept.id,
            found: true,
          });
        }
      });

      test("concept ids are unique", () => {
        const ids = [...expected.mustHave, ...expected.niceToHave].map(
          (x) => x.id,
        );
        expect(new Set(ids).size).toBe(ids.length);
      });

      test("every stack item, location word and trap appears in the post", () => {
        for (const tech of expected.stack)
          expect({ tech, inPost: post.includes(lower(tech)) }).toEqual({
            tech,
            inPost: true,
          });
        for (const trap of expected.mustNotInclude)
          expect({ trap, inPost: post.includes(lower(trap)) }).toEqual({
            trap,
            inPost: true,
          });
        if (expected.locationAnyOf) {
          expect(
            expected.locationAnyOf.some((w) => post.includes(lower(w))),
          ).toBe(true);
        }
      });
    });
  }
});
