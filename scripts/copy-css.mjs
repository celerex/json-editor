import { mkdir, copyFile } from "node:fs/promises"

await mkdir(new URL("../dist/", import.meta.url), { recursive: true })
await copyFile(new URL("../src/editor.css", import.meta.url), new URL("../dist/editor.css", import.meta.url))
