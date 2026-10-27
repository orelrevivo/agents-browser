# Local environment

Copy the root `.env.example` to `.env` and set local development values:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```

The Electron main process loads these values when the app starts. The preload bridge and renderer do not receive the API key. Agent execution verifies the configured model before a request and preserves the exact `OPENAI_MODEL` value without fallback. Web search and agent memory are executed through the main process only.

The root `.env` is ignored by Git. In packaged builds, Groubot looks for `.env` in Electron’s user-data directory so secrets remain machine-local.
