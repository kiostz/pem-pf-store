// Shared types of the Admin Worker's JSON API: also imported type-only by the admin page, so both sides agree.

// Whether buyers can see a honor.
export type HonorStatus = 'active' | 'hidden'

// One honor as the admin lists it.
export interface AdminHonor {
  id: string // Never changes.
  name: string // Shown name.
  category: string // Category label.
  status: HonorStatus // Active or Hidden.
  stock: number // Units on hand.
}

// One honor's edits: what the admin saw (`from`) and wants (`to`) per changed field.
export interface HonorChange {
  id: string // Which honor.
  status?: { from: HonorStatus; to: HonorStatus } // Present when the status changed.
  stock?: { from: number; to: number } // Present when the stock changed.
}

// The outcome of a save: written, or refused with the current rows of the mismatched honors.
export interface SaveResult {
  kind: 'saved' | 'conflict' // Which one.
  honors: AdminHonor[] // Saved rows, or the current rows of the honors that no longer match.
}
