import { describe, expect, test } from "bun:test";

import { numbersIn, unverifiedNumbers, verifiedSource } from "./tailor-check";

describe("verifiedSource", () => {
  const cv =
    "LoadsRunner logistics platform. HappyGifters Stripe checkout. E-Prep test platform.";
  const repos = ["jane/fitcheck", "jane/weather_app"];

  test("keeps projects named in the CV", () => {
    expect(verifiedSource("LoadsRunner", cv, repos)).toBe("LoadsRunner");
    expect(verifiedSource("HappyGifters checkout", cv, repos)).toBe(
      "HappyGifters checkout",
    );
  });

  test("maps repo mentions to the full repo name", () => {
    expect(verifiedSource("fitcheck", cv, repos)).toBe("jane/fitcheck");
    expect(verifiedSource("The Fitcheck app", cv, repos)).toBe("jane/fitcheck");
  });

  test("drops made-up projects and empty values", () => {
    expect(verifiedSource("ShopMaster e-commerce", cv, repos)).toBeNull();
    expect(verifiedSource("  ", cv, repos)).toBeNull();
    expect(verifiedSource(null, cv, repos)).toBeNull();
  });
});

const CV =
  "Led a 6-person team on LoadsRunner (+35% ops efficiency). Cut page loads by 30%. 3+ years with React. Served 1,200 users since 2023.";

describe("numbersIn", () => {
  test("reads percentages, plus signs, commas and years", () => {
    expect(numbersIn(CV)).toEqual(["6", "35%", "30%", "3", "1200", "2023"]);
  });
});

describe("unverifiedNumbers", () => {
  test("accepts numbers that come from the CV, however they're written", () => {
    expect(
      unverifiedNumbers(
        "Led 6 engineers, improving ops efficiency 35% for 1200 users; 3+ years of React.",
        CV,
      ),
    ).toEqual([]);
  });

  test("flags invented metrics and dates", () => {
    expect(
      unverifiedNumbers("Grew revenue 40% and cut costs by $5k in 2021.", CV),
    ).toEqual(["40%", "5k", "2021"]);
  });

  test("returns nothing for text without numbers", () => {
    expect(unverifiedNumbers("Built accessible React components.", CV)).toEqual(
      [],
    );
  });
});
