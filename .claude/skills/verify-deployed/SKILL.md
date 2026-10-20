---
name: verify-deployed
description: How to prove a change is live on the Cascadia box - first whether the tier is well, then from what User will open inward, Caddy by Host header for a route, Windows curl.exe for the tailnet plane, evidence under .scratch/, and a URL on the right plane at the end. Use after deploying or restarting anything on the box, before saying a change is live, or when User asks whether something is up.
---

# Verify deployed

A change is live when the running thing shows it on the plane User
uses. A green suite, a rebuilt image and a restarted container are each
a step toward that, and none of them is it.

```
Verify Deployed Progress:
- [ ] 1. Is the tier well?
- [ ] 2. Start from what User will open
- [ ] 3. The route, through Caddy, with a Host header
- [ ] 4. The tailnet plane, through Windows curl.exe
- [ ] 5. Evidence under .scratch/
- [ ] 6. Give User a URL on the right plane
```

**Step 1 — is the tier well?** Before reading anything into your own
change, look at what is running:

```
docker ps --filter name=<app>
docker logs --tail 50 <container>
docker inspect --format '{{.State.Health.Status}}' <container>
```

Running, not restarting, healthy where a healthcheck exists. A tier that
was sick before your change is the finding: say so plainly and do not
attribute its symptoms to the change. Never inspect `.Config.Env` and
never render the compose config to look — both print secrets; read one
variable by name with `envq`.

**Step 2 — start from what User will open.** Name the URL he will use
before you test anything, then prove each hop toward it. The question is
whether he sees the change, so a check that only reaches the container
answers half of it.

**Step 3 — the route, through Caddy.** Caddy binds `127.0.0.1:80` and
routes on the Host header, never on the path:

```
curl -so /dev/null -w '%{http_code}\n' -H "Host: <app>.cascadia" http://127.0.0.1:80/<path>
curl -so /dev/null -w '%{http_code}\n' http://127.0.0.1:<port>/<path>
```

The first is the route, the second the app behind it. A request without
the Host header reaches the wrong door, so a 404 there says nothing
about the app. A 401 from an admin surface on loopback is usually right:
the app refused a request that arrived without the Tailscale identity
header.

**Step 4 — the tailnet plane, from Windows.** This WSL instance is a
separate tailnet member and cannot resolve the Windows node by name, so
a request from this shell times out whether the service is up or not.
Never curl the tailnet from WSL. Ask Windows:

```
/mnt/c/Windows/System32/curl.exe -so NUL -w '%{http_code}' https://cascadia.tail6dc8be.ts.net:<port>/<path>
```

For the Cloudflare plane, an unauthenticated request should be stopped
by Access. That proves the gate is in front; the app behind it was
proven in step 3.

**Anything you start in the background, you can stop.** Capture its PID
when you start it, keep its output under `.scratch/`, and stop it by
that PID when you are done:

```
mkdir -p .scratch/verify
node server.js > .scratch/verify/server.log 2>&1 &
echo $! > .scratch/verify/server.pid
kill "$(cat .scratch/verify/server.pid)"
```

Never stop a process by name: on this box the name matches other
sessions' processes too.

**Step 5 — evidence under `.scratch/`.** Status codes, response heads,
log excerpts and screenshots go in `.scratch/verify-<what>/`. Never in
`project/evidence` or anywhere else that is tracked: evidence committed
beside the code goes stale the next day and keeps claiming it is
current. Cite what it shows in your report, or in a log entry's `--did`.

**Step 6 — give User a URL on the right plane.** He is on another
machine, so a curl command is work handed back to him. Give him the
link, and say which plane it is on:

- tailnet: `https://cascadia.tail6dc8be.ts.net:<port>/<path>` — works
  from any device signed in to the tailnet, and from nowhere else;
- Cloudflare: `https://<name>--dev.cascadingcontext.com/<path>` — asks
  for his Access sign-in.

**When a screen changed**, run User's global `visual-delivery-test`
skill alongside: a fresh agent reads one screenshot cold and says what
it understands. If that skill is not installed here, say so rather than
skipping it silently. The **visual-inspector** agent checks a rendered
screen against a checklist; the two answer different questions.
