// Multiplayer pets are removed in this fork.
//
// Upstream broadcasts your pet to other people working on the same git repo
// through a relay it hosts (`wss://pets.agentsystem.dev`). That relay belongs to
// the upstream project, not to this fork, so this build must not connect to it —
// and standing up a replacement is not worth it for a cosmetic feature.
//
// The hook is kept as an inert stub rather than deleted so RemotePets and the
// pet overlay compile and render unchanged (with no peers, they simply draw
// nothing), and so the upstream version of this file stays easy to merge if the
// feature is ever wanted again against a relay we control.
//
// Also removed alongside this: the Settings → Pet "Multiplayer" toggle and
// src/shared/academy.ts, which existed only to build that relay's URL. The
// `pet_multiplayer_enabled` server setting is deliberately left in place so no
// database migration is needed to roll this back.

import type { PetPeer } from "~/shared/pet-multiplayer-protocol";

const NO_PEERS: PetPeer[] = [];

/** Always empty — this fork never connects to the pets relay. */
export function usePetMultiplayer(): PetPeer[] {
  return NO_PEERS;
}
