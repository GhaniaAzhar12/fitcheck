/** Flags numbers that aren't in the CV or the evidence. */
export function Unverified({ numbers }: { numbers: string[] }) {
  if (!numbers.length) return null;
  return (
    <p className="text-xs text-partial">
      Check: {numbers.join(", ")} {numbers.length === 1 ? "isn't" : "aren't"} in
      your CV. Edit or remove before using.
    </p>
  );
}
