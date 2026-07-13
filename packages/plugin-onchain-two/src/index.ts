/**
 * lyra-plugin-onchain-two — on-chain tools that require @mysten/sui v2
 * (Wormhole bridge, and later DeepBook v3 / Cetus execution).
 *
 * Isolated in its own package so its v2 SDK coexists with the v1 stack in
 * lyra-plugin-onchain-one. Tools register here and build their own PTBs with the
 * v2 client/keypair; the version-agnostic ToolDef interface is the only boundary.
 */
import type { NativePlugin } from 'lyra-core'

// v2 tools register here (Wormhole bridge next). Empty until the first v2 tool lands.
const plugin: NativePlugin = {
  name: 'onchain-two',
  register: () => {},
}

export default plugin
