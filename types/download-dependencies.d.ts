/// <reference types="electron-vite/node" />
declare module 'bencode' {
  const bencode: { decode: (input: Uint8Array) => unknown; encode: (input: unknown) => Uint8Array }
  export default bencode
}
declare module 'memory-chunk-store' {
  const store: unknown
  export default store
}
