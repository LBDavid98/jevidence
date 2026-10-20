---
name: server-conventions
paths: ["**"]
skills: ["verify-deployed"]
scripts: []
---
# Rule: conventions for a repo under /srv on the Cascadia box

Scope: only a repo checked out under `/srv` on the Cascadia box. Anywhere
else, this rule does not apply and says nothing.

- **No published ports.** A compose file never carries `ports:`. Services
  are reached through Caddy on the internal network; under WSL2 mirrored
  networking a published port lands on the house LAN without anyone
  noticing. `cascadia-deploy` refuses a compose file that publishes one.
- **A real hostname route is a publish.** A Caddy route file or a
  cloudflared ingress rule that gives an app a hostname makes it
  reachable. Add one when User asks for it, keep the Cloudflare Access
  gate in front of it, and never add an Access carve-out that lets an
  anonymous visitor through — that one is User's to confirm.
- **Secrets live in a 0600 `.env` and are read by name.** Read one
  variable with `envq`, never a region of a file or an environment:

  ```
  envq <container> <VAR>
  envq --file <path>/.env <VAR>
  envq --names <container>
  ```

  A prefix grep over an environment, a line range of a `.env`, a compose
  config render, a diff of an edited `.env` and "just the keys" of a key
  map are all regions, and each has leaked a credential on this box.
  Prove a property instead of printing a value. If one leaks anyway, say
  so at once and name what it reaches.
- **Infrastructure is sourced from the Windows tree `~/server`.** Stacks,
  Caddy routes and ingress rules are changed there and applied with the
  box's own tooling (`sync-stacks.sh`, `cascadia-deploy`), never by
  editing a running container or a copy under `/srv`.
- **Two planes, and an app is on the one it was deployed onto.** The
  tailnet (`https://cascadia.tail6dc8be.ts.net:<port>`, tailnet members
  only; `tailscale serve` runs Windows-side) holds the admin surfaces.
  Cloudflare (`<name>--dev.cascadingcontext.com`, behind Access) holds
  what User reaches from a browser off the tailnet. Caddy on
  `127.0.0.1:80` is the front door for both and routes on the Host
  header, never on the path.
- **Do not diagnose the tailnet from inside WSL.** A request from this
  shell to the tailnet name times out whether or not the service is up,
  so it means nothing. Check the container, the loopback port, and
  Windows `curl.exe` instead — the **verify-deployed** skill has the
  commands.

The detail — naming, layout, deploying, secrets, workspaces, and the
topology map to read before changing how a service is reached — is in
`/srv/apps/cascadia-sdk/docs/sop/`.
