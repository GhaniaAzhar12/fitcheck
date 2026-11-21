import { describe, expect, test } from "bun:test";
import { isRealRequirement, tidy } from "./extract-job";
import type { JobExtraction } from "./job-extraction";

describe("isRealRequirement", () => {
  test("drops application steps (real examples from Day 14 job posts)", () => {
    for (const item of [
      "Complete take-home assignment",
      "Include pineapple in email",
      "Include LLM disclosure if applicable",
      "Send a cover letter",
      "Submit a coding challenge",
    ]) {
      expect(isRealRequirement(item)).toBe(false);
    }
  });

  test("drops working arrangements and generic traits", () => {
    for (const item of [
      "Work full-time remotely",
      "Overlap 4 hours with CET",
      "Deliver without supervision",
      "Onboard quickly",
      "Self-starter",
    ]) {
      expect(isRealRequirement(item)).toBe(false);
    }
  });

  test("keeps eligibility rules even when they mention a time zone (Day 23 eval, case 04)", () => {
    for (const item of [
      "Authorized to work in the United States and live in a US time zone",
      "Right to work in the UK",
      "Must be eligible to work in the EU",
      "Visa sponsorship not available",
    ]) {
      expect(isRealRequirement(item)).toBe(true);
    }
    // Plain arrangements are still dropped.
    expect(isRealRequirement("Must live in a US time zone")).toBe(false);
  });

  test("keeps real skills and experience", () => {
    for (const item of [
      "Proficiency in React",
      "Hands-on experience with AWS",
      "3+ years full-stack experience",
      "Web security best practices",
      "Experience with Stripe payments",
      "Mentoring junior engineers",
      "Remote team collaboration tools like Slack",
    ]) {
      expect(isRealRequirement(item)).toBe(true);
    }
  });
});

describe("tidy", () => {
  const base: JobExtraction = {
    title: "Engineer",
    company: null,
    seniority: "mid",
    remote: "remote",
    location: null,
    minYearsExperience: null,
    mustHave: [],
    niceToHave: [],
    stack: [],
    salary: null,
  };

  test("filters non-requirements and duplicates from both lists", () => {
    const result = tidy({
      ...base,
      mustHave: ["React", " react ", "Include pineapple in email"],
      niceToHave: ["React", "AWS", "Onboard quickly"],
    });
    expect(result.mustHave).toEqual(["React"]);
    expect(result.niceToHave).toEqual(["AWS"]);
  });
});
