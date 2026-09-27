# Bundled whisper.cpp (voice control)

This directory holds the offline speech-to-text engine for push-to-talk voice
control. The artifacts are **not committed** (the model is ~148 MB) — they're
fetched/built locally and bundled into the packaged app via the
`extraResources` entry in `package.json`.

## Populate

```bash
pnpm setup:whisper
```

This produces:

- `whisper-server` — whisper.cpp's HTTP server binary (built from source with
  CMake; Metal GPU on macOS, plus CoreML *with allow-fallback* — it uses the
  CoreML encoder when `ggml-base.en-encoder.mlmodelc` is present and falls back to
  Metal when it isn't, instead of aborting). The setup script best-effort
  generates the CoreML model when python3 + coremltools + openai-whisper are
  installed; otherwise it's skipped and Metal is used.
- `ggml-base.en.bin` — the base English model.

Overrides if you already have these:

```bash
WHISPER_SERVER_BIN=/path/to/whisper-server WHISPER_MODEL=/path/to/ggml-base.en.bin pnpm setup:whisper
```

## Runtime behavior

`electron/whisper-server.ts` resolves the binary + model from here (in dev) or
from `process.resourcesPath/whisper/` (packaged), spawns the server lazily on
first use, and keeps it warm. If the artifacts are absent, voice transcription
reports unavailable instead of failing — so a build without them still runs.

## Dual-architecture macOS releases

Both installers need a matching speech-server architecture. The packaging hook rejects an incompatible binary. A universal `whisper-server` can be staged once for both installers with `lipo -create <arm64-server> <x64-server> -output resources/whisper/whisper-server`.

For the 2026.9.21 Intel slice, build whisper.cpp v1.8.3 (`2eeeba56e9edd762b4b38467bab96c2517163158`) with:

```sh
cmake -S <source> -B <build> -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=x86_64 -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_METAL=OFF -DGGML_OPENMP=OFF -DWHISPER_COREML=OFF -DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_F16C=OFF -DGGML_FMA=OFF -DGGML_BMI2=OFF
cmake --build <build> --config Release -j 6 --target whisper-server
```

The Intel binary links only system libraries; the existing ARM slice retains its local acceleration support.
