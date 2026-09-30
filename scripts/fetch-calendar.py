import sys,urllib.request,gzip,json
url=json.load(sys.stdin)['url']
req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Accept-Language':'en-GB,en;q=0.9,it;q=0.8'})
with urllib.request.urlopen(req,timeout=25) as r:
 b=r.read()
 if b[:2]==b'\x1f\x8b':b=gzip.decompress(b)
 print(b.decode('utf-8'))
