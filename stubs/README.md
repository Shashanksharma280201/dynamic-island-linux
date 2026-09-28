# Stubs

`@huggingface/transformers` (local Whisper speech recognition) depends on
`onnxruntime-node` and `sharp` for its Node.js build. The island only runs it
inside the renderer (WebAssembly, `onnxruntime-web`), so those two are replaced
with these empty packages through `overrides` in `package.json`. Without this,
`npm install` would download about 300 MB of native binaries nobody uses.
