// Entry point of the example package — this is the public surface.
// Import this from outside the package; never reach into lib/.

import { composeGreeting } from "./lib/impl";

/** Greet a person by name. Behaviour lives behind this small function. */
export function greet(name: string): string {
  return composeGreeting(name);
}
