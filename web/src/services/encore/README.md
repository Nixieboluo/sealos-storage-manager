# Encore SDK

Generate the backend client into this directory:

```bash
pnpm generate:api
```

The generated `client.ts` file is intentionally not hand-written. Keep domain
wrappers in sibling files under `src/services` or feature-level `api/` folders.
