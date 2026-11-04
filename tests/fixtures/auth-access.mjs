let value = { status: "unauthenticated" }
export function setAccess(result) { value = result }
export async function getAccess() { return value }
