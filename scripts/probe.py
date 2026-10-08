# Temporary probe: inspect data sources from a GitHub runner (removed after use).
import json, re, sys, urllib.request, urllib.parse
from html.parser import HTMLParser

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}

def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.status, r.read()

print("=== IOCL XP100 page")
for url in ["https://www.iocl.com/xp100", "https://iocl.com/XP100"]:
    try:
        st, body = get(url)
        html = body.decode("utf-8", "replace")
        print(url, st, len(html))
        open("xp100.html", "w").write(html)
        i = html.lower().find("list of xp100")
        print("idx", i)
        print(html[i:i+3000] if i >= 0 else html[:1500])
        print("tables:", html.lower().count("<table"), "tr:", html.lower().count("<tr"))
        for m in re.finditer(r'(src|href)="([^"]+\.(?:js|json|xlsx?|csv|pdf))"', html):
            print("asset", m.group(2))
        break
    except Exception as e:
        print(url, "ERR", e)

def overpass(q):
    st, body = get("https://overpass-api.de/api/interpreter", urllib.parse.urlencode({"data": q}).encode())
    return json.loads(body)

AREA = 'area["ISO3166-1"="IN"][admin_level=2]->.in;'
for label, sel in [
    ("name~coco", 'nwr["amenity"="fuel"]["name"~"coco",i](area.in);'),
    ("octane_100", 'nwr["amenity"="fuel"]["fuel:octane_100"="yes"](area.in);'),
    ("name~xp100|power 100|speed 100", 'nwr["amenity"="fuel"]["name"~"xp ?100|power ?100|speed ?100",i](area.in);'),
]:
    try:
        d = overpass(f'[out:json][timeout:170];{AREA}{sel}out center tags;')
        els = d["elements"]
        print(f"=== OSM {label}: {len(els)}")
        for e in els[:15]:
            print(json.dumps(e.get("tags", {}))[:300])
    except Exception as e:
        print("OSM", label, "ERR", e)

try:
    d = overpass(f'[out:json][timeout:170];{AREA}nwr["amenity"="fuel"](area.in);out tags;')
    from collections import Counter
    c = Counter((e.get("tags", {}).get("brand") or "<none>") for e in d["elements"])
    print("=== OSM fuel total", len(d["elements"]))
    for k, v in c.most_common(25): print(v, k)
    c2 = Counter(e.get("tags", {}).get("operator") or "<none>" for e in d["elements"])
    print("--- operators"); [print(v, k) for k, v in c2.most_common(15)]
except Exception as e:
    print("OSM brands ERR", e)
