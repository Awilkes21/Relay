const pitchTypeLabels: Record<string, string> = {
  CH: "Changeup",
  CU: "Curveball",
  EP: "Eephus",
  FC: "Cutter",
  FF: "Four-Seam Fastball",
  FO: "Forkball",
  FS: "Splitter",
  KC: "Knuckle Curve",
  KN: "Knuckleball",
  SC: "Screwball",
  SI: "Sinker",
  SL: "Slider",
  ST: "Sweeper",
  SV: "Slurve",
};

export function formatPitchType(pitchType: string | null | undefined) {
  if (!pitchType) return "-";
  return pitchTypeLabels[pitchType] ?? pitchType;
}

export function formatPitchTypeWithCode(pitchType: string | null | undefined) {
  if (!pitchType) return "-";
  const label = formatPitchType(pitchType);
  return label === pitchType ? pitchType : `${label} (${pitchType})`;
}
