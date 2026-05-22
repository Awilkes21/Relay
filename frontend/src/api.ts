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

export { API_URL };
