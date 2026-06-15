declare module 'utif' {
  export interface IFD {
    width: number
    height: number
    /** BitsPerSample tag */
    t258?: number[]
    [key: string]: unknown
  }
  export function decode(buffer: ArrayBuffer | Uint8Array): IFD[]
  export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: IFD): void
  export function toRGBA8(ifd: IFD): Uint8Array
  export function encodeImage(rgba: ArrayBuffer, width: number, height: number): ArrayBuffer

  const UTIF: {
    decode: typeof decode
    decodeImage: typeof decodeImage
    toRGBA8: typeof toRGBA8
    encodeImage: typeof encodeImage
  }
  export default UTIF
}
