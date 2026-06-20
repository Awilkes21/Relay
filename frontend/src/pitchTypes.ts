const pitchTypeLabels: Record<string, string> = {
  CH: "Changeup",
  CU: "Curveball",
  EP: "Eephus",
  FA: "Fastball",
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

export function formatPitchType(pitchType: string | null | undefined): string {
  if (!pitchType) return "-";
  if (pitchType.includes(",")) {
    return pitchType
      .split(",")
      .map((value) => formatPitchType(value.trim()))
      .join(", ");
  }
  return pitchTypeLabels[pitchType] ?? pitchType;
}

export function formatPitchTypeWithCode(pitchType: string | null | undefined): string {
  if (!pitchType) return "-";
  if (pitchType.includes(",")) {
    return pitchType
      .split(",")
      .map((value) => formatPitchTypeWithCode(value.trim()))
      .join(", ");
  }
  const label = formatPitchType(pitchType);
  return label === pitchType ? pitchType : `${label} (${pitchType})`;
}
