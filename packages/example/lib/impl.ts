// Internal implementation — hidden in a subfolder, unreachable from outside
// the package. A package's internals may nest as deep as they like.

export function composeGreeting(name: string): string {
  return `Hello, ${name}!`;
}
