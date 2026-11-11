# HISTORICAL - DOES NOT WORK AFTER THE 2.0-a1 SPLIT. Do not run it.
# index.html no longer contains the app: the css is css/app.css and the script is
# js/01..12 (see js/files.js), so what this script cuts out from between the
# ARTIFACT markers is an empty page with <link>/<script src> tags that nothing
# can resolve. ROADMAP and PROJECT_STATE already say the artifact is not
# maintained and is not to be rebuilt; this note is so the script itself says so.
# It is kept only as a record of how the artifact copy was made.
#
# Generates artifact-body.html from index.html.
#
# index.html is the canonical app: a complete, self-hostable HTML document.
# The Claude Artifact host supplies its own <!doctype>/<head>/<body> wrapper, so
# the artifact copy is everything between the ARTIFACT markers, with a <title>
# put back on the front. Run this after editing index.html, then republish.

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root "index.html"
$dst  = Join-Path $root "artifact-body.html"

# -Encoding utf8 is not optional: Windows PowerShell 5.1 reads as ANSI by
# default, which turns every em-dash in the source into mojibake.
$html = Get-Content $src -Raw -Encoding utf8
$start = $html.IndexOf("<!--ARTIFACT-START-->")
$end   = $html.IndexOf("<!--ARTIFACT-END-->")
if ($start -lt 0 -or $end -lt 0) { throw "ARTIFACT markers not found in index.html" }

$start += "<!--ARTIFACT-START-->".Length
$body = $html.Substring($start, $end - $start).Trim()

# The artifact build has no manifest and no service worker to register.
$body = $body -replace '(?s)/\* Offline support.*?\n\}\r?\n', ''

$out = "<title>Iron Log</title>`r`n" + $body + "`r`n"
# Set-Content -Encoding utf8 writes a BOM on 5.1, which shows up as a stray
# glyph before the <title>. Write UTF-8 without one.
[System.IO.File]::WriteAllText($dst, $out, (New-Object System.Text.UTF8Encoding $false))
Write-Output ("wrote artifact-body.html  ({0:N0} bytes)" -f (Get-Item $dst).Length)
