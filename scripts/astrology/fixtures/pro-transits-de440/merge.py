import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
order = [c["id"] for c in json.load(open(os.path.join(HERE, "cases.json"), encoding="utf8"))]
parts = [json.load(open(os.path.join(HERE, f"part{i}.json"), encoding="utf8")) for i in range(3)]
by = {c["id"]: c for p in parts for c in p["cases"]}
meta = parts[0]
meta["cases"] = [by[i] for i in order]
meta["counts"] = {
    "cases": len(order),
    "byGroup": {g: sum(1 for c in meta["cases"] if c["group"] == g) for g in sorted({c["group"] for c in meta["cases"]})},
    "windows": sum(len(c["W"]) for c in meta["cases"]),
    "exacts": sum(len(w[3]) for c in meta["cases"] for w in c["W"]),
    "stations": sum(len(c["ST"]) for c in meta["cases"]),
    "ingresses": sum(len(c["IN"]) for c in meta["cases"]),
}
s = json.dumps(meta, separators=(",", ":"), ensure_ascii=False)
open(os.path.join(HERE, "ref-se-transit.json"), "w", encoding="utf8").write(s)
print(len(s), meta["counts"])
