#!/usr/bin/env bash
# Temporary probe: inspect data sources from a GitHub runner (removed after use).
set -u
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
echo "=== IOCL"
for u in https://iocl.com/xp100 https://www.iocl.com/xp100; do
  curl -sS -L --max-redirs 10 -c jar.txt -b jar.txt -A "$UA" -H "Accept: text/html,application/xhtml+xml" -H "Accept-Language: en-IN,en;q=0.9" \
    -D - -o page.html -w "final=%{url_effective} code=%{http_code} size=%{size_download}\n" "$u" 2>&1 | grep -iE "^(HTTP|location|set-cookie|server|final)" | head -30
  if [ -s page.html ] && grep -qi "xp100" page.html; then cp page.html xp100.html; break; fi
done
if [ -f xp100.html ]; then
  python3 - <<'PY'
import re
h=open("xp100.html",encoding="utf-8",errors="replace").read()
print("len",len(h),"tables",h.lower().count("<table"),"tr",h.lower().count("<tr"))
i=h.lower().find("list of xp100"); print("idx",i); print(h[i:i+4000] if i>=0 else "")
for m in set(re.findall(r'(?:src|href)="([^"]+)"',h)):
    if re.search(r'\.(js|json|xlsx?|csv|pdf)|api|xp100',m,re.I): print("asset",m)
PY
fi
echo "=== OSM"
OUA="COCOFinder/1.0 (+https://github.com/iraniroahn/COCOFinder)"
q() { curl -sS -A "$OUA" --data-urlencode "data=$1" "$2" -o osm.json -w "code=%{http_code} size=%{size_download}\n"; }
for ep in https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter https://maps.mail.ru/osm/tools/overpass/api/interpreter; do
  echo "endpoint $ep"
  q '[out:json][timeout:170];area["ISO3166-1"="IN"][admin_level=2]->.in;nwr["amenity"="fuel"]["name"~"coco",i](area.in);out center tags;' $ep
  head -c 300 osm.json; echo
  python3 -c "
import json;d=json.load(open('osm.json'));e=d['elements'];print('coco',len(e))
for x in e[:40]: t=x.get('tags',{});print(t.get('name'),'|',t.get('brand'),'|',t.get('operator'),'|',t.get('addr:city'),x.get('lat') or x.get('center'))
" && break
done
q '[out:json][timeout:170];area["ISO3166-1"="IN"][admin_level=2]->.in;nwr["amenity"="fuel"]["name"~"xp ?100|power ?100|speed ?100|octane",i](area.in);out center tags;' $ep
python3 -c "
import json;d=json.load(open('osm.json'));e=d['elements'];print('xp-name',len(e))
for x in e[:20]: print(x.get('tags'))
"
q '[out:json][timeout:170];area["ISO3166-1"="IN"][admin_level=2]->.in;nwr["amenity"="fuel"][~"^fuel:octane_10[0-9]$"~"yes"](area.in);out center tags;' $ep
python3 -c "
import json;d=json.load(open('osm.json'));e=d['elements'];print('octane100 tag',len(e))
for x in e[:20]: print(x.get('tags'))
"
q '[out:json][timeout:170];area["ISO3166-1"="IN"][admin_level=2]->.in;nwr["amenity"="fuel"](area.in);out tags;' $ep
python3 -c "
import json;from collections import Counter
d=json.load(open('osm.json'));e=d['elements'];print('fuel total',len(e))
c=Counter((x.get('tags',{}).get('brand') or '<none>') for x in e)
[print(v,k) for k,v in c.most_common(30)]
c=Counter((x.get('tags',{}).get('brand:wikidata') or '<none>') for x in e)
[print(v,k) for k,v in c.most_common(10)]
"
