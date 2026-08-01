# Generates artifact-body.html from index.html.
#
# index.html is the canonical app: a complete, self-hostable HTML document.
# The Claude Artifact host supplies its own <!doctype>/<head>/<body> wrapper, so
# the artifact copy is everything between the ARTIFACT markers, with a <title>
# put back on the front. Run this after editing index.html, then republish.

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root "index.html"
$dst  = Join-Path $root "artifact-body.html"

$html = Get-Content $src -Raw
$start = $html.IndexOf("<!--ARTIFACT-START-->")
$end   = $html.IndexOf("<!--ARTIFACT-END-->")
if ($start -lt 0 -or $end -lt 0) { throw "ARTIFACT markers not found in index.html" }

$start += "<!--ARTIFACT-START-->".Length
$body = $html.Substring($start, $end - $start).Trim()

# The artifact build has no manifest and no service worker to register.
$body = $body -replace '(?s)/\* Offline support.*?\n\}\r?\n', ''

$out = "<title>Iron Log</title>`r`n" + $body + "`r`n"
Set-Content -Path $dst -Value $out -Encoding utf8
Write-Output ("wrote artifact-body.html  ({0:N0} bytes)" -f (Get-Item $dst).Length)
