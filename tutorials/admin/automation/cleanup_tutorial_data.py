"""Remove every record created for the admin tutorial (TUTORIAL_ADMIN_2026).

Only works against the isolated tutorial database (127.0.0.1:27118,
database name containing "tutorial"); it refuses any other URI.

How records are identified
  * Every document created by the tutorial (baseline seed + recordings) has an
    ObjectId generated after the tutorial start time stored in
    .local/tutorial_meta.json. Children (charges, collections, attendances,
    sessions, audit logs...) are always created after their parents, so a
    time cut-off removes the whole graph consistently, relations included.
  * As a cross-check, the script counts how many of the selected documents
    carry the TUTORIAL_ADMIN_2026 tag or an @example.com address.
  * Documents that existed before the tutorial but were modified by it
    (organization settings, catalog order) are restored from the
    "seed_only" snapshot taken before the tutorial started.

Usage
    python automation/cleanup_tutorial_data.py            # dry run: prints the plan
    python automation/cleanup_tutorial_data.py --apply    # deletes
    python automation/cleanup_tutorial_data.py --drop-database --apply   # removes the whole tutorial DB
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import subprocess
import sys

from bson import ObjectId
from pymongo import MongoClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from tutorial_env import LOCAL, MONGO_URI, TAG, assert_tutorial_database  # noqa: E402

PRE_EXISTING_RESTORE = ["organizations", "catalogitems", "branches", "users"]
MONGO_TOOLS = pathlib.Path("C:/Program Files/MongoDB/Tools/100/bin")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--drop-database", action="store_true")
    args = ap.parse_args()

    assert_tutorial_database(MONGO_URI)
    client = MongoClient(MONGO_URI)
    db = client.get_default_database()

    if args.drop_database:
        print(f"Will drop database {db.name}")
        if args.apply:
            client.drop_database(db.name)
            print("Dropped.")
        return

    meta = json.loads((LOCAL / "tutorial_meta.json").read_text(encoding="utf-8"))
    started = dt.datetime.fromisoformat(meta["started_at"])
    cutoff = ObjectId.from_datetime(started - dt.timedelta(seconds=1))
    print(f"Tutorial started at {started.isoformat()} (tag {TAG})")

    total = 0
    plan = []
    for name in sorted(db.list_collection_names()):
        coll = db[name]
        query = {"_id": {"$gte": cutoff}}
        try:
            count = coll.count_documents(query)
        except Exception:
            continue
        if not count:
            continue
        tagged = coll.count_documents({"$and": [query, {"$or": [
            {"notes": {"$regex": TAG}}, {"bio": {"$regex": TAG}}, {"description": {"$regex": TAG}},
            {"email": {"$regex": "@example\\.com$"}},
        ]}]})
        plan.append((name, count, tagged))
        total += count
    print(f"{'collection':28} {'to delete':>9} {'tagged':>7}")
    for name, count, tagged in plan:
        print(f"{name:28} {count:9d} {tagged:7d}")
    print(f"Total documents created by the tutorial: {total}")

    if not args.apply:
        print("Dry run only. Re-run with --apply to delete.")
        return

    for name, _, _ in plan:
        db[name].delete_many({"_id": {"$gte": cutoff}})
    print("Deleted tutorial-created documents.")

    snap = LOCAL / "snapshots" / "seed_only"
    if (snap / db.name).exists():
        for coll in PRE_EXISTING_RESTORE:
            subprocess.run([str(MONGO_TOOLS / "mongorestore.exe"), "--uri=mongodb://127.0.0.1:27118/?replicaSet=rs0",
                            "--drop", "--quiet", f"--nsInclude={db.name}.{coll}", str(snap)], check=True)
        print("Restored pre-tutorial settings, catalogs, branches and users from the seed_only snapshot.")
    # The receipt counter belongs to the tutorial organization only; reset it.
    db.sequences.delete_many({})
    print("Cleanup finished.")


if __name__ == "__main__":
    main()
