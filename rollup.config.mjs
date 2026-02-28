import terser from "@rollup/plugin-terser"

export default [
  {
    input: "src/editor.js",
    output: [
      {
        file: "dist/editor.esm.js",
        format: "es",
        sourcemap: true
      },
      {
        file: "dist/editor.umd.js",
        format: "umd",
        name: "JsonEditor",
        sourcemap: true
      }
    ]
  },
  {
    input: "src/editor.js",
    output: {
      file: "dist/editor.umd.min.js",
      format: "umd",
      name: "JsonEditor",
      sourcemap: true
    },
    plugins: [terser()]
  }
]
