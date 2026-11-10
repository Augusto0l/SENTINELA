// Applied only to tile images. Cross-origin servers receive the page origin,
// never its path/query; authentication pages keep their no-referrer policy.
export const TILE_REFERRER_POLICY = "strict-origin-when-cross-origin" as const
