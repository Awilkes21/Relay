# Relay Demo Data

This directory is for the curated portfolio demo cache.

Expected files:

```txt
data/demo/statcast.parquet
data/demo/statcast_manifest.json
```

Build or refresh the demo artifacts from an existing local cache:

```powershell
cd backend
python scripts\prepare_demo_cache.py
```

Install the demo artifacts as the active app cache:

```powershell
cd backend
python scripts\prepare_demo_cache.py --skip-build --install
```

Build and install in one step:

```powershell
cd backend
python scripts\prepare_demo_cache.py --install
```

The active app cache in `data/statcast.parquet` remains ignored by git. The demo cache here can be committed for a portfolio/demo build when its size is acceptable.
