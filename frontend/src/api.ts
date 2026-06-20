const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:8000");

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
  single_game?: string;
  start_date?: string;
  end_date?: string;
  pitch_type?: string | string[];
  pitch_type_group?: string;
  count?: string;
  balls?: string;
  strikes?: string;
  min_velocity?: string;
  max_velocity?: string;
  batter_hand?: string;
  description?: string;
  events?: string;
  base_state?: string;
  count_group?: string;
  location_filter?: string;
  result_order?: string;
  limit?: string;
};

export type PitchResult = {
  game_date: string | null;
  player_name: string | null;
  pitcher: number | null;
  batter: number | null;
  batter_name: string | null;
  p_throws: string | null;
  stand: string | null;
  pitch_type: string | null;
  release_speed: number | null;
  release_spin_rate: number | null;
  release_pos_x: number | null;
  release_pos_z: number | null;
  arm_angle: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  plate_x: number | null;
  plate_z: number | null;
  launch_speed: number | null;
  launch_angle: number | null;
  bb_type: string | null;
  hit_distance_sc: number | null;
  estimated_ba_using_speedangle: number | null;
  estimated_woba_using_speedangle: number | null;
  woba_value: number | null;
  balls: number | null;
  strikes: number | null;
  description: string | null;
  events: string | null;
  on_1b: number | null;
  on_2b: number | null;
  on_3b: number | null;
};

export type CachedPitcher = {
  pitcher: number;
  player_name: string;
  pitch_count: number;
  first_game_date: string;
  last_game_date: string;
};

export type CachedPitchersResponse = {
  count: number;
  results: CachedPitcher[];
};

export type DataQualityMetric = {
  key: string;
  label: string;
  fields: string[];
  denominator: "all_pitches" | "balls_in_play" | string;
  denominator_count: number;
  available_count: number;
  missing_count: number;
  missing_rate: number | null;
  available_rate: number | null;
  missing_fields: string[];
};

export type CacheMetadataResponse = {
  path: string;
  file_size_bytes: number;
  pitch_count: number;
  pitcher_count: number;
  first_game_date: string | null;
  last_game_date: string | null;
  seasons: number[];
  pitch_types: string[];
  data_quality: {
    pitch_count: number;
    metrics: DataQualityMetric[];
  };
  source?: "manifest" | "manifest+duckdb" | "duckdb" | string;
  manifest?: {
    path: string;
    generated_at: string | null;
    date_range: {
      start: string;
      end: string;
    } | null;
  };
};

export type PitchDataQualityResponse = {
  pitch_count: number;
  metrics: DataQualityMetric[];
};

export type PitchFilterOptions = {
  seasons: number[];
  game_dates: Array<{
    game_date: string;
    away_team: string | null;
    home_team: string | null;
    opponent_team: string | null;
    pitch_count: number;
  }>;
  pitch_types: string[];
  batter_hands: string[];
  descriptions: string[];
  events: string[];
  velocity: {
    min: number | null;
    max: number | null;
  };
};

export type PitchSearchResponse = {
  count: number;
  total_count: number;
  results: PitchResult[];
};

export type ProfileSummaryMetrics = {
  average_velocity: number | null;
  average_spin: number | null;
  strike_rate: number | null;
  whiff_rate: number | null;
  zone_rate: number | null;
};

export type ProfileArsenalPitch = {
  pitch_type: string;
  count: number;
  velocity: number | null;
  spin: number | null;
  ivb: number | null;
  hb: number | null;
  strikes: number;
  whiffs: number;
  located_count: number;
  zone_count: number;
};

export type ProfileBucketRow = {
  bucket: string;
  pitch_type: string;
  count: number;
  velocity: number | null;
  spin: number | null;
  ivb: number | null;
  hb: number | null;
  arm_angle: number | null;
  strikes: number;
  whiffs: number;
  located_count: number;
  zone_count: number;
  balls_in_play: number;
  contacted_count: number;
  hard_contact_count: number;
  average_exit_velocity: number | null;
  max_exit_velocity: number | null;
};

export type ProfileSummaryResponse = {
  pitch_count: number;
  metrics: ProfileSummaryMetrics;
  arsenal: ProfileArsenalPitch[];
  bucketed: {
    game: ProfileBucketRow[];
    month: ProfileBucketRow[];
  };
};

export type HeatmapMode = "all" | "whiffs" | "hard_contact" | "in_zone";

export type PitchHeatmapCell = {
  x_bin: number;
  z_bin: number;
  x_start: number;
  x_end: number;
  z_start: number;
  z_end: number;
  count: number;
  share: number;
  density: number;
  average_velocity: number | null;
  average_exit_velocity: number | null;
  max_exit_velocity: number | null;
  top_pitch_type: string | null;
  top_pitch_count: number | null;
  top_pitch_share: number;
};

export type PitchHeatmapResponse = {
  mode: HeatmapMode;
  x_bins: number;
  z_bins: number;
  domain: {
    x_min: number;
    x_max: number;
    z_min: number;
    z_max: number;
  };
  total_count: number;
  max_count: number;
  cells: PitchHeatmapCell[];
};

export type CompareFilters = {
  pitcher_id: string;
  pitcher_name: string;
  pitch_type: string;
  batter_hand: string;
  a_game: string;
  a_start: string;
  a_end: string;
  b_game: string;
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
  average_arm_angle: Record<string, number>;
  arm_angle: number | null;
  strike_rate: number | null;
  whiff_rate: number | null;
  zone_rate: number | null;
  pitcher_hand: string | null;
};

export type CompareDelta = {
  pitch_count: number;
  pitch_usage: Record<string, PitchUsageMetric>;
  average_velocity: Record<string, number | null>;
  average_spin_rate: Record<string, number | null>;
  average_induced_vertical_break: Record<string, number | null>;
  average_horizontal_break: Record<string, number | null>;
  average_arm_angle: Record<string, number | null>;
  arm_angle: number | null;
  strike_rate: number | null;
  whiff_rate: number | null;
  zone_rate: number | null;
};

export type PitcherCompareResponse = {
  pitcher_id: number;
  pitcher_hand: string | null;
  filters: {
    pitch_type: string | null;
    batter_hand: string | null;
  };
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
  chart_data?: {
    heatmap_mode: HeatmapMode;
    heatmaps: {
      period_a: PitchHeatmapResponse;
      period_b: PitchHeatmapResponse;
    };
  };
};

export type SavedComparison = {
  id: string;
  name: string;
  filters: CompareFilters;
  created_at: string;
};

export type RelaySkill =
  | "search_pitches"
  | "get_pitch_heatmap"
  | "compare_pitcher_periods"
  | "summarize_arsenal"
  | "summarize_movement"
  | "open_pitcher_profile";

export type RelaySkillCall = {
  skill: RelaySkill;
  args: Record<string, string | number | boolean | null | undefined>;
  warnings: string[];
  parser?: string;
};

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") {
      if (body.detail.includes("Statcast parquet file not found")) {
        return "No cached Statcast data found. Run ingestion first.";
      }
      return body.detail;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export async function getPitchers(): Promise<CachedPitchersResponse> {
  const response = await fetch(`${API_URL}/pitchers`);

  if (!response.ok) {
    throw new Error(await responseError(response, `Pitchers returned ${response.status}`));
  }

  return response.json();
}

export async function getCacheMetadata(): Promise<CacheMetadataResponse> {
  const response = await fetch(`${API_URL}/cache/metadata`);

  if (!response.ok) {
    throw new Error(await responseError(response, `Cache metadata returned ${response.status}`));
  }

  return response.json();
}

export async function getPitchFilterOptions(
  filters: PitchFilters = {},
): Promise<PitchFilterOptions> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = Array.isArray(value) ? value.filter(Boolean).join(",") : value?.trim();
    if (
      trimmedValue &&
      key !== "single_game" &&
      key !== "count" &&
      key !== "min_velocity" &&
      key !== "max_velocity" &&
      key !== "result_order" &&
      key !== "limit"
    ) {
      params.set(key, trimmedValue);
    }
  });

  const queryString = params.toString();
  const response = await fetch(
    `${API_URL}/pitch-options${queryString ? `?${queryString}` : ""}`,
  );

  if (!response.ok) {
    throw new Error(await responseError(response, `Pitch options returned ${response.status}`));
  }

  return response.json();
}

export async function searchPitches(filters: PitchFilters): Promise<PitchSearchResponse> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = Array.isArray(value) ? value.filter(Boolean).join(",") : value?.trim();
    if (trimmedValue && key !== "single_game" && key !== "count") {
      params.set(key, trimmedValue);
    }
  });

  const queryString = params.toString();
  const response = await fetch(
    `${API_URL}/pitches${queryString ? `?${queryString}` : ""}`,
  );

  if (!response.ok) {
    throw new Error(await responseError(response, `Pitch search returned ${response.status}`));
  }

  return response.json();
}

export async function getProfilePitches(filters: PitchFilters): Promise<PitchSearchResponse> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = Array.isArray(value) ? value.filter(Boolean).join(",") : value?.trim();
    if (trimmedValue && key !== "single_game" && key !== "count" && key !== "limit") {
      params.set(key, trimmedValue);
    }
  });

  const queryString = params.toString();
  const response = await fetch(
    `${API_URL}/pitches/profile${queryString ? `?${queryString}` : ""}`,
  );

  if (!response.ok) {
    throw new Error(await responseError(response, `Profile pitches returned ${response.status}`));
  }

  return response.json();
}

export async function getProfileSummary(filters: PitchFilters): Promise<ProfileSummaryResponse> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = Array.isArray(value) ? value.filter(Boolean).join(",") : value?.trim();
    if (trimmedValue && key !== "single_game" && key !== "count" && key !== "limit") {
      params.set(key, trimmedValue);
    }
  });

  const queryString = params.toString();
  const response = await fetch(
    `${API_URL}/pitches/profile/summary${queryString ? `?${queryString}` : ""}`,
  );

  if (!response.ok) {
    throw new Error(await responseError(response, `Profile summary returned ${response.status}`));
  }

  return response.json();
}

export async function getPitchDataQuality(
  filters: PitchFilters,
): Promise<PitchDataQualityResponse> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = Array.isArray(value) ? value.filter(Boolean).join(",") : value?.trim();
    if (
      trimmedValue &&
      key !== "single_game" &&
      key !== "count" &&
      key !== "result_order" &&
      key !== "limit"
    ) {
      params.set(key, trimmedValue);
    }
  });

  const queryString = params.toString();
  const response = await fetch(
    `${API_URL}/pitches/data-quality${queryString ? `?${queryString}` : ""}`,
  );

  if (!response.ok) {
    throw new Error(await responseError(response, `Pitch data quality returned ${response.status}`));
  }

  return response.json();
}

export async function getPitchHeatmap(
  filters: PitchFilters,
  mode: HeatmapMode = "all",
): Promise<PitchHeatmapResponse> {
  const params = new URLSearchParams();
  params.set("mode", mode);

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = Array.isArray(value) ? value.filter(Boolean).join(",") : value?.trim();
    if (
      trimmedValue &&
      key !== "single_game" &&
      key !== "count" &&
      key !== "result_order" &&
      key !== "limit"
    ) {
      params.set(key, trimmedValue);
    }
  });

  const queryString = params.toString();
  const response = await fetch(
    `${API_URL}/pitches/heatmap${queryString ? `?${queryString}` : ""}`,
  );

  if (!response.ok) {
    throw new Error(await responseError(response, `Pitch heatmap returned ${response.status}`));
  }

  return response.json();
}

export async function comparePitcher(
  filters: CompareFilters,
  heatmapMode: HeatmapMode = "all",
  includeHeatmaps = false,
): Promise<PitcherCompareResponse> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = value.trim();
    if (trimmedValue && key !== "a_game" && key !== "b_game") {
      params.set(key, trimmedValue);
    }
  });
  params.set("heatmap_mode", heatmapMode);
  params.set("include_heatmaps", includeHeatmaps ? "true" : "false");

  const response = await fetch(`${API_URL}/compare/pitcher?${params.toString()}`);

  if (!response.ok) {
    throw new Error(
      await responseError(response, `Pitcher comparison returned ${response.status}`),
    );
  }

  return response.json();
}

export async function parseNaturalLanguageQuery(query: string): Promise<RelaySkillCall> {
  const response = await fetch(`${API_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(await responseError(response, `Query parser returned ${response.status}`));
  }

  return response.json();
}

export { API_URL };
