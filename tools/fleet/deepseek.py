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
body = {"model": a.model, "max_tokens": a.max_tokens, "stream": True,
        "messages": [{"role": "user", "content": "".join(parts)}]}
def call():
  req = urllib.request.Request("https://opencode.ai/inference/go/openai/v1/chat/completions", data=json.dumps(body).encode(),
    headers={"Authorization": "Bearer proxy-injected", "Content-Type": "application/json", "User-Agent": "ironlog-fleet/1.0",
             "Accept": "text/event-stream", "x-opencode-session": f"ironlog-v2-{int(time.time())}"})
  out, usage = [], {}
  with urllib.request.urlopen(req, timeout=1800) as resp:   # streamed, so the gateway never sits idle
    for raw in resp:
      line = raw.decode("utf-8", "replace").strip()
      if not line.startswith("data:"): continue
      data = line[5:].strip()
      if data == "[DONE]": break
      ev = json.loads(data)
      if ev.get("error"): raise RuntimeError(json.dumps(ev["error"]))
      for ch in ev.get("choices", []):
        piece = (ch.get("delta") or {}).get("content")
        if piece: out.append(piece)
      if ev.get("usage"): usage = ev["usage"]
  return "".join(out), usage
for attempt in range(4):                                     # 502/503/timeouts: back off 15, 30, 60 s
  try:
    text, u = call(); break
  except Exception as e:
    body_txt = getattr(e, "read", lambda: b"")()[:300]
    print(f"attempt {attempt+1} failed: {e} {body_txt!r}", file=sys.stderr)
    if attempt == 3: sys.exit(1)
    time.sleep(15 * 2 ** attempt)
if not text.strip(): sys.exit("empty reply")
open(a.out, "w").write(text)
print(f"ok {a.model} in={u.get('prompt_tokens')} out={u.get('completion_tokens')} -> {a.out}")
