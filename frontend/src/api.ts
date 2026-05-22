const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type HealthResponse = {
  status: string;
};

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`);

  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }

  return response.json();
}

export type PitchFilters = {
  pitcher_id?: string;
  pitcher_name?: string;
  season?: string;
  pitch_type?: string;
  balls?: string;
  strikes?: string;
  min_velocity?: string;
  max_velocity?: string;
};

export type PitchResult = {
  game_date: string | null;
  player_name: string | null;
  pitcher: number | null;
  batter: number | null;
  pitch_type: string | null;
  release_speed: number | null;
  release_spin_rate: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  plate_x: number | null;
  plate_z: number | null;
  balls: number | null;
  strikes: number | null;
  description: string | null;
  events: string | null;
};

export type PitchSearchResponse = {
  count: number;
  results: PitchResult[];
};

export type CompareFilters = {
  pitcher_id: string;
  pitcher_name: string;
  a_start: string;
  a_end: string;
  b_start: string;
  b_end: string;
};

export type PitchUsageMetric = {
  count: number;
  rate: number | null;
};

export type PeriodMetrics = {
  pitch_count: number;
  pitch_usage: Record<string, PitchUsageMetric>;
  average_velocity: Record<string, number>;
  average_spin_rate: Record<string, number>;
  average_induced_vertical_break: Record<string, number>;
  average_horizontal_break: Record<string, number>;
  strike_rate: number | null;
  whiff_rate: number | null;
  zone_rate: number | null;
};

export type CompareDelta = {
  pitch_count: number;
  pitch_usage: Record<string, PitchUsageMetric>;
  average_velocity: Record<string, number | null>;
  average_spin_rate: Record<string, number | null>;
  average_induced_vertical_break: Record<string, number | null>;
  average_horizontal_break: Record<string, number | null>;
  strike_rate: number | null;
  whiff_rate: number | null;
  zone_rate: number | null;
};

export type PitcherCompareResponse = {
  pitcher_id: number;
  period_a: {
    start: string;
    end: string;
    metrics: PeriodMetrics;
  };
  period_b: {
    start: string;
    end: string;
    metrics: PeriodMetrics;
  };
  deltas: CompareDelta;
};

export async function searchPitches(
  filters: PitchFilters,
): Promise<PitchSearchResponse> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = value?.trim();
    if (trimmedValue) {
      params.set(key, trimmedValue);
    }
  });

  const queryString = params.toString();
  const response = await fetch(
    `${API_URL}/pitches${queryString ? `?${queryString}` : ""}`,
  );

  if (!response.ok) {
    throw new Error(`Pitch search returned ${response.status}`);
  }

  return response.json();
}

export async function comparePitcher(
  filters: CompareFilters,
): Promise<PitcherCompareResponse> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = value.trim();
    if (trimmedValue) {
      params.set(key, trimmedValue);
    }
  });

  const response = await fetch(`${API_URL}/compare/pitcher?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Pitcher comparison returned ${response.status}`);
  }

  return response.json();
}

export { API_URL };
