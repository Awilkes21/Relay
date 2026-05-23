import sys
import tempfile
import unittest
from pathlib import Path


try:
    import duckdb
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"DuckDB test dependency is not installed: {exc}") from exc


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.db.statcast import statcast_connection


class StatcastDbTests(unittest.TestCase):
    def test_statcast_view_excludes_unknown_pitch_types(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            parquet_path = Path(temp_dir) / "statcast.parquet"
            duckdb.connect().execute(
                "COPY ("
                "SELECT 'FF' AS pitch_type, 1 AS pitch_id "
                "UNION ALL "
                "SELECT 'UN' AS pitch_type, 2 AS pitch_id "
                "UNION ALL "
                "SELECT 'Unknown' AS pitch_type, 3 AS pitch_id "
                "UNION ALL "
                "SELECT NULL AS pitch_type, 4 AS pitch_id"
                f") TO '{parquet_path.as_posix()}' (FORMAT PARQUET)"
            )

            with statcast_connection(parquet_path) as connection:
                rows = connection.execute(
                    "SELECT pitch_type, pitch_id FROM statcast_pitches ORDER BY pitch_id"
                ).fetchall()

        self.assertEqual(rows, [("FF", 1)])


if __name__ == "__main__":
    unittest.main()
