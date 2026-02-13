import type { ScaleEnum } from "./types";

export const SCALE_OPTIONS: Array<{ value: ScaleEnum; label: string }> = [
  { value: "C_MAJOR_A_MINOR", label: "C major / A minor" },
  { value: "D_FLAT_MAJOR_B_FLAT_MINOR", label: "D♭ major / B♭ minor" },
  { value: "D_MAJOR_B_MINOR", label: "D major / B minor" },
  { value: "E_FLAT_MAJOR_C_MINOR", label: "E♭ major / C minor" },
  { value: "E_MAJOR_D_FLAT_MINOR", label: "E major / C♯/D♭ minor" },
  { value: "F_MAJOR_D_MINOR", label: "F major / D minor" },
  { value: "G_FLAT_MAJOR_E_FLAT_MINOR", label: "G♭ major / E♭ minor" },
  { value: "G_MAJOR_E_MINOR", label: "G major / E minor" },
  { value: "A_FLAT_MAJOR_F_MINOR", label: "A♭ major / F minor" },
  { value: "A_MAJOR_G_FLAT_MINOR", label: "A major / F♯/G♭ minor" },
  { value: "B_FLAT_MAJOR_G_MINOR", label: "B♭ major / G minor" },
  { value: "B_MAJOR_A_FLAT_MINOR", label: "B major / G♯/A♭ minor" },
  { value: "SCALE_UNSPECIFIED", label: "Model decides" },
];
