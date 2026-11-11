#!/usr/bin/env python3
"""Send a brief (plus attached files) to DeepSeek through the owner's OpenCode Go key.
DeepSeek ONLY on this key (owner's instruction, 11 Nov 2026). The key is injected by
the session's network proxy; nothing secret is read or stored here.
Usage: deepseek.py --brief brief.md [--attach f1 f2 ...] --out reply.md [--model deepseek-v4-pro|deepseek-v4.1-flash]"""
import argparse, json, time, urllib.request, sys
ALLOWED = {"deepseek-v4-pro", "deepseek-v4.1-flash"}
ap = argparse.ArgumentParser()
ap.add_argument("--brief", required=True); ap.add_argument("--attach", nargs="*", default=[])
ap.add_argument("--out", required=True); ap.add_argument("--model", default="deepseek-v4-pro")
ap.add_argument("--max-tokens", type=int, default=32000)
a = ap.parse_args()
if a.model not in ALLOWED: sys.exit("DeepSeek models only on the OpenCode key: " + ", ".join(sorted(ALLOWED)))
parts = [open(a.brief).read()]
for f in a.attach: parts.append(f"\n\n===== FILE: {f} =====\n" + open(f, errors="replace").read())
body = {"model": a.model, "max_tokens": a.max_tokens, "messages": [{"role": "user", "content": "".join(parts)}]}
req = urllib.request.Request("https://opencode.ai/inference/go/openai/v1/chat/completions", data=json.dumps(body).encode(),
  headers={"Authorization": "Bearer proxy-injected", "Content-Type": "application/json", "User-Agent": "ironlog-fleet/1.0", "x-opencode-session": f"ironlog-v2-{int(time.time())}"})
r = json.load(urllib.request.urlopen(req, timeout=1800))
if r.get("error"): sys.exit(json.dumps(r["error"]))
open(a.out, "w").write(r["choices"][0]["message"].get("content") or "")
u = r.get("usage", {}); print(f"ok {a.model} in={u.get('prompt_tokens')} out={u.get('completion_tokens')} -> {a.out}")
