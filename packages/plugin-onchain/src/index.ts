/**
 * lyra-plugin-onchain — the single on-chain plugin import.
 *
 * A facade over two SDK-isolated halves:
 *   - lyra-plugin-onchain-one — tools on @mysten/sui v1 (7k swap, NAVI/Suilend/
 *     Scallop, staking, vault/policy)
 *   - lyra-plugin-onchain-two — tools on @mysten/sui v2 (Wormhole bridge, …)
 *
 * The incompatible @mysten/sui versions can't share a Transaction object, so each
 * half builds + signs + executes its own PTBs internally; only the version-
 * agnostic ToolDef crosses this boundary. Consumers import THIS package and get
 * every tool, unaware two SDK versions run underneath.
 */
// Re-export the full v1 surface (TOOLS, WEB_TOOL_NAMES, policyFromEnv, guidance,
// deriveAgentKeypair, isValueMovingTool, types, …) + the v1 plugin as default.
export * from 'lyra-plugin-onchain-one'
export { default } from 'lyra-plugin-onchain-one'

// NOTE: the v2 half (`lyra-plugin-onchain-two` — the Wormhole bridge) is deliberately
// NOT wired in here. It pins @mysten/sui v2, which cannot be flattened alongside
// onchain-one's v1 in a published npm install (the two SDK majors coexist only via
// nested node_modules), and the bridge is not functional yet. Publishing the facade
// with a hard dependency on the private onchain-two package left its deps unresolved
// (`workspace:*`) and broke every downstream install (CLI, gateway). Until the bridge
// ships with proper v1/v2 coexistence, this facade === the v1 surface. Re-add the v2
// registration (dynamic, install-optional) at that point.
