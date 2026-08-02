// TEMPORARY FILE — proves the CI pipeline actually catches a real break.
// Deliberately invalid: assigning a string literal to a `number`-typed
// constant. This file is deleted in the very next commit on this
// throwaway branch, which is never merged.
const deliberatelyWrongType: number = "this is not a number";
export default deliberatelyWrongType;
